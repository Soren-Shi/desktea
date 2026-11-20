import type {
  Archetype,
  Box2D,
  ChatMessage,
  DeskObject,
  DiffObjectAudit,
  GroupAction,
  GroupActionType,
  Locale,
  ObjectMood,
  ObjectStateUpdate,
  ObjectStatus,
} from "./types";

export interface RawObject {
  id: string;
  name: string;
  roleTag: string;
  archetype: Archetype;
  personality: string;
  box_2d: number[];
}

export interface RawMessage {
  senderId: string;
  text: string;
  replyToName?: string;
  reaction?: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface RawGroupAction {
  type: string;
  objectId?: string;
  value?: string;
  systemNotice?: string;
}

export interface RawObjectUpdate {
  objectId: string;
  mood: string;
  memoryNote?: string;
}

export interface RawDiffAudit {
  id: string;
  status: string;
  evidence?: string;
  afterBox2d?: number[];
}

const VALID_ACTIONS = new Set<GroupActionType>([
  "kick",
  "invite",
  "mute",
  "unmute",
  "rename_group",
  "set_title",
  "leave",
]);

const VALID_MOODS = new Set<ObjectMood>([
  "chill",
  "annoyed",
  "panicked",
  "smug",
  "betrayed",
  "dramatic",
]);

export function getObjectStatus(obj: DeskObject): ObjectStatus {
  if (obj.status) return obj.status;
  return obj.removed ? "gone" : "active";
}

export function isObjectInChat(obj: DeskObject): boolean {
  const st = getObjectStatus(obj);
  return st === "active" || st === "muted";
}

export function canObjectSpeak(obj: DeskObject): boolean {
  return getObjectStatus(obj) === "active";
}

export function isValidNonZeroBox(raw: unknown): raw is number[] {
  if (!Array.isArray(raw) || raw.length < 4) return false;
  const [ymin, xmin, ymax, xmax] = raw.slice(0, 4).map((n) => Number(n));
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return false;
  if (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) return false;
  return Math.abs(ymax - ymin) >= 18 && Math.abs(xmax - xmin) >= 18;
}

export function computeBoxIoU(a: Box2D, b: Box2D): number {
  const interY1 = Math.max(a[0], b[0]);
  const interX1 = Math.max(a[1], b[1]);
  const interY2 = Math.min(a[2], b[2]);
  const interX2 = Math.min(a[3], b[3]);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
  return interArea / Math.max(1, areaA + areaB - interArea);
}

export function clampBox2D(raw: unknown): Box2D {
  if (!Array.isArray(raw) || raw.length < 4) {
    return [100, 100, 400, 400];
  }
  const nums = raw.slice(0, 4).map((n) => {
    const val = Math.round(Number(n));
    if (!Number.isFinite(val)) return 0;
    return Math.max(0, Math.min(1000, val));
  });
  let [ymin, xmin, ymax, xmax] = nums;
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  if (ymax - ymin < 25) ymax = Math.min(1000, ymin + 40);
  if (xmax - xmin < 25) xmax = Math.min(1000, xmin + 40);
  return [ymin, xmin, ymax, xmax];
}

export function formatChatTimestamp(raw?: string): string {
  const val = (raw || "").trim();
  if (!val) return "00:00";
  const hhmmMatch = val.match(/(?:T|^|\s)(\d{2}:\d{2})(?::\d{2})?/);
  if (hhmmMatch) return hhmmMatch[1];
  return val.slice(0, 8);
}

export function normalizeObjects(raw: RawObject[], startIndex = 1): DeskObject[] {
  return (raw || []).slice(0, 6).map((obj, idx) => ({
    id: obj.id || `obj-${startIndex + idx}`,
    index: startIndex + idx,
    name: obj.name || `Item ${startIndex + idx}`,
    roleTag: obj.roleTag || "Desk Resident",
    archetype: obj.archetype || "observer",
    personality: obj.personality || "",
    box_2d: clampBox2D(obj.box_2d),
  }));
}

export function normalizeMessages(
  raw: RawMessage[],
  objects: DeskObject[],
  prefix = "msg"
): ChatMessage[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const fallback = objects[0];
  return (raw || []).map((m, idx) => {
    const isSystem = Boolean(m.isSystem || m.senderId === "system");
    const sender = byId.get(m.senderId) || fallback;
    const rawReply = m.replyToName?.trim();
    const resolvedReply = rawReply ? byId.get(rawReply)?.name || rawReply : undefined;
    return {
      id: `${prefix}-${Date.now()}-${idx}`,
      senderId: isSystem ? "system" : sender?.id || m.senderId,
      senderName: isSystem ? "SYSTEM" : sender?.name || m.senderId,
      text: m.text || "",
      replyToName: resolvedReply,
      reaction: m.reaction?.trim() || undefined,
      timestamp: formatChatTimestamp(m.timestamp),
      isSystem,
    };
  });
}

export function resolveMentionedObjectIds(
  objects: DeskObject[],
  ownerMessage: string,
  explicitIds?: string[]
): string[] {
  const found = new Set<string>(
    (explicitIds || []).filter((id) => objects.some((o) => o.id === id))
  );
  const lowerMsg = ownerMessage.toLowerCase();
  for (const obj of objects) {
    if (lowerMsg.includes(`@${obj.name.toLowerCase()}`)) {
      found.add(obj.id);
    }
  }
  return Array.from(found);
}

export function normalizeGroupActions(
  rawActions: RawGroupAction[] | undefined,
  objects: DeskObject[],
  locale: Locale
): GroupAction[] {
  if (!Array.isArray(rawActions) || rawActions.length === 0) return [];
  const byId = new Map(objects.map((o) => [o.id, o]));
  const results: GroupAction[] = [];

  for (const raw of rawActions.slice(0, 3)) {
    const type = raw.type as GroupActionType;
    if (!VALID_ACTIONS.has(type)) continue;

    if (type === "rename_group") {
      const nextName = (raw.value || "").trim().slice(0, 48);
      if (!nextName) continue;
      results.push({
        type,
        value: nextName,
        systemNotice:
          raw.systemNotice?.trim() ||
          (locale === "zh"
            ? `群聊名称已修改为「${nextName}」`
            : `Group renamed to "${nextName}"`),
      });
      continue;
    }

    const target = raw.objectId ? byId.get(raw.objectId) : undefined;
    if (!target) continue;

    if (type === "set_title") {
      const nextTag = (raw.value || "").trim().slice(0, 24);
      if (!nextTag) continue;
      results.push({
        type,
        objectId: target.id,
        value: nextTag,
        systemNotice:
          raw.systemNotice?.trim() ||
          (locale === "zh"
            ? `[${target.name}] 获得了新头衔：${nextTag}`
            : `[${target.name}] received a new title: ${nextTag}`),
      });
      continue;
    }

    const defaultNotice = (() => {
      if (type === "kick") {
        return locale === "zh"
          ? `[${target.name}] 被主人移出了群聊`
          : `[${target.name}] was kicked out by Owner`;
      }
      if (type === "invite") {
        return locale === "zh"
          ? `[${target.name}] 被拉回了群聊`
          : `[${target.name}] was pulled back into the chat`;
      }
      if (type === "mute") {
        return locale === "zh"
          ? `[${target.name}] 已被禁言`
          : `[${target.name}] was muted`;
      }
      if (type === "unmute") {
        return locale === "zh"
          ? `[${target.name}] 已解除禁言`
          : `[${target.name}] was unmuted`;
      }
      return locale === "zh"
        ? `[${target.name}] 气得退出了群聊`
        : `[${target.name}] rage-quit the group chat`;
    })();

    results.push({
      type,
      objectId: target.id,
      value: raw.value?.trim() || undefined,
      systemNotice: raw.systemNotice?.trim() || defaultNotice,
    });
  }

  return results;
}

export function normalizeObjectUpdates(
  rawUpdates: RawObjectUpdate[] | undefined,
  objects: DeskObject[]
): ObjectStateUpdate[] {
  if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) return [];
  const validIds = new Set(objects.map((o) => o.id));
  const out: ObjectStateUpdate[] = [];
  for (const item of rawUpdates.slice(0, 4)) {
    if (!item?.objectId || !validIds.has(item.objectId)) continue;
    const mood = item.mood as ObjectMood;
    if (!VALID_MOODS.has(mood)) continue;
    out.push({
      objectId: item.objectId,
      mood,
      memoryNote: item.memoryNote?.trim().slice(0, 80) || undefined,
    });
  }
  return out;
}

