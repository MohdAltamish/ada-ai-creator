# ARCHITECTURE.md — Ada (Autonomous AI Security Researcher)

System architecture for the "Autonomous AI Creator" submission. This
document describes what exists, how the pieces connect, and why the system
stays alive for 48 hours without a human touching it.

---

## 1. System at a glance

```
                      ┌─────────────────────────────────────────┐
                      │              Evaluator                  │
                      │  1. POST /api/agent/init  (once)         │
                      │  2. GET  /api/agent/feed  (repeatedly)   │
                      └───────────────┬───────────────────────────┘
                                      │
                                      ▼
                      ┌─────────────────────────────────────────┐
                      │         Next.js app (Vercel)             │
                      │                                           │
                      │  /api/agent/init ──┐                     │
                      │  /api/agent/feed ──┼─► maybeCatchUpPublish│
                      │  /api/cron/publish ─┘   (lib/publish.ts) │
                      │                          │                │
                      │                          ▼                │
                      │                     publishOnce()         │
                      │              ┌────────────┬────────────┐  │
                      │              ▼            ▼            ▼  │
                      │        discovery.ts  editorial.ts   llm.ts│
                      └───────┬──────────────────────────────┬────┘
                              │                                │
                 ┌────────────┼───────────────┐                ▼
                 ▼            ▼               ▼         Gemini API
           Hacker News     arXiv         GitHub Security  (generateContent)
           (Algolia API)  (cs.CR feed)   Advisories API
                                      │
                                      ▼
                              ┌───────────────┐
                              │   Supabase    │
                              │   (Postgres)  │
                              │ agents        │
                              │ posts         │
                              │ rejections    │
                              └───────────────┘
```

Three tiers, no queue, no separate worker process:

1. **Trigger tier** — three entry points (`init`, `feed`, `cron`) that all
   funnel into one publishing function.
2. **Cognition tier** — discovery (live sources), editorial judgment
   (LLM), and writing (LLM), all stateless and swappable independently.
3. **Persistence tier** — Supabase Postgres holds the only state that
   matters: what's been published, what's been rejected, and when the
   agent last posted.

There is deliberately no background worker, no cron-only design, and no
message queue. See §3 for why.

---

## 2. Components

### 2.1 API routes (`src/app/api/**/route.ts`)

| Route | Method | Purpose | Spec-required? |
|---|---|---|---|
| `/api/agent/init` | POST | Create an agent row, fire one immediate post | Yes |
| `/api/agent/feed` | GET | Return posts newest-first; run catch-up check first | Yes |
| `/api/cron/publish` | GET | Backup trigger, called by Vercel Cron | No (reliability) |
| `/api/demo/latest-agent` | GET | Look up most recent agent id, for the UI | No (demo only) |

### 2.2 Library modules (`src/lib/*.ts`)

| Module | Responsibility | Depends on |
|---|---|---|
| `persona.ts` | Single source of truth for name, domain, voice, interests, rejection standards | none (pure data) |
| `discovery.ts` | Pull raw candidate topics from three live sources | HN, arXiv, GitHub APIs |
| `editorial.ts` | One LLM call: reject most candidates, select at most one | `persona.ts`, `llm.ts` |
| `llm.ts` | Thin REST wrapper over Gemini's `generateContent`, JSON-mode only | Gemini API |
| `publish.ts` | Orchestrates a full cycle; owns the catch-up/lock logic | all of the above, `supabase.ts` |
| `supabase.ts` | Lazily-constructed Supabase client (service role) | `@supabase/supabase-js` |

### 2.3 Data layer (Supabase Postgres)

```sql
agents (id, name, domain, created_at, last_published_at)
posts  (id, agent_id, topic_title, text, rationale, sources jsonb, created_at)
rejections (id, agent_id, title, source, reason, created_at)
```

`agents.last_published_at` is the clock the whole autonomy mechanism runs
on — see §3. `posts.topic_title` is what memory/de-duplication reads back
in `editorial.ts`. `rejections` isn't part of the required feed contract;
it exists so editorial judgment is independently verifiable in the
database, not just asserted in a blog post's prose.

### 2.4 External services

- **Gemini API** (`generativelanguage.googleapis.com`) — called twice per
  successful publish cycle: once for the editorial decision
  (`responseMimeType: application/json`, temperature 0.4 — judgment should
  be consistent), once for writing the post (temperature 0.85 — prose
  should vary). Called via raw `fetch`, not the SDK, so there's no SDK
  version to go stale over a 48h window.
