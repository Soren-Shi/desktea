import { clampBox2D, DEFAULT_AGY_MODEL, findAgyBinary, runAgyStructured } from "./agy-provider";
import { DEFAULT_GEMINI_API_MODEL, runGeminiStructured } from "./gemini-provider";
import {
  DEFAULT_OPENROUTER_CHAT_MODEL,
  DEFAULT_OPENROUTER_VISION_MODEL,
  runOpenRouterStructured,
} from "./openrouter-provider";
import {
  dedupeParrotedMessages,
  filterMessagesAfterActions,
  filterNewObjectsAgainstExisting,
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
import { resolveProxyEnv } from "./proxy";
import { checkRateLimit, type RateLimitBucket } from "./rate-limit";
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
  ApiErrorCode,
  Archetype,
  Box2D,
  ChatMessage,
  ChatterResult,
  DeskAnalysisResult,
  DeskObject,
  DiffResult,
  HealthMode,
  HealthStatus,
  LiveTurnResult,
  Locale,
  ProviderName,
  ReplyResult,
  Tone,
} from "./types";

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

interface RawChatterPayload {
  tensionDelta: number;
  actions?: RawGroupAction[];
  objectUpdates?: RawObjectUpdate[];
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

export class ProviderError extends Error {
  code: ApiErrorCode;
  status: number;
  retryAfterSec?: number;

