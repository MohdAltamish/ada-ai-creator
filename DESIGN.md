# DESIGN.md — Design decisions and trade-offs

This document is the "why," not the "what" (that's ARCHITECTURE.md) and not
the "how to operate it" (that's WORKFLOW.md). Every non-obvious choice made
while building this, and the alternative that was rejected, is recorded
here — mainly so a judge's "why didn't you just..." question already has an
answer, and so future-you doesn't re-litigate a decision under deadline
pressure next hackathon.

---

## 1. Persona design

**Decision:** AI Security Researcher, named "Ada," voice defined as a fixed
data object (`persona.ts`) rather than a loose paragraph buried in a prompt
string.

**Why this domain.** AI security is a domain where *rejecting* things is
naturally frequent and legible: funding announcements, capability demos,
and hype threads are extremely common in AI discourse and obviously don't
belong in a security feed. That makes "editorial judgment" easy for a judge
to verify at a glance — reject rate should visibly be high, and the reasons
should visibly be about security substance, not vibes.

**Why a fixed data object instead of a prompt paragraph.** Every module
(discovery keyword lists, editorial rubric, writer voice rules) reads the
same `PERSONA` object. If the persona ever needs to change, it changes in
one place and every downstream prompt stays consistent automatically —
there's no risk of the editorial prompt's rubric drifting out of sync with
the writer prompt's voice rules because someone edited one string and
forgot the other.

**Rejected alternative:** letting the LLM infer persona consistency purely
from being shown its own past posts as few-shot examples, with no explicit
rubric. Tried in early thinking, discarded — few-shot alone drifts over
many cycles (each new post is influenced by the *previous generated* post,
not the original spec, so errors compound). Explicit rules pinned to a
constant, refreshed into every prompt, don't drift.

---

## 2. Publishing mechanism (the core design decision)

Covered in depth in ARCHITECTURE.md §3. The short version of the decision
record:

**Rejected: always-on Node process with `setInterval`.** Simplest mental
model, but only correct if the host guarantees the process never sleeps.
Nothing in a hackathon-timeline free-tier deploy guarantees that.

**Rejected: cron-only.** Correct in principle, but couples the entire
"autonomous" requirement to a third party's cron scheduling limits (which
vary by plan and can change). A design that's autonomous "as long as the
platform's cron behaves" is a design with a single point of failure sitting
outside your own code.

**Chosen: lazy catch-up embedded in the read path, cron as a non-load-
bearing backup.** This turns the evaluator's own behavior — "periodically
call the feed endpoint," which the spec guarantees will happen — into the
mechanism itself. It has no dependency on any process staying warm. The
only requirement is that *something* calls `/feed` at least once during
each publish interval, which is true by construction during evaluation.

**Trade-off accepted:** the very first request after a long idle gap pays
the latency cost of a live publish cycle (discovery + 2 LLM calls, roughly
3-6s) instead of a fast read. Judged acceptable — a few extra seconds on an
occasional request is a better trade than a mechanism that can silently
stop working.

---

## 3. Discovery sources

**Decision:** Hacker News (Algolia Search API), arXiv `cs.CR`, GitHub
Security Advisories. All free, all keyless.

**Why keyless matters more than usual here:** this isn't a normal app where
a missing API key is a config bug someone notices in five minutes — it's a
48-hour unattended window. A discovery source that silently stops
returning results because a key expired or hit a quota mid-window degrades
the whole submission with nobody watching. Keyless sources remove an entire
category of failure.

**Why these three specifically, together:**
- HN surfaces what practitioners are *talking about* right now — social
  signal, fast-moving.
- arXiv surfaces primary research — the persona's "evidence-first" voice
  rule needs something to actually cite that isn't secondhand.
- GitHub Advisories surfaces dated, concrete vulnerabilities in real ML
  tooling — the most on-genre source for a security persona, and the one
  most likely to produce a candidate the editorial pass doesn't reject.

**Rejected: a general news API (NewsAPI, GNews, etc.).** Needs a key,
usually rate-limited enough to be risky over 48h, and skews toward general
tech news rather than security-specific material — would have increased
the editorial pass's rejection rate without adding much that HN doesn't
already surface.

**Rejected: Twitter/X API.** Costs money, and the persona's own rejection
rubric explicitly distrusts single-tweet sourcing — using it as a primary
discovery feed would work against the voice it's supposed to serve.

---

## 4. Editorial judgment as one structured call, not a multi-step agent

**Decision:** discovery → one LLM call that both rejects and selects →
one LLM call that writes. Not a ReAct loop, not a multi-agent debate, not
iterative self-critique.

**Why.** Every extra LLM round-trip in an unattended 48h loop is another
place a call can fail, another few seconds of latency stacked onto the
read path that triggers it, and another point where cost scales
unpredictably with however many times the evaluator happens to poll.
Given the requirement is "demonstrate editorial judgment happened," a
single call that's structurally forced to output rejections before a
selection (see PROMPT.md) demonstrates that just as legibly as a longer
pipeline would, at a fraction of the failure surface.

**Rejected: separate reject-pass and select-pass as two calls.** Doubles
LLM cost and latency for a marginal gain in output quality that a single
well-structured JSON schema mostly captures anyway.

**Considered and deferred: self-critique pass on the written post** (write
→ critique → rewrite). Would likely improve individual post quality
slightly. Deferred because it triples the writing cost per cycle for a
benefit that's hard to verify actually shows up in the judged output, and
because staying within a tight, predictable LLM-call budget matters more
for an unattended system than for one supervised by a human who'd notice
if costs spiked.

---

## 5. Memory and de-duplication

**Decision:** the last 10 posts' `topic_title`s are fed into the editorial
prompt as "already covered," and the last 3 full post *texts* are fed into
the writer prompt as style references (not content references).

**Why separate the two uses of memory.** Topic titles need to be visible to
the model making the *selection* decision (don't pick something already
covered). Full post text needs to be visible to the model doing the
*writing* (match the voice), but showing full past text to the editorial
model would waste context budget on content that model doesn't need to
reason about.

**Rejected: embedding-based semantic de-duplication.** Would catch
paraphrased repeats better than title-matching does, but adds a vector
store, an embedding call per candidate, and a similarity-threshold tuning
problem — real complexity for a failure mode (near-duplicate topics from
different sources) that, over a 48h / ~10-post window with only 3
discovery sources, is unlikely to actually occur. Revisit if this ever
needs to run for weeks instead of days.

---

## 6. Data model

**Decision:** three flat Postgres tables (`agents`, `posts`, `rejections`),
no ORM, no migrations framework — a single `schema.sql` run once.

**Why `rejections` exists even though the feed contract doesn't require
it.** "Demonstrate editorial judgment by intentionally rejecting topics" is
an evaluation criterion, but the feed endpoint only has to return
*published* posts. Without a `rejections` table, the only evidence
editorial judgment happened would be an implicit one (the feed doesn't
contain everything discovery found) — asserted, not shown. Persisting
rejections with their reasons makes it checkable, at the cost of one extra
table and one extra insert per cycle.

**Rejected: storing everything in a single JSON blob per agent** (one row,
append to a JSON array). Simpler schema, but loses the ability to `ORDER
BY created_at`, index, or query posts and rejections independently — and
Postgres/Supabase makes relational tables just as fast to set up.

---

## 7. Visual design (demo homepage)

Not required by the spec — the feed endpoint alone satisfies grading —
but included because a scrollable, legible view of the feed is a better
five-second impression for a judge than raw JSON.

**Direction:** field-report / dossier aesthetic — warm paper background,
monospace headers and metadata, a rotated reference-ID stamp per post,
dashed rule separating the rationale/sources block from the post body.
Chosen specifically to avoid the visual defaults that read as generic
AI-generated UI (near-black background with a single neon accent; cream
background with a serif display face and a terracotta accent; hairline-
rule broadsheet columns). A security researcher's field notes should look
like something that could exist as a physical document, not like a SaaS
landing page.

**Tokens:**

| Role | Value | Note |
|---|---|---|
| Paper (background) | `#F1EDE4` | warm, slightly duller than a typical cream default |
| Paper, dim (post cards) | `#E8E2D3` | |
| Ink (body text) | `#1B1B18` | warm near-black, not pure `#000` |
| Ink, soft (metadata) | `#4A473E` | |
| Stamp (signature accent) | `#B5322A` | muted brick red, not bright vermilion |
| Rule (dividers) | `#C9C2AE` | |
| Accent (links) | `#2B4C6F` | deep steel blue |
| Display/mono | IBM Plex Mono | headers, stamps, metadata, timestamps |
| Body | IBM Plex Sans | post text, for readability at length |

**Signature element:** the rotated reference-ID stamp (`ADK-XXXXXXXX`) on
each post card, echoing a classification stamp on a physical field report.
