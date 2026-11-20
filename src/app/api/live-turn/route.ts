import { NextResponse } from "next/server";
import { enforcePublicQuota, liveCameraTurn, ProviderError } from "@/lib/ai";
import type { ChatMessage, DeskObject, Locale, Tone } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const VALID_TONES = new Set<Tone>(["roast", "corporate", "drama"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      currImageBase64?: string;
      prevImageBase64?: string;
      mimeType?: string;
      trigger?: "auto" | "chat";
      objects?: DeskObject[];
      history?: ChatMessage[];
      ownerMessage?: string;
      mentionedObjectIds?: string[];
      locale?: Locale;
      tone?: Tone;
      model?: string;
      apiKey?: string;
    };

    if (!body.currImageBase64) {
      return NextResponse.json({ error: "Missing currImageBase64" }, { status: 400 });
    }
    if (
      body.currImageBase64.length > MAX_BASE64_BYTES ||
      (body.prevImageBase64 && body.prevImageBase64.length > MAX_BASE64_BYTES)
    ) {
      return NextResponse.json({ error: "Image payload exceeds 8MB limit" }, { status: 413 });
    }

    enforcePublicQuota(req, "vision", body.apiKey);

    const tone: Tone = body.tone && VALID_TONES.has(body.tone) ? body.tone : "roast";
    const result = await liveCameraTurn({
      currImageBase64: body.currImageBase64,
      prevImageBase64: body.prevImageBase64,
      mimeType: body.mimeType || "image/jpeg",
      trigger: body.trigger === "chat" ? "chat" : "auto",
      locale: body.locale === "en" ? "en" : "zh",
      tone,
      objects: Array.isArray(body.objects) ? body.objects : [],
      history: Array.isArray(body.history) ? body.history : [],
      ownerMessage: body.ownerMessage?.trim(),
      mentionedObjectIds: Array.isArray(body.mentionedObjectIds)
        ? body.mentionedObjectIds
        : undefined,
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
    const message = err instanceof Error ? err.message : "Failed live camera turn";
    return NextResponse.json(
      { error: message, code: "PROVIDER_ERROR" },
      { status: 500 }
    );
  }
}
