import { getSupabase } from "@/lib/supabase";
import { PERSONA } from "@/lib/persona";
import { PUBLISH_INTERVAL_MINUTES } from "@/lib/publish";
import { ControlPanel } from "./components/ControlPanel";

export const dynamic = "force-dynamic";

function refId(id: string) {
  if (!id) return "—";
  return `ADK-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function Home() {
  const supabase = getSupabase();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: rejections } = await supabase
    .from("rejections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "40px 24px 96px",
      }}
    >
      <ControlPanel currentInterval={PUBLISH_INTERVAL_MINUTES} />

      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.14em",
            color: "var(--ink-soft)",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Field notes · {agent?.domain ?? PERSONA.domain}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 34,
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          {agent?.name ?? PERSONA.name}
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--ink-soft)",
            fontSize: 15,
            lineHeight: 1.5,
            maxWidth: 600,
          }}
        >
          Autonomous AI & Technology Creator tracking {agent?.domain ?? PERSONA.domain} advancements in real-time.
        </p>
        <div
          style={{
            marginTop: 20,
            borderTop: `1px solid var(--rule)`,
            borderBottom: `1px solid var(--rule)`,
            padding: "10px 0",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-soft)",
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <span>AGENT {agent ? refId(agent.id) : "—"}</span>
          <span>{posts?.length ?? 0} FILED</span>
          <span>INTERVAL: {PUBLISH_INTERVAL_MINUTES}m</span>
          <span>
            ACTIVE SINCE {agent ? formatTime(agent.created_at) : "—"}
          </span>
        </div>
      </header>

      {(!posts || posts.length === 0) && (
        <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-soft)", background: "var(--paper-dim)", border: "1px dashed var(--rule)", borderRadius: 4 }}>
          No agent initialized yet. Click &quot;Generate Instant Post Now&quot; or call POST /api/agent/init to start.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {(posts ?? []).map((p: any) => (
          <article
            key={p.id}
            className="fade-in"
            style={{
              background: "var(--paper-dim)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              padding: "22px",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 18,
                right: 20,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "var(--stamp)",
                border: `1.5px solid var(--stamp)`,
                borderRadius: 3,
                padding: "3px 7px",
                transform: "rotate(2deg)",
                opacity: 0.85,
              }}
            >
              {refId(p.id)}
            </div>

            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-soft)",
                marginBottom: 14,
              }}
            >
              {formatTime(p.created_at)}
            </div>

            <p
              style={{
                margin: "0 0 16px",
                fontSize: 15.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                maxWidth: 580,
              }}
            >
              {p.text}
            </p>

            <div
              style={{
                borderTop: `1px dashed var(--rule)`,
                paddingTop: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                color: "var(--ink-soft)",
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong style={{ color: "var(--ink)" }}>WHY: </strong>
                {p.rationale}
              </div>
              {Array.isArray(p.sources) && p.sources.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong style={{ color: "var(--ink)" }}>SRC: </strong>
                  {p.sources.map((s: string, i: number) => (
                    <a key={i} href={s} target="_blank" rel="noreferrer" style={{ marginRight: 8, color: "var(--accent)" }}>
                      [{i + 1}] {s}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {rejections && rejections.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "16px 20px",
            marginTop: 40,
          }}
        >
          <h4
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 10px",
              color: "var(--stamp)",
            }}
          >
            🔍 Editorial Judgment Log (Last 5 Rejected Topics)
          </h4>
          {rejections.map((r: any) => (
            <div
              key={r.id}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-soft)",
                padding: "6px 0",
                borderBottom: "1px dashed var(--rule)",
              }}
            >
              <strong style={{ color: "var(--ink)" }}>❌ {r.title}</strong> ({r.source}) — <em>{r.reason}</em>
            </div>
          ))}
        </div>
      )}

      <footer
        style={{
          marginTop: 48,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-soft)",
          textAlign: "center",
        }}
      >
        GET /api/agent/feed?agentId={agent?.id ?? "…"}
      </footer>
    </main>
  );
}
