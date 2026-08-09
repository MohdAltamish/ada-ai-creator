# CHANGES.md

Everything that changed this pass, in one place. Sections 1-6 are already
implemented in the project (`src/lib/*.ts`, new API routes, schema
migration). Section 7 is a UI spec, not yet coded — written in enough
detail to implement directly, since you asked for changes over full code
this round.

---

## 1. Bug fix: duplicate posts

Your screenshot showed six near-identical posts about the same "OpenAI
pauses Astra" story and three about the same prompt-injection thread —
all citing the *exact same source URL* each time, just reworded headlines.

**Root cause:** de-duplication only compared `topic_title` strings. Each
rediscovery of the same story got a slightly different LLM-written
headline, so exact-match title comparison never caught it.

**Fix — two layers, in `src/lib/editorial.ts` and `src/lib/publish.ts`:**

- **Layer 1 (new, deterministic, runs before any LLM call):**
  `publish.ts` now builds a `Set` of every source URL already published for
  the agent (from the last 15 posts) and passes it into
  `runEditorialPass()`, which drops any candidate whose `url` is already
  in that set — *before* it's even shown to the model:
  ```ts
  const urlFiltered = candidates.filter((c) => !publishedUrls.has(c.url));
  ```
  This is the actual fix — deterministic, zero LLM cost, catches the exact
  failure mode in your screenshot.
- **Layer 2 (existing, tightened):** the editorial prompt's duplicate
  instruction now explicitly says *"same underlying story phrased
  differently counts as a duplicate — reject it"* instead of just "reject
  exact repeats," as a second line of defense for near-duplicates that
  don't share a URL (two different articles about the same event).

## 2. Schema migration — additive, safe to re-run on your live project

```sql
alter table agents add column if not exists interval_minutes int not null default 240;
alter table agents add column if not exists persona_profile jsonb;
alter table posts add column if not exists category text;
```

Run this once in the Supabase SQL editor before deploying the rest. No
existing data is touched.

## 3. Real multi-domain persona support

Your "Cipher" / "Quantum Cryptography" test agent in the screenshot was
cosmetic — the domain field was stored, but discovery keywords, the
editorial rubric, and the voice rules were still the hardcoded AI-Security
ones underneath.

**Fix:**
- `src/lib/persona.ts` now exports a `PersonaProfile` type, a
  `DEFAULT_PROFILE` constant (your curated Ada/AI-Security persona,
  unchanged), and `generatePersonaProfile(name, domain)` — one LLM call,
  made once at `init` time for any non-default name/domain, that
  synthesizes `{bio, voice[], interests[], rejects[], discoveryKeywords[]}`
  tailored to whatever domain was typed into the Custom Domain field.
  Stored on `agents.persona_profile`.
- `discovery.ts`, `editorial.ts`, and `publish.ts` all now take a
  `profile: PersonaProfile` parameter instead of importing a static
  constant. `publish.ts` resolves which profile to use:
  ```ts
  function resolveProfile(agent: any): PersonaProfile {
    if (agent.persona_profile) return agent.persona_profile as PersonaProfile;
    if (isDefaultPersona(agent.name, agent.domain)) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, name: agent.name, domain: agent.domain };
  }
  ```
- `discovery.ts`'s arXiv query no longer hardcodes `cat:cs.CR` — it builds
  the query from `profile.discoveryKeywords` instead, so a domain like
  "Quantum Cryptography" actually gets relevant arXiv results instead of
  being filtered through an AI-security-only category.

## 4. Category field

