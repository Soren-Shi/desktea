"use client";

import { Check, Copy, Download, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CardLayout,
  ChatMessage,
  DeskObject,
  Locale,
  Skin,
} from "@/lib/ai/types";
import {
  copyCardToClipboard,
  downloadCardPng,
  renderShareCardCanvas,
} from "@/lib/export-card";
import { getCopy } from "@/lib/i18n";

interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  imageSrc: string;
  groupName: string;
  resentmentScore: number;
  mostLikelyToLeave: string;
  objects: DeskObject[];
  messages: ChatMessage[];
}

const CARD_SKINS: Skin[] = ["gallery", "message", "dark"];
const CARD_LAYOUTS: CardLayout[] = ["landscape", "portrait"];

export function ShareCardModal({
  isOpen,
  onClose,
  locale,
  imageSrc,
  groupName,
  resentmentScore,
  mostLikelyToLeave,
  objects,
  messages,
}: ShareCardModalProps) {
  const t = getCopy(locale);
  const [cardLayout, setCardLayout] = useState<CardLayout>("landscape");
  const [cardSkin, setCardSkin] = useState<Skin>("dark");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const maxSelect = cardLayout === "landscape" ? 4 : 6;

  useEffect(() => {
    if (isOpen) {
      const nonSystem = messages.filter((m) => !m.isSystem);
      setSelectedIds(nonSystem.slice(0, maxSelect).map((m) => m.id));
      setCopied(false);
    }
  }, [isOpen, messages, maxSelect]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.length > maxSelect ? prev.slice(0, maxSelect) : prev
    );
  }, [maxSelect]);

  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    let cancelled = false;
    const picked = messages.filter((m) => selectedIds.includes(m.id));
    const listToRender =
      picked.length > 0 ? picked : messages.slice(0, maxSelect);

    setRendering(true);
    renderShareCardCanvas({
      imageSrc,
      groupName,
      resentmentScore,
      mostLikelyToLeave,
      objects,
      messages: listToRender,
      skin: cardSkin,
      layout: cardLayout,
      locale,
    })
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreviewUrl(canvas.toDataURL("image/png"));
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    imageSrc,
    groupName,
    resentmentScore,
    mostLikelyToLeave,
    objects,
    messages,
    selectedIds,
    cardSkin,
    cardLayout,
    maxSelect,
    locale,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleMessage = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((item) => item !== id)
          : prev
        : prev.length >= maxSelect
        ? [...prev.slice(1), id]
        : [...prev, id]
    );
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      const ok = await copyCardToClipboard(canvasRef.current);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Clipboard API requires HTTPS or localhost
    }
  };

  const publicOrigin =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? window.location.origin
      : "";

  const xText =
    locale === "zh"
      ? `我拍了张桌面照，结果桌面上的东西背着我建了个群「${groupName}」，怨气值 ${resentmentScore}% 💀${publicOrigin ? `\n\n来测测你的桌面：${publicOrigin}` : ""} #DeskTea`
      : `Uploaded a photo of my desk and leaked their secret group chat "${groupName}" (${resentmentScore}% tension) 💀${publicOrigin ? `\n\nTry your desk: ${publicOrigin}` : ""} #DeskTea`;

  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2.5 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-enter grid max-h-[92dvh] w-full max-w-6xl grid-cols-1 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[#111113] text-[#FAFAFA] shadow-2xl lg:grid-cols-12 lg:overflow-hidden">
        {/* Controls (below preview on mobile, left on desktop) */}
        <div className="order-last flex flex-col justify-between border-t border-[var(--border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:order-first lg:col-span-4 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:pb-6">
          <div>
            <div className="flex items-start justify-between gap-3 pb-4">
              <div>
                <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                  {t.shareModalTitle}
                </h3>
                <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                  {t.shareModalDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            {/* Layout Selector */}
            <div className="mt-2">
              <div className="mb-2 text-[12px] font-medium text-[var(--ink-secondary)]">
                {t.shareLayoutLabel}
              </div>
              <div className="grid grid-cols-2 rounded-full border border-[var(--border)] bg-[#0A0A0A] p-1">
                {CARD_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setCardLayout(l)}
                    className={`cursor-pointer rounded-full py-1.5 text-[12px] font-medium transition-colors ${
                      cardLayout === l
                        ? "bg-white text-[#0A0A0A]"
                        : "text-[var(--ink-secondary)] hover:text-white"
                    }`}
                  >
                    {t.layoutLabels[l]}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Theme */}
            <div className="mt-4">
              <div className="mb-2 text-[12px] font-medium text-[var(--ink-secondary)]">
                {t.shareSkinLabel}
              </div>
              <div className="grid grid-cols-3 rounded-full border border-[var(--border)] bg-[#0A0A0A] p-1">
                {CARD_SKINS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCardSkin(s)}
                    className={`cursor-pointer rounded-full py-1.5 text-[12px] font-medium transition-colors ${
                      cardSkin === s
                        ? "bg-white text-[#0A0A0A]"
                        : "text-[var(--ink-secondary)] hover:text-white"
                    }`}
                  >
                    {t.skinLabels[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Message selector */}
            <div className="mt-4">
              <div className="mb-2 text-[12px] font-medium text-[var(--ink-secondary)]">
                {t.sharePickLabel} ({selectedIds.length}/{maxSelect})
              </div>
              <div className="max-h-[150px] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[220px]">
                {messages.map((m) => {
                  const checked = selectedIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMessage(m.id)}
                      className={`flex w-full cursor-pointer items-start gap-2.5 rounded-2xl p-2.5 text-left transition-colors ${
                        checked
                          ? "border border-white/25 bg-[var(--surface-hover)]"
                          : "border border-[var(--border)] bg-[var(--surface)] opacity-60 hover:opacity-100"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                          checked
                            ? "bg-white text-[#0A0A0A]"
                            : "ring-1 ring-white/25"
                        }`}
                      >
                        {checked && <Check className="h-2.5 w-2.5 stroke-[2.5]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-[var(--ink-secondary)]">
                          {m.isOwner ? t.ownerName : m.senderName} · {m.timestamp}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] text-[#FAFAFA]">
                          {m.text}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canvasRef.current || rendering}
                onClick={() =>
                  canvasRef.current && downloadCardPng(canvasRef.current)
                }
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2.5 text-[12.5px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#EAEAEA] active:scale-[0.97] disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5 stroke-[2]" />
                <span>{t.shareDownload}</span>
              </button>
              <button
                type="button"
                disabled={!canvasRef.current || rendering}
                onClick={handleCopy}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-[12.5px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.97] disabled:opacity-40"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 stroke-[1.75] text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 stroke-[1.75]" />
                )}
                <span>{copied ? t.shareCopied : t.shareCopy}</span>
              </button>
            </div>
            <a
              href={xIntentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface)] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>{t.shareXIntent}</span>
            </a>
          </div>
        </div>

        {/* Live Preview (above controls on mobile, right on desktop) */}
        <div className="order-first flex max-h-[36dvh] items-center justify-center overflow-y-auto bg-[#0A0A0A] p-4 sm:max-h-[45dvh] lg:order-last lg:col-span-8 lg:max-h-[92dvh] lg:p-6">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Share card preview"
              className={`w-full rounded-2xl shadow-2xl ring-1 ring-white/[0.1] ${
                cardLayout === "landscape" ? "max-w-[680px]" : "max-w-[440px]"
              }`}
            />
          ) : (
            <div className="py-24 text-[13px] text-[var(--ink-muted)]">
              Rendering preview…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
