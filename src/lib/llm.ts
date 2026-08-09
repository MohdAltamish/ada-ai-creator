// Thin wrapper over the Featherless AI API (OpenAI-compatible).
// Featherless hosts dozens of open-source models behind a single
// OpenAI-compatible endpoint, so switching models is just an env var change.
// Everything downstream just calls generateJSON() and expects parsed JSON back.

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateJSON<T = unknown>(opts: {
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  const apiKey =
    process.env.FEATHERLESS_API_KEY ||
    "rc_1a4d83d5c14fec0625e42bbe8ffdfcafb71a7383eb928a6002953129e019fb08";
  const model =
    process.env.FEATHERLESS_MODEL || "Qwen/Qwen2.5-7B-Instruct";
  const baseUrl =
    process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";

  if (!apiKey) {
    throw new Error("Missing FEATHERLESS_API_KEY env var");
  }

  const url = `${baseUrl}/chat/completions`;
  const maxRetries = 6;
  let lastError = "";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

    if (res.status === 429) {
      lastError = await res.text();
      const waitMs = 3500 * (attempt + 1);
      console.warn(
        `Featherless 429 concurrency limit hit (attempt ${attempt + 1}/${maxRetries}), retrying in ${waitMs / 1000}s...`
      );
      await delay(waitMs);
      continue;
    }

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

  throw new Error(`Featherless API error 429 after ${maxRetries} retries: ${lastError}`);
}
