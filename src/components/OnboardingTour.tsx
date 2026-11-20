"use client";

import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  GitCompare,
  Share2,
  SquareDashedMousePointer,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/ai/types";
import { getCopy } from "@/lib/i18n";

interface OnboardingTourProps {
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingTour({
  isOpen,
  locale,
  onClose,
  onComplete,
}: OnboardingTourProps) {
  const t = getCopy(locale);
  const steps = t.tourSteps;
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStepIdx(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setStepIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (stepIdx >= steps.length - 1) {
          onComplete();
        } else {
          setStepIdx((i) => Math.min(steps.length - 1, i + 1));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, stepIdx, steps.length, onClose, onComplete]);

  if (!isOpen) return null;

  const current = steps[stepIdx] || steps[0];
  const isLast = stepIdx === steps.length - 1;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t.tourHelpTitle}
    >
      <div className="modal-enter max-h-[90dvh] w-full max-w-[440px] overflow-y-auto rounded-3xl border border-[var(--border-strong)] bg-[#111113] p-5 text-[#FAFAFA] shadow-2xl sm:p-6">
        {/* Top Bar: Step Counter + Skip / Close */}
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[#D9DBDF]">
            {current.badge}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
            >
              {t.tourSkip}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.dismiss}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
            >
              <X className="h-4 w-4 stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* 4-Segment Progress Bar */}
        <div className="mt-3.5 grid grid-cols-4 gap-1.5">
          {steps.map((s, idx) => (
            <button
              key={s.badge}
              type="button"
              onClick={() => setStepIdx(idx)}
              aria-label={s.badge}
              className={`h-1 cursor-pointer rounded-full transition-colors ${
                idx === stepIdx
                  ? "bg-white"
                  : idx < stepIdx
                  ? "bg-white/45"
                  : "bg-[var(--border)] hover:bg-white/25"
              }`}
            />
          ))}
        </div>

        {/* Visual Mini Preview Hero */}
        <div className="mt-4 flex min-h-[124px] flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[#0A0A0A] p-4">
          {stepIdx === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#0A0A0A] shadow-lg">
                <Upload className="h-3.5 w-3.5 stroke-[2]" />
                <span>{t.tryYourDesk}</span>
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[#D9DBDF]">
                <Camera className="h-3.5 w-3.5 stroke-[1.75]" />
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-medium text-[var(--ink-secondary)]">
                Ctrl + V / Drop
              </span>
            </div>
          )}

          {stepIdx === 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1 text-[11.5px] font-medium text-[#FFD2CD]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(255,90,78,0.9)]" />
                <span>Pin</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[12px] font-medium text-[#FAFAFA]">
                <AtSign className="h-3.5 w-3.5 text-[#FF7A70]" />
                <span>{locale === "zh" ? "点名某件物品" : "Steel Water Flask"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11.5px] font-medium text-[#D9DBDF]">
                <SquareDashedMousePointer className="h-3.5 w-3.5" />
                <span>{t.boxItemBtn}</span>
              </span>
            </div>
          )}

          {stepIdx === 2 && (
            <div className="flex flex-col items-center gap-2.5">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span>{t.autoChatLabel}</span>
                <span className="text-[10.5px] text-emerald-300">{t.autoChatStateOn}</span>
                <span className="flex h-4 w-7 items-center justify-end rounded-full bg-emerald-400 p-0.5">
                  <span className="h-3 w-3 rounded-full bg-[#0A0A0A]" />
                </span>
              </div>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                + {t.stepAwayBtn}
              </span>
            </div>
          )}

          {stepIdx === 3 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[11.5px] font-medium text-[#FAFAFA]">
                <GitCompare className="h-3.5 w-3.5" />
                <span>{t.sequelBtn}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11.5px] font-medium text-[#D9DBDF]">
                <Video className="h-3.5 w-3.5" />
                <span>{t.liveCamBtn}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-[#0A0A0A]">
                <Share2 className="h-3.5 w-3.5 stroke-[2]" />
                <span>{t.shareToX} · 16:9</span>
              </span>
            </div>
          )}
        </div>

        {/* Step Title & Body Copy */}
        <h3 className="mt-4 text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#FAFAFA]">
          {current.title}
        </h3>
        <p className="mt-2 text-[13px] leading-[1.6] text-[var(--ink-body)]">
          {current.desc}
        </p>
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink-secondary)]">
          {current.tip}
        </div>

        {/* Bottom Navigation Footer */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[11.5px] tabular-nums text-[var(--ink-muted)]">
            {stepIdx + 1} / {steps.length}
          </span>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-[12.5px] font-medium text-[#D9DBDF] transition-colors hover:bg-[var(--surface-hover)] hover:text-white active:scale-[0.97]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{t.tourPrev}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  onComplete();
                } else {
                  setStepIdx((i) => Math.min(steps.length - 1, i + 1));
                }
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.97]"
            >
              <span>{isLast ? t.tourFinish : t.tourNext}</span>
              {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
