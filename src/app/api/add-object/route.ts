import { NextResponse } from "next/server";
import { addDeskObject, enforcePublicQuota, ProviderError } from "@/lib/ai";
import type { Box2D, ChatMessage, DeskObject, Locale, Tone } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const VALID_TONES = new Set<Tone>(["roast", "corporate", "drama"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      box_2d?: Box2D;
      customName?: string;
      objects?: DeskObject[];
      history?: ChatMessage[];
      locale?: Locale;
      tone?: Tone;
      model?: string;
      apiKey?: string;
    };

    if (!body.imageBase64 || !Array.isArray(body.box_2d) || body.box_2d.length < 4) {
      return NextResponse.json(
        { error: "Missing imageBase64 or box_2d" },
        { status: 400 }
      );
    }
    if (body.imageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: "Image payload exceeds 8MB limit" }, { status: 413 });
    }

    enforcePublicQuota(req, "vision", body.apiKey);

    const tone: Tone = body.tone && VALID_TONES.has(body.tone) ? body.tone : "roast";
    const result = await addDeskObject({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType || "image/jpeg",
      box_2d: body.box_2d,
      customName: body.customName,
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
    const message = err instanceof Error ? err.message : "Failed to add object";
    return NextResponse.json(
      { error: message, code: "PROVIDER_ERROR" },
      { status: 500 }
    );
  }
}
