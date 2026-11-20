"use client";

import {
  Camera,
  GitCompare,
  PanelLeft,
  Play,
  RotateCw,
  Share2,
  SquareDashedMousePointer,
  Upload,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Box2D, DeskObject, Locale } from "@/lib/ai/types";
import { cropSingleBoxFromSrc } from "@/lib/crop-avatars";
import { getCopy } from "@/lib/i18n";

export interface LiveSpeechBubble {
  objectId: string;
  senderName: string;
  text: string;
  reaction?: string;
}

interface DeskCanvasProps {
  locale: Locale;
  caseTitle: string;
  imageSrc: string;
  afterImageSrc: string | null;
  isBlankSession: boolean;
  objects: DeskObject[];
  isScanning: boolean;
  isReplaying: boolean;
  activeObjectId: string | null;
  selectedObjectId: string | null;
  speakingObjectId: string | null;
  activeSpeechBubble: LiveSpeechBubble | null;
  // Draw-box to add object
  isDrawMode: boolean;
  isAddingObject: boolean;
  onToggleDrawMode: () => void;
  onAddBoxObject: (
    box: Box2D,
    customName: string,
    previewAvatarUrl: string
  ) => Promise<void>;
  // Live Camera mode
  isLiveCamActive: boolean;
  isLiveTurnRunning: boolean;
  liveCountdownSec: number;
  autoWatchEnabled: boolean;
  autoWatchInterval: 30 | 60 | 120;
  motionGateEnabled: boolean;
  chatVisionEnabled: boolean;
  liveStatusNote: string | null;
  videoDeviceCount: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onToggleLiveCam: () => void;
  onSwitchCamera: () => void;
  onSnapLiveNow: () => void;
  onToggleAutoWatch: () => void;
  onChangeAutoInterval: (sec: 30 | 60 | 120) => void;
  onToggleMotionGate: () => void;
  onToggleChatVision: () => void;
  // General actions
  onOpenMobileSidebar: () => void;
  onToggleLocale: () => void;
  onHoverObject: (id: string | null) => void;
  onSelectObject: (id: string | null) => void;
  onReplay: () => void;
  onUploadClick: () => void;
  onCameraClick: () => void;
  onReanalyzeLive: () => void;
  onOpenSequel: () => void;
  onOpenShareCard: () => void;
}

const WATCH_INTERVALS: Array<30 | 60 | 120> = [30, 60, 120];

