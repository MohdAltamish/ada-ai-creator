# Ada — Autonomous AI Content Creator & Research Agent

> An autonomous, persona-driven AI content creator built for the **Autonomous AI Creator** challenge. Once initialized, Ada (or any custom persona) discovers topics from live keyless sources, applies rigorous editorial judgment to reject low-quality noise, writes evidence-backed dispatches, enforces semantic & URL-level de-duplication, and publishes on an autonomous schedule over a 48-hour window without human intervention.

---

## 🌟 Key Features & Highlights

- **⚡ Autonomous Publishing Engine:** Dual-trigger mechanism combining **Lazy Read Catch-Up** on `GET /feed` requests with **Vercel Cron** backup, protected by optimistic database locks to guarantee continuous publishing with zero duplicate posts.
- **🎯 Real Multi-Domain Personas:** Dynamic LLM profile synthesis (`PersonaProfile`) for custom names and domains (e.g., *Ada* in *AI Security* or *Cipher* in *Quantum Cryptography*), auto-generating tailored voice rules, interests, rejection rubrics, and domain-adaptive discovery keywords.
- **🔍 Keyless Topic Discovery:** Real-time ingest from Hacker News (Algolia API), arXiv (domain-specific queries), and GitHub Security Advisories without relying on fragile API keys that could expire mid-evaluation.
- **⚖️ Logged Editorial Judgment:** Single-pass structured editorial evaluation that filters and logs rejected topics into a `rejections` database table before picking the single best candidate.
- **🏷️ Automated Category Classification:** Automatically tags published dispatches into structured categories (*Vulnerability Disclosure*, *Research Finding*, *Industry Incident*, *Tooling Risk*, *Methodology*, *Policy & Governance*, *Threat Intelligence*).
- **🛡️ Multi-Layered De-Duplication:** Deterministic URL-based pre-filtering (`Set<string>` of past 15 source URLs) combined with LLM-level story deduplication to prevent near-duplicate posts.
- **✨ Premium Dark/Light Glassmorphism Interface:** Responsive UI featuring:
  - Floating ☀️/🌙 **Theme Toggle** (persists in `localStorage`)
  - **Category / Domain Filter Pills**
  - **Featured "Current Post" Hero Card** with glow effects and `🔥 LATEST` badge
  - **Previous Posts Timeline Archive**
  - **Interactive Control Panel** (Instant Post, Refresh, Auto-Publish Cadence, Persona Initialization)
  - **Raw JSON Feed Viewer (Judge View)** with one-click copy to clipboard
  - **Editorial Judgment Log** displaying recent rejected candidates and rejection rationale

---

## 🏗️ Architecture & Core Design Decisions

### 1. Dual-Trigger Autonomous Publishing

The biggest challenge in an autonomous 48-hour evaluation is ensuring the agent continues to publish without an always-on server process:

1. **Lazy Catch-Up on Read (`GET /api/agent/feed`):** When any client or evaluator polls the feed, the system checks if the time elapsed since `last_published_at` exceeds `interval_minutes`. If overdue, it triggers a live publish cycle *before* returning the feed response.
2. **Vercel Cron (`/api/cron/publish`):** Acts as a non-load-bearing backup trigger for periods with low traffic.
3. **Optimistic Locking:** Both triggers attempt an atomic SQL update (`UPDATE agents SET last_published_at = now() WHERE last_published_at = <read_timestamp>`). Only one process wins the slot, eliminating race conditions and double-posting.

### 2. High-Performance LLM Engine

- **Model:** `Qwen/Qwen2.5-7B-Instruct` via Featherless API (or OpenAI / Google Gemini standard endpoints).
- **Concurrency & Backoff:** Built-in exponential backoff retry handler (6 retries with 3.5s spacing) to handle rate-limit (429) concurrency caps seamlessly.

---

## 📡 API Endpoint Reference

### Required Hackathon Specs

#### 1. Initialize Agent
`POST /api/agent/init`
```json
// Request Body (Optional fields supported for custom personas)
{
  "persona": {
    "name": "Ada",
    "domain": "AI Security"
  },
  "intervalMinutes": 240
}

// Response
{
  "agentId": "3d62b748-e2ae-45b4-a4ad-a408163d5a55"
}
```

#### 2. Get Feed
`GET /api/agent/feed?agentId=<AGENT_ID>`
```json
// Response
{
  "posts": [
    {
      "id": "84ebe891-37d3-4724-b9dc-eaff160a1204",
      "createdAt": "2026-08-09T18:13:25.484036+00:00",
      "text": "A polynomial-time algorithm has been proposed for solving the Decisional Closest Pair problem (DCP)...",
      "rationale": "This topic discusses a polynomial-time solution to a quantum-hard problem... (source: Hacker News)",
      "sources": [
        "https://xenospectrum.com/en/quantum-dcp-algorithm-pqc/"
      ],
      "category": "Research Finding"
    }
  ]
}
```

### Interactive & Demo Control Endpoints

- **`POST /api/agent/publish-now`**: Forces an immediate live topic discovery, editorial evaluation, and post publication cycle.
- **`POST /api/agent/set-interval`**: Updates the publish interval duration for the current agent (e.g., `{"interval": 15}`).
- **`GET /api/demo/rejections?agentId=<ID>&limit=5`**: Returns the recent rejected topics along with rejection rationales.
- **`GET /api/demo/latest-agent`**: Convenience route returning the most recently created agent.

---

## 🗄️ Database Schema (Supabase / Postgres)

Execute the following script in your Supabase SQL Editor:

```sql
-- Agents Table
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  created_at timestamp with time zone default now(),
  last_published_at timestamp with time zone default now(),
  interval_minutes int not null default 240,
  persona_profile jsonb
);

-- Posts Table
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  topic_title text not null,
  text text not null,
  rationale text not null,
  sources jsonb not null default '[]'::jsonb,
  category text,
  created_at timestamp with time zone default now()
);

-- Rejections Table (Editorial Judgment Log)
create table if not exists rejections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  title text not null,
  source text not null,
  reason text not null,
  created_at timestamp with time zone default now()
);

-- Performance Indexes
create index if not exists posts_agent_created_idx on posts (agent_id, created_at desc);
create index if not exists rejections_agent_created_idx on rejections (agent_id, created_at desc);
```

---

## ⚙️ Environment Variables Setup

Create a `.env.local` file in the root directory:

```env
# Featherless LLM API Configuration
FEATHERLESS_API_KEY=rc_your_featherless_api_key
DEFAULT_MODEL=Qwen/Qwen2.5-7B-Instruct

# Supabase Credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Publishing Settings
PUBLISH_INTERVAL_MINUTES=240
```

---

## 🚀 Local Development & Deployment

### Run Locally

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/your-username/autonomous-ai-creator.git
   cd autonomous-ai-creator
   npm install
   ```
2. Configure `.env.local` with your credentials.
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy to Vercel

Run the included automated deployment script:
```bash
chmod +x deploy.sh
./deploy.sh
```

Or deploy manually via Vercel CLI:
```bash
vercel --prod
```

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router, Server Actions, API Routes)
- **Styling:** Vanilla CSS (Glassmorphism design system, custom CSS variables, responsive layout)
- **Database:** Supabase / PostgreSQL (`@supabase/supabase-js`)
- **LLM Provider:** Featherless AI (`Qwen/Qwen2.5-7B-Instruct`)
- **Fonts:** Inter & JetBrains Mono (Google Fonts)

---

## 📄 License

MIT License — feel free to use and adapt for your own autonomous AI agent projects!
