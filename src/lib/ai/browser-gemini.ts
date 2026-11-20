import {
  clampBox2D,
  dedupeParrotedMessages,
  filterMessagesAfterActions,
  filterNewObjectsAgainstExisting,
  getLocalTimeContext,
  normalizeGroupActions,
  normalizeMessages,
  normalizeObjects,
  normalizeObjectUpdates,
  reconcileDiffAudits,
  resolveMentionedObjectIds,
  type RawDiffAudit,
  type RawGroupAction,
  type RawMessage,
  type RawObject,
  type RawObjectUpdate,
} from "./normalize";
import {
  buildAddObjectPrompt,
  buildAnalyzePrompt,
  buildChatterPrompt,
  buildDiffPrompt,
  buildLiveTurnPrompt,
  buildReplyPrompt,
} from "./prompts";
import {
  ADD_OBJECT_SCHEMA,
  ANALYZE_SCHEMA,
  CHATTER_SCHEMA,
  DIFF_SCHEMA,
  LIVE_TURN_SCHEMA,
  REPLY_SCHEMA,
} from "./schemas";
import type {
  AddObjectResult,
  Archetype,
  Box2D,
  ChatMessage,
  ChatterResult,
  DeskAnalysisResult,
  DeskObject,
  DiffResult,
  LiveTurnResult,
  Locale,
  ReplyResult,
  Tone,
} from "./types";

const DEFAULT_BROWSER_GEMINI_MODEL = "gemini-2.5-flash";

interface InlineImage {
  base64: string;
  mimeType: string;
}

interface RawAnalyzePayload {
  groupName: string;
  resentmentScore: number;
  verdict: string;
  mostLikelyToLeave: string;
  objects: RawObject[];
  messages: RawMessage[];
}

interface RawReplyPayload {
  tensionDelta: number;
  actions?: RawGroupAction[];
  objectUpdates?: RawObjectUpdate[];
  newObjects?: RawObject[];
  messages: RawMessage[];
}

interface RawDiffPayload {
  summary: string;
  resentmentScore: number;
  objectAudits?: RawDiffAudit[];
  removedIds: string[];
  newObjects: RawObject[];
  messages: RawMessage[];
}

interface RawAddObjectPayload {
  name: string;
  roleTag: string;
  archetype: Archetype;
  personality: string;
  joinNotice: string;
  messages: RawMessage[];
}

interface RawLiveTurnPayload {
  sceneNote: string;
  resentmentScore: number;
  removedIds: string[];
  newObjects: RawObject[];
  messages: RawMessage[];
}

interface RawChatterPayload {
  tensionDelta: number;
  actions?: RawGroupAction[];
  objectUpdates?: RawObjectUpdate[];
  messages: RawMessage[];
}

function stripDataUrl(base64: string, fallbackMime: string): { data: string; mimeType: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: fallbackMime || "image/jpeg", data: base64 };
}

async function callBrowserGeminiStructured<T>(params: {
  apiKey: string;
  prompt: string;
  schema: Record<string, unknown>;
  images?: InlineImage[];
  model?: string;
}): Promise<{ data: T; model: string; durationMs: number }> {
  const model =
    params.model && params.model.startsWith("gemini-2")
      ? params.model
      : DEFAULT_BROWSER_GEMINI_MODEL;
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
  )}:generateContent?key=${encodeURIComponent(params.apiKey.trim())}`;

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
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 260)}`);
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