export function DeskCanvas({
  locale,
  caseTitle,
  imageSrc,
  afterImageSrc,
  isBlankSession,
  objects,
  isScanning,
  isReplaying,
  activeObjectId,
  selectedObjectId,
  speakingObjectId,
  activeSpeechBubble,
  isDrawMode,
  isAddingObject,
  onToggleDrawMode,
  onAddBoxObject,
  isLiveCamActive,
  isLiveTurnRunning,
  liveCountdownSec,
  autoWatchEnabled,
  autoWatchInterval,
  motionGateEnabled,
  chatVisionEnabled,
  liveStatusNote,
  videoDeviceCount,
  videoRef,
  onToggleLiveCam,
  onSwitchCamera,
  onSnapLiveNow,
  onToggleAutoWatch,
  onChangeAutoInterval,
  onToggleMotionGate,
  onToggleChatVision,
  onOpenMobileSidebar,
  onToggleLocale,
  onHoverObject,
  onSelectObject,
  onReplay,
  onUploadClick,
  onCameraClick,
  onReanalyzeLive,
  onOpenSequel,
  onOpenShareCard,
}: DeskCanvasProps) {
  const t = getCopy(locale);
  const [plateView, setPlateView] = useState<"before" | "after" | "split">(
    "after"
  );
  const [splitPct, setSplitPct] = useState(50);

  // Draw-box state
  const photoWrapperRef = useRef<HTMLDivElement>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<Box2D | null>(null);
  const [pendingBox, setPendingBox] = useState<{
    box: Box2D;
    previewUrl: string;
  } | null>(null);
  const [customName, setCustomName] = useState("");

  const displaySrc =
    afterImageSrc && plateView === "after" ? afterImageSrc : imageSrc;
  const focusedId =
    activeSpeechBubble?.objectId ||
    activeObjectId ||
    selectedObjectId ||
    speakingObjectId;

  const visibleObjects = objects.filter((o) => {
    if (isLiveCamActive) return !o.removed;
    if (afterImageSrc && plateView === "after") return !o.removed;
    if (afterImageSrc && plateView === "before") return !o.isNew;
    return !o.removed;
  });

  // Reset draw state when leaving draw mode
  useEffect(() => {
    if (!isDrawMode) {
      drawStartRef.current = null;
      setDraftBox(null);
      setPendingBox(null);
      setCustomName("");
    }
  }, [isDrawMode]);

  // Esc cancels draw mode
  useEffect(() => {
    if (!isDrawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onToggleDrawMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawMode, onToggleDrawMode]);

  // Default to split view automatically when sequel arrives
  useEffect(() => {
    if (afterImageSrc) {
      setPlateView("split");
      setSplitPct(50);
    } else {
      setPlateView("after");
    }
  }, [afterImageSrc]);

  const toNormCoords = (clientX: number, clientY: number) => {
    const el = photoWrapperRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(
        1000,
        Math.round(((clientX - rect.left) / Math.max(1, rect.width)) * 1000)
      )
    );
    const y = Math.max(
      0,
      Math.min(
        1000,
        Math.round(((clientY - rect.top) / Math.max(1, rect.height)) * 1000)
      )
    );
    return { x, y };
  };

  const handleDrawPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || isAddingObject || pendingBox) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toNormCoords(e.clientX, e.clientY);
    drawStartRef.current = pt;
    setDraftBox([pt.y, pt.x, pt.y, pt.x]);
  };

  const handleDrawPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || !drawStartRef.current) return;
    const pt = toNormCoords(e.clientX, e.clientY);
    const start = drawStartRef.current;
    setDraftBox([
      Math.min(start.y, pt.y),
      Math.min(start.x, pt.x),
      Math.max(start.y, pt.y),
      Math.max(start.x, pt.x),
    ]);
  };

  const handleDrawPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || !drawStartRef.current) return;
    const pt = toNormCoords(e.clientX, e.clientY);
    const start = drawStartRef.current;
    drawStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const box: Box2D = [
      Math.min(start.y, pt.y),
      Math.min(start.x, pt.x),
      Math.max(start.y, pt.y),
      Math.max(start.x, pt.x),
    ];
    setDraftBox(null);

    if (box[2] - box[0] < 25 || box[3] - box[1] < 25) {
      return;
    }

    const previewUrl = await cropSingleBoxFromSrc(
      displaySrc,
      box,
      objects.length + 1
    );
    setPendingBox({ box, previewUrl });
    setCustomName("");
  };

  const handleConfirmPendingBox = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pendingBox || isAddingObject) return;
    await onAddBoxObject(pendingBox.box, customName.trim(), pendingBox.previewUrl);
    setPendingBox(null);
    setCustomName("");
  };

  const handleSplitDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const wrapper = photoWrapperRef.current;
    if (!wrapper) return;

    const updateSplit = (clientX: number) => {
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(
        5,
        Math.min(95, ((clientX - rect.left) / Math.max(1, rect.width)) * 100)
      );
      setSplitPct(pct);
    };

    updateSplit(e.clientX);
    const onMove = (ev: PointerEvent) => updateSplit(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const activeBox = pendingBox?.box || draftBox;

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[var(--stage)] px-3 pb-2.5 pt-2.5 sm:px-6 sm:pb-4 sm:pt-3.5 lg:px-8 lg:pb-5 lg:pt-4">
      {/* Subtle Adaptive Ambient Glow behind Photograph */}
      {!isBlankSession && imageSrc && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <img
            src={displaySrc}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-[0.11] blur-3xl saturate-125 transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/80 via-[#0A0A0A]/35 to-[#0A0A0A]/92" />
        </div>
      )}

      {/* Ultra-Minimal Grok-Style Top Header */}
      <header className="relative z-40 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label={t.sidebarExpand}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white lg:hidden"
          >
            <PanelLeft className="h-4 w-4 stroke-[1.75]" />
          </button>
          <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-[#9A9FA8] sm:text-[13.5px]">
            {caseTitle}
          </span>
        </div>

        {/* Right: Locale + Live Cam + Share pills */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleLocale}
            title={locale === "en" ? "切换为中文" : "Switch to English"}
            className="flex cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/85 px-2.5 py-1.5 text-[11.5px] font-medium text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white active:scale-[0.97] sm:px-3 sm:text-[12px]"
          >
            {locale === "en" ? "中文" : "EN"}
          </button>

          <button
            type="button"
            onClick={onToggleLiveCam}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors active:scale-[0.97] sm:px-3 sm:text-[12px] ${
              isLiveCamActive
                ? "border-[var(--accent)]/50 bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--surface)]/85 text-[#D9DBDF] hover:bg-[var(--surface-hover)] hover:text-white"
            }`}
          >
            {isLiveCamActive ? (
              <VideoOff className="h-3.5 w-3.5 stroke-[1.9]" />
            ) : (
              <Video className="h-3.5 w-3.5 stroke-[1.75]" />
            )}
            <span>{isLiveCamActive ? t.liveActive : t.liveCamBtn}</span>
          </button>

          <button
            type="button"
            disabled={isScanning || isBlankSession || objects.length === 0}
            onClick={onOpenShareCard}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[11.5px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 sm:px-3.5 sm:text-[12px]"
          >
            <Share2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{t.shareToX}</span>
          </button>
        </div>
      </header>

      {/* Center Stage: Blank Session / Live Camera / Framed Photo */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center py-2 sm:py-4">
        {isLiveCamActive ? (
          <div className="relative inline-block max-w-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block h-auto max-h-[34dvh] w-auto max-w-full rounded-2xl bg-black shadow-[0_28px_80px_-20px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.14] sm:max-h-[44dvh] lg:max-h-[calc(100dvh-205px)]"
            />

            {/* Live Badge + Cam Switcher */}
            <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              <span>LIVE</span>
            </div>

            <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5">
              {videoDeviceCount > 1 && (
                <button
                  type="button"
                  onClick={onSwitchCamera}
                  className="cursor-pointer rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md hover:bg-black/90 hover:text-white"
                >
                  {t.liveSwitchCam}
                </button>
              )}
              <button
                type="button"
                onClick={onToggleLiveCam}
                className="cursor-pointer rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md hover:bg-black/90 hover:text-white"
              >
                {t.liveExit}
              </button>
            </div>

            {(isLiveTurnRunning || isScanning) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--border-strong)] bg-[#141416]/92 px-4 py-2 text-[13px] font-medium text-[#FAFAFA] shadow-2xl backdrop-blur-md">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span>{t.scanningPill}</span>
                </div>
              </div>
            )}

            {/* Overlay detected object anchors onto live feed */}
            {!isScanning &&
              visibleObjects.map((obj) => {
                const [ymin, xmin, ymax, xmax] = obj.box_2d;
                const cx = Math.max(5, Math.min(95, (xmin + xmax) / 20));
                const cy = Math.max(7, Math.min(93, (ymin + ymax) / 20));
                const isSelected = selectedObjectId === obj.id;
                const isHovered = activeObjectId === obj.id;
                const isSpeaking = speakingObjectId === obj.id;
                const hasSpeechBubble = activeSpeechBubble?.objectId === obj.id;
                const isFocused =
                  isSelected || isHovered || isSpeaking || hasSpeechBubble;
                const horizAnchor =
                  cx < 26
                    ? "left-0"
                    : cx > 74
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";
                const placeBelow = cy < 32;

                return (
                  <div
                    key={obj.id}
                    style={{ left: `${cx}%`, top: `${cy}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                      hasSpeechBubble ? "z-40" : isFocused ? "z-30" : "z-20"
                    }`}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => onHoverObject(obj.id)}
                      onMouseLeave={() => onHoverObject(null)}
                      onClick={() => onSelectObject(isSelected ? null : obj.id)}
                      aria-label={obj.name}
                      className="group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full focus:outline-none"
                    >
                      <span
                        className={`absolute h-5 w-5 rounded-full transition-all duration-200 ${
                          hasSpeechBubble || isSelected || isSpeaking
                            ? "scale-125 bg-[var(--accent)]/35 ring-2 ring-[var(--accent)]"
                            : "anchor-pulse bg-white/18 ring-1 ring-white/55"
                        }`}
                      />
                      <span
                        className={`relative h-2 w-2 rounded-full ${
                          hasSpeechBubble || isSelected || isSpeaking
                            ? "bg-[var(--accent)]"
                            : "bg-white"
                        }`}
                      />
                    </button>

                    {hasSpeechBubble && activeSpeechBubble && (
                      <div
                        className={`msg-enter pointer-events-none absolute w-[196px] max-w-[calc(100vw-32px)] rounded-2xl border border-[var(--border-strong)] bg-[#141416]/94 px-3 py-2 text-left shadow-2xl backdrop-blur-xl sm:w-[224px] sm:py-2.5 ${horizAnchor} ${
                          placeBelow ? "top-full mt-2" : "bottom-full mb-2"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--ink-secondary)]">
                          <span className="truncate">{activeSpeechBubble.senderName}</span>
                          {activeSpeechBubble.reaction && (
                            <span>{activeSpeechBubble.reaction}</span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[#FAFAFA]">
                          {activeSpeechBubble.text}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : isBlankSession ? (
          <div className="modal-enter w-full max-w-lg rounded-3xl border border-dashed border-[var(--border-strong)] bg-[#131315]/90 px-6 py-10 text-center backdrop-blur-xl sm:px-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#FAFAFA]">
              <Upload className="h-5 w-5 stroke-[1.75]" />
            </div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              {t.blankStageTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--ink-secondary)]">
              {t.blankStageSub}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onUploadClick}
                className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.97]"
              >
                <Upload className="h-3.5 w-3.5 stroke-[2]" />
                <span>{t.tryYourDesk}</span>
              </button>
              <button
                type="button"
                onClick={onCameraClick}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Camera className="h-3.5 w-3.5 stroke-[1.75]" />
                <span>{t.takePhoto}</span>
              </button>
              <button
                type="button"
                onClick={onToggleLiveCam}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Video className="h-3.5 w-3.5 stroke-[1.75]" />
                <span>{t.liveCamBtn}</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={photoWrapperRef}
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
            className={`relative inline-block max-w-full ${
              isDrawMode ? "cursor-crosshair select-none touch-none" : ""
            }`}
          >
            <img
              src={displaySrc}
              alt="Desk scene"
              draggable={false}
              className={`block h-auto max-h-[34dvh] w-auto max-w-full rounded-2xl shadow-[0_28px_80px_-20px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.1] transition-opacity duration-300 sm:max-h-[44dvh] lg:max-h-[calc(100dvh-152px)] ${
                isScanning ? "opacity-55" : "opacity-100"
              }`}
            />

            {/* Split Curtain Slider Overlay */}
            {afterImageSrc && plateView === "split" && !isScanning && !isDrawMode && (
              <>
                <img
                  src={imageSrc}
                  alt="Before desk"
                  draggable={false}
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                  className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-cover"
                />
                <div
                  onPointerDown={handleSplitDragStart}
                  style={{ left: `${splitPct}%` }}
                  className="absolute inset-y-0 z-30 w-6 -translate-x-1/2 cursor-ew-resize select-none touch-none"
                >
                  <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.85)]" />
                  <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#0A0A0A] shadow-xl ring-1 ring-black/20">
                    ⇄
                  </div>
                </div>
                <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-full border border-white/15 bg-black/65 px-2.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-md">
                  {t.beforeLabel}
                </span>
                <span className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-full border border-white/15 bg-black/65 px-2.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-md">
                  {t.afterLabel}
                </span>
              </>
            )}

            {/* 3-Way Before / After / Split Toggle */}
            {afterImageSrc && !isScanning && !isDrawMode && (
              <div className="absolute right-3 top-3 z-30 flex rounded-full border border-[var(--border-strong)] bg-[#131315]/90 p-0.5 backdrop-blur-md">
                {(["before", "after", "split"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPlateView(mode)}
                    className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      plateView === mode
                        ? "bg-white text-[#0A0A0A]"
                        : "text-[var(--ink-secondary)] hover:text-white"
                    }`}
                  >
                    {mode === "before"
                      ? t.beforeLabel
                      : mode === "after"
                      ? t.afterLabel
                      : t.splitLabel}
                  </button>
                ))}
              </div>
            )}

            {/* Draw-Box Instruction Banner */}
            {isDrawMode && !pendingBox && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-40 max-w-[calc(100%-16px)] -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[#131315]/94 px-3.5 py-1.5 text-center text-[11.5px] font-medium leading-snug text-[#FAFAFA] shadow-xl backdrop-blur-md sm:whitespace-nowrap sm:text-[12px]">
                {t.drawBanner}
              </div>
            )}

            {/* Active Drawn Box Overlay */}
            {activeBox && (
              <div
                style={{
                  top: `${activeBox[0] / 10}%`,
                  left: `${activeBox[1] / 10}%`,
                  width: `${(activeBox[3] - activeBox[1]) / 10}%`,
                  height: `${(activeBox[2] - activeBox[0]) / 10}%`,
                }}
                className="pointer-events-none absolute z-40 rounded-xl border-2 border-dashed border-white bg-white/[0.08] shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              />
            )}

            {/* Pending Box Confirmation Popover */}
            {pendingBox && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={
                  {
                    "--pop-left": `${Math.max(
                      18,
                      Math.min(82, (pendingBox.box[1] + pendingBox.box[3]) / 20)
                    )}%`,
                    top: `${
                      pendingBox.box[0] < 380
                        ? Math.min(92, pendingBox.box[2] / 10 + 3)
                        : Math.max(8, pendingBox.box[0] / 10 - 3)
                    }%`,
                  } as React.CSSProperties
                }
                className={`modal-enter absolute left-1/2 z-50 w-[min(18rem,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-[var(--border-strong)] bg-[#151518]/98 p-3.5 shadow-2xl backdrop-blur-xl sm:left-[var(--pop-left)] ${
                  pendingBox.box[0] < 380 ? "" : "-translate-y-full"
                }`}
              >
                <form onSubmit={handleConfirmPendingBox} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={pendingBox.previewUrl}
                      alt="Box preview"
                      className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/25"
                    />
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      autoFocus
                      disabled={isAddingObject}
                      placeholder={t.drawNicknamePlaceholder}
                      className="min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-[#0A0A0A] px-3 py-1.5 text-[16px] text-[#FAFAFA] placeholder:text-[var(--ink-muted)] focus:border-white/40 focus:outline-none sm:text-[12.5px]"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={isAddingObject}
                      onClick={() => setPendingBox(null)}
                      className="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white disabled:opacity-40"
                    >
                      {t.drawRedraw}
                    </button>
                    <button
                      type="button"
                      disabled={isAddingObject}
                      onClick={onToggleDrawMode}
                      className="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white disabled:opacity-40"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingObject}
                      className="cursor-pointer rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.97] disabled:opacity-50"
                    >
                      {isAddingObject ? t.drawAdding : t.drawSubmit}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Calm Scanning Overlay */}
            {isScanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--border-strong)] bg-[#131315]/92 px-4 py-2 text-[13px] font-medium text-[#FAFAFA] shadow-2xl backdrop-blur-md">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span>{t.scanningPill}</span>
                </div>
              </div>
            )}

            {/* Whisper-thin Luminous Frame ONLY for focused object */}
            {!isScanning &&
              !isDrawMode &&
              plateView !== "split" &&
              visibleObjects.map((obj) => {
                const isFocused = focusedId === obj.id;
                if (!isFocused) return null;
                const [ymin, xmin, ymax, xmax] = obj.box_2d;
                return (
                  <div
                    key={`frame-${obj.id}`}
                    style={{
                      top: `${ymin / 10}%`,
                      left: `${xmin / 10}%`,
                      width: `${(xmax - xmin) / 10}%`,
                      height: `${(ymax - ymin) / 10}%`,
                    }}
                    className="pointer-events-none absolute z-10 rounded-xl border border-white/75 shadow-[0_0_0_1px_rgba(0,0,0,0.45)] transition-all duration-200"
                  />
                );
              })}

            {/* Minimal Luminous Spatial Anchor Dots + Frosted Glass Callouts */}
            {!isScanning &&
              plateView !== "split" &&
              visibleObjects.map((obj) => {
                const [ymin, xmin, ymax, xmax] = obj.box_2d;
                const cx = Math.max(5, Math.min(95, (xmin + xmax) / 20));
                const cy = Math.max(7, Math.min(93, (ymin + ymax) / 20));
                const isSelected = selectedObjectId === obj.id;
                const isHovered = activeObjectId === obj.id;
                const isSpeaking = speakingObjectId === obj.id;
                const hasSpeechBubble = activeSpeechBubble?.objectId === obj.id;
                const isFocused =
                  isSelected || isHovered || isSpeaking || hasSpeechBubble;

                const horizAnchor =
                  cx < 26
                    ? "left-0"
                    : cx > 74
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";
                const placeBelow = cy < 32;

                return (
                  <div
                    key={obj.id}
                    style={{ left: `${cx}%`, top: `${cy}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                      isDrawMode ? "pointer-events-none opacity-25" : ""
                    } ${hasSpeechBubble ? "z-40" : isFocused ? "z-30" : "z-20"}`}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => onHoverObject(obj.id)}
                      onMouseLeave={() => onHoverObject(null)}
                      onClick={() => onSelectObject(isSelected ? null : obj.id)}
                      aria-label={obj.name}
                      className="group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full focus:outline-none"
                    >
                      <span
                        className={`absolute h-5 w-5 rounded-full transition-all duration-200 ${
                          hasSpeechBubble || isSelected || isSpeaking
                            ? "scale-125 bg-[var(--accent)]/35 ring-2 ring-[var(--accent)]"
                            : isHovered
                            ? "scale-125 bg-white/30 ring-2 ring-white"
                            : "anchor-pulse bg-white/18 ring-1 ring-white/55 group-hover:scale-125 group-hover:bg-white/30"
                        }`}
                      />
                      <span
                        className={`relative h-2 w-2 rounded-full transition-transform duration-200 ${
                          hasSpeechBubble || isSelected || isSpeaking
                            ? "scale-110 bg-[var(--accent)] shadow-[0_0_12px_rgba(255,90,78,0.95)]"
                            : "bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] group-hover:scale-110"
                        }`}
                      />

                      {!hasSpeechBubble && (isHovered || isSelected) && (
                        <div
                          className={`msg-enter pointer-events-none absolute flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--border-strong)] bg-[#141416]/94 py-1 pl-1 pr-3 shadow-2xl backdrop-blur-xl ${horizAnchor} ${
                            placeBelow ? "top-full mt-2" : "bottom-full mb-2"
                          }`}
                        >
                          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10">
                            {obj.avatarUrl && (
                              <img
                                src={obj.avatarUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <span className="text-[11.5px] font-medium text-[#FAFAFA]">
                            {obj.name}
                          </span>
                          <span className="text-[10.5px] text-[var(--ink-secondary)]">
                            {obj.roleTag}
                          </span>
                        </div>
                      )}
                    </button>

                    {hasSpeechBubble && activeSpeechBubble && (
                      <div
                        className={`msg-enter pointer-events-none absolute w-[196px] max-w-[calc(100vw-32px)] rounded-2xl border border-[var(--border-strong)] bg-[#141416]/94 px-3 py-2 text-left shadow-2xl backdrop-blur-xl sm:w-[232px] sm:py-2.5 ${horizAnchor} ${
                          placeBelow ? "top-full mt-2" : "bottom-full mb-2"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                            {obj.avatarUrl && (
                              <img
                                src={obj.avatarUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--ink-secondary)]">
                            {activeSpeechBubble.senderName}
                          </span>
                          {activeSpeechBubble.reaction && (
                            <span className="text-[11px]">
                              {activeSpeechBubble.reaction}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.45] text-[#FAFAFA]">
                          {activeSpeechBubble.text}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Live Camera Control Strip + Minimal 5-Pill Floating Bottom Action Bar */}
      <div className="relative z-30 flex flex-col items-center gap-2">
        {isLiveCamActive && (
          <div className="modal-enter flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[#131315]/92 px-3 py-1.5 text-[11.5px] shadow-xl backdrop-blur-xl">
            <button
              type="button"
              disabled={isLiveTurnRunning || isScanning}
              onClick={onSnapLiveNow}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.97] disabled:opacity-45"
            >
              <Camera className="h-3.5 w-3.5 stroke-[2]" />
              <span>{t.liveSnapNow}</span>
            </button>

            <div className="flex items-center gap-1 rounded-full bg-[var(--surface)] p-0.5">
              <button
                type="button"
                onClick={onToggleAutoWatch}
                className={`cursor-pointer rounded-full px-2.5 py-1 font-medium transition-colors ${
                  autoWatchEnabled
                    ? "bg-white text-[#0A0A0A]"
                    : "text-[var(--ink-secondary)] hover:text-white"
                }`}
              >
                {t.liveAutoWatch}
                {autoWatchEnabled ? ` · ${liveCountdownSec}s` : ""}
              </button>
              {WATCH_INTERVALS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangeAutoInterval(sec)}
                  className={`cursor-pointer rounded-full px-2 py-1 text-[10.5px] transition-colors ${
                    autoWatchInterval === sec
                      ? "bg-[var(--surface-hover)] text-white"
                      : "text-[var(--ink-muted)] hover:text-white"
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleMotionGate}
              className={`cursor-pointer rounded-full px-2.5 py-1 transition-colors ${
                motionGateEnabled
                  ? "bg-[var(--surface-hover)] text-[#FAFAFA]"
                  : "text-[var(--ink-muted)] hover:text-white"
              }`}
            >
              {t.liveMotionGate}
            </button>

            <button
              type="button"
              onClick={onToggleChatVision}
              className={`cursor-pointer rounded-full px-2.5 py-1 transition-colors ${
                chatVisionEnabled
                  ? "bg-[var(--surface-hover)] text-[#FAFAFA]"
                  : "text-[var(--ink-muted)] hover:text-white"
              }`}
            >
              {t.liveChatVision}
            </button>

            {liveStatusNote && (
              <span className="px-1.5 text-[11px] text-[var(--ink-secondary)]">
                {liveStatusNote}
              </span>
            )}
          </div>
        )}

        {/* Minimal Grok-Style Single-Row Swipeable Floating Bottom Dock */}
        <div className="no-scrollbar flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[#131315]/92 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:gap-1.5">
          <button
            type="button"
            onClick={onUploadClick}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#ECECEC] active:scale-[0.97] sm:px-4 sm:text-[12.5px]"
          >
            <Upload className="h-3.5 w-3.5 stroke-[2]" />
            <span>{t.tryYourDesk}</span>
          </button>

          <button
            type="button"
            onClick={onCameraClick}
            title={t.takePhoto}
            aria-label={t.takePhoto}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white active:scale-95"
          >
            <Camera className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>

          <span className="h-4 w-px shrink-0 bg-[var(--border)]" />

          <button
            type="button"
            disabled={isScanning || isBlankSession || isLiveCamActive}
            onClick={onToggleDrawMode}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] font-medium transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[12px] ${
              isDrawMode
                ? "bg-white text-[#0A0A0A]"
                : "text-[#D9DBDF] hover:bg-[var(--surface-hover)] hover:text-white"
            }`}
          >
            <SquareDashedMousePointer className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{t.boxItemBtn}</span>
          </button>

          <button
            type="button"
            disabled={isScanning || isBlankSession}
            onClick={onReplay}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] font-medium text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[12px]"
          >
            <Play className="h-3.5 w-3.5 stroke-[1.8]" />
            <span>{isReplaying ? t.replaying : t.replay}</span>
          </button>

          <button
            type="button"
            disabled={isScanning || isBlankSession || objects.length === 0}
            onClick={onOpenSequel}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[12px]"
          >
            <GitCompare className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{t.sequelBtn}</span>
          </button>

          <button
            type="button"
            disabled={isScanning || isBlankSession || isLiveCamActive}
            onClick={onReanalyzeLive}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] font-medium text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[12px]"
          >
            <RotateCw className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{t.reanalyzeLive}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