`editorial.ts`'s JSON output gained a `category` field — the model is
already reasoning about what kind of topic it's picking, so asking it to
label it ("Vulnerability Disclosure," "Research Finding," "Industry
Incident," "Tooling Risk," "Methodology") was a small addition. Stored on
`posts.category`, returned as an extra field in `/api/agent/feed`
alongside the five required fields — additive, doesn't touch the required
schema.

## 5. Per-agent configurable publish interval

`agents.interval_minutes` (defaults to 240, or whatever `intervalMinutes`
is passed to `init`). `maybeCatchUpPublish()` now reads the per-agent
value instead of only the global `PUBLISH_INTERVAL_MINUTES` env var.

## 6. New endpoints (demo/control-panel only — not part of the graded contract)

| Endpoint | Method | Body/Query | Purpose |
|---|---|---|---|
| `/api/agent/publish-now` | POST | `{agentId}` | Forces a publish attempt immediately, bypassing the interval check — still goes through the same optimistic lock as every other trigger, so it can't double-post against a concurrent feed catch-up. Returns `{published: boolean}`; `false` is valid (editorial rejected everything that cycle). |
| `/api/agent/interval` | PATCH | `{agentId, intervalMinutes}` | Updates §5's per-agent cadence. |
| `/api/demo/rejections` | GET | `?agentId=&limit=5` | Last N rejected candidates + reasons, for the Editorial Judgment Log panel. |
| `/api/demo/latest-agent` | GET | — | Unchanged shape, now also returns `intervalMinutes`. |

`init` itself is otherwise contract-unchanged; it now additionally accepts
an optional `intervalMinutes` in the body and triggers §3's profile
generation for non-default personas.

---

## 7. UI spec — not yet built (this is what to implement in `page.tsx`)

`page.tsx` needs to become a client component (`"use client"`) — it's no
longer just a server-rendered read of one agent's feed, it has to hold
interactive state and call the endpoints above.

**State:** `agent` (`{id, name, domain, createdAt, intervalMinutes} | null`),
`posts[]`, `rejections[]`, `busy` (bool, disables buttons mid-request),
`newAgentName`, `newAgentDomain` (controlled form inputs).

**On mount:** `GET /api/demo/latest-agent` → if an agent comes back,
`GET /api/agent/feed?agentId=` and `GET /api/demo/rejections?agentId=&limit=5`
in parallel.

**Handlers:**
- `refreshFeed()` — re-fetches feed + rejections for the current agent. Used standalone by "Refresh Feed" and chained after the other actions below.
- `generateNow()` — set `busy`, `POST /api/agent/publish-now {agentId}`, `refreshFeed()`, clear `busy`. Button label swaps to "Generating…" while busy.
- `createAgent()` — `POST /api/agent/init {persona: {name: newAgentName, domain: newAgentDomain}}`, then set `agent` from the response (`id` comes back; `name`/`domain`/`createdAt`/`intervalMinutes` you already have client-side from the form + `Date.now()` + the 240 default — no need for a round trip), then `refreshFeed()`. Clear the form inputs after.
- `changeInterval(minutes)` — `PATCH /api/agent/interval {agentId, intervalMinutes: minutes}`, update `agent.intervalMinutes` locally on success.
- "View Raw JSON Feed (Judge View)" is not a handler — it's a plain `<a href="/api/agent/feed?agentId=${agent.id}" target="_blank">` styled as a button.

**Layout, top to bottom:**

1. **Control panel** — bordered card, `--paper-dim` background (already
   used for post cards — reuse it here so the panel and cards read as the
   same "dossier" material):
   - Small mono label: `⚡ INTERACTIVE AGENT CONTROLS`
   - Button row: **Generate Instant Post Now** (`.btn-solid`) · **Refresh
     Feed** (`.btn-outline`) · **View Raw JSON Feed (Judge View)**
     (`.btn-solid`, renders as the `<a>` above)
   - `Create New Agent / Custom Domain:` (`.field-label`), then a row of
     two `.field-input`s (name, domain placeholders like "Cipher" /
     "Quantum Cryptography" — matches what you were already testing) plus
     **Create & Initialize Persona** (`.btn-solid`, disabled until both
     fields are non-empty)
   - `Change Auto-Publish Interval Duration:` (`.field-label`), then a
     `.field-select` — options like 5 min (testing) / 30 min / 1h / 4h
     (default) / 6h / 12h / 24h — `onChange` calls `changeInterval`
     immediately, no separate save button
   - `.btn`, `.field-input`, `.field-select`, `.field-label` classes are
     already added to `globals.css` in this pass — ready to use.

2. **Header** — unchanged structure from before, just driven by
   `agent.name`/`agent.domain` instead of the old server-fetched value.

3. **Feed**, split into current vs. previous:
   ```ts
   const [current, ...previous] = posts; // posts is already newest-first
   ```
   - `current` renders in the existing post-card style plus: a small
     `LATEST` badge (new, top-left, accent-blue border/text — see badge
     CSS below) and a slightly heavier card border (2px vs 1px) so it
     reads as featured without a full redesign.
   - If `previous.length > 0`: a section heading — `PREVIOUS POSTS`, mono,
     uppercase, `--ink-soft`, sitting above a hairline rule — then map the
     rest with the existing (non-featured) card style, unchanged.
   - Every card (current and previous) gets a **category badge** next to
     the timestamp — only rendered when `post.category` is truthy (older
     posts from before this migration will have `category: null`; render
     nothing for those, not the literal string "null").

4. **Editorial Judgment Log** — new section, same `--paper-dim` bordered-
   card treatment as the control panel (bookends the page). Header:
   `🔍 EDITORIAL JUDGMENT LOG (LAST 5 REJECTED TOPICS)`. Below it, one row
   per rejection: `✗ {title} ({source}) — {reason}`, title in
   `text-decoration: line-through`, reason in normal weight, muted color.
   Only render the section if `rejections.length > 0`.

5. **Footer** — unchanged: `GET /api/agent/feed?agentId={agent.id}`.

**Suggested badge CSS** (not yet in `globals.css` — small enough to paste
directly where the other control-panel classes were added):
```css
.badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
}
.badge-latest {
  border-color: var(--accent);
  color: var(--accent);
}
```

---

## 8. Docs now stale (say the word and I'll pass over them)

`ARCHITECTURE.md`, `DESIGN.md`, `PROMPT.md`, `RULES.md`, `WORKFLOW.md` all
still describe the pre-this-pass system: `persona.ts` as a single fixed
constant, the editorial JSON schema without `category`, no mention of
per-agent intervals or the demo control endpoints. None of the *reasoning*
in them is wrong (the lazy-catch-up design, the optimistic lock, the
voice/rejection rules are all unchanged) — they just don't reflect
sections 1-7 above yet.
