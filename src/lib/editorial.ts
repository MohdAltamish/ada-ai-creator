// This is the "editorial judgment" the brief asks for. It's a single LLM
// call that's forced to reject before it's allowed to select, given the
// persona's explicit standards and what's already been covered. Rejections
// are returned alongside the pick so callers can log *why* things didn't
// make the cut, not just what did.

import { PERSONA } from "./persona";
import { generateJSON } from "./llm";
import type { Candidate } from "./discovery";

export interface EditorialDecision {
  selected: (Candidate & { rationale: string }) | null;
  rejected: { title: string; source: string; reason: string }[];
}

interface RawDecision {
  rejected: { idx: number; reason: string }[];
  selectedIdx: number | null;
  selectionRationale: string;
}

export async function runEditorialPass(
  candidates: Candidate[],
  recentTopics: string[],
  personaName?: string,
  personaDomain?: string
): Promise<EditorialDecision> {
  const name = personaName || PERSONA.name;
  const domain = personaDomain || PERSONA.domain;
  if (candidates.length === 0) {
    return { selected: null, rejected: [] };
  }

  // De-dupe by title and cap the list — keeps the prompt small and cheap.
  const seen = new Set<string>();
  const pool = candidates.filter((c) => {
    const key = c.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const trimmed = pool.slice(0, 25).map((c, i) => ({
    idx: i,
    title: c.title,
    summary: c.summary.slice(0, 300),
    source: c.source,
    publishedAt: c.publishedAt,
  }));

  const prompt = `You are the editorial judgment module for an AI persona.

PERSONA
Name: ${name}
Domain: ${domain}
Interests: ${PERSONA.interests.join("; ")}
Reject anything matching: ${PERSONA.rejects.join("; ")}

RECENTLY COVERED TOPICS (reject exact repeats; a genuinely new angle on an old topic is fine):
${recentTopics.length ? recentTopics.map((t) => `- ${t}`).join("\n") : "(none yet — this is the first post)"}

CANDIDATE TOPICS:
${JSON.stringify(trimmed, null, 2)}

TASK
1. Reject every candidate that fails the persona's standards or duplicates recent coverage. One-sentence reason each.
2. From what survives, select exactly ONE best candidate. If nothing survives, selectedIdx is null — that is a valid, expected outcome, not a failure.
3. selectionRationale: 1-3 sentences on why this topic and why it matters right now.

Respond as JSON only:
{"rejected": [{"idx": number, "reason": string}], "selectedIdx": number | null, "selectionRationale": string}`;

  const result = await generateJSON<RawDecision>({
    system:
      "You are a strict, security-savvy editor. You reject more candidates than you accept. Output valid JSON only, no markdown fences, no commentary outside the JSON.",
    prompt,
    temperature: 0.4,
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
    selected: { ...chosen, rationale: result.selectionRationale },
    rejected,
  };
}