export async function browserAnalyzeDesk(params: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  locale: Locale;
  tone?: Tone;
  model?: string;
}): Promise<DeskAnalysisResult> {
  const tone: Tone = params.tone || "roast";
  const timeCtx = getLocalTimeContext(params.locale);
  const res = await callBrowserGeminiStructured<RawAnalyzePayload>({
    apiKey: params.apiKey,
    prompt: buildAnalyzePrompt(params.locale, tone, undefined, timeCtx),
    schema: ANALYZE_SCHEMA as unknown as Record<string, unknown>,
    images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
    model: params.model,
  });

  const objects = normalizeObjects(res.data.objects);
  return {
    groupName: res.data.groupName,
    resentmentScore: Math.max(0, Math.min(100, Math.round(res.data.resentmentScore))),
    verdict: res.data.verdict,
    mostLikelyToLeave: res.data.mostLikelyToLeave,
    objects,
    messages: normalizeMessages(res.data.messages, objects, "init"),
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function browserReplyToOwner(params: {
  apiKey: string;
  locale: Locale;
  tone?: Tone;
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage: string;
  isFirstBreach: boolean;
  mentionedObjectIds?: string[];
  imageBase64?: string;
  mimeType?: string;
  model?: string;
}): Promise<ReplyResult> {
  const mentionedIds = resolveMentionedObjectIds(
    params.objects,
    params.ownerMessage,
    params.mentionedObjectIds
  );
  const hasImage = Boolean(params.imageBase64);
  const nextStartIdx =
    params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;

  const res = await callBrowserGeminiStructured<RawReplyPayload>({
    apiKey: params.apiKey,
    prompt: buildReplyPrompt({
      locale: params.locale,
      tone: params.tone || "roast",
      groupName: params.groupName,
      objects: params.objects,
      history: params.history,
      ownerMessage: params.ownerMessage,
      isFirstBreach: params.isFirstBreach,
      mentionedObjectIds: mentionedIds,
      localTimeContext: getLocalTimeContext(params.locale),
      hasImage,
    }),
    schema: REPLY_SCHEMA as unknown as Record<string, unknown>,
    images:
      hasImage && params.imageBase64
        ? [{ base64: params.imageBase64, mimeType: params.mimeType || "image/jpeg" }]
        : undefined,
    model: params.model,
  });

  const rawNewList = hasImage && Array.isArray(res.data.newObjects) ? res.data.newObjects : [];
  const newObjects = filterNewObjectsAgainstExisting(
    rawNewList,
    params.objects,
    nextStartIdx
  );
  const rawToCanonId = new Map<string, string>();
  rawNewList.forEach((raw) => {
    const matched = newObjects.find((n) => n.name === raw.name);
    if (raw.id && matched) rawToCanonId.set(raw.id, matched.id);
  });
  const remappedRawMsgs = (res.data.messages || []).map((m) => ({
    ...m,
    senderId: rawToCanonId.get(m.senderId) || m.senderId,
  }));

  const allObjects = [...params.objects, ...newObjects];
  const actions = normalizeGroupActions(res.data.actions, allObjects, params.locale);
  const objectUpdates = normalizeObjectUpdates(res.data.objectUpdates, allObjects);
  const rawMsgs = normalizeMessages(remappedRawMsgs, allObjects, "reply");
  const filteredMsgs = filterMessagesAfterActions(rawMsgs, allObjects, actions);
  const messages = dedupeParrotedMessages(filteredMsgs, params.history);

  return {
    tensionDelta: Math.max(-20, Math.min(20, Math.round(res.data.tensionDelta))),
    actions,
    objectUpdates,
    newObjects,
    messages,
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function browserDiffDesks(params: {
  apiKey: string;
  beforeImageBase64: string;
  afterImageBase64: string;
  mimeType: string;
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  model?: string;
}): Promise<DiffResult> {
  const tone: Tone = params.tone || "roast";
  const nextStartIdx =
    params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;

  const res = await callBrowserGeminiStructured<RawDiffPayload>({
    apiKey: params.apiKey,
    prompt: buildDiffPrompt({
      locale: params.locale,
      tone,
      objects: params.objects,
      history: params.history,
    }),
    schema: DIFF_SCHEMA as unknown as Record<string, unknown>,
    images: [
      { base64: params.beforeImageBase64, mimeType: params.mimeType },
      { base64: params.afterImageBase64, mimeType: params.mimeType },
    ],
    model: params.model,
  });

  const reconciled = reconcileDiffAudits({
    prevObjects: params.objects,
    rawAudits: res.data.objectAudits,
    rawRemovedIds: res.data.removedIds,
    rawNewObjects: res.data.newObjects,
    nextStartIdx,
  });
  const allObjects = [...params.objects, ...reconciled.newObjects];

  return {
    summary: res.data.summary,
    removedIds: reconciled.removedIds,
    updatedBoxes: reconciled.updatedBoxes,
    objectAudits: reconciled.objectAudits,
    newObjects: reconciled.newObjects,
    messages: normalizeMessages(res.data.messages, allObjects, "diff"),
    resentmentScore: Math.max(0, Math.min(100, Math.round(res.data.resentmentScore))),
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function browserAddDeskObject(params: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  box_2d: Box2D;
  customName?: string;
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  model?: string;
}): Promise<AddObjectResult> {
  const tone: Tone = params.tone || "roast";
  const clampedBox = clampBox2D(params.box_2d);
  const nextIndex = params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;
  const newId = `obj-${nextIndex}-${Date.now().toString(36).slice(-4)}`;

  const res = await callBrowserGeminiStructured<RawAddObjectPayload>({
    apiKey: params.apiKey,
    prompt: buildAddObjectPrompt({
      locale: params.locale,
      tone,
      box_2d: clampedBox,
      customName: params.customName,
      objects: params.objects,
      history: params.history,
    }),
    schema: ADD_OBJECT_SCHEMA as unknown as Record<string, unknown>,
    images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
    model: params.model,
  });

  const newObj: DeskObject = {
    id: newId,
    index: nextIndex,
    name: res.data.name || params.customName?.trim() || `Item ${nextIndex}`,
    roleTag: res.data.roleTag || "Newcomer",
    archetype: res.data.archetype || "observer",
    personality: res.data.personality || "",
    box_2d: clampedBox,
  };

  const mappedMessages = (res.data.messages || []).map((m) => ({
    ...m,
    senderId: m.senderId === "new-object" ? newId : m.senderId,
  }));
  const allObjects = [...params.objects, newObj];

  return {
    object: newObj,
    joinNotice:
      res.data.joinNotice ||
      (params.locale === "zh"
        ? `[${newObj.name}] 被主人圈进了群聊`
        : `[${newObj.name}] was pulled into the chat by Owner`),
    messages: normalizeMessages(mappedMessages, allObjects, "add"),
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function browserLiveCameraTurn(params: {
  apiKey: string;
  currImageBase64: string;
  prevImageBase64?: string;
  mimeType: string;
  trigger: "auto" | "chat";
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage?: string;
  mentionedObjectIds?: string[];
  model?: string;
}): Promise<LiveTurnResult> {
  const tone: Tone = params.tone || "roast";
  const mentionedIds = params.ownerMessage
    ? resolveMentionedObjectIds(
        params.objects,
        params.ownerMessage,
        params.mentionedObjectIds
      )
    : [];
  const nextStartIdx =
    params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;

  const images = params.prevImageBase64
    ? [
        { base64: params.prevImageBase64, mimeType: params.mimeType },
        { base64: params.currImageBase64, mimeType: params.mimeType },
      ]
    : [{ base64: params.currImageBase64, mimeType: params.mimeType }];

  const res = await callBrowserGeminiStructured<RawLiveTurnPayload>({
    apiKey: params.apiKey,
    prompt: buildLiveTurnPrompt({
      locale: params.locale,
      tone,
      trigger: params.trigger,
      objects: params.objects,
      history: params.history,
      ownerMessage: params.ownerMessage,
      mentionedObjectIds: mentionedIds,
      hasPrevFrame: Boolean(params.prevImageBase64),
    }),
    schema: LIVE_TURN_SCHEMA as unknown as Record<string, unknown>,
    images,
    model: params.model,
  });

  const newObjects = normalizeObjects(res.data.newObjects, nextStartIdx).map((o) => ({
    ...o,
    isNew: true,
  }));
  const allObjects = [...params.objects, ...newObjects];

  return {
    sceneNote: res.data.sceneNote?.trim() || "",
    removedIds: res.data.removedIds || [],
    newObjects,
    messages: normalizeMessages(res.data.messages, allObjects, "live"),
    resentmentScore: Math.max(0, Math.min(100, Math.round(res.data.resentmentScore))),
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function browserGenerateChatter(params: {
  apiKey: string;
  locale: Locale;
  tone?: Tone;
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerPresent: boolean;
  model?: string;
}): Promise<ChatterResult> {
  const res = await callBrowserGeminiStructured<RawChatterPayload>({
    apiKey: params.apiKey,
    prompt: buildChatterPrompt({
      locale: params.locale,
      tone: params.tone || "roast",
      groupName: params.groupName,
      objects: params.objects,
      history: params.history,
      ownerPresent: params.ownerPresent,
      localTimeContext: getLocalTimeContext(params.locale),
    }),
    schema: CHATTER_SCHEMA as unknown as Record<string, unknown>,
    model: params.model,
  });

  const actions = normalizeGroupActions(res.data.actions, params.objects, params.locale);
  const objectUpdates = normalizeObjectUpdates(res.data.objectUpdates, params.objects);
  const rawMsgs = normalizeMessages(res.data.messages, params.objects, "chat");
  const messages = filterMessagesAfterActions(rawMsgs, params.objects, actions);

  return {
    tensionDelta: Math.max(-8, Math.min(8, Math.round(res.data.tensionDelta))),
    actions,
    objectUpdates,
    messages,
    provider: "gemini",
    model: res.model,
    durationMs: res.durationMs,
  };
}
