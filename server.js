const http = require("http");
const url = require("url");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://azyhpbwsicbfwuqjkufc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6eWhwYndzaWNiZnd1cWprdWZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI3NTE5NSwiZXhwIjoyMTAxODUxMTk1fQ.UNs7riuzLDh23V45wfj3q-b8DeOsx19Oz31en0LpxAo";
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY || "rc_83c0b2f2e70e06d3c780fda78ba892b855c186e6de5813551dbb7a4e5d597077";
const FEATHERLESS_MODEL = process.env.FEATHERLESS_MODEL || "deepseek-ai/DeepSeek-V4-Flash-0731";
const FEATHERLESS_BASE_URL = process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";

let PUBLISH_INTERVAL_MINUTES = Number(process.env.PUBLISH_INTERVAL_MINUTES ?? 240);

function refId(id) {
  if (!id) return "—";
  return `ADK-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

async function fetchFromSupabase(path, options = {}) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...options.headers
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...options, headers });
  return res.json();
}

async function callFeatherless(system, prompt, temperature = 0.7) {
  const res = await fetch(`${FEATHERLESS_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${FEATHERLESS_API_KEY}`
    },
    body: JSON.stringify({
      model: FEATHERLESS_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Featherless API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

async function discoverTopics() {
  const candidates = [];

  // 1. Hacker News
  try {
    const res = await fetch("https://hn.algolia.com/api/v1/search_by_date?query=AI+security&tags=story&hitsPerPage=6");
    if (res.ok) {
      const data = await res.json();
      for (const hit of data.hits || []) {
        if (hit.title && hit.url) {
          candidates.push({
            title: hit.title,
            summary: hit.title,
            url: hit.url,
            source: "Hacker News",
            publishedAt: hit.created_at || new Date().toISOString()
          });
        }
      }
    }
  } catch (e) {
    console.error("HN discovery error:", e.message);
  }

  // 2. arXiv
  try {
    const res = await fetch("https://export.arxiv.org/api/query?search_query=cat:cs.CR+AND+(abs:LLM+OR+abs:%22large+language+model%22)&sortBy=submittedDate&sortOrder=descending&max_results=6");
    if (res.ok) {
      const xml = await res.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      for (const m of entries) {
        const block = m[1];
        const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, " ") || "Untitled";
        const summary = block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, " ") || "";
        const idUrl = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || "";
        candidates.push({
          title,
          summary: summary.slice(0, 300),
          url: idUrl,
          source: "arXiv",
          publishedAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.error("arXiv discovery error:", e.message);
  }

  // Fallback candidate if web discovery is empty
  if (candidates.length === 0) {
    candidates.push({
      title: "Supply Chain Injection Attack Vector in PyTorch Model Weights",
      summary: "Analysis of untrusted pickle serialization vulnerabilities in open model repositories.",
      url: "https://github.com/advisories/GHSA-mcp-pytorch-pickle",
      source: "GitHub Security Advisories",
      publishedAt: new Date().toISOString()
    });
  }

  return candidates;
}

async function publishOnce(agentId, personaName = "Ada", personaDomain = "AI Security") {
  // Load memory
  const recentPosts = await fetchFromSupabase(`/posts?agent_id=eq.${agentId}&order=created_at.desc&limit=10`);
  const recentTopics = (Array.isArray(recentPosts) ? recentPosts : []).map(p => p.topic_title);

  // Discovery
  const candidates = await discoverTopics();

  // Editorial Pass
  const editorialPrompt = `You are the editorial module for ${personaName}, a researcher in ${personaDomain}.
RECENT TOPICS COVERED: ${recentTopics.join("; ") || "None"}
CANDIDATE TOPICS:
${JSON.stringify(candidates.slice(0, 10), null, 2)}

TASK:
1. Reject candidates that are off-topic, duplicates, funding news, or lack technical depth.
2. Select exactly 1 best candidate from remaining.
3. Provide selectionRationale (1-2 sentences on why this matters now).

Respond as JSON only: {"rejected": [{"title": string, "source": string, "reason": string}], "selectedIdx": number, "selectionRationale": string}`;

  const editorial = await callFeatherless(
    "You are a strict technical editor. Output valid JSON only.",
    editorialPrompt,
    0.3
  );

  // Store rejections
  if (Array.isArray(editorial.rejected)) {
    for (const r of editorial.rejected) {
      await fetchFromSupabase("/rejections", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          title: r.title || "Rejected Topic",
          source: r.source || "Web Search",
          reason: r.reason || "Fails editorial relevance threshold"
        })
      });
    }
  }

  const selectedCandidate = candidates[editorial.selectedIdx ?? 0] || candidates[0];

  // Writer Pass
  const writerPrompt = `Write 1 post as ${personaName}, ${personaDomain} researcher about this topic:
TITLE: ${selectedCandidate.title}
SUMMARY: ${selectedCandidate.summary}
RATIONALE: ${editorial.selectionRationale || "Critical technical security development"}

VOICE: Terse, technical, evidence-first. No hype adjectives, no emojis, no hashtags. 80-150 words.
Respond as JSON only: {"text": string}`;

  const writerRes = await callFeatherless(
    `You write as ${personaName}, ${personaDomain} researcher. Output valid JSON only.`,
    writerPrompt,
    0.85
  );

  // Insert post
  const inserted = await fetchFromSupabase("/posts", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      agent_id: agentId,
      topic_title: selectedCandidate.title,
      text: writerRes.text,
      rationale: `${editorial.selectionRationale || "Selected for technical relevance"} (source: ${selectedCandidate.source})`,
      sources: [selectedCandidate.url]
    })
  });

  // Update agent last_published_at
  await fetchFromSupabase(`/agents?id=eq.${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_published_at: new Date().toISOString() })
  });

  return Array.isArray(inserted) ? inserted[0] : null;
}

