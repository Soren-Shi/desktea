import { NextResponse } from "next/server";
import { analyzeDesk, enforcePublicQuota, ProviderError } from "@/lib/ai";
import type { Locale, Tone } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const VALID_TONES = new Set<Tone>(["roast", "corporate", "drama"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      locale?: Locale;
      tone?: Tone;
      localTimeContext?: string;
      model?: string;
      apiKey?: string;
    };

    if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
    }
    if (body.imageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: "Image payload exceeds 8MB limit" }, { status: 413 });
    }

    enforcePublicQuota(req, "vision", body.apiKey);

    const locale: Locale = body.locale === "en" ? "en" : "zh";
    const tone: Tone = body.tone && VALID_TONES.has(body.tone) ? body.tone : "roast";
    const result = await analyzeDesk({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType || "image/jpeg",
      locale,
      tone,
      localTimeContext: body.localTimeContext,
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
    const message = err instanceof Error ? err.message : "Failed to analyze desk";
    return NextResponse.json(
      { error: message, code: "PROVIDER_ERROR" },
      { status: 500 }
    );
  }
}
