"use client";

import { useState } from "react";

interface ControlPanelProps {
  currentInterval: number;
  onRefresh?: () => void;
}

export function ControlPanel({ currentInterval, onRefresh }: ControlPanelProps) {
  const [name, setName] = useState("Cipher");
  const [domain, setDomain] = useState("Quantum Cryptography");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"info" | "error" | "success">("info");
  const [interval, setIntervalVal] = useState(currentInterval);
  const [showJson, setShowJson] = useState(false);
  const [jsonPayload, setJsonPayload] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function showStatus(msg: string, type: "info" | "error" | "success" = "info") {
    setStatus(msg);
    setStatusType(type);
  }

  async function fetchJsonFeed() {
    if (showJson) {
      setShowJson(false);
      return;
    }
    showStatus("Fetching live JSON feed payload...", "info");
    try {
      const agentRes = await fetch("/api/demo/latest-agent");
      const agentData = await agentRes.json();
      const agentId =
        agentData.agent?.id || "f7b8c9d0-1234-5678-9abc-def012345678";
      setActiveAgentId(agentId);

      const feedRes = await fetch(`/api/agent/feed?agentId=${agentId}`);
      const feedData = await feedRes.json();
      setJsonPayload(JSON.stringify(feedData, null, 2));
      setShowJson(true);
      setStatus("");
    } catch (err: any) {
      showStatus("Failed to fetch JSON feed: " + err.message, "error");
    }
  }

  function copyJson() {
    if (!jsonPayload) return;
    navigator.clipboard.writeText(jsonPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function triggerInstantPost() {
    setBusy(true);
    showStatus("Running live topic discovery & LLM editorial generation... Please wait 5-10s", "info");
    try {
      const res = await fetch("/api/agent/publish-now", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        if (data.post) {
          showStatus("New instant post published!", "success");
        } else {
          showStatus("Editorial pass finished: topics evaluated, rejections logged.", "info");
        }
        setTimeout(() => {
          onRefresh?.();
          setStatus("");
        }, 1500);
      } else {
        showStatus("Error: " + (data.error || "Failed to publish"), "error");
      }
    } catch (err: any) {
      showStatus("Exception: " + err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function createNewAgent() {
    if (!name || !domain) {
      showStatus("Please enter both Name and Domain", "error");
      return;
    }
    setBusy(true);
    showStatus(`Creating persona '${name}' (${domain}) and generating initial post...`, "info");
    try {
      const res = await fetch("/api/agent/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: { name, domain } }),
      });
      const data = await res.json();
      if (data.agentId) {
        showStatus(`Created agent ${data.agentId}!`, "success");
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showStatus("Error: " + (data.error || "Failed to initialize agent"), "error");
      }
    } catch (err: any) {
      showStatus("Exception: " + err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeInterval(newMins: number) {
    showStatus(`Updating publish interval to ${newMins} minutes...`, "info");
    try {
      const res = await fetch("/api/agent/set-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: Number(newMins) }),
      });
      const data = await res.json();
      if (data.ok) {
        setIntervalVal(newMins);
        showStatus(`Interval updated to ${newMins} minutes!`, "success");
        setTimeout(() => setStatus(""), 2000);
      }
    } catch (err: any) {
      showStatus("Failed to change interval: " + err.message, "error");
    }
  }

  return (
    <div className="glass-card-control" style={{ marginBottom: 28 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: collapsed ? 0 : 16,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>⚡</span>
          Interactive Agent Controls
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn btn-outline"
          style={{ padding: "4px 10px", fontSize: 10 }}
        >
          {collapsed ? "▼ Expand" : "▲ Collapse"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Primary Actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <button
              onClick={triggerInstantPost}
              disabled={busy}
              className="btn btn-solid"
            >
              {busy ? (
                <>
                  <span className="spinner" /> Generating...
                </>
              ) : (
                <>⚡ Generate Instant Post</>
              )}
            </button>

            <button
              onClick={() => onRefresh?.()}
              className="btn btn-outline"
            >
              🔄 Refresh Feed
            </button>

            <button
              onClick={fetchJsonFeed}
              className={`btn ${showJson ? "btn-danger" : "btn-violet"}`}
            >
              {showJson
                ? "✕ Hide JSON Feed"
                : "📊 Raw JSON Feed (Judge View)"}
            </button>
          </div>

          {/* Create New Agent */}
          <div
            style={{
              borderTop: "1px solid var(--border-glass)",
              paddingTop: 14,
              marginBottom: 14,
            }}
          >
            <label className="field-label">
              Create New Agent / Custom Domain
            </label>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Persona Name (e.g. Cipher)"
                className="field-input"
                style={{ flex: 1, minWidth: 140 }}
              />
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Domain (e.g. Quantum Cryptography)"
                className="field-input"
                style={{ flex: 1, minWidth: 140 }}
              />
              <button
                onClick={createNewAgent}
                disabled={busy || !name || !domain}
                className="btn btn-solid"
              >
                ✨ Create & Initialize
              </button>
            </div>
          </div>

          {/* Interval Selector */}
          <div
            style={{
              borderTop: "1px solid var(--border-glass)",
              paddingTop: 14,
            }}
          >
            <label className="field-label">
              Auto-Publish Interval Duration
            </label>
            <select
              value={interval}
              onChange={(e) => changeInterval(Number(e.target.value))}
              className="field-select"
              style={{ maxWidth: 360 }}
            >
              <option value={240}>Default: Every 4 Hours (240 mins)</option>
              <option value={360}>Every 6 Hours</option>
              <option value={720}>Every 12 Hours</option>
              <option value={60}>Every 1 Hour</option>
              <option value={30}>Every 30 Minutes</option>
              <option value={15}>Fast Test: Every 15 Minutes</option>
              <option value={5}>Ultra Fast: Every 5 Minutes</option>
              <option value={1}>Debug: Every 1 Minute</option>
            </select>
          </div>

          {/* Status */}
          {status && (
            <div className={`status-line ${statusType}`}>{status}</div>
          )}

          {/* JSON Viewer */}
          {showJson && jsonPayload && (
            <div className="json-viewer">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  📡 GET /api/agent/feed?agentId={activeAgentId}
                </span>
                <button
                  onClick={copyJson}
                  className={`btn ${copied ? "btn-solid" : "btn-outline"}`}
                  style={{ padding: "4px 12px", fontSize: 10 }}
                >
                  {copied ? "✅ Copied!" : "📋 Copy JSON"}
                </button>
              </div>
              <pre>{jsonPayload}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
