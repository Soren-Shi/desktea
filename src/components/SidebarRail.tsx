"use client";

import {
  HelpCircle,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DeskSession, HealthStatus, Locale } from "@/lib/ai/types";
import { getCopy } from "@/lib/i18n";
import type { SampleDesk } from "@/lib/samples";

interface SidebarRailProps {
  locale: Locale;
  isExpanded: boolean;
  isMobileOpen: boolean;
  sessions: DeskSession[];
  currentSessionId: string;
  samples: SampleDesk[];
  activeSampleId: string | null;
  isBlankSession: boolean;
  health: HealthStatus | null;
  hasCustomKey: boolean;
  onToggleExpand: () => void;
  onCloseMobile: () => void;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAllHistory: () => void;
  onSelectSample: (sample: SampleDesk) => void;
  onOpenTour: () => void;
  onOpenSettings: () => void;
}

function DeskTeaMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[#FAFAFA]"
    >
      <rect
        x="3"
        y="4"
        width="13"
        height="13"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M11 10.5C11 9.12 12.12 8 13.5 8H18.5C19.88 8 21 9.12 21 10.5V16.5C21 17.88 19.88 19 18.5 19H15.8L13 21.2V19H13.5C12.12 19 11 17.88 11 16.5V10.5Z"
        fill="#0E0E10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarRail({
  locale,
  isExpanded,
  isMobileOpen,
  sessions,
  currentSessionId,
  samples,
  activeSampleId,
  isBlankSession,
  health,
  hasCustomKey,
  onToggleExpand,
  onCloseMobile,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onClearAllHistory,
  onSelectSample,
  onOpenTour,
  onOpenSettings,
}: SidebarRailProps) {
  const t = getCopy(locale);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    if (!confirmClearAll) return;
    const timer = setTimeout(() => setConfirmClearAll(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClearAll]);

  const modeBadge = hasCustomKey
    ? "Custom Key"
    : health?.mode === "hosted-openrouter"
    ? "Live"
    : health?.mode === "local-agy"
    ? "AGY"
    : health?.mode === "hosted-gemini"
    ? "Live"
    : "BYOK";

  const renderRailBody = (expanded: boolean, isMobileDrawer: boolean) => (
    <div className="flex h-full flex-col justify-between bg-[var(--sidebar)] px-2.5 py-3.5 text-[var(--ink)]">
      {/* Top: Brand + Toggle + New Session */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={`flex items-center ${
            expanded ? "justify-between px-1" : "flex-col gap-2.5"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl">
              <DeskTeaMark />
            </div>
            {expanded && (
              <span className="text-[16px] font-semibold tracking-[-0.03em] text-[#FAFAFA]">
                {t.brand}
              </span>
            )}
          </div>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={t.dismiss}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
            >
              <X className="h-4 w-4 stroke-[1.75]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleExpand}
              title={expanded ? t.sidebarCollapse : t.sidebarExpand}
              aria-label={expanded ? t.sidebarCollapse : t.sidebarExpand}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
            >
              {expanded ? (
                <PanelLeftClose className="h-4 w-4 stroke-[1.75]" />
              ) : (
                <PanelLeft className="h-4 w-4 stroke-[1.75]" />
              )}
            </button>
          )}
        </div>

        {/* New Session CTA */}
        <div className={`mt-3.5 ${expanded ? "px-0.5" : "flex justify-center"}`}>
          {expanded ? (
            <button
              type="button"
              onClick={() => {
                onNewSession();
                if (isMobileDrawer) onCloseMobile();
              }}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-[13px] font-medium text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-[0.98]"
            >
              <SquarePen className="h-3.5 w-3.5 stroke-[1.8]" />
              <span>{t.newSession}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onNewSession}
              title={t.newSession}
              aria-label={t.newSession}
              className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[#FAFAFA] transition-colors hover:bg-[var(--surface-hover)] active:scale-95"
            >
              <SquarePen className="h-4 w-4 stroke-[1.8]" />
            </button>
          )}
        </div>

        {/* Scrollable Middle: Sessions (expanded) + Featured Desks */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-0.5">
          {expanded && (
            <div>
              <div className="mb-2 flex items-center justify-between px-1.5">
                <span className="text-[11px] font-medium tracking-[0.02em] text-[var(--ink-muted)]">
                  {t.sidebarSessions}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmClearAll) {
                      setConfirmClearAll(false);
                      onClearAllHistory();
                      if (isMobileDrawer) onCloseMobile();
                    } else {
                      setConfirmClearAll(true);
                    }
                  }}
                  title={t.clearAllHistory}
                  className={`flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] transition-colors ${
                    confirmClearAll
                      ? "bg-[var(--accent-soft)] font-medium text-[#FF8A80]"
                      : "text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-white"
                  }`}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  <span>{confirmClearAll ? t.clearAllConfirm : t.clearAllHistory}</span>
                </button>
              </div>

              <div className="space-y-1">
                {sessions.map((sess, idx) => {
                  const isCurr = sess.id === currentSessionId;
                  return (
                    <div
                      key={sess.id}
                      className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                        isCurr
                          ? "bg-[var(--surface-hover)] text-white"
                          : "text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchSession(sess.id);
                          if (isMobileDrawer) onCloseMobile();
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      >
                        <div className="h-7 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[#0A0A0A]">
                          {sess.imageSrc ? (
                            <img
                              src={sess.imageSrc}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--ink-muted)]">
                              {idx + 1}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium">
                            {sess.groupName || sess.title}
                          </div>
                          <div className="text-[10.5px] text-[var(--ink-muted)]">
                            {sess.objects.length} {t.membersSuffix}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(sess.id);
                        }}
                        title={t.deleteSessionLabel}
                        aria-label={t.deleteSessionLabel}
                        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-muted)] opacity-75 transition-opacity hover:bg-white/10 hover:text-[var(--accent)] lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Featured Desks */}
          <div>
            {expanded && (
              <div className="mb-2 px-1.5 text-[11px] font-medium tracking-[0.02em] text-[var(--ink-muted)]">
                {t.sidebarCases}
              </div>
            )}

            <div
              className={
                expanded
                  ? "space-y-1"
                  : "flex flex-col items-center gap-2.5 pt-1"
              }
            >
              {samples.map((sample) => {
                const active = !isBlankSession && activeSampleId === sample.id;
                if (!expanded) {
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => onSelectSample(sample)}
                      title={sample.title[locale]}
                      aria-label={sample.title[locale]}
                      className={`h-[30px] w-[38px] shrink-0 cursor-pointer overflow-hidden rounded-lg transition-all active:scale-95 ${
                        active
                          ? "opacity-100 ring-2 ring-white"
                          : "opacity-50 ring-1 ring-white/15 hover:opacity-95"
                      }`}
                    >
                      <img
                        src={sample.imageUrl}
                        alt={sample.title[locale]}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                }

                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      onSelectSample(sample);
                      if (isMobileDrawer) onCloseMobile();
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors ${
                      active
                        ? "bg-[var(--surface-hover)] text-white"
                        : "text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-white"
                    }`}
                  >
                    <div
                      className={`h-[30px] w-[42px] shrink-0 overflow-hidden rounded-lg ${
                        active ? "ring-1 ring-white/75" : "ring-1 ring-white/10"
                      }`}
                    >
                      <img
                        src={sample.imageUrl}
                        alt={sample.title[locale]}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug">
                      {sample.title[locale]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Utilities: Mode Status + Locale + Settings */}
      <div
        className={`mt-3 border-t border-[var(--border)] pt-3 ${
          expanded
            ? "flex items-center justify-between gap-2 px-1"
            : "flex flex-col items-center gap-2"
        } ${isMobileDrawer ? "pb-[calc(0.5rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        {expanded && (
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                health?.openrouterConfigured ||
                health?.agyAvailable ||
                health?.geminiConfigured ||
                hasCustomKey
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />
            <span className="truncate">{modeBadge}</span>
          </div>
        )}

        <div
          className={`flex items-center gap-1.5 ${
            expanded ? "" : "flex-col"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onOpenTour();
              if (isMobileDrawer) onCloseMobile();
            }}
            title={t.tourHelpTitle}
            aria-label={t.tourHelpTitle}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
          >
            <HelpCircle className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              if (isMobileDrawer) onCloseMobile();
            }}
            title={t.drawerTitle}
            aria-label="Settings"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-white"
          >
            <Settings2 className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Left Rail */}
      <aside
        className={`hidden shrink-0 border-r border-[var(--border)] transition-[width] duration-200 ease-out lg:block lg:h-full ${
          isExpanded ? "w-[248px]" : "w-[60px]"
        }`}
      >
        {renderRailBody(isExpanded, false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 h-full w-[264px] border-r border-[var(--border)] bg-[var(--sidebar)] shadow-2xl">
            {renderRailBody(true, true)}
          </aside>
        </div>
      )}
    </>
  );
}
