"use client";

import { useState } from "react";

export function ControlPanel({ currentInterval }: { currentInterval: number }) {
  const [name, setName] = useState("Cipher");
  const [domain, setDomain] = useState("Quantum Cryptography");
  const [status, setStatus] = useState("");
  const [interval, setIntervalVal] = useState(currentInterval);

  async function triggerInstantPost() {
    setStatus("⏳ Running live topic discovery & LLM editorial generation... Please wait 5-10s");
    try {
      const res = await fetch("/api/agent/publish-now", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        if (data.post) {
          setStatus("✅ New instant post published! Reloading page...");
        } else {
          setStatus("ℹ️ Editorial pass finished: topics evaluated, rejections logged below. Reloading...");
        }
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus("❌ Error: " + (data.error || "Failed to publish"));
      }
    } catch (err: any) {
      setStatus("❌ Exception: " + err.message);
    }
  }

  async function createNewAgent() {
    if (!name || !domain) {
      alert("Please enter both Name and Domain");
      return;
    }
    setStatus(`✨ Creating persona '${name}' (${domain}) and generating initial instant post...`);
    try {
      const res = await fetch("/api/agent/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: { name, domain } })
      });
      const data = await res.json();
      if (data.agentId) {
        setStatus(`✅ Created agent ${data.agentId}! Reloading page...`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setStatus("❌ Error: " + (data.error || "Failed to initialize agent"));
      }
    } catch (err: any) {
      setStatus("❌ Exception: " + err.message);
    }
  }

  async function changeInterval(newMins: number) {
    setStatus(`⏳ Updating publish interval duration to ${newMins} minutes...`);
    try {
      const res = await fetch("/api/agent/set-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: Number(newMins) })
      });
      const data = await res.json();
      if (data.ok) {
        setIntervalVal(newMins);
        setStatus(`✅ Interval updated to ${newMins} minutes! Reloading page...`);
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err: any) {
      setStatus("❌ Failed to change interval: " + err.message);
    }
  }

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--rule)",
        borderRadius: 6,
        padding: "16px 20px",
        marginBottom: 32,
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 12px",
          color: "var(--ink-soft)",
        }}
      >
        ⚡ Interactive Agent Controls
      </h3>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={triggerInstantPost}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          ⚡ Generate Instant Post Now
        </button>

        <button
          onClick={() => window.location.reload()}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            background: "#e2ddd5",
            color: "var(--ink)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          🔄 Refresh Feed
        </button>

        <a
          href="/api/auth/featherless/login"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          🔐 Sign in with Featherless OAuth
        </a>
      </div>

      <div style={{ borderTop: "1px solid var(--rule)", margin: "12px 0", paddingTop: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", marginBottom: 8 }}>
          Create New Agent / Custom Domain:
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Persona Name (e.g. Cipher)"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              padding: "8px 12px",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              background: "var(--paper)",
              flex: 1,
              minWidth: 140,
            }}
          />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain (e.g. Quantum Cryptography)"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              padding: "8px 12px",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              background: "var(--paper)",
              flex: 1,
              minWidth: 140,
            }}
          />
          <button
            onClick={createNewAgent}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 16px",
              background: "var(--ink)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ✨ Create & Initialize Persona
          </button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--rule)", margin: "12px 0", paddingTop: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", marginBottom: 8 }}>
          Change Auto-Publish Interval Duration:
        </div>
        <select
          value={interval}
          onChange={(e) => changeInterval(Number(e.target.value))}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            padding: "8px 12px",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            background: "var(--paper)",
            width: "100%",
            maxWidth: 360,
          }}
        >
          <option value={240}>Default: Every 4 Hours (240 mins)</option>
          <option value={15}>Fast Test: Every 15 Minutes</option>
          <option value={1}>Ultra Fast: Every 1 Minute</option>
          <option value={0}>Instant On Every Refresh (0 mins)</option>
        </select>
      </div>

      {status && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", marginTop: 10 }}>
          {status}
        </div>
      )}
    </div>
  );
}
