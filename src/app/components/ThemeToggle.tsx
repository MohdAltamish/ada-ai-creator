"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem("ada-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ada-theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 100,
        width: 42,
        height: 42,
        borderRadius: "50%",
        border: "1px solid var(--border-glass)",
        background: "var(--bg-card)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        transition: "all 0.3s ease",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-teal)";
        e.currentTarget.style.transform = "scale(1.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-glass)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
