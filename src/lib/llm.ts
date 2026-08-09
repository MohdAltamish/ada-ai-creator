// Thin wrapper over the Featherless AI API (OpenAI-compatible).
// Featherless hosts dozens of open-source models behind a single
// OpenAI-compatible endpoint, so switching models is just an env var change.
// Everything downstream just calls generateJSON() and expects parsed JSON back.

const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY;
const FEATHERLESS_MODEL =
  process.env.FEATHERLESS_MODEL || "deepseek-ai/DeepSeek-V4-Flash-0731";
const FEATHERLESS_BASE_URL =
  process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";

export async function generateJSON<T = unknown>(opts: {
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  if (!FEATHERLESS_API_KEY) {
    throw new Error("Missing FEATHERLESS_API_KEY env var");
  }

  const url = `${FEATHERLESS_BASE_URL}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model: FEATHERLESS_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature ?? 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Featherless API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(
      "Featherless returned no content: " + JSON.stringify(data)
    );
  }

  // Some models may wrap JSON in markdown fences — strip them if present.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return JSON.parse(cleaned) as T;
}
