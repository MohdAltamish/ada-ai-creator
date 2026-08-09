# PROMPTS.md — LLM prompts, verbatim

Two prompts run per publish cycle: one editorial (reject/select), one
writing. Both call `generateJSON()` in `src/lib/llm.ts`, which sets
Gemini's `generationConfig.responseMimeType` to `application/json` — the
model is constrained to emit parseable JSON, not asked nicely to. If you
change either prompt, keep the closing "respond as JSON only" instruction
and the exact key names, since `editorial.ts` and `publish.ts` parse those
keys directly with no fallback.

Both prompts pull from `src/lib/persona.ts` at call time — there is
exactly one place persona voice/rubric text lives, referenced by variable
below (`${PERSONA.x}`), not copy-pasted into each prompt separately. Keep
it that way; a persona edit should never require touching this file.

---

## 1. Editorial prompt (`src/lib/editorial.ts`, `runEditorialPass`)

### System instruction

```
You are a strict, security-savvy editor. You reject more candidates than
you accept. Output valid JSON only, no markdown fences, no commentary
outside the JSON.
```

### User prompt template

```
You are the editorial judgment module for an AI persona.

PERSONA
Name: ${PERSONA.name}
Domain: ${PERSONA.domain}
Interests: ${PERSONA.interests.join("; ")}
Reject anything matching: ${PERSONA.rejects.join("; ")}

RECENTLY COVERED TOPICS (reject exact repeats; a genuinely new angle on an old topic is fine):
${recentTopics.map(t => `- ${t}`).join("\n") || "(none yet — this is the first post)"}

CANDIDATE TOPICS:
${JSON.stringify(trimmedCandidates, null, 2)}

TASK
1. Reject every candidate that fails the persona's standards or duplicates recent coverage. One-sentence reason each.
2. From what survives, select exactly ONE best candidate. If nothing survives, selectedIdx is null — that is a valid, expected outcome, not a failure.
3. selectionRationale: 1-3 sentences on why this topic and why it matters right now.

Respond as JSON only:
{"rejected": [{"idx": number, "reason": string}], "selectedIdx": number | null, "selectionRationale": string}
```

`trimmedCandidates` is capped at 25 title-deduplicated candidates, each
reduced to `{idx, title, summary (300 chars), source, publishedAt}` —
enough for the model to judge relevance without the prompt ballooning past
what's needed. Call temperature: **0.4** — this is a judgment call, not a
creative one; low temperature keeps rejection reasoning consistent across
cycles rather than picking a different "mood" each time.

### Design notes on this prompt

- **Step 1 before step 2 is load-bearing, not stylistic.** Ordering
  "reject" before "select" in the instructions, and requiring rejection
  reasons as part of the same JSON object as the selection, makes the
  model justify what it's throwing out in the same breath as what it's
  keeping — it can't silently cherry-pick a favorite without articulating
  why the others failed.
- **`selectedIdx: null` is explicitly named as a valid outcome** in the
  instructions themselves, not left implicit. Without that sentence, a
  model under an implicit "always produce a recommendation" prior will
  strain to select something mediocre rather than report an empty result —
  exactly the failure mode "editorial judgment" is supposed to prevent.
- **Recent topics are titles only, not full text.** The editorial model
  needs to know *what's been covered*, not *how it was phrased* — full
  text would spend context budget this call doesn't need (see DESIGN.md
  §5 for why that's split from the writer prompt).

---

## 2. Writer prompt (`src/lib/publish.ts`, `writePost`)

### System instruction

```
You write as ${PERSONA.name}, ${PERSONA.domain} researcher. Stay strictly
in character. Output valid JSON only.
```

### User prompt template

```
Write ONE new post in ${PERSONA.name}'s voice about this topic.

TOPIC: ${chosen.title}
CONTEXT: ${chosen.summary}
SOURCE (${chosen.source}): ${chosen.url}
WHY THIS WAS CHOSEN: ${chosen.rationale}

VOICE RULES:
${PERSONA.voice.map(v => `- ${v}`).join("\n")}

PAST POSTS, FOR VOICE CONSISTENCY ONLY (do not repeat their content, match tone/structure):
${lastThreePostTexts.join("\n---\n")}

Write 80-160 words of plain text. No markdown headers, no hashtags, no
emoji, no "As an AI...".

Respond as JSON only: {"text": string}
```

(The past-posts block is omitted entirely on the very first post, when
there's nothing yet to reference — not sent as an empty section.)

Call temperature: **0.85** — the opposite instinct from the editorial
call. Selection should be stable; prose should have some texture cycle to
cycle so ten posts in a row don't read as templated.

### Design notes on this prompt

- **"For voice consistency only... do not repeat their content"** is an
  explicit guard against the most common few-shot failure: the model
  treating prior examples as source material to riff on rather than pure
  style reference, which over many cycles would slowly turn "past security
  posts" into "paraphrases of past security posts."
- **The rationale is passed into the writer, not just stored separately.**
  The post's *reasoning* for existing (why this topic, why now) shapes how
  it's framed, even though that rationale is also independently persisted
  and returned via the API's `rationale` field — the model gets it as
  writing context, the evaluator gets it as a structured field, and they
  stay in sync because it's the same string in both places (see
  `publish.ts`: `rationale: `${decision.selected.rationale} (source: ...)``).
- **Negative constraints are explicit** (no headers, no hashtags, no
  emoji, no "As an AI") because absent an explicit ban, general-purpose
  chat models default toward exactly these — they're the tells of
  generic AI copy, and the persona's whole voice is built around *not*
  reading as generic AI copy.

---

## 3. Extending these prompts

If you add a new discovery source, no prompt changes are needed — new
candidates just flow into the same `CANDIDATE TOPICS` block.

If you change the persona (new domain, new voice rules), edit
`persona.ts` only — both prompts above pick up the change automatically
next cycle, no need to touch this file or find every place voice text got
copy-pasted.

If you add a new required output field (e.g. a severity tag), add it to
the JSON schema in **both** the prompt's closing instruction and the
TypeScript interface that parses it (`RawDecision` in `editorial.ts` or
the inline type in `writePost`) — the parser has no fallback for missing
keys, so those two need to move together.
