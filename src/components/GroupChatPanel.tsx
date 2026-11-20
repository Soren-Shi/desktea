"use client";

import {
  ArrowDown,
  ArrowUp,
  AtSign,
  ChevronDown,
  Footprints,
  Info,
  Radio,
  Trash2,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getObjectStatus, isObjectInChat } from "@/lib/ai/normalize";
import type { ChatMessage, DeskObject, Locale, Tone } from "@/lib/ai/types";
import { getCopy } from "@/lib/i18n";

interface GroupChatPanelProps {
  locale: Locale;
  tone: Tone;
  isBlankSession: boolean;
  isLiveCamActive: boolean;
  groupName: string;
  resentmentScore: number;
  verdict: string;
  mostLikelyToLeave: string;
  objects: DeskObject[];
  messages: ChatMessage[];
  visibleCount: number;
  isScanning: boolean;
  isStreaming: boolean;
  isReplying: boolean;
  isChattering: boolean;
  autoChatEnabled: boolean;
  canStepAway: boolean;
  activeObjectId: string | null;
  selectedObjectId: string | null;
  speakingObjectId: string | null;
  quickReplies: string[];
  situationalPrompts: string[];
  onChangeTone: (tone: Tone) => void;
  onToggleAutoChat: () => void;
  onStepAway: () => void;
  onHoverObject: (id: string | null) => void;
  onSelectObject: (id: string | null) => void;
  onClearFilter: () => void;
  onRevealAll: () => void;
  onHoverMessage: (id: string | null) => void;
  onSendOwnerMessage: (text: string) => void;
  onMemberAction: (
    objectId: string,
    action: "kick" | "invite" | "mute" | "unmute"
  ) => void;
  onClearChat: () => void;
  onDeleteMessage: (id: string) => void;
}

const TONES: Tone[] = ["roast", "corporate", "drama"];