export function filterMessagesAfterActions(
  messages: ChatMessage[],
  objects: DeskObject[],
  actions: GroupAction[]
): ChatMessage[] {
  // Objects that are muted/kicked/left this turn cannot speak (unless invited back in the same turn)
  const silenced = new Set<string>();
  for (const obj of objects) {
    const st = getObjectStatus(obj);
    if (st === "muted" || st === "kicked" || st === "gone") {
      silenced.add(obj.id);
    }
  }
  for (const act of actions) {
    if (!act.objectId) continue;
    if (act.type === "kick" || act.type === "mute" || act.type === "leave") {
      silenced.add(act.objectId);
    } else if (act.type === "invite" || act.type === "unmute") {
      silenced.delete(act.objectId);
    }
  }
  return messages.filter((m) => m.isSystem || m.isOwner || !silenced.has(m.senderId));
}

export function reconcileDiffAudits(params: {
  prevObjects: DeskObject[];
  rawAudits?: RawDiffAudit[];
  rawRemovedIds?: string[];
  rawNewObjects?: RawObject[];
  nextStartIdx: number;
}): {
  removedIds: string[];
  updatedBoxes: Array<{ id: string; box_2d: Box2D; status: "kept" | "moved" }>;
  objectAudits: DiffObjectAudit[];
  newObjects: DeskObject[];
} {
  const prevActive = params.prevObjects.filter((o) => !o.removed && getObjectStatus(o) !== "gone");
  const prevById = new Map(prevActive.map((o) => [o.id, o]));
  const removedSet = new Set<string>(
    (params.rawRemovedIds || []).filter((id) => prevById.has(id))
  );
  const updatedBoxes: Array<{ id: string; box_2d: Box2D; status: "kept" | "moved" }> = [];
  const objectAudits: DiffObjectAudit[] = [];

  for (const audit of params.rawAudits || []) {
    if (!audit?.id || !prevById.has(audit.id)) continue;
    const rawStatus = audit.status;
    const validAfter = isValidNonZeroBox(audit.afterBox2d);
    if (rawStatus === "removed" || !validAfter) {
      removedSet.add(audit.id);
      objectAudits.push({
        id: audit.id,
        status: "removed",
        evidence: audit.evidence?.trim() || "",
      });
    } else {
      removedSet.delete(audit.id);
      const clamped = clampBox2D(audit.afterBox2d);
      const status: "kept" | "moved" = rawStatus === "moved" ? "moved" : "kept";
      updatedBoxes.push({ id: audit.id, box_2d: clamped, status });
      objectAudits.push({
        id: audit.id,
        status,
        evidence: audit.evidence?.trim() || "",
        afterBox2d: clamped,
      });
    }
  }

  // Deduplicate newObjects that heavily overlap surviving objects' afterBox2d
  const normalizedNew = normalizeObjects(params.rawNewObjects || [], params.nextStartIdx)
    .filter((cand) => {
      for (const surv of updatedBoxes) {
        if (computeBoxIoU(cand.box_2d, surv.box_2d) > 0.55) {
          return false;
        }
      }
      return true;
    })
    .map((o) => ({ ...o, isNew: true, status: "active" as const }));

  return {
    removedIds: Array.from(removedSet),
    updatedBoxes,
    objectAudits,
    newObjects: normalizedNew,
  };
}

export function getLocalTimeContext(locale: Locale): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const h = now.getHours();
  if (locale === "zh") {
    const part =
      h < 5
        ? "深夜熬夜"
        : h < 9
        ? "清晨"
        : h < 12
        ? "上午工作时段"
        : h < 14
        ? "午间"
        : h < 18
        ? "下午"
        : h < 22
        ? "晚间"
        : "深夜";
    return `${hh}:${mm} (${part})`;
  }
  const part =
    h < 5
      ? "late night"
      : h < 9
      ? "early morning"
      : h < 12
      ? "morning"
      : h < 14
      ? "midday"
      : h < 18
      ? "afternoon"
      : h < 22
      ? "evening"
      : "late night";
  return `${hh}:${mm} (${part})`;
}
