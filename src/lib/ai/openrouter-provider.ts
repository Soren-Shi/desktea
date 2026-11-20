import http from "node:http";
import tls from "node:tls";
import { resolveProxyEnv } from "./proxy";

export const DEFAULT_OPENROUTER_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "google/gemini-3.1-flash-lite";

export const DEFAULT_OPENROUTER_CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "google/gemini-2.5-flash-lite";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 55_000;

export interface OpenRouterInlineImage {
  base64: string;
  mimeType: string;
}

function toDataUrl(base64: string, fallbackMime: string): string {
  const trimmed = base64.trim();
  if (/^data:[^;]+;base64,/i.test(trimmed)) {
    return trimmed;
  }
  const mime = fallbackMime || "image/jpeg";
  return `data:${mime};base64,${trimmed}`;
}

export function toStrictJsonSchema(
  node: unknown,
  keyName?: string
): Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return {};
  }

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(src)) {
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      const nextProps: Record<string, unknown> = {};
      for (const [propKey, propSchema] of Object.entries(
        v as Record<string, unknown>
      )) {
        nextProps[propKey] = toStrictJsonSchema(propSchema, propKey);
      }
      out.properties = nextProps;
    } else if (k === "items" && v && typeof v === "object") {
      out.items = toStrictJsonSchema(v);
    } else {
      out[k] = v;
    }
  }

  if (out.type === "object") {
    out.additionalProperties = false;
  }

  if ((keyName === "box_2d" || keyName === "afterBox2d") && out.type === "array") {
    out.minItems = 4;
    out.maxItems = 4;
  }

  return out;
}

function postViaConnectProxy(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsedTarget = new URL(targetUrl);
    const parsedProxy = new URL(proxyUrl);
    const targetPort = Number(parsedTarget.port) || 443;
    const proxyPort = Number(parsedProxy.port) || 8080;
    const authority = `${parsedTarget.hostname}:${targetPort}`;

    let settled = false;
    let connectReq: http.ClientRequest | null = null;
    let tlsReq: http.ClientRequest | null = null;
    let activeSocket: import("node:net").Socket | null = null;

    const cleanup = () => {
      clearTimeout(timer);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        tlsReq?.destroy();
        connectReq?.destroy();
        activeSocket?.destroy();
      } catch {
        // ignore cleanup errors
      }
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new Error(`OpenRouter proxy request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const connectHeaders: Record<string, string> = { Host: authority };
    if (parsedProxy.username || parsedProxy.password) {
      const auth = `${decodeURIComponent(parsedProxy.username)}:${decodeURIComponent(
        parsedProxy.password
      )}`;
      connectHeaders["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString(
        "base64"
      )}`;
    }

    connectReq = http.request({
      host: parsedProxy.hostname,
      port: proxyPort,
      method: "CONNECT",
      path: authority,
      headers: connectHeaders,
    });

    connectReq.on("connect", (res, socket) => {
      activeSocket = socket;
      if (res.statusCode !== 200) {
        fail(
          new Error(
            `OpenRouter proxy CONNECT failed with status ${res.statusCode ?? "unknown"}`
          )
        );
        return;
      }

      socket.on("error", (err) => fail(err));

      const tlsSocket = tls.connect({
        socket,
        servername: parsedTarget.hostname,
      });
      tlsSocket.on("error", (err) => fail(err));

      tlsReq = http.request(
        {
          hostname: parsedTarget.hostname,
          port: targetPort,
          path: `${parsedTarget.pathname}${parsedTarget.search}`,
          method: "POST",
          headers: {
            ...headers,
            "Content-Length": Buffer.byteLength(body, "utf8").toString(),
          },
          createConnection: () => tlsSocket,
        },
        (httpsRes) => {
          const chunks: Buffer[] = [];
          httpsRes.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          httpsRes.on("end", () => {
            if (settled) return;
            settled = true;
            cleanup();
            const status = httpsRes.statusCode ?? 500;
            const text = Buffer.concat(chunks).toString("utf8");
            try {
              tlsSocket.end();
              socket.end();
            } catch {
              // ignore
            }
            resolve({
              ok: status >= 200 && status < 300,
              status,
              text,
            });
          });
          httpsRes.on("error", (err) => fail(err));
        }
      );

      tlsReq.on("error", (err) => fail(err));
      tlsReq.write(body, "utf8");
      tlsReq.end();
    });

    connectReq.on("error", (err) => fail(err));
    connectReq.end();
  });
}

async function postOpenRouterJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; text: string }> {
  const { proxyUrl } = resolveProxyEnv();
  if (proxyUrl) {
    return postViaConnectProxy(url, proxyUrl, headers, body, timeoutMs);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    ok: res.ok,
    status: res.status,
    text: await res.text(),
  };
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const val = (part as { text?: unknown }).text;
          return typeof val === "string" ? val : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

function parseJsonResponse<T>(rawText: string): T {
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error(`OpenRouter returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

export async function runOpenRouterStructured<T>(params: {
  apiKey: string;
  prompt: string;
  schema: Record<string, unknown>;
  images?: OpenRouterInlineImage[];
  model?: string;
  temperature?: number;
}): Promise<{ data: T; model: string; durationMs: number }> {
  const startedAt = Date.now();
  const hasImages = Boolean(params.images && params.images.length > 0);
  const model =
    params.model ||
    (hasImages ? DEFAULT_OPENROUTER_VISION_MODEL : DEFAULT_OPENROUTER_CHAT_MODEL);

  const userContent = hasImages
    ? [
        ...(params.images || []).map((img) => ({
          type: "image_url",
          image_url: { url: toDataUrl(img.base64, img.mimeType) },
        })),
        { type: "text", text: params.prompt },
      ]
    : params.prompt;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://desktea.xyz",
    "X-Title": "DeskTea",
  };

  const payload = JSON.stringify({
    model,
    temperature: params.temperature ?? (hasImages ? 0.75 : 0.9),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "desktea_response",
        strict: true,
        schema: toStrictJsonSchema(params.schema),
      },
    },
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const res = await postOpenRouterJson(OPENROUTER_CHAT_URL, headers, payload);
  if (!res.ok) {
    throw new Error(`OpenRouter API ${res.status}: ${res.text.slice(0, 320)}`);
  }

  const json = JSON.parse(res.text) as {
    model?: string;
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(`OpenRouter API error: ${json.error.message}`);
  }

  const rawContent = extractMessageText(json.choices?.[0]?.message?.content);
  if (!rawContent) {
    throw new Error("OpenRouter returned empty message content");
  }

  return {
    data: parseJsonResponse<T>(rawContent),
    model: json.model || model,
    durationMs: Date.now() - startedAt,
  };
}
