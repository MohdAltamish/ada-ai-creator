// This is the "editorial judgment" the brief asks for. It's a single LLM
// call that's forced to reject before it's allowed to select, given the
// persona's explicit standards and what's already been covered. Rejections
// are returned alongside the pick so callers can log *why* things didn't
// make the cut, not just what did.
//
// §1 of CHANGES.md: deterministic URL dedup before LLM call.
// §4 of CHANGES.md: category field in output.

import { generateJSON } from "./llm";
import type { Candidate } from "./discovery";
import type { PersonaProfile } from "./persona";
import { DEFAULT_PROFILE } from "./persona";

export interface EditorialDecision {
  selected: (Candidate & { rationale: string; category: string }) | null;
  rejected: { title: string; source: string; reason: string }[];
}

interface RawDecision {
  rejected: { idx: number; reason: string }[];
  selectedIdx: number | null;
  selectionRationale: string;
  category: string;
}

export async function runEditorialPass(
  candidates: Candidate[],
  recentTopics: string[],
  profile?: PersonaProfile,
  publishedUrls?: Set<string>
): Promise<EditorialDecision> {
  const p = profile ?? DEFAULT_PROFILE;

  if (candidates.length === 0) {
    return { selected: null, rejected: [] };
  }

  // §1 Layer 1: deterministic URL dedup — drop any candidate whose URL
  // was already published. Zero LLM cost, catches the exact failure mode
  // of rediscovering the same story with a slightly different headline.
  let pool = candidates;
  if (publishedUrls && publishedUrls.size > 0) {
    pool = pool.filter((c) => !publishedUrls.has(c.url));
  }

  // De-dupe by title and cap the list — keeps the prompt small and cheap.
  const seen = new Set<string>();
  pool = pool.filter((c) => {
    const key = c.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (pool.length === 0) {
    return { selected: null, rejected: [] };
  }

  const trimmed = pool.slice(0, 25).map((c, i) => ({
    idx: i,
    title: c.title,
    summary: c.summary.slice(0, 300),
    source: c.source,
    publishedAt: c.publishedAt,
  }));

  const prompt = `You are the editorial judgment module for an AI persona.

PERSONA
Name: ${p.name}
Domain: ${p.domain}
Interests: ${p.interests.join("; ")}
Reject anything matching: ${p.rejects.join("; ")}

RECENTLY COVERED TOPICS (reject exact repeats AND the same underlying story phrased differently — a genuinely new angle on an old topic is fine, but a rewording of an already-covered event is not):
${recentTopics.length ? recentTopics.map((t) => `- ${t}`).join("\n") : "(none yet — this is the first post)"}

CANDIDATE TOPICS:
${JSON.stringify(trimmed, null, 2)}

TASK
1. Filter out exact duplicates of recently covered topics or completely irrelevant items.
2. Select the single best, most insightful candidate (selectedIdx) that fits ${p.name}'s domain (${p.domain}). Pick the top choice even if standards are high.
3. Include brief rejection reasons for items that were not selected.
4. selectionRationale: 1-2 sentences on why this selected topic matters right now.
5. category: Classify the selected topic into exactly one of: "Vulnerability Disclosure", "Research Finding", "Industry Incident", "Tooling Risk", "Methodology", "Policy & Governance", "Threat Intelligence".

Respond as JSON only:
{"rejected": [{"idx": number, "reason": string}], "selectedIdx": number, "selectionRationale": string, "category": string}`;

  const result = await generateJSON<RawDecision>({
    system: `You are an expert editor for ${p.name} (${p.domain}). Evaluate the candidate topics and select the single best one to write about. Output valid JSON only.`,
    prompt,
    temperature: 0.6,
  });

  const rejected = result.rejected
    .map((r) => {
      const c = pool[r.idx];
      return c ? { title: c.title, source: c.source, reason: r.reason } : null;
    })
    .filter((x): x is { title: string; source: string; reason: string } => x !== null);

  if (result.selectedIdx === null || result.selectedIdx === undefined) {
    return { selected: null, rejected };
  }

  const chosen = pool[result.selectedIdx];
  if (!chosen) {
    return { selected: null, rejected };
  }

  return {
    selected: {
      ...chosen,
      rationale: result.selectionRationale,
      category: result.category || "Research Finding",
    },
    rejected,
  };
}
