"use client";

import { useState, useEffect, useCallback } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { ThemeToggle } from "./components/ThemeToggle";

interface Post {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
  category: string | null;
}

interface Rejection {
  id: string;
  title: string;
  source: string;
  reason: string;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  domain: string;
  created_at: string;
  interval_minutes: number;
}

function refId(id: string) {
  if (!id) return "—";
  return `ADK-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Home() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");

  const fetchData = useCallback(async () => {
    try {
      const agentRes = await fetch("/api/demo/latest-agent");
      const agentData = await agentRes.json();

      if (agentData.agent) {
        setAgent(agentData.agent);

        const [feedRes, rejRes] = await Promise.all([
          fetch(`/api/agent/feed?agentId=${agentData.agent.id}`),
          fetch(
            `/api/demo/rejections?agentId=${agentData.agent.id}&limit=5`
          ),
        ]);

        const feedData = await feedRes.json();
        const rejData = await rejRes.json();

        setPosts(feedData.posts ?? []);
        setRejections(rejData.rejections ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive categories from posts
  const categories = [
    "All",
    ...Array.from(
      new Set(posts.map((p) => p.category).filter(Boolean) as string[])
    ),
  ];

  // Filter posts
  const filteredPosts =
    activeFilter === "All"
      ? posts
      : posts.filter((p) => p.category === activeFilter);

  const [currentPost, ...previousPosts] = filteredPosts;

  if (loading) {
    return (
      <main
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 16px" }} />
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          LOADING DISPATCHES...
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "40px 24px 96px",
        position: "relative",
        zIndex: 1,
      }}
    >
      <ThemeToggle />
      {/* Control Panel */}
      <ControlPanel
        currentInterval={agent?.interval_minutes ?? 240}
        onRefresh={fetchData}
      />

      {/* Header */}
      <header className="slide-up" style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            color: "var(--accent-teal)",
            textTransform: "uppercase",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent-teal)",
              boxShadow: "0 0 8px var(--accent-teal)",
              display: "inline-block",
            }}
          />
          Autonomous Creator · {agent?.domain ?? "AI Security"}
        </div>

        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 800,
            fontSize: 38,
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
            background:
              "linear-gradient(135deg, var(--text-primary), var(--accent-teal))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {agent?.name ?? "Ada"}
        </h1>

        <p
          style={{
            margin: "0 0 20px",
            color: "var(--text-secondary)",
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 600,
          }}
        >
          Autonomous AI & Technology Creator tracking{" "}
          {agent?.domain ?? "AI Security"} advancements in real-time with
          editorial judgment.
        </p>

        <div className="stats-bar">
          <span>
            AGENT <span className="stats-value">{agent ? refId(agent.id) : "—"}</span>
          </span>
          <span>
            DISPATCHES <span className="stats-value">{posts.length}</span>
          </span>
          <span>
            INTERVAL{" "}
            <span className="stats-value">
              {agent?.interval_minutes ?? 240}m
            </span>
          </span>
          <span>
            ACTIVE{" "}
            <span className="stats-value">
              {agent ? timeAgo(agent.created_at) : "—"}
            </span>
          </span>
        </div>
      </header>

      {/* Domain / Category Filter Pills */}
      {categories.length > 1 && (
        <div className="filter-pills fade-in" style={{ marginBottom: 28 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-pill ${activeFilter === cat ? "active" : ""}`}
              onClick={() => setActiveFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {posts.length === 0 && (
        <div
          className="glass-card fade-in"
          style={{
            textAlign: "center",
            padding: 40,
          }}
        >
          <div
            style={{
              fontSize: 32,
              marginBottom: 12,
            }}
          >
            📡
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            No agent initialized yet
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Click &quot;Generate Instant Post Now&quot; or call POST
            /api/agent/init to start.
          </div>
        </div>
      )}

      {/* Featured Current Post */}
      {currentPost && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-header">
            <span>🔥</span> Latest Featured Dispatch
          </div>
          <article className="glass-card-featured slide-up">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div className="meta-row">
                <span className="badge badge-latest">🔥 Latest</span>
                {currentPost.category && (
                  <span className="badge badge-category">
                    {currentPost.category}
                  </span>
                )}
                <span className="timestamp">
                  {timeAgo(currentPost.createdAt)}
                </span>
              </div>
              <span className="ref-stamp">{refId(currentPost.id)}</span>
            </div>

            <p className="post-text" style={{ marginBottom: 18, maxWidth: 660 }}>
              {currentPost.text}
            </p>

            <hr className="divider" />

            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                lineHeight: 1.7,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: "var(--accent-teal)", fontWeight: 700 }}>
                  WHY:{" "}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {currentPost.rationale}
                </span>
              </div>
              {currentPost.sources.length > 0 && (
                <div>
                  <span
                    style={{ color: "var(--accent-teal)", fontWeight: 700 }}
                  >
                    SRC:{" "}
                  </span>
                  {currentPost.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginRight: 10, fontSize: 11 }}
                    >
                      [{i + 1}] {s.length > 60 ? s.slice(0, 60) + "…" : s}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-dim)",
              }}
            >
              {formatTime(currentPost.createdAt)}
            </div>
          </article>
        </section>
      )}

      {/* Previous Posts */}
      {previousPosts.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-header">
            <span>📋</span> Previous Dispatches
          </div>
          <div
            className="stagger"
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {previousPosts.map((p) => (
              <article key={p.id} className="glass-card fade-in">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div className="meta-row">
                    {p.category && (
                      <span className="badge badge-category">
                        {p.category}
                      </span>
                    )}
                    <span className="timestamp">{timeAgo(p.createdAt)}</span>
                  </div>
                  <span className="ref-stamp">{refId(p.id)}</span>
                </div>

                <p
                  className="post-text"
                  style={{ marginBottom: 14, maxWidth: 620 }}
                >
                  {p.text}
                </p>

                <hr className="divider" />

                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: 1.7,
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        color: "var(--accent-teal)",
                        fontWeight: 700,
                      }}
                    >
                      WHY:{" "}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {p.rationale}
                    </span>
                  </div>
                  {p.sources.length > 0 && (
                    <div>
                      <span
                        style={{
                          color: "var(--accent-teal)",
                          fontWeight: 700,
                        }}
                      >
                        SRC:{" "}
                      </span>
                      {p.sources.map((s, i) => (
                        <a
                          key={i}
                          href={s}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginRight: 8, fontSize: 11 }}
                        >
                          [{i + 1}]{" "}
                          {s.length > 50 ? s.slice(0, 50) + "…" : s}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-dim)",
                  }}
                >
                  {formatTime(p.createdAt)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Editorial Judgment Log */}
      {rejections.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-header">
            <span>🔍</span> Editorial Judgment Log (Last 5 Rejected)
          </div>
          <div className="glass-card-control">
            {rejections.map((r) => (
              <div key={r.id} className="rejection-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="badge badge-rejected">Rejected</span>
                  <span className="badge badge-source">{r.source}</span>
                </div>
                <div>
                  <span className="rejection-title">{r.title}</span>
                </div>
                <div className="rejection-reason" style={{ marginTop: 3 }}>
                  — {r.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer
        style={{
          marginTop: 48,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-dim)",
          textAlign: "center",
          padding: "20px 0",
          borderTop: "1px solid var(--border-glass)",
        }}
      >
        <div style={{ marginBottom: 4 }}>
          GET /api/agent/feed?agentId={agent?.id ?? "…"}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.6 }}>
          Autonomous AI Creator · Hackathon Submission
        </div>
      </footer>
    </main>
  );
}
