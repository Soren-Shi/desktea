import { NextResponse } from "next/server";
import { enforcePublicQuota, ProviderError, replyToOwner } from "@/lib/ai";
import type { ChatMessage, DeskObject, Locale, Tone } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TONES = new Set<Tone>(["roast", "corporate", "drama"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      objects?: DeskObject[];
      history?: ChatMessage[];
      groupName?: string;
      ownerMessage?: string;
      isFirstBreach?: boolean;
      mentionedObjectIds?: string[];
      localTimeContext?: string;
      imageBase64?: string;
      mimeType?: string;
      locale?: Locale;
      tone?: Tone;
      model?: string;
      apiKey?: string;
    };

    if (!body.ownerMessage?.trim()) {
      return NextResponse.json({ error: "Missing ownerMessage" }, { status: 400 });
    }
    if (!Array.isArray(body.objects) || body.objects.length === 0) {
      return NextResponse.json({ error: "Missing desk objects" }, { status: 400 });
    }

    enforcePublicQuota(req, "chat", body.apiKey);

    const tone: Tone = body.tone && VALID_TONES.has(body.tone) ? body.tone : "roast";
    const result = await replyToOwner({
      locale: body.locale === "en" ? "en" : "zh",
      tone,
      groupName: body.groupName,
      objects: body.objects,
      history: Array.isArray(body.history) ? body.history : [],
      ownerMessage: body.ownerMessage.trim(),
      isFirstBreach: Boolean(body.isFirstBreach),
      mentionedObjectIds: Array.isArray(body.mentionedObjectIds)
        ? body.mentionedObjectIds
        : undefined,
      localTimeContext: body.localTimeContext,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
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
    const message = err instanceof Error ? err.message : "Failed to generate reply";
    return NextResponse.json(
      { error: message, code: "PROVIDER_ERROR" },
      { status: 500 }
    );
  }
}
