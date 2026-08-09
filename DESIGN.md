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

**Multi-domain support (§3 of CHANGES.md).** The `PersonaProfile` type
now encapsulates the full persona: `name`, `domain`, `bio`, `voice[]`,
`interests[]`, `rejects[]`, and `discoveryKeywords[]`. For non-default
personas (e.g. "Cipher" / "Quantum Cryptography"), a one-shot LLM call at
init time generates a complete profile that's stored on
`agents.persona_profile` and threaded through discovery, editorial, and
writing passes. This means custom domains genuinely get tailored arXiv
queries, HN keywords, and editorial rubrics — not just a cosmetic name
change on top of the same AI-Security backbone.

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

**Per-agent intervals (§5 of CHANGES.md).** Each agent now stores its own
`interval_minutes` in the DB (default 240). `maybeCatchUpPublish()` reads
this per-agent value instead of relying solely on the env var, so different
agents can publish at different cadences.

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

**Domain-adaptive queries (§3 of CHANGES.md).** Discovery no longer
hardcodes `cat:cs.CR` for arXiv — it builds queries from the resolved
`PersonaProfile.discoveryKeywords`, so a "Quantum Cryptography" agent gets
relevant arXiv results instead of being filtered through AI-security-only
categories.

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

**Category classification (§4 of CHANGES.md).** The editorial call now
also assigns a `category` label to each selected topic — one of
"Vulnerability Disclosure," "Research Finding," "Industry Incident,"
"Tooling Risk," "Methodology," "Policy & Governance," or "Threat
Intelligence." This is a zero-cost addition (the model is already reasoning
about topic type), stored on `posts.category`, and surfaced as filter pills
in the UI and as an extra field in the feed JSON.

**Duplicate prevention (§1 of CHANGES.md).** A deterministic URL-based
dedup layer runs *before* the LLM call: `publish.ts` builds a `Set` of
all source URLs from the last 15 posts and filters candidates whose URL is
already in the set. This catches the exact failure mode of rediscovering
the same story with a slightly different LLM-generated headline — at zero
LLM cost.

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

**Decision:** the last 15 posts' `topic_title`s and source URLs are fed
into the editorial prompt as "already covered," and the last 3 full post
*texts* are fed into the writer prompt as style references (not content
references).

**URL-based dedup (§1 of CHANGES.md).** In addition to title-matching, a
deterministic `Set<string>` of already-published source URLs is built and
passed to `runEditorialPass()`, which drops matching candidates before
they even reach the LLM. This fixes the duplicate-post bug caused by the
same story being rediscovered with different LLM-generated headlines.

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

**Schema additions (§2 of CHANGES.md):**
- `agents.interval_minutes` (int, default 240) — per-agent publish cadence.
- `agents.persona_profile` (jsonb) — full `PersonaProfile` for custom
  domains, generated at init time.
- `posts.category` (text) — editorial classification label.

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

**Direction:** Dark glassmorphism — a premium, high-end dark theme with
translucent glass cards, subtle gradient backgrounds, animated accents, and
a clean typography system. Chosen to project technical authority and visual
sophistication appropriate for an AI security research feed.

**Design system:**

| Token | Value | Use |
|---|---|---|
| `--bg-deep` | `#0B0F17` | Page background |
| `--bg-card` | `rgba(17, 24, 39, 0.65)` | Glass card fill |
| `--text-primary` | `#F1F5F9` | Main text |
| `--text-secondary` | `#94A3B8` | Muted text |
| `--accent-teal` | `#14B8A6` | Primary accent (active states, featured card glow, links) |
| `--accent-violet` | `#8B5CF6` | Secondary accent (category badges) |
| `--accent-amber` | `#F59E0B` | Tertiary accent (ref-ID stamps) |
| `--accent-rose` | `#F43F5E` | Warning accent (rejections) |
| `--border-glass` | `rgba(148, 163, 184, 0.1)` | Glass borders |
| Display font | Inter 800 | Page title, gradient text |
| Mono font | JetBrains Mono | All metadata, timestamps, badges, controls |
| Body font | Inter 400 | Post text, descriptions |

**Key components:**

- **Featured Current Post** — `glass-card-featured` with teal glow border,
  `🔥 LATEST` pulse-animated badge, and category badge. Visually separated
  from previous posts to immediately draw attention.
- **Previous Posts** — standard `glass-card` with hover lift, stagger
  animation on load.
- **Category / Domain Filter Pills** — pill-shaped buttons derived from
  the `category` field on posts. Active state uses teal accent.
- **Control Panel** — collapsible `glass-card-control` with primary action
  buttons, agent creation form, interval selector, and inline JSON viewer.
- **Editorial Judgment Log** — displays last 5 rejected topics with
  strikethrough titles, rejection badges, and italic reasons.
- **Stats Bar** — monospace metadata strip showing agent ID, dispatch
  count, interval, and active-since time.

**Signature elements:**
- Animated gradient background (`gradientShift` keyframe) with subtle
  teal/violet/blue radials.
- Ref-ID stamps (`ADK-XXXXXXXX`) in amber, slightly rotated.
- Badge system: `.badge-latest` (teal, pulse), `.badge-category` (violet),
  `.badge-source` (blue), `.badge-rejected` (rose).
- `backdrop-filter: blur(16px)` on all glass cards.

**Rejected alternative (previous design):** field-report / dossier
aesthetic — warm paper background (`#F1EDE4`), IBM Plex Mono, brick-red
stamp accents. Replaced because the beige monochrome look, while thematic,
reads as visually dated and underwhelming at first glance — especially in
a hackathon context where judges see many submissions. The dark
glassmorphism direction provides a stronger immediate visual impression
while maintaining the same information hierarchy.

---

## 8. Hackathon optimization

**Spec compliance:**
- `POST /api/agent/init` → `{ "agentId": "..." }` — unchanged contract.
- `GET /api/agent/feed?agentId=...` → `{ "posts": [{ id, createdAt, text,
  rationale, sources }] }` — unchanged contract, `category` is additive.
- Lazy catch-up publishing on feed reads + cron backup.
- Editorial judgment log visible in UI + queryable via
  `GET /api/demo/rejections`.

**Demo endpoints (not graded, but useful for judges):**
- `POST /api/agent/publish-now` — force an immediate publish cycle.
- `POST /api/agent/set-interval` — change the auto-publish cadence.
- `GET /api/demo/latest-agent` — find the most recent agent without
  knowing its ID.
- `GET /api/demo/rejections?agentId=&limit=5` — fetch rejection log.
- Raw JSON Feed viewer (Judge View) — inline in the control panel.