  constructor(
    message: string,
    code: ApiErrorCode,
    status: number,
    retryAfterSec?: number
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

type ProviderSource = "byok" | "openrouter-env" | "server-env" | "local-agy";

function pickOpenRouterModel(customModel: string | undefined, fallback: string): string {
  return customModel && customModel.includes("/") ? customModel : fallback;
}

function pickGeminiModel(customModel: string | undefined): string {
  return customModel && customModel.startsWith("gemini-2")
    ? customModel
    : DEFAULT_GEMINI_API_MODEL;
}

function chooseProvider(apiKey?: string): {
  provider: ProviderName;
  resolvedKey?: string;
  source: ProviderSource;
} {
  const cleanKey = apiKey?.trim();
  if (cleanKey) {
    if (cleanKey.startsWith("sk-or-")) {
      return { provider: "openrouter", resolvedKey: cleanKey, source: "byok" };
    }
    return { provider: "gemini", resolvedKey: cleanKey, source: "byok" };
  }

  const agyPath = findAgyBinary();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (process.env.DESKTEA_PROVIDER === "agy" && agyPath) {
    return { provider: "agy", source: "local-agy" };
  }
  if (process.env.DESKTEA_PROVIDER === "gemini" && geminiKey) {
    return {
      provider: "gemini",
      resolvedKey: geminiKey,
      source: "server-env",
    };
  }
  if (openrouterKey) {
    return {
      provider: "openrouter",
      resolvedKey: openrouterKey,
      source: "openrouter-env",
    };
  }
  if (agyPath) {
    return { provider: "agy", source: "local-agy" };
  }
  if (geminiKey) {
    return {
      provider: "gemini",
      resolvedKey: geminiKey,
      source: "server-env",
    };
  }
  throw new ProviderError(
    "No AI API key configured on server. Add an OpenRouter or Gemini API key in Settings to run live analysis.",
    "KEY_REQUIRED",
    401
  );
}

export function enforcePublicQuota(
  req: Request,
  bucket: RateLimitBucket,
  apiKey?: string
) {
  const { source } = chooseProvider(apiKey);
  if (source !== "openrouter-env" && source !== "server-env") {
    return;
  }
  const quota = checkRateLimit(req, bucket);
  if (!quota.allowed) {
    throw new ProviderError(
      "Hourly free demo limit reached. Please try again shortly.",
      "RATE_LIMITED",
      429,
      quota.retryAfterSec
    );
  }
}

export function getHealthStatus(): HealthStatus {
  const agyPath = findAgyBinary();
  const { proxyUrl } = resolveProxyEnv();
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const parsedLimit = Number(process.env.DESKTEA_VISION_LIMIT_PER_HOUR);
  const visionLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 12;

  let provider: ProviderName;
  let mode: HealthMode;
  let rateLimitHourly: number | null;

  if (process.env.DESKTEA_PROVIDER === "agy" && agyPath) {
    provider = "agy";
    mode = "local-agy";
    rateLimitHourly = null;
  } else if (process.env.DESKTEA_PROVIDER === "gemini" && geminiConfigured) {
    provider = "gemini";
    mode = "hosted-gemini";
    rateLimitHourly = visionLimit;
  } else if (openrouterConfigured) {
    provider = "openrouter";
    mode = "hosted-openrouter";
    rateLimitHourly = visionLimit;
  } else if (agyPath) {
    provider = "agy";
    mode = "local-agy";
    rateLimitHourly = null;
  } else if (geminiConfigured) {
    provider = "gemini";
    mode = "hosted-gemini";
    rateLimitHourly = visionLimit;
  } else {
    provider = "gemini";
    mode = "byok-only";
    rateLimitHourly = null;
  }

  return {
    provider,
    mode,
    agyAvailable: Boolean(agyPath),
    agyPath,
    defaultModel:
      provider === "openrouter"
        ? DEFAULT_OPENROUTER_VISION_MODEL
        : provider === "gemini"
        ? DEFAULT_GEMINI_API_MODEL
        : DEFAULT_AGY_MODEL,
    openrouterConfigured,
    geminiConfigured,
    visionModel: provider === "openrouter" ? DEFAULT_OPENROUTER_VISION_MODEL : undefined,
    chatModel: provider === "openrouter" ? DEFAULT_OPENROUTER_CHAT_MODEL : undefined,
    proxyDetected: proxyUrl,
    rateLimitHourly,
  };
}

export async function analyzeDesk(params: {
  imageBase64: string;
  mimeType: string;
  locale: Locale;
  tone?: Tone;
  localTimeContext?: string;
  model?: string;
  apiKey?: string;
}): Promise<DeskAnalysisResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
  const tone: Tone = params.tone || "roast";
  const prompt = buildAnalyzePrompt(params.locale, tone, undefined, params.localTimeContext);
  const schema = ANALYZE_SCHEMA as unknown as Record<string, unknown>;

  let res: { data: RawAnalyzePayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawAnalyzePayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
      model: pickOpenRouterModel(params.model, DEFAULT_OPENROUTER_VISION_MODEL),
      temperature: 0.75,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawAnalyzePayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
      model: pickGeminiModel(params.model),
    });
  } else {
    res = await runAgyStructured<RawAnalyzePayload>({
      prompt: "",
      buildPromptWithPaths: ([filePath]) =>
        buildAnalyzePrompt(params.locale, tone, filePath, params.localTimeContext),
      schema,
      images: [{ filename: "desk", base64: params.imageBase64, mimeType: params.mimeType }],
      model: params.model,
    });
  }

