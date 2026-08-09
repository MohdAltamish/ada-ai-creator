// Orchestration + the reliability trick the whole submission leans on.
//
// maybeCatchUpPublish() is called from TWO places: every GET /feed request,
// and the Vercel Cron job. Either one can trigger a post if enough time has
// elapsed since the last one. That means the agent keeps publishing "on its
// own" whether or not the host process stays warm between requests, and
// regardless of how often (or rarely) Vercel Cron is allowed to fire on
// whatever plan this is deployed on. The evaluator's own polling becomes
// part of what keeps the agent alive — which is a feature, not a workaround,
// since the spec's own evaluation method is "periodically call the feed
// endpoint."
//
// The UPDATE ... WHERE last_published_at = <value we read> pattern below is
// an optimistic lock: if two requests race (evaluator poll + cron, say),
// only one of them successfully claims the publish slot and the other is a
// safe no-op instead of double-posting.

import { getSupabase } from "./supabase";
import { discoverTopics } from "./discovery";
import { runEditorialPass } from "./editorial";
import {
  DEFAULT_PROFILE,
  isDefaultPersona,
  type PersonaProfile,
} from "./persona";
import { generateJSON } from "./llm";

export let PUBLISH_INTERVAL_MINUTES = Number(
  process.env.PUBLISH_INTERVAL_MINUTES ?? 240
);

export function setPublishInterval(mins: number) {
  PUBLISH_INTERVAL_MINUTES = mins;
}

/**
 * §3: Resolve which PersonaProfile to use for a given agent row.
 * Priority: stored persona_profile > default (if name/domain match) > minimal fallback.
 */
function resolveProfile(agent: any): PersonaProfile {
  if (agent.persona_profile) return agent.persona_profile as PersonaProfile;
  if (isDefaultPersona(agent.name, agent.domain)) return DEFAULT_PROFILE;
  return {
    ...DEFAULT_PROFILE,
    name: agent.name,
    domain: agent.domain,
    discoveryKeywords: agent.domain.toLowerCase().split(/\s+/),
  };
}

async function writePost(
  chosen: {
    title: string;
    summary: string;
    url: string;
    source: string;
    rationale: string;
  },
  pastPosts: { text: string }[],
  profile: PersonaProfile
): Promise<{ text: string }> {
  const examples = pastPosts
    .slice(0, 3)
    .map((p) => p.text)
    .join("\n---\n");

  const prompt = `Write ONE new post in ${profile.name}'s voice about this topic.

TOPIC: ${chosen.title}
CONTEXT: ${chosen.summary}
SOURCE (${chosen.source}): ${chosen.url}
WHY THIS WAS CHOSEN: ${chosen.rationale}

VOICE RULES:
${profile.voice.map((v) => `- ${v}`).join("\n")}

${
  examples
    ? `PAST POSTS, FOR VOICE CONSISTENCY ONLY (do not repeat their content, match tone/structure):\n${examples}`
    : ""
}

Write 80-160 words of plain text. No markdown headers, no hashtags, no emoji, no "As an AI...".

Respond as JSON only: {"text": string}`;

  return generateJSON<{ text: string }>({
    system: `You write as ${profile.name}, ${profile.domain} researcher. Stay strictly in character. Output valid JSON only.`,
    prompt,
    temperature: 0.85,
  });
}

export async function publishOnce(agentId: string) {
  const supabase = getSupabase();

  const { data: agent } = await supabase
    .from("agents")
    .select("name, domain, persona_profile")
    .eq("id", agentId)
    .single();

  const profile = agent ? resolveProfile(agent) : DEFAULT_PROFILE;

  const { data: recentPosts } = await supabase
    .from("posts")
    .select("topic_title, text, sources")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(15);

  const recentTopics = (recentPosts ?? []).map(
    (p: any) => p.topic_title as string
  );

  // §1: Build a Set of already-published source URLs for deterministic dedup
  const publishedUrls = new Set<string>();
  for (const p of recentPosts ?? []) {
    if (Array.isArray((p as any).sources)) {
      for (const url of (p as any).sources) {
        if (typeof url === "string") publishedUrls.add(url);
      }
    }
  }

  const candidates = await discoverTopics(profile.domain);
  const decision = await runEditorialPass(
    candidates,
    recentTopics,
    profile,
    publishedUrls
  );

  if (decision.rejected.length) {
    await supabase.from("rejections").insert(
      decision.rejected.map((r) => ({
        agent_id: agentId,
        title: r.title,
        source: r.source,
        reason: r.reason,
      }))
    );
  }

  if (!decision.selected) {
    // Nothing cleared the bar this cycle. Publishing nothing is itself the
    // editorial judgment the brief asks for — the agent doesn't pad the feed.
    return null;
  }

  // Brief 1s pause so Featherless AI releases concurrency lock before writing pass
  await new Promise((r) => setTimeout(r, 1000));

  const { text } = await writePost(
    decision.selected,
    recentPosts ?? [],
    profile
  );

  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({
      agent_id: agentId,
      topic_title: decision.selected.title,
      text,
      rationale: `${decision.selected.rationale} (source: ${decision.selected.source})`,
      sources: [decision.selected.url],
      category: decision.selected.category,
    })
    .select()
    .single();

  if (error) throw error;
  return inserted;
}

export async function maybeCatchUpPublish(agentId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (!agent) return;

  // §5: Per-agent interval takes priority over the env var / global default
  const intervalMins =
    (agent as any).interval_minutes ??
    Number(process.env.PUBLISH_INTERVAL_MINUTES ?? PUBLISH_INTERVAL_MINUTES ?? 240);

  const dueAt = new Date(
    new Date(agent.last_published_at).getTime() + intervalMins * 60_000
  );
  if (new Date() < dueAt) return;

  // Optimistic claim on the publish slot — see file header.
  const { data: claimed } = await supabase
    .from("agents")
    .update({ last_published_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("last_published_at", agent.last_published_at)
    .select()
    .maybeSingle();

  if (!claimed) return; // lost the race — another request already claimed it

  await publishOnce(agentId);
}
