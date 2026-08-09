// Live topic discovery from three free, keyless sources chosen to fit an
// AI-security persona specifically:
//   - Hacker News   -> what practitioners are actually discussing today
//   - arXiv cs.CR   -> primary-source research, not secondhand summaries
//   - GitHub Advisories -> real, dated vulnerabilities in ML tooling
// No API keys needed, which keeps the 48h autonomous window from ever
// stalling on a missing/expired credential.

export interface Candidate {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
}

async function fromHN(domain?: string): Promise<Candidate[]> {
  const queries = [
    ...(domain ? [domain] : []),
    "prompt injection",
    "AI security",
    "LLM vulnerability",
    "quantum cryptography",
    "model jailbreak",
    "cybersecurity",
  ];
  const out: Candidate[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
          q
        )}&tags=story&hitsPerPage=5`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const hit of data.hits ?? []) {
        if (!hit.title || !hit.url) continue;
        out.push({
          title: hit.title,
          summary: hit.title,
          url: hit.url,
          source: "Hacker News",
          publishedAt: hit.created_at ?? new Date().toISOString(),
        });
      }
    } catch {
      // one bad query shouldn't sink the whole discovery pass
    }
  }
  return out;
}

async function fromArxiv(domain?: string): Promise<Candidate[]> {
  try {
    const searchQuery = domain
      ? `all:%22${encodeURIComponent(domain)}%22`
      : "cat:cs.CR+AND+(abs:LLM+OR+abs:%22large+language+model%22+OR+abs:agent)";
    const res = await fetch(
      `https://export.arxiv.org/api/query?search_query=${searchQuery}&sortBy=submittedDate&sortOrder=descending&max_results=8`
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    return entries.map((m) => {
      const block = m[1];
      const title =
        block
          .match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "Untitled";
      const summary =
        block
          .match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "";
      const url = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const published =
        block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ??
        new Date().toISOString();
      return {
        title,
        summary: summary.slice(0, 500),
        url,
        source: "arXiv",
        publishedAt: published,
      };
    });
  } catch {
    return [];
  }
}

async function fromGitHubAdvisories(domain?: string): Promise<Candidate[]> {
  try {
    const res = await fetch(
      "https://api.github.com/advisories?per_page=25&sort=published&direction=desc",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "autonomous-ai-creator",
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    const keywords = [
      "ai",
      "ml",
      "llm",
      "model",
      "crypto",
      "quantum",
      "security",
      "mcp",
    ];
    if (domain) {
      keywords.push(...domain.toLowerCase().split(/\s+/));
    }
    return data
      .filter((a) => {
        const blob = `${a.summary ?? ""} ${a.description ?? ""}`.toLowerCase();
        return keywords.some((k) => k.length > 2 && blob.includes(k));
      })
      .map((a) => ({
        title: a.summary,
        summary: (a.description ?? "").slice(0, 500),
        url: a.html_url,
        source: "GitHub Security Advisories",
        publishedAt: a.published_at ?? new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export async function discoverTopics(domain?: string): Promise<Candidate[]> {
  const [hn, arxiv, ghsa] = await Promise.allSettled([
    fromHN(domain),
    fromArxiv(domain),
    fromGitHubAdvisories(domain),
  ]);
  const pools = [hn, arxiv, ghsa].filter(
    (r): r is PromiseFulfilledResult<Candidate[]> => r.status === "fulfilled"
  );
  return pools.flatMap((r) => r.value);
}
