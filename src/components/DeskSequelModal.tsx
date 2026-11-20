"use client";

import { Camera, Sparkles, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DeskObject, Locale } from "@/lib/ai/types";
import { compressImageToDataUrl } from "@/lib/crop-avatars";
import { getCopy } from "@/lib/i18n";

interface DeskSequelModalProps {
  locale: Locale;
  isOpen: boolean;
  isComparing: boolean;
  beforeImageSrc: string;
  objects: DeskObject[];
  isLiveCamActive: boolean;
  onCaptureFromLive?: () => { dataUrl: string; mimeType: string } | null;
  onClose: () => void;
  onSubmitAfter: (afterDataUrl: string, mimeType: string) => void;
}

export function DeskSequelModal({
  locale,
  isOpen,
  isComparing,
  beforeImageSrc,
  objects,
  isLiveCamActive,
  onCaptureFromLive,
  onClose,
  onSubmitAfter,
}: DeskSequelModalProps) {
  const t = getCopy(locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isComparing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isComparing, onClose]);

  if (!isOpen) return null;

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(file, 1280, 0.85);
      onSubmitAfter(dataUrl, mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read image");
    }
  };

  const handleGrabLive = () => {
    if (!onCaptureFromLive) return;
    const frame = onCaptureFromLive();
    if (!frame) {
      setError("Live camera frame unavailable");
      return;
    }
    onSubmitAfter(frame.dataUrl, frame.mimeType);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isComparing) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2.5 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-enter max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--border)] bg-[#111113] text-[#FAFAFA] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--ink-secondary)]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>BEFORE / AFTER SEQUEL</span>
            </div>
            <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              {t.sequelModalTitle}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-secondary)]">
              {t.sequelModalDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isComparing}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12.5px] text-[#FF8A80]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-12 sm:p-6">
          {/* Left: Current Before Scene + Legend */}
          <div className="space-y-3 sm:col-span-5">
            <div className="flex items-center justify-between text-[11.5px] font-medium text-[var(--ink-secondary)]">
              <span>{t.sequelBeforeTitle}</span>
              <span>
                {objects.filter((o) => !o.removed).length} {t.membersSuffix}
              </span>
            </div>
            {beforeImageSrc && (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black/40">
                <img
                  src={beforeImageSrc}
                  alt={t.sequelBeforeTitle}
                  className="aspect-[4/3] w-full object-cover opacity-85"
                />
              </div>
            )}
            <ul className="space-y-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11.5px] text-[var(--ink-secondary)]">
              <li>• {t.sequelLegendRemoved}</li>
              <li>• {t.sequelLegendAdded}</li>
              <li>• {t.sequelLegendMoved}</li>
            </ul>
          </div>

          {/* Right: Sequel Upload / Drop / Live Grab */}
          <div className="flex flex-col justify-between sm:col-span-7">
            <div className="mb-2 text-[11.5px] font-medium text-[var(--ink-secondary)]">
              {t.sequelAfterTitle}
            </div>

            {isComparing ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
                <span className="h-2.5 w-2.5 animate-ping rounded-full bg-[var(--accent)]" />
                <p className="mt-4 text-[13px] font-medium text-[#FAFAFA]">
                  {t.afterComparing}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${
                    isDragging
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-white/35 hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0A0A0A]">
                    <Upload className="h-4 w-4 stroke-[2]" />
                  </div>
                  <div className="text-[13.5px] font-medium text-[#FAFAFA]">
                    {t.afterUploadBtn}
                  </div>
                  <div className="mt-1 text-[11.5px] text-[var(--ink-muted)]">
                    {t.uploadPrompt}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-[12.5px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.98]"
                  >
                    <Camera className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>{t.afterCameraBtn}</span>
                  </button>

                  {isLiveCamActive && onCaptureFromLive && (
                    <button
                      type="button"
                      onClick={handleGrabLive}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2.5 text-[12.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.98]"
                    >
                      <Video className="h-3.5 w-3.5 stroke-[1.75]" />
                      <span>{t.sequelCaptureLive}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
