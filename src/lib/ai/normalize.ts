import type {
  Archetype,
  Box2D,
  ChatMessage,
  DeskObject,
  Locale,
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
  const active = objects.filter((o) => !o.removed);
  const found = new Set<string>(
    (explicitIds || []).filter((id) => active.some((o) => o.id === id))
  );
  const lowerMsg = ownerMessage.toLowerCase();
  for (const obj of active) {
    if (lowerMsg.includes(`@${obj.name.toLowerCase()}`)) {
      found.add(obj.id);
    }
  }
  return Array.from(found);
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