function renderMessageText(
  text: string,
  objectNames: string[],
  isOwnerBubble: boolean
) {
  const sortedNames = [...objectNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const mentionPattern =
    sortedNames.length > 0
      ? new RegExp(
          `(@(?:${sortedNames.join("|")})|@[\\w\\u4e00-\\u9fa5\\-·]+)`,
          "g"
        )
      : /(@[\w\u4e00-\u9fa5\-·]+)/g;

  const parts = text.split(mentionPattern);
  return parts.map((part, idx) =>
    part.startsWith("@") ? (
      <span
        key={idx}
        className={
          isOwnerBubble
            ? "font-semibold text-[#D9381E]"
            : "font-medium text-[#FF6B5B]"
        }
      >
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

export function GroupChatPanel({
  locale,
  tone,
  isBlankSession,
  isLiveCamActive,
  groupName,
  resentmentScore,
  verdict,
  mostLikelyToLeave,
  objects,
  messages,
  visibleCount,
  isScanning,
  isStreaming,
  isReplying,
  isChattering,
  autoChatEnabled,
  canStepAway,
  activeObjectId,
  selectedObjectId,
  speakingObjectId,
  quickReplies,
  situationalPrompts,
  onChangeTone,
  onToggleAutoChat,
  onStepAway,
  onHoverObject,
  onSelectObject,
  onClearFilter,
  onRevealAll,
  onHoverMessage,
  onSendOwnerMessage,
  onMemberAction,
  onClearChat,
  onDeleteMessage,
}: GroupChatPanelProps) {
  const t = getCopy(locale);
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIdx, setMentionStartIdx] = useState<number>(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [verdictExpanded, setVerdictExpanded] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    setConfirmClear(false);
  }, [groupName, messages.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const prevDisplayedLenRef = useRef(0);

  const objectMap = useMemo(
    () => new Map(objects.map((o) => [o.id, o])),
    [objects]
  );
  const objectNames = useMemo(() => objects.map((o) => o.name), [objects]);
  const activeObjects = useMemo(
    () => objects.filter((o) => isObjectInChat(o)),
    [objects]
  );

  // Include kicked/muted objects in @mention picker so owner can @them to invite/unmute!
  const mentionableObjects = useMemo(
    () => objects.filter((o) => getObjectStatus(o) !== "gone"),
    [objects]
  );

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableObjects.filter(
      (o) =>
        o.name.toLowerCase().includes(q) || o.roleTag.toLowerCase().includes(q)
    );
  }, [mentionQuery, mentionableObjects]);

  const sliced = messages.slice(0, visibleCount);
  const displayed = selectedObjectId
    ? sliced.filter(
        (m) => m.senderId === selectedObjectId || m.isSystem || m.isOwner
      )
    : sliced;

  const nextTyping =
    isStreaming && visibleCount < messages.length
      ? messages[visibleCount]
      : null;

  const lastDisplayedId =
    displayed.length > 0 ? displayed[displayed.length - 1].id : "";

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
      setHasUnreadBelow(false);
      isNearBottomRef.current = true;
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 130;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setHasUnreadBelow(false);
    }
  }, []);

  // Keep pinned to bottom when container resizes (e.g. mobile photo collapse/expand or keyboard)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-anchor to bottom when switching filter back to full chat
  useEffect(() => {
    if (selectedObjectId === null && isNearBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [selectedObjectId, scrollToBottom]);

  // Auto-scroll smoothly whenever new messages stream in or AI starts typing
  useEffect(() => {
    const grew = displayed.length > prevDisplayedLenRef.current;
    prevDisplayedLenRef.current = displayed.length;

    if (forceScrollRef.current || isNearBottomRef.current) {
      forceScrollRef.current = false;
      scrollToBottom("smooth");
    } else if (grew) {
      setHasUnreadBelow(true);
    }
  }, [displayed.length, lastDisplayedId, isReplying, isChattering, scrollToBottom]);

  const evaluateMentionTrigger = (val: string, cursorPos: number) => {
    const beforeCursor = val.slice(0, cursorPos);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      const query = match[1];
      const atIdx = beforeCursor.lastIndexOf("@");
      setMentionQuery(query);
      setMentionStartIdx(atIdx);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIdx(-1);
    }
  };

  const insertMentionObject = (obj: DeskObject) => {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? draft.length;
    if (mentionQuery !== null && mentionStartIdx >= 0) {
      const prefix = draft.slice(0, mentionStartIdx);
      const suffix = draft.slice(cursor);
      const next = `${prefix}@${obj.name} ${suffix}`;
      setDraft(next);
      setMentionQuery(null);
      setMentionStartIdx(-1);
      requestAnimationFrame(() => {
        if (input) {
          input.focus();
          const nextPos = prefix.length + obj.name.length + 2;
          input.setSelectionRange(nextPos, nextPos);
        }
      });
    } else {
      const spacer = draft && !draft.endsWith(" ") ? " " : "";
      const next = `${draft}${spacer}@${obj.name} `;
      setDraft(next);
      setMentionQuery(null);
      requestAnimationFrame(() => {
        input?.focus();
      });
    }
  };

  const handleOpenMentionPicker = () => {
    if (mentionableObjects.length === 0 || isScanning) return;
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const spacer = before && !before.endsWith(" ") ? " " : "";
    const inserted = `${before}${spacer}@`;
    const next = `${inserted}${draft.slice(cursor)}`;
    setDraft(next);
    setMentionQuery("");
    setMentionStartIdx(inserted.length - 1);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(inserted.length, inserted.length);
      }
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery === null || mentionCandidates.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionCandidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex(
        (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMentionObject(mentionCandidates[mentionIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionQuery(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      insertMentionObject(mentionCandidates[mentionIndex]);
      return;
    }
    const cleaned = draft.trim();
    if (
      !cleaned ||
      isReplying ||
      isScanning ||
      (!isLiveCamActive && objects.length === 0)
    ) {
      return;
    }
    forceScrollRef.current = true;
    onSendOwnerMessage(cleaned);
    setDraft("");
    setMentionQuery(null);
  };

  const handleCycleTone = () => {
    const idx = TONES.indexOf(tone);
    const next = TONES[(idx + 1) % TONES.length];
    onChangeTone(next);
  };

  const canSend =
    Boolean(draft.trim()) &&
    !isReplying &&
    !isScanning &&
    (objects.length > 0 || isLiveCamActive);

  const tensionDotColor =
    resentmentScore >= 80
      ? "bg-[var(--accent)]"
      : resentmentScore >= 55
      ? "bg-amber-400"
      : "bg-emerald-400";

  const selectedObj = selectedObjectId ? objectMap.get(selectedObjectId) : null;
  const selectedStatus = selectedObj ? getObjectStatus(selectedObj) : null;

  return (
    <section className="relative flex h-full min-h-0 flex-col border-t border-[var(--border)] bg-[var(--rail)] lg:border-l lg:border-t-0">
      {/* Streamlined Breathable Header (Ultra-compact 2 rows on mobile) */}
      <div className="shrink-0 border-b border-[var(--border)] px-3.5 pb-2 pt-2.5 sm:px-6 sm:pb-3 sm:pt-3.5 lg:pb-3.5 lg:pt-4">
        {/* Row 1: Group Title + Tension + Mobile Auto-Chat / Desktop Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h1 className="min-w-0 truncate text-[14.5px] font-semibold leading-snug tracking-[-0.02em] text-[#FAFAFA] sm:text-[15.5px]">
              {isScanning
                ? t.scanningPill
                : isBlankSession && objects.length === 0
                ? t.brand
                : groupName}
            </h1>
            {!isScanning && objects.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileInfoOpen((v) => !v)}
                aria-label={t.chatInfoBtn}
                className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors sm:hidden ${
                  mobileInfoOpen
                    ? "bg-[var(--surface-hover)] text-white"
                    : "text-[var(--ink-muted)] hover:text-white"
                }`}
              >
                <Info className="h-3.5 w-3.5 stroke-[1.8]" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isScanning && objects.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[#D9DBDF] sm:px-2.5">
                <span className={`h-1.5 w-1.5 rounded-full ${tensionDotColor}`} />
                <span className="tabular-nums">
                  <span className="hidden sm:inline">{t.resentmentWord} </span>
                  {resentmentScore}%
                </span>
              </span>
            )}
            {!isScanning && isStreaming && (
              <button
                type="button"
                onClick={onRevealAll}
                className="cursor-pointer rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.97] sm:px-2.5"
              >
                {t.revealAll}
              </button>
            )}
            {/* Mobile compact Auto-Chat switch right in Row 1 */}
            {!isScanning && objects.length >= 2 && (
              <button
                type="button"
                role="switch"
                aria-checked={autoChatEnabled}
                onClick={onToggleAutoChat}
                title={autoChatEnabled ? t.autoChatOnTitle : t.autoChatOffTitle}
                className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all active:scale-[0.97] sm:hidden ${
                  autoChatEnabled
                    ? "border-emerald-400/55 bg-emerald-500/18 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.22)]"
                    : "border-[var(--border-strong)] bg-[#1B1C22] text-[#E6E8EC]"
                }`}
              >
                <Radio
                  className={`h-3 w-3 stroke-[2] ${
                    autoChatEnabled ? "animate-pulse text-emerald-300" : "text-[#9A9FA8]"
                  }`}
                />
                <span>{t.autoChatLabel}</span>
              </button>
            )}
            {/* Desktop Clear Chat button */}
            {!isScanning && messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirmClear) {
                    setConfirmClear(false);
                    onClearChat();
                  } else {
                    setConfirmClear(true);
                  }
                }}
                title={t.deleteChatBtn}
                aria-label={confirmClear ? t.deleteChatConfirm : t.deleteChatBtn}
                className={`hidden cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors active:scale-[0.97] sm:flex ${
                  confirmClear
                    ? "border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[#FF8A80]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-white"
                }`}
              >
                <Trash2 className="h-3 w-3 stroke-[1.75]" />
                {confirmClear && <span>{t.deleteChatConfirm}</span>}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Collapsible Info Panel (Verdict + Meta + Clear Chat) */}
        {mobileInfoOpen && !isScanning && objects.length > 0 && (
          <div className="mt-2 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[11.5px] sm:hidden">
            <div className="flex items-center justify-between gap-2 text-[var(--ink-secondary)]">
              <span className="truncate">
                {activeObjects.length} {t.membersSuffix} · {t.firstToLeave}:{" "}
                {mostLikelyToLeave}
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmClear) {
                      setConfirmClear(false);
                      setMobileInfoOpen(false);
                      onClearChat();
                    } else {
                      setConfirmClear(true);
                    }
                  }}
                  className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    confirmClear
                      ? "border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[#FF8A80]"
                      : "border-[var(--border)] text-[var(--ink-secondary)] hover:text-white"
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{confirmClear ? t.deleteChatConfirm : t.deleteChatBtn}</span>
                </button>
              )}
            </div>
            {verdict && (
              <p className="leading-relaxed text-[#D9DBDF]">{verdict}</p>
            )}
          </div>
        )}

        {/* Desktop Row 2: Member meta + Prominent Auto-Chat Switch */}
        {!isScanning && objects.length > 0 && (
          <div className="mt-2 hidden items-center justify-between gap-2 sm:flex">
            <div className="flex min-w-0 flex-1 items-center gap-x-2 text-[11.5px] text-[var(--ink-secondary)]">
              <span className="shrink-0 whitespace-nowrap">
                {activeObjects.length} {t.membersSuffix}
              </span>
              <span className="shrink-0 text-[var(--ink-muted)]">·</span>
              <span className="truncate">
                {t.firstToLeave}: {mostLikelyToLeave}
              </span>
            </div>

            {objects.length >= 2 && (
              <button
                type="button"
                role="switch"
                aria-checked={autoChatEnabled}
                onClick={onToggleAutoChat}
                title={autoChatEnabled ? t.autoChatOnTitle : t.autoChatOffTitle}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-all active:scale-[0.97] ${
                  autoChatEnabled
                    ? "border-emerald-400/55 bg-emerald-500/18 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.22)]"
                    : "border-[var(--border-strong)] bg-[#1B1C22] text-[#F2F4F8] hover:border-white/35 hover:bg-[#23252C]"
                }`}
              >
                <Radio
                  className={`h-3 w-3 stroke-[2] ${
                    autoChatEnabled ? "animate-pulse text-emerald-300" : "text-[#9A9FA8]"
                  }`}
                />
                <span>{t.autoChatLabel}</span>
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${
                    autoChatEnabled
                      ? "justify-end bg-emerald-400"
                      : "justify-start bg-[#32353C]"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      autoChatEnabled ? "bg-[#0A0A0A]" : "bg-[#D9DBDF]"
                    }`}
                  />
                </span>
              </button>
            )}
          </div>
        )}

        {/* Desktop Click-to-expand single-line Verdict */}
        {!isScanning && verdict && objects.length > 0 && (
          <button
            type="button"
            onClick={() => setVerdictExpanded((v) => !v)}
            className="mt-2 hidden w-full cursor-pointer items-start gap-1.5 text-left text-[12px] leading-[1.5] text-[var(--ink-secondary)] transition-colors hover:text-[#D9DBDF] sm:flex"
          >
            <span className={verdictExpanded ? "" : "line-clamp-1"}>
              {verdict}
            </span>
            <ChevronDown
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)] transition-transform ${
                verdictExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}

        {/* Interactive Cropped-Avatar Cast Roster */}
        {!isScanning && objects.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 sm:mt-2.5">
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-0.5">
              {objects.map((obj) => {
                const st = getObjectStatus(obj);
                const isSelected = selectedObjectId === obj.id;
                const isHovered = activeObjectId === obj.id;
                const isSpeaking = speakingObjectId === obj.id;
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onMouseEnter={() => onHoverObject(obj.id)}
                    onMouseLeave={() => onHoverObject(null)}
                    onClick={() => onSelectObject(isSelected ? null : obj.id)}
                    title={`${obj.name} · ${obj.roleTag}${
                      st === "kicked"
                        ? ` (${t.statusKicked})`
                        : st === "muted"
                        ? ` (${t.statusMuted})`
                        : st === "gone"
                        ? ` (${t.statusGone})`
                        : ""
                    }`}
                    aria-label={obj.name}
                    className={`relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full transition-transform duration-150 active:scale-95 ${
                      st === "gone" || st === "kicked"
                        ? "opacity-40 grayscale"
                        : st === "muted"
                        ? "opacity-65"
                        : ""
                    } ${
                      isSelected || isSpeaking
                        ? "scale-105 ring-2 ring-[var(--accent)]"
                        : isHovered
                        ? "scale-105 ring-2 ring-white"
                        : "ring-1 ring-white/15 hover:ring-white/45"
                    }`}
                  >
                    {obj.avatarUrl ? (
                      <img
                        src={obj.avatarUrl}
                        alt={obj.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="block h-full w-full bg-white/10" />
                    )}
                    {st === "muted" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-amber-300">
                        <VolumeX className="h-3 w-3" />
                      </span>
                    )}
                    {st === "kicked" && (
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[var(--accent)]/90" />
                    )}
                  </button>
                );
              })}
            </div>
            {canStepAway ? (
              <button
                type="button"
                onClick={onStepAway}
                disabled={isReplying || isChattering}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-white active:scale-[0.97] disabled:opacity-40"
              >
                <Footprints className="h-3 w-3 stroke-[1.75]" />
                <span>{t.stepAwayBtn}</span>
              </button>
            ) : (
              <span className="hidden shrink-0 text-[10.5px] text-[var(--ink-muted)] sm:inline">
                {t.clickPinHint}
              </span>
            )}
          </div>
        )}

        {/* Selected Object Spotlight & Member Power Bar (Kick / Pull Back / Mute / @Mention) */}
        {selectedObj && selectedStatus && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11.5px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-[#FAFAFA]">
                {selectedObj.name}
              </span>
              {selectedStatus === "kicked" && (
                <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[#FF8A80]">
                  {t.statusKicked}
                </span>
              )}
              {selectedStatus === "muted" && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                  {t.statusMuted}
                </span>
              )}
              {selectedStatus === "gone" && (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                  {t.statusGone}
                </span>
              )}
              {selectedStatus === "active" && selectedObj.mood && (
                <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                  {t.moodLabels[selectedObj.mood]}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {selectedStatus !== "gone" && (
                <button
                  type="button"
                  onClick={() => insertMentionObject(selectedObj)}
                  className="cursor-pointer rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[#FF7A70] hover:text-white"
                >
                  {t.mentionThis}
                </button>
              )}

              {selectedStatus === "active" && (
                <>
                  <button
                    type="button"
                    disabled={isReplying || isScanning}
                    onClick={() => onMemberAction(selectedObj.id, "mute")}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white disabled:opacity-40"
                  >
                    <VolumeX className="h-3 w-3" />
                    <span>{t.muteBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isReplying || isScanning}
                    onClick={() => onMemberAction(selectedObj.id, "kick")}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[#FF8A80] hover:text-white disabled:opacity-40"
                  >
                    <UserMinus className="h-3 w-3" />
                    <span>{t.kickBtn}</span>
                  </button>
                </>
              )}

              {selectedStatus === "muted" && (
                <>
                  <button
                    type="button"
                    disabled={isReplying || isScanning}
                    onClick={() => onMemberAction(selectedObj.id, "unmute")}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300 hover:text-white disabled:opacity-40"
                  >
                    <Volume2 className="h-3 w-3" />
                    <span>{t.unmuteBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isReplying || isScanning}
                    onClick={() => onMemberAction(selectedObj.id, "kick")}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[#FF8A80] hover:text-white disabled:opacity-40"
                  >
                    <UserMinus className="h-3 w-3" />
                    <span>{t.kickBtn}</span>
                  </button>
                </>
              )}

              {(selectedStatus === "kicked" || selectedStatus === "gone") && (
                <button
                  type="button"
                  disabled={isReplying || isScanning}
                  onClick={() => onMemberAction(selectedObj.id, "invite")}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 hover:text-white disabled:opacity-40"
                >
                  <UserPlus className="h-3 w-3" />
                  <span>{t.inviteBackBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClearFilter}
                aria-label={t.showAllFilter}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Transcript Stream (ALWAYS dedicated scroll box on mobile & desktop) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-3.5 py-3 sm:space-y-4 sm:px-6 sm:py-4"
      >
        {isScanning ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex items-start gap-3 opacity-50">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/10" />
                <div className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
                  <div className="h-12 w-60 animate-pulse rounded-2xl bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-[13px] text-[var(--ink-muted)]">
            {isLiveCamActive
              ? t.liveWaitFirst
              : objects.length > 0
              ? locale === "zh"
                ? "对话已清空 — 在下方发言或开启「自动闲聊」"
                : "Chat cleared — reply below or toggle Auto-Chat"
              : t.blankStageSub}
          </div>
        ) : (
          <>
            {displayed.map((msg) => {
              const sender = objectMap.get(msg.senderId);

              if (msg.isSystem && msg.diffMeta) {
                const {
                  removedNames,
                  addedNames,
                  movedNames = [],
                  prevScore,
                  nextScore,
                } = msg.diffMeta;
                return (
                  <div
                    key={msg.id}
                    className="msg-enter rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-[#FAFAFA]">
                        {t.sequelBtn}
                      </span>
                      <span className="tabular-nums text-[var(--ink-secondary)]">
                        {t.resentmentWord} {prevScore}% → {nextScore}%
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-body)]">
                      {msg.text}
                    </p>
                    {(removedNames.length > 0 ||
                      addedNames.length > 0 ||
                      movedNames.length > 0) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {removedNames.map((n) => (
                          <span
                            key={`rem-${n}`}
                            className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] text-[#FF8A80] line-through"
                          >
                            {n} · {t.sequelRemovedTag}
                          </span>
                        ))}
                        {addedNames.map((n) => (
                          <span
                            key={`add-${n}`}
                            className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300"
                          >
                            {n} · {t.sequelAddedTag}
                          </span>
                        ))}
                        {movedNames.map((n) => (
                          <span
                            key={`mov-${n}`}
                            className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-200"
                          >
                            {n} · {t.sequelMovedTag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (msg.isSystem) {
                const isBreach =
                  msg.text === t.ownerJoinedAlert ||
                  msg.id.startsWith("sys-breach");
                return (
                  <div key={msg.id} className="msg-enter flex justify-center py-1">
                    <span
                      className={`rounded-full border px-3.5 py-1 text-[11px] font-medium ${
                        isBreach
                          ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[#FF8A80]"
                          : "border-[var(--border)] bg-[#18181C] text-[var(--ink-secondary)]"
                      }`}
                    >
                      {msg.text}
                    </span>
                  </div>
                );
              }

              if (msg.isOwner) {
                return (
                  <div key={msg.id} className="msg-enter group flex justify-end">
                    <div className="max-w-[82%] text-right">
                      <div className="mb-1 flex items-center justify-end gap-1.5 text-[11px] text-[var(--ink-muted)]">
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(msg.id)}
                          aria-label={t.deleteMessageLabel}
                          title={t.deleteMessageLabel}
                          className="cursor-pointer rounded-full p-0.5 text-[var(--ink-muted)] opacity-60 transition-opacity hover:text-[var(--accent)] focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <span className="tabular-nums">{msg.timestamp}</span>
                        <span className="font-medium text-[var(--ink-secondary)]">
                          {t.ownerName}
                        </span>
                      </div>
                      <div className="inline-block rounded-[18px] rounded-tr-[5px] bg-white px-4 py-2.5 text-left text-[13.5px] leading-[1.6] text-[#0A0A0A]">
                        {renderMessageText(msg.text, objectNames, true)}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <article
                  key={msg.id}
                  onMouseEnter={() => {
                    onHoverObject(msg.senderId);
                    onHoverMessage(msg.id);
                  }}
                  onMouseLeave={() => {
                    onHoverObject(null);
                    onHoverMessage(null);
                  }}
                  className="msg-enter group flex items-start gap-3"
                >
                  <div className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-white/15 transition-transform duration-150 group-hover:scale-105">
                    {sender?.avatarUrl && (
                      <img
                        src={sender.avatarUrl}
                        alt={msg.senderName}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 max-w-[86%]">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[#B9BDC6]">
                        {msg.senderName}
                      </span>
                      <span className="text-[10.5px] tabular-nums text-[var(--ink-muted)]">
                        {msg.timestamp}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        aria-label={t.deleteMessageLabel}
                        title={t.deleteMessageLabel}
                        className="cursor-pointer rounded-full p-0.5 text-[var(--ink-muted)] opacity-60 transition-opacity hover:text-[var(--accent)] focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {msg.replyToName &&
                      !msg.text.trim().startsWith(`@${msg.replyToName}`) && (
                        <div className="mb-1 border-l-2 border-[var(--border-strong)] pl-2 text-[11px] text-[var(--ink-secondary)]">
                          ↳ @{msg.replyToName}
                        </div>
                      )}

                    <div className="relative inline-block rounded-[18px] rounded-tl-[5px] border border-[var(--border)] bg-[var(--bubble-in)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--ink-body)] transition-colors group-hover:border-[var(--border-strong)] group-hover:bg-[#191A1E]">
                      {renderMessageText(msg.text, objectNames, false)}
                    </div>

                    {msg.reaction && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px]">
                          {msg.reaction}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {/* 3-Dot Typing Bubble */}
            {(nextTyping || isReplying || isChattering) && (
              <div className="flex items-center gap-2.5 pt-1">
                <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                </div>
                <span className="text-[11.5px] text-[var(--ink-secondary)]">
                  {isReplying
                    ? locale === "zh"
                      ? "桌面成员正在慌张打字…"
                      : "Desk items are typing fast…"
                    : isChattering
                    ? t.chatteringHint
                    : nextTyping?.senderName}
                </span>
              </div>
            )}
            <div ref={bottomRef} className="h-1 shrink-0" />
          </>
        )}
      </div>

      {/* Floating Jump-to-Latest Pill when user scrolled up */}
      {hasUnreadBelow && (
        <div className="pointer-events-none absolute bottom-[126px] left-1/2 z-30 -translate-x-1/2 sm:bottom-[152px]">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="pointer-events-auto flex cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-[#1B1C22]/95 px-3 py-1 text-[11.5px] font-medium text-white shadow-xl backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
          >
            <ArrowDown className="h-3 w-3" />
            <span>{t.jumpToLatest}</span>
          </button>
        </div>
      )}

      {/* Signature Grok-Inspired Unified Floating Pill Composer */}
      <div className="shrink-0 border-t border-[var(--border)]/60 bg-[var(--rail)]/95 px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md sm:px-5 sm:pb-4 sm:pt-2.5">
        {objects.length > 0 && !draft.trim() && (
          <div className="no-scrollbar mb-2 flex flex-nowrap gap-1.5 overflow-x-auto sm:mb-2.5 sm:flex-wrap sm:overflow-visible">
            {[...quickReplies.slice(0, 2), ...situationalPrompts.slice(0, 2)].map(
              (preset, idx) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isReplying || isScanning}
                  onClick={() => {
                    forceScrollRef.current = true;
                    onSendOwnerMessage(preset);
                  }}
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-[var(--border)] bg-transparent px-3 py-1 text-[11.5px] text-[#9A9FA8] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 ${
                    idx >= 2 ? "hidden sm:inline-flex" : ""
                  }`}
                >
                  {preset}
                </button>
              )
            )}
          </div>
        )}

        <div className="relative">
          {/* @ Mention Autocomplete Popover */}
          {mentionQuery !== null && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[#161619]/98 p-1.5 shadow-2xl backdrop-blur-xl">
              {mentionCandidates.map((obj, idx) => {
                const highlighted = idx === mentionIndex;
                const st = getObjectStatus(obj);
                return (
                  <button
                    key={obj.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMentionObject(obj);
                    }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      highlighted
                        ? "bg-[var(--surface-hover)] text-white"
                        : "text-[#D9DBDF] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <div
                      className={`h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10 ${
                        st === "kicked" ? "opacity-50 grayscale" : ""
                      }`}
                    >
                      {obj.avatarUrl && (
                        <img
                          src={obj.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <span className="truncate text-[12.5px] font-medium">
                      {obj.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-secondary)]">
                      {st === "kicked"
                        ? t.statusKicked
                        : st === "muted"
                        ? t.statusMuted
                        : obj.roleTag}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Unified Floating Card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-[20px] border border-[var(--border-strong)]/80 bg-[var(--surface)] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-colors focus-within:border-white/30 sm:rounded-[22px] sm:p-2.5"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => {
                const val = e.target.value;
                setDraft(val);
                evaluateMentionTrigger(
                  val,
                  e.target.selectionStart ?? val.length
                );
              }}
              onClick={(e) => {
                const el = e.currentTarget;
                evaluateMentionTrigger(
                  el.value,
                  el.selectionStart ?? el.value.length
                );
              }}
              onKeyDown={handleInputKeyDown}
              disabled={
                isReplying ||
                isScanning ||
                (!isLiveCamActive && objects.length === 0)
              }
              placeholder={t.composerPlaceholder}
              className="w-full bg-transparent px-2 py-1 text-[16px] text-white placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-50 sm:py-1.5 sm:text-[13.5px]"
            />

            {/* Bottom Asymmetric Action Row inside Composer Card */}
            <div className="mt-1 flex items-center justify-between gap-2 sm:mt-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={mentionableObjects.length === 0 || isScanning}
                  onClick={handleOpenMentionPicker}
                  title="@"
                  aria-label="Mention object"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[#1B1C20] text-[#D9DBDF] transition-colors hover:bg-[#24262C] hover:text-white disabled:opacity-35"
                >
                  <AtSign className="h-3.5 w-3.5 stroke-[2]" />
                </button>

                {/* Mobile Compact Single-Tap Tone Cycler */}
                <button
                  type="button"
                  onClick={handleCycleTone}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[#101012] px-2.5 py-1 text-[11px] font-medium text-[#E6E8EC] transition-colors active:scale-[0.97] sm:hidden"
                >
                  <span>{t.toneLabels[tone]}</span>
                  <ChevronDown className="h-3 w-3 text-[var(--ink-secondary)]" />
                </button>

                {/* Desktop Inline Tone Mode Segmented Pill */}
                <div
                  className="hidden items-center rounded-full border border-[var(--border)] bg-[#101012] p-0.5 sm:flex"
                  role="group"
                  aria-label="Comedy tone"
                >
                  {TONES.map((item) => {
                    const active = tone === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => onChangeTone(item)}
                        className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-[#FAFAFA] text-[#0A0A0A]"
                            : "text-[var(--ink-secondary)] hover:text-white"
                        }`}
                      >
                        {t.toneLabels[item]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSend}
                aria-label={t.send}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <ArrowUp className="h-4 w-4 stroke-[2]" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
