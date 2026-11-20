import { NextResponse } from "next/server";
import { diffDesks, enforcePublicQuota, ProviderError } from "@/lib/ai";
import type { ChatMessage, DeskObject, Locale, Tone } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const VALID_TONES = new Set<Tone>(["roast", "corporate", "drama"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      beforeImageBase64?: string;
      afterImageBase64?: string;
      mimeType?: string;
      objects?: DeskObject[];
      history?: ChatMessage[];
      locale?: Locale;
      tone?: Tone;
      model?: string;
      apiKey?: string;
    };

    if (!body.beforeImageBase64 || !body.afterImageBase64) {
      return NextResponse.json({ error: "Missing before/after images" }, { status: 400 });
    }
    if (
      body.beforeImageBase64.length > MAX_BASE64_BYTES ||
      body.afterImageBase64.length > MAX_BASE64_BYTES
    ) {
      return NextResponse.json({ error: "Image payload exceeds 8MB limit" }, { status: 413 });
    }

    enforcePublicQuota(req, "vision", body.apiKey);

    const tone: Tone = body.tone && VALID_TONES.has(body.tone) ? body.tone : "roast";
    const result = await diffDesks({
      beforeImageBase64: body.beforeImageBase64,
      afterImageBase64: body.afterImageBase64,
      mimeType: body.mimeType || "image/jpeg",
      locale: body.locale === "en" ? "en" : "zh",
      tone,
      objects: Array.isArray(body.objects) ? body.objects : [],
      history: Array.isArray(body.history) ? body.history : [],
      model: body.model,
      apiKey: body.apiKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { error: err.message, code: err.code, retryAfterSec: err.retryAfterSec },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to compare desk photos";
    return NextResponse.json(
      { error: message, code: "PROVIDER_ERROR" },
      { status: 500 }
    );
  }
}