  const objects = normalizeObjects(res.data.objects);
  return {
    groupName: res.data.groupName,
    resentmentScore: Math.max(0, Math.min(100, Math.round(res.data.resentmentScore))),
    verdict: res.data.verdict,
    mostLikelyToLeave: res.data.mostLikelyToLeave,
    objects,
    messages: normalizeMessages(res.data.messages, objects, "init"),
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function replyToOwner(params: {
  locale: Locale;
  tone?: Tone;
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerMessage: string;
  isFirstBreach: boolean;
  mentionedObjectIds?: string[];
  localTimeContext?: string;
  imageBase64?: string;
  mimeType?: string;
  model?: string;
  apiKey?: string;
}): Promise<ReplyResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
  const mentionedIds = resolveMentionedObjectIds(
    params.objects,
    params.ownerMessage,
    params.mentionedObjectIds
  );
  const hasImage = Boolean(params.imageBase64);
  const nextStartIdx =
    params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;

  const prompt = buildReplyPrompt({
    locale: params.locale,
    tone: params.tone || "roast",
    groupName: params.groupName,
    objects: params.objects,
    history: params.history,
    ownerMessage: params.ownerMessage,
    isFirstBreach: params.isFirstBreach,
    mentionedObjectIds: mentionedIds,
    localTimeContext: params.localTimeContext,
    hasImage,
  });
  const schema = REPLY_SCHEMA as unknown as Record<string, unknown>;
  const inlineImages =
    hasImage && params.imageBase64
      ? [{ base64: params.imageBase64, mimeType: params.mimeType || "image/jpeg" }]
      : undefined;

  let res: { data: RawReplyPayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawReplyPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: inlineImages,
      model: pickOpenRouterModel(
        params.model,
        hasImage ? DEFAULT_OPENROUTER_VISION_MODEL : DEFAULT_OPENROUTER_CHAT_MODEL
      ),
      temperature: hasImage ? 0.8 : 0.9,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawReplyPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: inlineImages,
      model: pickGeminiModel(params.model),
    });
  } else if (hasImage && params.imageBase64) {
    res = await runAgyStructured<RawReplyPayload>({
      prompt: "",
      buildPromptWithPaths: ([filePath]) =>
        buildReplyPrompt({
          locale: params.locale,
          tone: params.tone || "roast",
          groupName: params.groupName,
          objects: params.objects,
          history: params.history,
          ownerMessage: params.ownerMessage,
          isFirstBreach: params.isFirstBreach,
          mentionedObjectIds: mentionedIds,
          localTimeContext: params.localTimeContext,
          hasImage: true,
          imageFilePath: filePath,
        }),
      schema,
      images: [
        {
          filename: "desk-reply",
          base64: params.imageBase64,
          mimeType: params.mimeType || "image/jpeg",
        },
      ],
      model: params.model,
    });
  } else {
    res = await runAgyStructured<RawReplyPayload>({
      prompt,
      schema,
      model: params.model,
    });
  }

  // Reconcile newly discovered objects from photo (map raw id -> canonical unique id)
  const rawNewList = hasImage && Array.isArray(res.data.newObjects) ? res.data.newObjects : [];
  const newObjects = filterNewObjectsAgainstExisting(
    rawNewList,
    params.objects,
    nextStartIdx
  );
  const rawToCanonId = new Map<string, string>();
  rawNewList.forEach((raw, idx) => {
    const matched = newObjects.find(
      (n) =>
        n.name === raw.name ||
        (idx < newObjects.length && n.box_2d[0] === Math.round(raw.box_2d?.[0] ?? -1))
    );
    if (raw.id && matched) {
      rawToCanonId.set(raw.id, matched.id);
    }
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
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function diffDesks(params: {
  beforeImageBase64: string;
  afterImageBase64: string;
  mimeType: string;
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  model?: string;
  apiKey?: string;
}): Promise<DiffResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
  const tone: Tone = params.tone || "roast";
  const nextStartIdx =
    params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;
  const schema = DIFF_SCHEMA as unknown as Record<string, unknown>;
  const prompt = buildDiffPrompt({
    locale: params.locale,
    tone,
    objects: params.objects,
    history: params.history,
  });

  let res: { data: RawDiffPayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawDiffPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [
        { base64: params.beforeImageBase64, mimeType: params.mimeType },
        { base64: params.afterImageBase64, mimeType: params.mimeType },
      ],
      model: pickOpenRouterModel(params.model, DEFAULT_OPENROUTER_VISION_MODEL),
      temperature: 0.75,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawDiffPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [
        { base64: params.beforeImageBase64, mimeType: params.mimeType },
        { base64: params.afterImageBase64, mimeType: params.mimeType },
      ],
      model: pickGeminiModel(params.model),
    });
  } else {
    res = await runAgyStructured<RawDiffPayload>({
      prompt: "",
      buildPromptWithPaths: ([beforePath, afterPath]) =>
        buildDiffPrompt({
          locale: params.locale,
          tone,
          objects: params.objects,
          history: params.history,
          beforePath,
          afterPath,
        }),
      schema,
      images: [
        { filename: "desk-before", base64: params.beforeImageBase64, mimeType: params.mimeType },
        { filename: "desk-after", base64: params.afterImageBase64, mimeType: params.mimeType },
      ],
      model: params.model,
    });
  }

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
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function addDeskObject(params: {
  imageBase64: string;
  mimeType: string;
  box_2d: Box2D;
  customName?: string;
  locale: Locale;
  tone?: Tone;
  objects: DeskObject[];
  history: ChatMessage[];
  model?: string;
  apiKey?: string;
}): Promise<AddObjectResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
  const tone: Tone = params.tone || "roast";
  const clampedBox = clampBox2D(params.box_2d);
  const nextIndex = params.objects.reduce((m, o) => Math.max(m, o.index), 0) + 1;
  const newId = `obj-${nextIndex}-${Date.now().toString(36).slice(-4)}`;
  const schema = ADD_OBJECT_SCHEMA as unknown as Record<string, unknown>;
  const prompt = buildAddObjectPrompt({
    locale: params.locale,
    tone,
    box_2d: clampedBox,
    customName: params.customName,
    objects: params.objects,
    history: params.history,
  });

  let res: { data: RawAddObjectPayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawAddObjectPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
      model: pickOpenRouterModel(params.model, DEFAULT_OPENROUTER_VISION_MODEL),
      temperature: 0.75,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawAddObjectPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: [{ base64: params.imageBase64, mimeType: params.mimeType }],
      model: pickGeminiModel(params.model),
    });
  } else {
    res = await runAgyStructured<RawAddObjectPayload>({
      prompt: "",
      buildPromptWithPaths: ([filePath]) =>
        buildAddObjectPrompt({
          locale: params.locale,
          tone,
          box_2d: clampedBox,
          customName: params.customName,
          objects: params.objects,
          history: params.history,
          imageFilePath: filePath,
        }),
      schema,
      images: [{ filename: "desk-box", base64: params.imageBase64, mimeType: params.mimeType }],
      model: params.model,
    });
  }

  const rawData = res.data;
  const newObj: DeskObject = {
    id: newId,
    index: nextIndex,
    name: rawData.name || params.customName?.trim() || `Item ${nextIndex}`,
    roleTag: rawData.roleTag || "Newcomer",
    archetype: rawData.archetype || "observer",
    personality: rawData.personality || "",
    box_2d: clampedBox,
  };

  const mappedMessages = (rawData.messages || []).map((m) => ({
    ...m,
    senderId: m.senderId === "new-object" ? newId : m.senderId,
  }));
  const allObjects = [...params.objects, newObj];

  return {
    object: newObj,
    joinNotice:
      rawData.joinNotice ||
      (params.locale === "zh"
        ? `[${newObj.name}] 被主人圈进了群聊`
        : `[${newObj.name}] was pulled into the chat by Owner`),
    messages: normalizeMessages(mappedMessages, allObjects, "add"),
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function liveCameraTurn(params: {
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
  apiKey?: string;
}): Promise<LiveTurnResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
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
  const schema = LIVE_TURN_SCHEMA as unknown as Record<string, unknown>;
  const prompt = buildLiveTurnPrompt({
    locale: params.locale,
    tone,
    trigger: params.trigger,
    objects: params.objects,
    history: params.history,
    ownerMessage: params.ownerMessage,
    mentionedObjectIds: mentionedIds,
    hasPrevFrame: Boolean(params.prevImageBase64),
  });
  const inlineImages = params.prevImageBase64
    ? [
        { base64: params.prevImageBase64, mimeType: params.mimeType },
        { base64: params.currImageBase64, mimeType: params.mimeType },
      ]
    : [{ base64: params.currImageBase64, mimeType: params.mimeType }];

  let res: { data: RawLiveTurnPayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawLiveTurnPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: inlineImages,
      model: pickOpenRouterModel(params.model, DEFAULT_OPENROUTER_VISION_MODEL),
      temperature: 0.75,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawLiveTurnPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      images: inlineImages,
      model: pickGeminiModel(params.model),
    });
  } else {
    const agyImages = params.prevImageBase64
      ? [
          { filename: "live-prev", base64: params.prevImageBase64, mimeType: params.mimeType },
          { filename: "live-curr", base64: params.currImageBase64, mimeType: params.mimeType },
        ]
      : [{ filename: "live-curr", base64: params.currImageBase64, mimeType: params.mimeType }];

    res = await runAgyStructured<RawLiveTurnPayload>({
      prompt: "",
      buildPromptWithPaths: (paths) =>
        buildLiveTurnPrompt({
          locale: params.locale,
          tone,
          trigger: params.trigger,
          objects: params.objects,
          history: params.history,
          ownerMessage: params.ownerMessage,
          mentionedObjectIds: mentionedIds,
          hasPrevFrame: Boolean(params.prevImageBase64),
          prevPath: paths.length > 1 ? paths[0] : undefined,
          currPath: paths.length > 1 ? paths[1] : paths[0],
        }),
      schema,
      images: agyImages,
      model: params.model,
    });
  }

  const rawData = res.data;
  const newObjects = normalizeObjects(rawData.newObjects, nextStartIdx).map((o) => ({
    ...o,
    isNew: true,
  }));
  const allObjects = [...params.objects, ...newObjects];

  return {
    sceneNote: rawData.sceneNote?.trim() || "",
    removedIds: rawData.removedIds || [],
    newObjects,
    messages: normalizeMessages(rawData.messages, allObjects, "live"),
    resentmentScore: Math.max(0, Math.min(100, Math.round(rawData.resentmentScore))),
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}

