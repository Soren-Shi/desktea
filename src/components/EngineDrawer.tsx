"use client";

import { Check, ExternalLink, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { HealthStatus, Locale } from "@/lib/ai/types";
import { getCopy } from "@/lib/i18n";

interface EngineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  health: HealthStatus | null;
  promptReason?: "rate_limited" | "key_required" | null;
  agyModel: string;
  apiKey: string;
  onSave: (model: string, apiKey: string) => void;
}

const AGY_MODELS = [
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-4-neon-low",
];

export function EngineDrawer({
  isOpen,
  onClose,
  locale,
  health,
  promptReason,
  agyModel,
  apiKey,
  onSave,
}: EngineDrawerProps) {
  const t = getCopy(locale);
  const [draftModel, setDraftModel] = useState(agyModel);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftModel(agyModel);
      setDraftKey(apiKey);
      setSaved(false);
    }
  }, [isOpen, agyModel, apiKey]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draftModel, draftKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const isHosted =
    health?.mode === "hosted-openrouter" || health?.mode === "hosted-gemini";
  const showAgyModels = health?.mode === "local-agy";
  const trimmedKey = draftKey.trim();
  const effectiveModeLabel = trimmedKey
    ? trimmedKey.startsWith("sk-or-")
      ? "OpenRouter (Custom Key)"
      : "Gemini API (Custom Key)"
    : health
    ? t.modeLabels[health.mode]
    : "Hosted · OpenRouter";

  const showByokTutorial =
    !isHosted || promptReason === "key_required" || Boolean(trimmedKey);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-enter flex h-full w-full max-w-full flex-col justify-between overflow-y-auto border-l border-[var(--border)] bg-[#101012] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[#FAFAFA] shadow-2xl sm:max-w-md sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div>
          <div className="flex items-start justify-between border-b border-[var(--border)] pb-4">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                {t.drawerTitle}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-secondary)]">
                {isHosted ? t.drawerHostedDesc : t.drawerDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4 stroke-[1.75]" />
            </button>
          </div>

          {promptReason && (
            <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3.5 text-[12.5px] leading-relaxed text-[#FFD2CD]">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div>
                  <p>
                    {promptReason === "rate_limited"
                      ? isHosted
                        ? t.hostedBusyRateLimit
                        : t.byokNoticeRateLimit
                      : t.byokNoticeKeyRequired}
                  </p>
                  {(!isHosted || promptReason === "key_required") && (
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA]"
                    >
                      <span>{t.getFreeApiKey}</span>
                      <ExternalLink className="h-3 w-3 stroke-[2]" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-2.5 text-[12px] font-medium text-[var(--ink-secondary)]">
              {t.drawerHealth}
            </div>
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--ink-secondary)]">Mode</dt>
                <dd className="font-medium text-[#FAFAFA]">
                  {effectiveModeLabel}
                </dd>
              </div>
              {isHosted && !trimmedKey && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--ink-secondary)]">Vision Model</dt>
                    <dd className="truncate font-medium text-[#FAFAFA]">
                      {health?.visionModel || health?.defaultModel}
                    </dd>
                  </div>
                  {health?.chatModel && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-secondary)]">Chat Model</dt>
                      <dd className="truncate font-medium text-[#FAFAFA]">
                        {health.chatModel}
                      </dd>
                    </div>
                  )}
                </>
              )}
              {showAgyModels && health?.agyAvailable && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--ink-secondary)]">
                      Antigravity CLI
                    </dt>
                    <dd className="font-medium text-emerald-400">Ready</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--ink-secondary)]">
                      Network Proxy
                    </dt>
                    <dd className="truncate font-medium text-[#FAFAFA]">
                      {health?.proxyDetected || "Direct"}
                    </dd>
                  </div>
                </>
              )}
              {health?.rateLimitHourly && !trimmedKey && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--ink-secondary)]">Free Quota</dt>
                  <dd className="font-medium text-[#FAFAFA]">
                    {health.rateLimitHourly} scans / hr
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11.5px] leading-relaxed text-[var(--ink-secondary)]">
              <div className="flex items-center gap-1.5 font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span>
                  {isHosted && !trimmedKey ? t.hostedReadyBadge : t.byokDirectBadge}
                </span>
              </div>
              {health?.mode === "byok-only" && !trimmedKey && (
                <p className="mt-1.5 text-[var(--ink-secondary)]">
                  {t.byokDemoFreeNote}
                </p>
              )}
              {showByokTutorial && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--ink-muted)]">
                  {t.byokQuickSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form id="engine-form" onSubmit={handleSave} className="mt-6 space-y-5">
            {showAgyModels && (
              <div>
                <label className="mb-2 block text-[12px] font-medium text-[var(--ink-secondary)]">
                  {t.drawerModel}
                </label>
                <div className="space-y-1.5">
                  {AGY_MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDraftModel(m)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3.5 py-2.5 text-[13px] transition-colors ${
                        draftModel === m
                          ? "border border-[var(--border-strong)] bg-[var(--surface-hover)] font-medium text-[#FAFAFA]"
                          : "border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] hover:text-white"
                      }`}
                    >
                      <span>{m}</span>
                      {draftModel === m && (
                        <Check className="h-3.5 w-3.5 stroke-[2]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <details
              open={
                health?.mode === "byok-only" ||
                Boolean(trimmedKey) ||
                promptReason === "key_required"
              }
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5"
            >
              <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:text-white">
                {t.drawerAdvancedKey}
              </summary>
              <div className="mt-3">
                <label
                  htmlFor="byok-input"
                  className="mb-2 block text-[11.5px] text-[var(--ink-muted)]"
                >
                  {t.drawerByok}
                </label>
                <input
                  id="byok-input"
                  type="password"
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder={t.drawerByokPlaceholder}
                  className="w-full rounded-2xl border border-[var(--border-strong)] bg-[#0E0E10] px-3.5 py-2.5 text-[16px] text-[#FAFAFA] placeholder:text-[var(--ink-muted)] focus:border-white/40 focus:outline-none sm:text-[14px]"
                />
              </div>
            </details>
          </form>
        </div>

        <button
          type="submit"
          form="engine-form"
          className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white py-3 text-[13px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.98]"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 stroke-[2]" />
              <span>{t.drawerSaved}</span>
            </>
          ) : (
            <span>{t.drawerSave}</span>
          )}
        </button>
      </div>
    </div>
  );
}