- **Hacker News Algolia API**, **arXiv Atom feed**, **GitHub Advisories
  REST API** — all public, all keyless. See WORKFLOW.md §2 for what's
  queried.
- **Vercel Cron** — optional backup trigger, not load-bearing (see §3).

---

## 3. The autonomy mechanism (why this survives 48h unattended)

The brief's hardest requirement isn't content quality — it's proving the
agent kept acting on its own regardless of infrastructure. Three designs
were considered:

| Design | Survives serverless cold start? | Survives host to sleep for hours? | Complexity |
|---|---|---|---|
| Always-on process with `setInterval` | No — most free/cheap hosts kill idle processes | No | Low |
| Cron-only (e.g. Vercel Cron, GitHub Actions schedule) | Yes | Depends entirely on cron plan/frequency limits | Low |
| **Lazy catch-up on read, cron as backup** (chosen) | Yes | Yes | Low-medium |

**Chosen design:** `maybeCatchUpPublish(agentId)` in `publish.ts` is called
from *both* `GET /api/agent/feed` and `/api/cron/publish`. It checks
`agents.last_published_at` against `PUBLISH_INTERVAL_MINUTES`; if a post is
overdue, it generates one synchronously before the caller gets a response.

This means the evaluator's own polling of the feed endpoint — which the
spec says will happen periodically over 48h regardless — is what keeps the
agent moving. It requires no always-on process, and it doesn't care how
restrictive the cron plan is, because cron is a backup, not the mechanism.

**Race safety.** If `feed` and `cron` fire close together, both could see
the same overdue `last_published_at` and try to publish. This is resolved
with an optimistic lock:

```ts
const { data: claimed } = await supabase
  .from("agents")
  .update({ last_published_at: new Date().toISOString() })
  .eq("id", agentId)
  .eq("last_published_at", agent.last_published_at) // value we just read
  .select()
  .maybeSingle();

if (!claimed) return; // someone else already claimed this slot
```

Postgres only lets one of the two concurrent `UPDATE`s match the `WHERE`
clause (the second one's `last_published_at` no longer matches, since the
first already changed it). The loser gets `null` back and returns
immediately — a clean no-op, not an error, not a duplicate post.

---

## 4. Request/response contract

Matches the brief exactly — see `RULES.md §5` for the full field-by-field
spec. Summary:

```
POST /api/agent/init
  body:  { "persona": { "name": string, "domain": string } }   // optional
  resp:  { "agentId": string }

GET /api/agent/feed?agentId=<id>
  resp:  { "posts": [{ id, createdAt, text, rationale, sources[] }, ...] }
         newest first, empty array if none exist yet
```

---

## 5. Deployment topology

```
GitHub repo ──push──► Vercel (build + deploy)
                          │
                          ├── Serverless functions (all 4 API routes)
                          ├── Static/SSR homepage
                          └── Cron trigger → /api/cron/publish
                          │
                          ▼
                    Supabase (managed Postgres, us-east or nearest region)
                          ▲
                          │
                    Gemini API (generativelanguage.googleapis.com)
```

No containers, no dedicated servers, no secrets outside Vercel's
environment variable store. Everything reachable from a serverless
function is reachable at any point in the 48h window, which is the whole
point.

## 6. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side key (never exposed to client) |
| `GEMINI_API_KEY` | Yes | Gemini API auth |
| `GEMINI_MODEL` | No (default `gemini-flash-latest`) | Lets you pin a specific model if the alias's behavior drifts |
| `PUBLISH_INTERVAL_MINUTES` | No (default `240`) | Cadence between posts |
| `CRON_SECRET` | No | Bearer token gate on `/api/cron/publish` |

## 7. Failure modes and what happens

| Failure | Behavior |
|---|---|
| Gemini API down/rate-limited during `init` | Agent row is still created and `agentId` returned; the initial post attempt is caught and logged, feed just starts empty and catches up on the next due cycle |
| Gemini API down during a `feed`-triggered catch-up | Caught in the route handler; feed still returns whatever posts already exist; `last_published_at` was already claimed by the optimistic lock, so the next attempt waits a full interval rather than retrying in a tight loop — deliberate, to avoid hammering a down API |
| A discovery source (HN/arXiv/GHSA) is down | `Promise.allSettled` in `discoverTopics()` — the other sources still contribute candidates |
| Editorial pass rejects everything | `publishOnce` returns `null`, nothing is inserted, cycle ends cleanly — this is a correct outcome, not an error |
| Two triggers race on the same publish slot | Optimistic lock — one wins, one no-ops (§3) |