export async function generateDeskChatter(params: {
  locale: Locale;
  tone?: Tone;
  groupName?: string;
  objects: DeskObject[];
  history: ChatMessage[];
  ownerPresent: boolean;
  localTimeContext?: string;
  model?: string;
  apiKey?: string;
}): Promise<ChatterResult> {
  const { provider, resolvedKey } = chooseProvider(params.apiKey);
  const prompt = buildChatterPrompt({
    locale: params.locale,
    tone: params.tone || "roast",
    groupName: params.groupName,
    objects: params.objects,
    history: params.history,
    ownerPresent: params.ownerPresent,
    localTimeContext: params.localTimeContext,
  });
  const schema = CHATTER_SCHEMA as unknown as Record<string, unknown>;

  let res: { data: RawChatterPayload; model: string; durationMs: number };

  if (provider === "openrouter" && resolvedKey) {
    res = await runOpenRouterStructured<RawChatterPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      model: pickOpenRouterModel(params.model, DEFAULT_OPENROUTER_CHAT_MODEL),
      temperature: 0.9,
    });
  } else if (provider === "gemini" && resolvedKey) {
    res = await runGeminiStructured<RawChatterPayload>({
      apiKey: resolvedKey,
      prompt,
      schema,
      model: pickGeminiModel(params.model),
    });
  } else {
    res = await runAgyStructured<RawChatterPayload>({
      prompt,
      schema,
      model: params.model,
    });
  }

  const actions = normalizeGroupActions(res.data.actions, params.objects, params.locale);
  const objectUpdates = normalizeObjectUpdates(res.data.objectUpdates, params.objects);
  const rawMsgs = normalizeMessages(res.data.messages, params.objects, "chat");
  const filteredMsgs = filterMessagesAfterActions(rawMsgs, params.objects, actions);
  const messages = dedupeParrotedMessages(filteredMsgs, params.history);

  return {
    tensionDelta: Math.max(-8, Math.min(8, Math.round(res.data.tensionDelta))),
    actions,
    objectUpdates,
    messages,
    provider,
    model: res.model,
    durationMs: res.durationMs,
  };
}
