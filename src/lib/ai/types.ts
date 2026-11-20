export type Locale = "zh" | "en";

export type Skin = "gallery" | "message" | "dark";

export type Tone = "roast" | "corporate" | "drama";

export type CardLayout = "landscape" | "portrait";

export type ProviderName = "openrouter" | "agy" | "gemini";

export type HealthMode =
  | "hosted-openrouter"
  | "local-agy"
  | "hosted-gemini"
  | "byok-only";

export type ApiErrorCode = "KEY_REQUIRED" | "RATE_LIMITED" | "PROVIDER_ERROR";

/** Normalized [ymin, xmin, ymax, xmax] in 0..1000 coordinates */
export type Box2D = [number, number, number, number];

export type Archetype = "laborer" | "dust" | "consumable" | "observer";

export interface DeskObject {
  id: string;
  index: number;
  name: string;
  roleTag: string;
  archetype: Archetype;
  personality: string;
  box_2d: Box2D;
  avatarUrl?: string;
  removed?: boolean;
  isNew?: boolean;
}

export interface DiffMeta {
  removedNames: string[];
  addedNames: string[];
  prevScore: number;
  nextScore: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  replyToName?: string;
  reaction?: string;
  timestamp: string;
  isOwner?: boolean;
  isSystem?: boolean;
  diffMeta?: DiffMeta;
}

export interface DeskAnalysisResult {
  groupName: string;
  resentmentScore: number;
  verdict: string;
  mostLikelyToLeave: string;
  objects: DeskObject[];
  messages: ChatMessage[];
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface ReplyResult {
  messages: ChatMessage[];
  tensionDelta: number;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface DiffResult {
  summary: string;
  removedIds: string[];
  newObjects: DeskObject[];
  messages: ChatMessage[];
  resentmentScore: number;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface AddObjectResult {
  object: DeskObject;
  joinNotice: string;
  messages: ChatMessage[];
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface LiveTurnResult {
  sceneNote: string;
  removedIds: string[];
  newObjects: DeskObject[];
  messages: ChatMessage[];
  resentmentScore: number;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface ChatterResult {
  messages: ChatMessage[];
  tensionDelta: number;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

export interface HealthStatus {
  provider: ProviderName;
  mode: HealthMode;
  agyAvailable: boolean;
  agyPath: string | null;
  defaultModel: string;
  openrouterConfigured: boolean;
  geminiConfigured: boolean;
  visionModel?: string;
  chatModel?: string;
  proxyDetected: string | null;
  rateLimitHourly: number | null;
}

export interface DeskSession {
  id: string;
  title: string;
  imageSrc: string;
  afterImageSrc: string | null;
  groupName: string;
  resentmentScore: number;
  verdict: string;
  mostLikelyToLeave: string;
  objects: DeskObject[];
  messages: ChatMessage[];
  visibleCount: number;
  hasBrokenIn: boolean;
  ownerSteppedAway?: boolean;
  activeSampleId: string | null;
  isBlank: boolean;
  createdAt: number;
}
