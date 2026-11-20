export const DEFAULT_GEMINI_API_MODEL = process.env.DESKTEA_GEMINI_MODEL || "gemini-2.5-flash";

export interface GeminiInlineImage {
  base64: string;
  mimeType: string;
}

function stripDataUrl(base64: string, fallbackMime: string): { data: string; mimeType: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: fallbackMime || "image/jpeg", data: base64 };
}

export async function runGeminiStructured<T>(params: {
  apiKey: string;
  prompt: string;
  schema: Record<string, unknown>;
  images?: GeminiInlineImage[];
  model?: string;
}): Promise<{ data: T; model: string; durationMs: number }> {
  const model = params.model || DEFAULT_GEMINI_API_MODEL;
  const startedAt = Date.now();

  const parts: Array<Record<string, unknown>> = [];
  if (params.images) {
    for (const img of params.images) {
      const clean = stripDataUrl(img.base64, img.mimeType);
      parts.push({
        inlineData: {
          mimeType: clean.mimeType,
          data: clean.data,
        },
      });
    }
  }
  parts.push({ text: params.prompt });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: params.schema,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API returned empty candidate text");
  }

  return {
    data: JSON.parse(text) as T,
    model,
    durationMs: Date.now() - startedAt,
  };
}