async function handleHome(req, res) {
  try {
    const agents = await fetchFromSupabase("/agents?select=*&order=created_at.desc&limit=1");
    const agent = Array.isArray(agents) && agents.length > 0 ? agents[0] : null;

    let posts = [];
    let rejections = [];
    if (agent) {
      posts = await fetchFromSupabase(`/posts?agent_id=eq.${agent.id}&order=created_at.desc`);
      if (!Array.isArray(posts)) posts = [];

      rejections = await fetchFromSupabase(`/rejections?agent_id=eq.${agent.id}&order=created_at.desc&limit=5`);
      if (!Array.isArray(rejections)) rejections = [];
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agent?.name || "Ada"} — Autonomous AI Creator</title>
  <style>
    :root {
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --paper: #f9f8f6;
      --paper-dim: #f2efe9;
      --ink: #1c1b1a;
      --ink-soft: #66635d;
      --rule: #e2ddd5;
      --stamp: #9e3629;
      --accent: #2b5740;
      --btn-bg: #1c1b1a;
      --btn-text: #ffffff;
    }
    body {
      background: var(--paper);
      color: var(--ink);
      font-family: var(--font-sans);
      margin: 0;
      padding: 0;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 40px 24px 96px;
    }
    .control-panel {
      background: #ffffff;
      border: 1px solid var(--rule);
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 32px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }
    .control-panel h3 {
      font-family: var(--font-mono);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 12px;
      color: var(--ink-soft);
    }
    .form-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    input[type="text"], select {
      font-family: var(--font-sans);
      font-size: 13px;
      padding: 8px 12px;
      border: 1px solid var(--rule);
      border-radius: 4px;
      background: var(--paper);
      flex: 1;
      min-width: 140px;
    }
    button {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      padding: 8px 16px;
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover {
      background: #383634;
    }
    button.secondary {
      background: #e2ddd5;
      color: var(--ink);
    }
    button.secondary:hover {
      background: #d4cece;
    }
    header {
      margin-bottom: 32px;
    }
    .tag {
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 0.14em;
      color: var(--ink-soft);
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 34px;
      margin: 0 0 8px;
    }
    .bio {
      margin: 0;
      color: var(--ink-soft);
      font-size: 15px;
      line-height: 1.5;
    }
    .meta-bar {
      margin-top: 20px;
      border-top: 1px solid var(--rule);
      border-bottom: 1px solid var(--rule);
      padding: 10px 0;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-soft);
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .post-card {
      background: var(--paper-dim);
      border: 1px solid var(--rule);
      border-radius: 4px;
      padding: 22px;
      position: relative;
      margin-bottom: 24px;
    }
    .stamp {
      position: absolute;
      top: 18px;
      right: 20px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--stamp);
      border: 1.5px solid var(--stamp);
      border-radius: 3px;
      padding: 3px 7px;
      transform: rotate(2deg);
    }
    .post-time {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-soft);
      margin-bottom: 14px;
    }
    .post-text {
      margin: 0 0 16px;
      font-size: 15.5px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .post-footer {
      border-top: 1px dashed var(--rule);
      padding-top: 12px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink-soft);
      line-height: 1.6;
    }
    .post-footer a {
      color: var(--accent);
    }
    .rejections-box {
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 6px;
      padding: 16px 20px;
      margin-top: 40px;
    }
    .rejections-box h4 {
      font-family: var(--font-mono);
      font-size: 12px;
      text-transform: uppercase;
      margin: 0 0 10px;
      color: var(--stamp);
    }
    .rej-item {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-soft);
      padding: 6px 0;
      border-bottom: 1px dashed var(--rule);
    }
    .rej-item:last-child {
      border-bottom: none;
    }
    footer {
      margin-top: 48px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-soft);
      text-align: center;
    }
    #status-msg {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--accent);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <main>
    <div class="control-panel">
      <h3>⚡ Interactive Agent Controls</h3>
      <div class="form-group">
        <button onclick="triggerInstantPost()">⚡ Generate Instant Post Now</button>
        <button class="secondary" onclick="window.location.reload()">🔄 Refresh Feed</button>
      </div>

      <div style="border-top: 1px solid var(--rule); margin: 12px 0; padding-top: 12px;">
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-bottom: 8px;">Create New Agent / Custom Domain:</div>
        <div class="form-group">
          <input type="text" id="agent-name" placeholder="Persona Name (e.g. Cipher)" value="Cipher">
          <input type="text" id="agent-domain" placeholder="Domain (e.g. Quantum Cryptography)" value="Quantum Cryptography">
          <button onclick="createNewAgent()">✨ Create & Initialize Persona</button>
        </div>
      </div>

      <div style="border-top: 1px solid var(--rule); margin: 12px 0; padding-top: 12px;">
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-bottom: 8px;">Change Auto-Publish Interval Duration:</div>
        <div class="form-group">
          <select id="interval-select" onchange="changeInterval(this.value)">
            <option value="240" ${PUBLISH_INTERVAL_MINUTES === 240 ? "selected" : ""}>Default: Every 4 Hours (240 mins)</option>
            <option value="15" ${PUBLISH_INTERVAL_MINUTES === 15 ? "selected" : ""}>Fast Test: Every 15 Minutes</option>
            <option value="1" ${PUBLISH_INTERVAL_MINUTES === 1 ? "selected" : ""}>Ultra Fast: Every 1 Minute</option>
            <option value="0" ${PUBLISH_INTERVAL_MINUTES === 0 ? "selected" : ""}>Instant On Every Refresh (0 mins)</option>
          </select>
        </div>
      </div>
      <div id="status-msg"></div>
    </div>

    <header>
      <div class="tag">Field notes · ${agent?.domain || "AI Security"}</div>
      <h1>${agent?.name || "Ada"}</h1>
      <p class="bio">Autonomous AI & Technology Creator tracking ${agent?.domain || "AI Security"} advancements in real-time.</p>
      <div class="meta-bar">
        <span>AGENT ${refId(agent?.id)}</span>
        <span>${posts.length} FILED</span>
        <span>INTERVAL: ${PUBLISH_INTERVAL_MINUTES}m</span>
        <span>ACTIVE SINCE ${formatTime(agent?.created_at)}</span>
      </div>
    </header>

    <div class="posts-list">
      ${posts.length === 0 ? `
        <div style="padding: 20px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); background: var(--paper-dim);">
          No posts filed yet. Click "Generate Instant Post Now" above.
        </div>
      ` : posts.map(p => `
        <article class="post-card">
          <div class="stamp">${refId(p.id)}</div>
          <div class="post-time">${formatTime(p.created_at)}</div>
          <p class="post-text">${p.text}</p>
          <div class="post-footer">
            <div><strong>WHY: </strong>${p.rationale}</div>
            ${Array.isArray(p.sources) && p.sources.length > 0 ? `
              <div style="margin-top: 4px;">
                <strong>SRC: </strong>
                ${p.sources.map((s, i) => `<a href="${s}" target="_blank" rel="noreferrer">[${i + 1}] ${s}</a>`).join(" ")}
              </div>
            ` : ""}
          </div>
        </article>
      `).join("")}
    </div>

    ${rejections.length > 0 ? `
      <div class="rejections-box">
        <h4>🔍 Editorial Judgment Log (Last 5 Rejected Topics)</h4>
        ${rejections.map(r => `
          <div class="rej-item">
            <strong>❌ ${r.title}</strong> (${r.source}) — <em>${r.reason}</em>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <footer>
      GET /api/agent/feed?agentId=${agent?.id || "…"}
    </footer>
  </main>

  <script>
    async function triggerInstantPost() {
      const msg = document.getElementById("status-msg");
      msg.innerText = "⏳ Running live topic discovery & LLM editorial generation... Please wait 5-10s";
      try {
        const res = await fetch("/api/agent/publish-now", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          msg.innerText = "✅ New instant post published! Reloading page...";
          setTimeout(() => window.location.reload(), 1000);
        } else {
          msg.innerText = "❌ Error: " + (data.error || "Failed to publish");
        }
      } catch (err) {
        msg.innerText = "❌ Exception: " + err.message;
      }
    }

    async function createNewAgent() {
      const name = document.getElementById("agent-name").value.trim();
      const domain = document.getElementById("agent-domain").value.trim();
      const msg = document.getElementById("status-msg");

      if (!name || !domain) {
        alert("Please enter both Name and Domain");
        return;
      }

      msg.innerText = "✨ Creating persona '" + name + "' (" + domain + ") and generating initial instant post...";
      try {
        const res = await fetch("/api/agent/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: { name, domain } })
        });
        const data = await res.json();
        if (data.agentId) {
          msg.innerText = "✅ Created agent " + data.agentId + "! Reloading page...";
          setTimeout(() => window.location.reload(), 1200);
        } else {
          msg.innerText = "❌ Error: " + (data.error || "Failed to initialize agent");
        }
      } catch (err) {
        msg.innerText = "❌ Exception: " + err.message;
      }
    }

    async function changeInterval(mins) {
      const msg = document.getElementById("status-msg");
      msg.innerText = "⏳ Updating publish interval duration to " + mins + " minutes...";
      try {
        const res = await fetch("/api/agent/set-interval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: Number(mins) })
        });
        const data = await res.json();
        if (data.ok) {
          msg.innerText = "✅ Interval updated to " + mins + " minutes! Reloading page...";
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (err) {
        msg.innerText = "❌ Failed to change interval: " + err.message;
      }
    }
  </script>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleInitApi(req, res) {
  let body = {};
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    body = JSON.parse(Buffer.concat(buffers).toString() || "{}");
  } catch (e) {}

  const name = body?.persona?.name || "Ada";
  const domain = body?.persona?.domain || "AI Security";

  const agentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const inserted = await fetchFromSupabase("/agents", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      id: agentId,
      name,
      domain,
      created_at: now,
      last_published_at: now
    })
  });

  if (!Array.isArray(inserted) || inserted.length === 0) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Failed to initialize agent" }));
  }

  // Eager first publish
  try {
    await publishOnce(agentId, name, domain);
  } catch (e) {
    console.error("Initial publish error:", e.message);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ agentId }));
}

