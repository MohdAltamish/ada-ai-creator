// Thin wrapper over the Featherless AI API (OpenAI-compatible).
// Featherless hosts dozens of open-source models behind a single
// OpenAI-compatible endpoint, so switching models is just an env var change.
// Everything downstream just calls generateJSON() and expects parsed JSON back.

export async function generateJSON<T = unknown>(opts: {
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  const model =
    process.env.FEATHERLESS_MODEL || "deepseek-ai/DeepSeek-V4-Flash-0731";
  const baseUrl =
    process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";

  if (!apiKey) {
    throw new Error("Missing FEATHERLESS_API_KEY env var");
  }

  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
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