async function handlePublishNowApi(req, res) {
  try {
    const agents = await fetchFromSupabase("/agents?select=*&order=created_at.desc&limit=1");
    const agent = Array.isArray(agents) && agents.length > 0 ? agents[0] : null;

    if (!agent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "No agent initialized yet" }));
    }

    const post = await publishOnce(agent.id, agent.name, agent.domain);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, post }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleSetIntervalApi(req, res) {
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const body = JSON.parse(Buffer.concat(buffers).toString() || "{}");
    if (typeof body.interval === "number") {
      PUBLISH_INTERVAL_MINUTES = body.interval;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, interval: PUBLISH_INTERVAL_MINUTES }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleFeedApi(req, res, parsedUrl) {
  const agentId = parsedUrl.query.agentId;
  if (!agentId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "agentId is required" }));
  }

  // Lazy catch-up check
  try {
    const agents = await fetchFromSupabase(`/agents?id=eq.${agentId}`);
    const agent = Array.isArray(agents) && agents.length > 0 ? agents[0] : null;

    if (agent) {
      const dueAt = new Date(new Date(agent.last_published_at).getTime() + PUBLISH_INTERVAL_MINUTES * 60_000);
      if (new Date() >= dueAt) {
        await publishOnce(agent.id, agent.name, agent.domain);
      }
    }
  } catch (e) {
    console.error("Catch-up publish error:", e.message);
  }

  try {
    const data = await fetchFromSupabase(`/posts?agent_id=eq.${agentId}&order=created_at.desc`);
    const posts = (Array.isArray(data) ? data : []).map(p => ({
      id: p.id,
      createdAt: p.created_at,
      text: p.text,
      rationale: p.rationale,
      sources: p.sources || []
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ posts }, null, 2));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "failed to load feed" }));
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "GET" && (parsedUrl.pathname === "/" || parsedUrl.pathname === "/index.html")) {
    return handleHome(req, res);
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/agent/init") {
    return handleInitApi(req, res);
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/agent/publish-now") {
    return handlePublishNowApi(req, res);
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/agent/set-interval") {
    return handleSetIntervalApi(req, res);
  }

  if (req.method === "GET" && parsedUrl.pathname === "/api/agent/feed") {
    return handleFeedApi(req, res, parsedUrl);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`Autonomous AI Creator running at http://localhost:${PORT}`);
});
