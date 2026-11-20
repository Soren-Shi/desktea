"use client";

import { Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeskCanvas, type LiveSpeechBubble } from "@/components/DeskCanvas";
import { DeskSequelModal } from "@/components/DeskSequelModal";
import { EngineDrawer } from "@/components/EngineDrawer";
import { GroupChatPanel } from "@/components/GroupChatPanel";
import { ShareCardModal } from "@/components/ShareCardModal";
import { SidebarRail } from "@/components/SidebarRail";
import {
  browserAddDeskObject,
  browserAnalyzeDesk,
  browserDiffDesks,
  browserGenerateChatter,
  browserLiveCameraTurn,
  browserReplyToOwner,
} from "@/lib/ai/browser-gemini";
import { getLocalTimeContext } from "@/lib/ai/normalize";
import type {
  AddObjectResult,
  ApiErrorCode,
  Box2D,
  ChatMessage,
  ChatterResult,
  DeskAnalysisResult,
  DeskObject,
  DeskSession,
  DiffResult,
  HealthStatus,
  LiveTurnResult,
  Locale,
  ReplyResult,
  Tone,
} from "@/lib/ai/types";
import {
  captureVideoFrame,
  computeFrameDiffPercent,
  sampleTinyGrayscale,
} from "@/lib/camera";
import { compressImageToDataUrl, cropObjectAvatars } from "@/lib/crop-avatars";
import { getCopy } from "@/lib/i18n";
import { CURATED_SAMPLES, type SampleDesk } from "@/lib/samples";
import { loadSavedSessions, saveSessionsToDb } from "@/lib/session-store";

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function makeSampleSession(sample: SampleDesk, locale: Locale): DeskSession {
  const a = sample.analysis[locale];
  return {
    id: `sess-${sample.id}-${Date.now().toString(36)}`,
    title: sample.title[locale],
    imageSrc: sample.imageUrl,
    afterImageSrc: null,
    groupName: a.groupName,
    resentmentScore: a.resentmentScore,
    verdict: a.verdict,
    mostLikelyToLeave: a.mostLikelyToLeave,
    objects: a.objects,
    messages: a.messages,
    visibleCount: a.messages.length,
    hasBrokenIn: false,
    ownerSteppedAway: false,
    activeSampleId: sample.id,
    isBlank: false,
    createdAt: Date.now(),
  };
}

function extractMentionIds(objects: DeskObject[], text: string): string[] {
  const lower = text.toLowerCase();
  return objects
    .filter((o) => !o.removed && lower.includes(`@${o.name.toLowerCase()}`))
    .map((o) => o.id);
}

function stripObjectAvatars(list: DeskObject[]): DeskObject[] {
  return list.map(({ avatarUrl: _omit, ...rest }) => rest);
}

export default function HomePage() {
  const defaultSample = CURATED_SAMPLES[0];
  const initialSessionRef = useRef<DeskSession>(
    makeSampleSession(defaultSample, "en")
  );

  const [locale, setLocale] = useState<Locale>("en");
  const [tone, setTone] = useState<Tone>("roast");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [agyModel, setAgyModel] = useState<string>("gemini-3.8-flash-low");
  const [apiKey, setApiKey] = useState<string>("");

  // Session store
  const [sessions, setSessions] = useState<DeskSession[]>([
    initialSessionRef.current,
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    initialSessionRef.current.id
  );

  // Active session fields
  const [activeSampleId, setActiveSampleId] = useState<string | null>(
    defaultSample.id
  );
  const [isBlankSession, setIsBlankSession] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>(defaultSample.imageUrl);
  const [afterImageSrc, setAfterImageSrc] = useState<string | null>(null);
  const [groupName, setGroupName] = useState(
    defaultSample.analysis.en.groupName
  );
  const [resentmentScore, setResentmentScore] = useState(
    defaultSample.analysis.en.resentmentScore
  );
  const [verdict, setVerdict] = useState(defaultSample.analysis.en.verdict);
  const [mostLikelyToLeave, setMostLikelyToLeave] = useState(
    defaultSample.analysis.en.mostLikelyToLeave
  );
  const [objects, setObjects] = useState<DeskObject[]>(
    defaultSample.analysis.en.objects
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    defaultSample.analysis.en.messages
  );
  const [visibleCount, setVisibleCount] = useState(
    defaultSample.analysis.en.messages.length
  );
  const [hasBrokenIn, setHasBrokenIn] = useState(false);
  const [ownerSteppedAway, setOwnerSteppedAway] = useState(false);

  // UI & interaction states
  const [isScanning, setIsScanning] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isChattering, setIsChattering] = useState(false);
  const [autoChatEnabled, setAutoChatEnabled] = useState(false);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [isAddingObject, setIsAddingObject] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);

  const [activeObjectId, setActiveObjectId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Sidebar & Draggable rail width
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [railWidth, setRailWidth] = useState<number>(440);
  const [isResizingRail, setIsResizingRail] = useState(false);

  // Live Camera mode states
  const [isLiveCamActive, setIsLiveCamActive] = useState(false);
  const [isLiveTurnRunning, setIsLiveTurnRunning] = useState(false);
  const [autoWatchEnabled, setAutoWatchEnabled] = useState(false);
  const [autoWatchInterval, setAutoWatchInterval] = useState<30 | 60 | 120>(60);
  const [liveCountdownSec, setLiveCountdownSec] = useState<number>(60);
  const [motionGateEnabled, setMotionGateEnabled] = useState(true);
  const [chatVisionEnabled, setChatVisionEnabled] = useState(true);
  const [liveStatusNote, setLiveStatusNote] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceIdx, setActiveDeviceIdx] = useState(0);

  // Modals
  const [isSequelOpen, setIsSequelOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerPromptReason, setDrawerPromptReason] = useState<
    "rate_limited" | "key_required" | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastLiveFrameRef = useRef<{
    dataUrl: string;
    tinyGray: Uint8Array | null;
  } | null>(null);
  const hasHydratedDbRef = useRef(false);
  const idleChatterTurnsRef = useRef(0);
  const ambientIndexMapRef = useRef<Record<string, number>>({});
  const firstAutoDelayRef = useRef(true);
  const stepAwayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = getCopy(locale);

  // Hydrate persisted preferences, IndexedDB sessions & default English sample avatars
  useEffect(() => {
    let resolvedLocale: Locale = "en";
    try {
      const savedKey = localStorage.getItem("desktea_api_key") || "";
      const savedModel =
        localStorage.getItem("desktea_agy_model") || "gemini-3.8-flash-low";
      setApiKey(savedKey);
      setAgyModel(savedModel);

      if (localStorage.getItem("desktea_sidebar_open") === "true") {
        setIsSidebarExpanded(true);
      }

      const savedRail = Number(localStorage.getItem("desktea_rail_width"));
      if (Number.isFinite(savedRail) && savedRail >= 360) {
        const maxAllowed = Math.min(700, Math.round(window.innerWidth * 0.58));
        setRailWidth(Math.min(maxAllowed, savedRail));
      }

      const savedLocale = localStorage.getItem("desktea_locale");
      if (savedLocale === "zh" || savedLocale === "en") {
        resolvedLocale = savedLocale;
      }
    } catch {
      // ignore storage failure
    }

    if (resolvedLocale !== "en") {
      const zhAnalysis = defaultSample.analysis[resolvedLocale];
      setLocale(resolvedLocale);
      setGroupName(zhAnalysis.groupName);
      setResentmentScore(zhAnalysis.resentmentScore);
      setVerdict(zhAnalysis.verdict);
      setMostLikelyToLeave(zhAnalysis.mostLikelyToLeave);
      setObjects(zhAnalysis.objects);
      setMessages(zhAnalysis.messages);
      setVisibleCount(zhAnalysis.messages.length);
    }

    fetch("/api/health")
      .then((r) => r.json())
      .then((data: HealthStatus) => setHealth(data))
      .catch(() => {});

    let cancelled = false;
    (async () => {
      const saved = await loadSavedSessions();
      if (cancelled) return;
      if (saved && saved.sessions.length > 0) {
        const target =
          saved.sessions.find((s) => s.id === saved.currentSessionId) ||
          saved.sessions[0];
        setSessions(saved.sessions);
        setCurrentSessionId(target.id);
        setActiveSampleId(target.activeSampleId);
        setIsBlankSession(target.isBlank);
        setImageSrc(target.imageSrc);
        setAfterImageSrc(target.afterImageSrc);
        setGroupName(target.groupName);
        setResentmentScore(target.resentmentScore);
        setVerdict(target.verdict);
        setMostLikelyToLeave(target.mostLikelyToLeave);
        setMessages(target.messages);
        setVisibleCount(target.visibleCount);
        setHasBrokenIn(target.hasBrokenIn);
        setOwnerSteppedAway(Boolean(target.ownerSteppedAway));
        if (
          target.imageSrc &&
          target.objects.length > 0 &&
          !target.objects[0].avatarUrl
        ) {
          const cropped = await cropObjectAvatars(target.imageSrc, target.objects);
          if (!cancelled) setObjects(cropped);
        } else {
          setObjects(target.objects);
        }
      } else {
        const cropped = await cropObjectAvatars(
          defaultSample.imageUrl,
          defaultSample.analysis[resolvedLocale].objects
        );
        if (!cancelled) setObjects(cropped);
      }
      hasHydratedDbRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultSample]);

  // Keep active session synced inside sessions list
  useEffect(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? {
              ...s,
              title:
                groupName ||
                (activeSampleId
                  ? CURATED_SAMPLES.find((c) => c.id === activeSampleId)?.title[
                      locale
                    ] || s.title
                  : t.newSession),
              imageSrc,
              afterImageSrc,
              groupName,
              resentmentScore,
              verdict,
              mostLikelyToLeave,
              objects,
              messages,
              visibleCount,
              hasBrokenIn,
              ownerSteppedAway,
              activeSampleId,
              isBlank: isBlankSession,
            }
          : s
      )
    );
  }, [
    currentSessionId,
    imageSrc,
    afterImageSrc,
    groupName,
    resentmentScore,
    verdict,
    mostLikelyToLeave,
    objects,
    messages,
    visibleCount,
    hasBrokenIn,
    ownerSteppedAway,
    activeSampleId,
    isBlankSession,
    locale,
    t.newSession,
  ]);

  // Debounced IndexedDB persistence
  useEffect(() => {
    if (!hasHydratedDbRef.current || isScanning) return;
    const timer = setTimeout(() => {
      saveSessionsToDb(sessions, currentSessionId);
    }, 800);
    return () => clearTimeout(timer);
  }, [sessions, currentSessionId, isScanning]);

  // Realistic variable staggered message playback
  useEffect(() => {
    if (isScanning) return;
    if (visibleCount >= messages.length) {
      if (isReplaying) setIsReplaying(false);
      return;
    }
    const nextMsg = messages[visibleCount];
    const delay = isReplaying
      ? 1650
      : nextMsg?.isSystem
      ? 450
      : Math.min(1500, Math.max(650, 520 + (nextMsg?.text?.length || 20) * 10));
    const timer = setTimeout(() => {
      setVisibleCount((prev) => Math.min(messages.length, prev + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [isScanning, isReplaying, visibleCount, messages]);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastLiveFrameRef.current = null;
    setAutoWatchEnabled(false);
    setLiveStatusNote(null);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Attach active MediaStream whenever <video> mounts or updates
  useEffect(() => {
    if (isLiveCamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isLiveCamActive, activeDeviceIdx]);

  const loadSessionIntoView = useCallback(
    async (sess: DeskSession) => {
      if (stepAwayTimerRef.current) {
        clearTimeout(stepAwayTimerRef.current);
        stepAwayTimerRef.current = null;
      }
      idleChatterTurnsRef.current = 0;
      setCurrentSessionId(sess.id);
      setActiveSampleId(sess.activeSampleId);
      setIsBlankSession(sess.isBlank);
      setImageSrc(sess.imageSrc);
      setAfterImageSrc(sess.afterImageSrc);
      setGroupName(sess.groupName);
      setResentmentScore(sess.resentmentScore);
      setVerdict(sess.verdict);
      setMostLikelyToLeave(sess.mostLikelyToLeave);
      setMessages(sess.messages);
      setVisibleCount(sess.visibleCount);
      setHasBrokenIn(sess.hasBrokenIn);
      setOwnerSteppedAway(Boolean(sess.ownerSteppedAway));
      setSelectedObjectId(null);
      setActiveObjectId(null);
      setHoveredMessageId(null);
      setIsReplaying(false);
      setIsDrawMode(false);
      setErrorMsg(null);

      if (sess.imageSrc && sess.objects.length > 0 && !sess.objects[0].avatarUrl) {
        const cropped = await cropObjectAvatars(sess.imageSrc, sess.objects);
        setObjects(cropped);
      } else {
        setObjects(sess.objects);
      }
    },
    []
  );

  const handleNewSession = useCallback(() => {
    if (isLiveCamActive) {
      stopCameraStream();
      setIsLiveCamActive(false);
    }
    const blank: DeskSession = {
      id: `sess-${Date.now().toString(36)}`,
      title: t.newSession,
      imageSrc: "",
      afterImageSrc: null,
      groupName: t.newSession,
      resentmentScore: 0,
      verdict: "",
      mostLikelyToLeave: "",
      objects: [],
      messages: [],
      visibleCount: 0,
      hasBrokenIn: false,
      ownerSteppedAway: false,
      activeSampleId: null,
      isBlank: true,
      createdAt: Date.now(),
    };
    setSessions((prev) => [blank, ...prev]);
    loadSessionIntoView(blank);
  }, [isLiveCamActive, stopCameraStream, t.newSession, loadSessionIntoView]);

  const handleSwitchSession = useCallback(
    (id: string) => {
      if (id === currentSessionId) return;
      const target = sessions.find((s) => s.id === id);
      if (target) {
        if (isLiveCamActive) {
          stopCameraStream();
          setIsLiveCamActive(false);
        }
        loadSessionIntoView(target);
      }
    },
    [currentSessionId, sessions, isLiveCamActive, stopCameraStream, loadSessionIntoView]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return;
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (id === currentSessionId && remaining[0]) {
        loadSessionIntoView(remaining[0]);
      }
    },
    [sessions, currentSessionId, loadSessionIntoView]
  );

  const handleClearChat = useCallback(() => {
    const sample = activeSampleId
      ? CURATED_SAMPLES.find((s) => s.id === activeSampleId)
      : null;
    if (sample) {
      setMessages(sample.analysis[locale].messages);
      setVisibleCount(sample.analysis[locale].messages.length);
      setResentmentScore(sample.analysis[locale].resentmentScore);
    } else {
      setMessages([]);
      setVisibleCount(0);
    }
    setHasBrokenIn(false);
    setOwnerSteppedAway(false);
    idleChatterTurnsRef.current = 0;
    setSelectedObjectId(null);
    setIsReplaying(false);
  }, [activeSampleId, locale]);

  const applyAnalysis = useCallback(
    async (plateUrl: string, analysis: DeskAnalysisResult, instant = false) => {
      const croppedObjects = await cropObjectAvatars(plateUrl, analysis.objects);
      setIsBlankSession(false);
      setGroupName(analysis.groupName);
      setResentmentScore(analysis.resentmentScore);
      setVerdict(analysis.verdict);
      setMostLikelyToLeave(analysis.mostLikelyToLeave);
      setObjects(croppedObjects);
      setMessages(analysis.messages);
      setVisibleCount(instant ? analysis.messages.length : 1);
      setIsReplaying(false);
      setHasBrokenIn(false);
      setOwnerSteppedAway(false);
      idleChatterTurnsRef.current = 0;
      setSelectedObjectId(null);
      setActiveObjectId(null);
      setHoveredMessageId(null);
      setAfterImageSrc(null);
      setIsDrawMode(false);
    },
    []
  );

  const handleApiErrorResponse = useCallback(
    (
      status: number,
      data: { error?: string; code?: ApiErrorCode },
      fallback: string
    ): string => {
      const isHostedMode =
        health?.mode === "hosted-openrouter" || health?.mode === "hosted-gemini";
      if (data.code === "RATE_LIMITED" || status === 429) {
        if (isHostedMode) {
          return t.hostedBusyRateLimit;
        }
        setDrawerPromptReason("rate_limited");
        setIsDrawerOpen(true);
        return t.byokNoticeRateLimit;
      }
      if (data.code === "KEY_REQUIRED" || status === 401) {
        setDrawerPromptReason("key_required");
        setIsDrawerOpen(true);
        return t.byokNoticeKeyRequired;
      }
      return data.error || fallback;
    },
    [
      health?.mode,
      t.byokNoticeKeyRequired,
      t.byokNoticeRateLimit,
      t.hostedBusyRateLimit,
    ]
  );

  const runLiveAnalyze = useCallback(
    async (
      dataUrl: string,
      mimeType: string,
      targetLocale: Locale,
      targetTone: Tone
    ) => {
      setIsBlankSession(false);
      setIsScanning(true);
      setIsReplaying(false);
      setErrorMsg(null);
      setAfterImageSrc(null);
      setSelectedObjectId(null);
      setActiveObjectId(null);
      setHoveredMessageId(null);
      setHasBrokenIn(false);
      setIsDrawMode(false);

      try {
        const cleanKey = apiKey.trim();
        let data: DeskAnalysisResult;
        if (cleanKey && !cleanKey.startsWith("sk-or-")) {
          data = await browserAnalyzeDesk({
            apiKey: cleanKey,
            imageBase64: dataUrl,
            mimeType,
            locale: targetLocale,
            tone: targetTone,
            model: agyModel,
          });
        } else {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: dataUrl,
              mimeType,
              locale: targetLocale,
              tone: targetTone,
              localTimeContext: getLocalTimeContext(targetLocale),
              model: agyModel,
              ...(cleanKey ? { apiKey: cleanKey } : {}),
            }),
          });
          const raw = (await res.json()) as DeskAnalysisResult & {
            error?: string;
            code?: ApiErrorCode;
          };
          if (!res.ok) {
            throw new Error(
              handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
            );
          }
          data = raw;
        }
        await applyAnalysis(dataUrl, data, false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to analyze desk");
      } finally {
        setIsScanning(false);
      }
    },
    [agyModel, apiKey, applyAnalysis, handleApiErrorResponse]
  );

  const handleSelectFile = useCallback(
    async (file: File) => {
      if (isLiveCamActive) {
        stopCameraStream();
        setIsLiveCamActive(false);
      }
      setActiveSampleId(null);
      setErrorMsg(null);
      try {
        const { dataUrl, mimeType } = await compressImageToDataUrl(file, 1280, 0.85);
        setImageSrc(dataUrl);
        await runLiveAnalyze(dataUrl, mimeType, locale, tone);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not read image");
      }
    },
    [isLiveCamActive, stopCameraStream, locale, tone, runLiveAnalyze]
  );

  const handleSelectSample = useCallback(
    async (sample: SampleDesk) => {
      if (isLiveCamActive) {
        stopCameraStream();
        setIsLiveCamActive(false);
      }
      setActiveSampleId(sample.id);
      setErrorMsg(null);
      setImageSrc(sample.imageUrl);
      setAfterImageSrc(null);
      await applyAnalysis(sample.imageUrl, sample.analysis[locale], true);
    },
    [isLiveCamActive, stopCameraStream, applyAnalysis, locale]
  );

  const handleReanalyzeLive = useCallback(async () => {
    if (!imageSrc || isScanning) return;
    setActiveSampleId(null);
    setErrorMsg(null);
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(imageSrc, 1280, 0.85);
      setImageSrc(dataUrl);
      await runLiveAnalyze(dataUrl, mimeType, locale, tone);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Re-analysis failed");
    }
  }, [imageSrc, isScanning, locale, tone, runLiveAnalyze]);

  const handleReplay = useCallback(() => {
    if (isScanning || messages.length === 0) return;
    setSelectedObjectId(null);
    setHoveredMessageId(null);
    setIsReplaying(true);
    setVisibleCount(1);
  }, [isScanning, messages.length]);

  const handleRevealAll = useCallback(() => {
    setIsReplaying(false);
    setVisibleCount(messages.length);
  }, [messages.length]);

  // Draw-box to add custom object
  const handleAddBoxObject = useCallback(
    async (box: Box2D, customName: string, previewAvatarUrl: string) => {
      if (!imageSrc) return;
      setIsAddingObject(true);
      setErrorMsg(null);
      try {
        const activeSrc = afterImageSrc || imageSrc;
        let payloadUrl = activeSrc;
        let mimeType = "image/jpeg";
        if (!payloadUrl.startsWith("data:")) {
          const compressed = await compressImageToDataUrl(activeSrc, 1280, 0.85);
          payloadUrl = compressed.dataUrl;
          mimeType = compressed.mimeType;
        }

        const cleanKey = apiKey.trim();
        let data: AddObjectResult;
        if (cleanKey && !cleanKey.startsWith("sk-or-")) {
          data = await browserAddDeskObject({
            apiKey: cleanKey,
            imageBase64: payloadUrl,
            mimeType,
            box_2d: box,
            customName,
            objects,
            history: messages,
            locale,
            tone,
            model: agyModel,
          });
        } else {
          const res = await fetch("/api/add-object", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: payloadUrl,
              mimeType,
              box_2d: box,
              customName,
              objects: stripObjectAvatars(objects),
              history: messages,
              locale,
              tone,
              model: agyModel,
              ...(cleanKey ? { apiKey: cleanKey } : {}),
            }),
          });
          const raw = (await res.json()) as AddObjectResult & {
            error?: string;
            code?: ApiErrorCode;
          };
          if (!res.ok) {
            throw new Error(
              handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
            );
          }
          data = raw;
        }

        const addedObj: DeskObject = {
          ...data.object,
          avatarUrl: previewAvatarUrl,
          isNew: Boolean(afterImageSrc),
        };

        const joinSys: ChatMessage = {
          id: `sys-add-${Date.now()}`,
          senderId: "system",
          senderName: "SYSTEM",
          text: data.joinNotice,
          timestamp: nowHHMM(),
          isSystem: true,
        };

        setObjects((prev) => [...prev, addedObj]);
        setMessages((prev) => {
          const next = [...prev, joinSys, ...data.messages];
          setVisibleCount(prev.length + 1);
          return next;
        });
        setIsDrawMode(false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to add item");
      } finally {
        setIsAddingObject(false);
      }
    },
    [
      imageSrc,
      afterImageSrc,
      objects,
      messages,
      locale,
      tone,
      agyModel,
      apiKey,
      handleApiErrorResponse,
    ]
  );

  // Live Camera start/stop & switch
  const startCameraWithDevice = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg(
          locale === "zh"
            ? "当前浏览器环境不支持实况摄像头调用（需要 HTTPS 或 localhost 权限）"
            : "Camera access is unavailable in this browser context"
        );
        return false;
      }

      try {
        stopCameraStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        setIsLiveCamActive(true);
        setIsBlankSession(false);
        setIsDrawMode(false);
        setLiveCountdownSec(autoWatchInterval);
        setLiveStatusNote(null);

        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter((d) => d.kind === "videoinput"));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        return true;
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : locale === "zh"
            ? "未能开启摄像头，请检查权限或设备连接"
            : "Could not access camera"
        );
        return false;
      }
    },
    [autoWatchInterval, locale, stopCameraStream]
  );

  const handleToggleLiveCam = useCallback(async () => {
    if (isLiveCamActive) {
      stopCameraStream();
      setIsLiveCamActive(false);
      return;
    }
    await startCameraWithDevice();
  }, [isLiveCamActive, startCameraWithDevice, stopCameraStream]);

  const handleSwitchCamera = useCallback(async () => {
    if (videoDevices.length <= 1) return;
    const nextIdx = (activeDeviceIdx + 1) % videoDevices.length;
    setActiveDeviceIdx(nextIdx);
    await startCameraWithDevice(videoDevices[nextIdx].deviceId);
  }, [videoDevices, activeDeviceIdx, startCameraWithDevice]);

  // Execute live camera frame analysis / turn
  const runLiveCameraTurn = useCallback(
    async (
      trigger: "auto" | "chat",
      ownerMessage?: string,
      mentionedIds?: string[]
    ) => {
      if (!videoRef.current || isLiveTurnRunning || isScanning) return;
      const video = videoRef.current;
      const tinyGray = sampleTinyGrayscale(video);
      const { dataUrl, mimeType } = captureVideoFrame(video, 1024, 0.82);

      // Motion gate check for auto timed check-ins
      if (
        trigger === "auto" &&
        motionGateEnabled &&
        objects.length > 0 &&
        lastLiveFrameRef.current?.tinyGray
      ) {
        const diff = computeFrameDiffPercent(
          lastLiveFrameRef.current.tinyGray,
          tinyGray
        );
        if (diff < 4.5) {
          setLiveStatusNote(t.liveNoMotionSkip);
          setLiveCountdownSec(autoWatchInterval);
          return;
        }
      }

      setLiveStatusNote(null);

      // First snapshot with empty cast -> run full initial analysis
      if (objects.length === 0) {
        lastLiveFrameRef.current = { dataUrl, tinyGray };
        setImageSrc(dataUrl);
        await runLiveAnalyze(dataUrl, mimeType, locale, tone);
        setLiveCountdownSec(autoWatchInterval);
        return;
      }

      setIsLiveTurnRunning(true);
      try {
        const cleanKey = apiKey.trim();
        let data: LiveTurnResult;
        if (cleanKey && !cleanKey.startsWith("sk-or-")) {
          data = await browserLiveCameraTurn({
            apiKey: cleanKey,
            currImageBase64: dataUrl,
            prevImageBase64: lastLiveFrameRef.current?.dataUrl,
            mimeType,
            trigger,
            locale,
            tone,
            objects,
            history: messages,
            ownerMessage,
            mentionedObjectIds: mentionedIds,
            model: agyModel,
          });
        } else {
          const res = await fetch("/api/live-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currImageBase64: dataUrl,
              prevImageBase64: lastLiveFrameRef.current?.dataUrl,
              mimeType,
              trigger,
              locale,
              tone,
              objects: stripObjectAvatars(objects),
              history: messages,
              ownerMessage,
              mentionedObjectIds: mentionedIds,
              model: agyModel,
              ...(cleanKey ? { apiKey: cleanKey } : {}),
            }),
          });
          const raw = (await res.json()) as LiveTurnResult & {
            error?: string;
            code?: ApiErrorCode;
          };
          if (!res.ok) {
            throw new Error(
              handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
            );
          }
          data = raw;
        }

        lastLiveFrameRef.current = { dataUrl, tinyGray };
        setImageSrc(dataUrl);

        const croppedNew =
          data.newObjects.length > 0
            ? await cropObjectAvatars(dataUrl, data.newObjects)
            : [];

        const removedSet = new Set(data.removedIds);
        setObjects((prev) => [
          ...prev.map((o) =>
            removedSet.has(o.id) ? { ...o, removed: true } : o
          ),
          ...croppedNew,
        ]);
        setResentmentScore(data.resentmentScore);

        const additions: ChatMessage[] = [];
        if (data.sceneNote && trigger === "auto") {
          additions.push({
            id: `sys-live-${Date.now()}`,
            senderId: "system",
            senderName: "SYSTEM",
            text: data.sceneNote,
            timestamp: nowHHMM(),
            isSystem: true,
          });
        }
        additions.push(...data.messages);

        setMessages((prev) => [...prev, ...additions]);
        setLiveCountdownSec(autoWatchInterval);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Live check failed");
      } finally {
        setIsLiveTurnRunning(false);
      }
    },
    [
      isLiveTurnRunning,
      isScanning,
      motionGateEnabled,
      objects,
      t.liveNoMotionSkip,
      autoWatchInterval,
      runLiveAnalyze,
      locale,
      tone,
      messages,
      agyModel,
      apiKey,
      handleApiErrorResponse,
    ]
  );

  // Auto-watch countdown loop
  useEffect(() => {
    if (!isLiveCamActive || !autoWatchEnabled || isLiveTurnRunning || isScanning) {
      return;
    }
    const timer = setInterval(() => {
      setLiveCountdownSec((prev) => {
        if (prev <= 1) {
          runLiveCameraTurn("auto");
          return autoWatchInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [
    isLiveCamActive,
    autoWatchEnabled,
    autoWatchInterval,
    isLiveTurnRunning,
    isScanning,
    runLiveCameraTurn,
  ]);

  // Global clipboard paste & drag-drop
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleSelectFile(file);
            break;
          }
        }
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setIsDraggingWindow(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        setIsDraggingWindow(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setIsDraggingWindow(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        handleSelectFile(file);
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleSelectFile]);

  const handleToggleLocale = useCallback(async () => {
    const nextLocale: Locale = locale === "zh" ? "en" : "zh";
    setLocale(nextLocale);
    try {
      localStorage.setItem("desktea_locale", nextLocale);
    } catch {
      // ignore
    }

    const activeSample = activeSampleId
      ? CURATED_SAMPLES.find((s) => s.id === activeSampleId)
      : null;
    if (activeSample && !hasBrokenIn && !afterImageSrc && !isScanning) {
      await applyAnalysis(
        activeSample.imageUrl,
        activeSample.analysis[nextLocale],
        true
      );
    }
  }, [
    locale,
    activeSampleId,
    hasBrokenIn,
    afterImageSrc,
    isScanning,
    applyAnalysis,
  ]);

  const runAutonomousChatter = useCallback(
    async (opts?: {
      bypassCap?: boolean;
      historyOverride?: ChatMessage[];
      ownerSteppedAwayOverride?: boolean;
    }) => {
      if (isBlankSession || isScanning || isReplying || isChattering || isReplaying) {
        return;
      }
      if (!opts?.bypassCap && visibleCount < messages.length) {
        return;
      }
      if (
        !opts?.bypassCap &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const activeObjs = objects.filter((o) => !o.removed);
      if (activeObjs.length < 2) return;

      if (!opts?.bypassCap && idleChatterTurnsRef.current >= 8) {
        return;
      }

      const cleanKey = apiKey.trim();
      const currSample = activeSampleId
        ? CURATED_SAMPLES.find((s) => s.id === activeSampleId) || null
        : null;
      const baseHistory = opts?.historyOverride || messages;

      // In public key-less BYOK mode on curated samples, play free non-repeating ambient threads
      if (!cleanKey && health?.mode === "byok-only") {
        if (currSample) {
          const pool = currSample.ambientThreads[locale];
          const threadKey = `${currSample.id}-${locale}`;
          const usedIdx = ambientIndexMapRef.current[threadKey] || 0;
          if (usedIdx < pool.length) {
            const chosen = pool[usedIdx];
            ambientIndexMapRef.current[threadKey] = usedIdx + 1;
            const byId = new Map(objects.map((o) => [o.id, o]));
            const ts = nowHHMM();
            const additions: ChatMessage[] = chosen.map((line, i) => {
              const sender = byId.get(line.senderId) || activeObjs[0];
              return {
                id: `ambient-${Date.now()}-${i}`,
                senderId: sender.id,
                senderName: sender.name,
                text: line.text,
                replyToName: line.replyToName,
                reaction: line.reaction,
                timestamp: ts,
              };
            });
            idleChatterTurnsRef.current += 1;
            setMessages((prev) => [...prev, ...additions]);
            return;
          }
        }
        setAutoChatEnabled(false);
        return;
      }

      setIsChattering(true);
      const isSteppedAway =
        opts?.ownerSteppedAwayOverride !== undefined
          ? opts.ownerSteppedAwayOverride
          : ownerSteppedAway;
      const ownerPresent = hasBrokenIn && !isSteppedAway;

      try {
        let data: ChatterResult;
        if (cleanKey && !cleanKey.startsWith("sk-or-")) {
          data = await browserGenerateChatter({
            apiKey: cleanKey,
            locale,
            tone,
            objects,
            history: baseHistory,
            ownerPresent,
            model: agyModel,
          });
        } else {
          const res = await fetch("/api/chatter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locale,
              tone,
              objects: stripObjectAvatars(objects),
              history: baseHistory,
              ownerPresent,
              localTimeContext: getLocalTimeContext(locale),
              model: agyModel,
              ...(cleanKey ? { apiKey: cleanKey } : {}),
            }),
          });
          const raw = (await res.json()) as ChatterResult & {
            error?: string;
            code?: ApiErrorCode;
          };
          if (!res.ok) {
            if (raw.code === "RATE_LIMITED" || raw.code === "KEY_REQUIRED") {
              setAutoChatEnabled(false);
            }
            if (opts?.bypassCap) {
              throw new Error(
                handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
              );
            }
            return;
          }
          data = raw;
        }

        idleChatterTurnsRef.current += 1;
        setResentmentScore((prev) =>
          Math.max(0, Math.min(100, prev + (data.tensionDelta || 0)))
        );
        setMessages((prev) => [...prev, ...data.messages]);
      } catch (err) {
        if (opts?.bypassCap) {
          setErrorMsg(
            err instanceof Error ? err.message : "Failed to generate chatter"
          );
        }
      } finally {
        setIsChattering(false);
      }
    },
    [
      isBlankSession,
      isScanning,
      isReplying,
      isChattering,
      isReplaying,
      visibleCount,
      messages,
      objects,
      apiKey,
      activeSampleId,
      health?.mode,
      locale,
      ownerSteppedAway,
      hasBrokenIn,
      tone,
      agyModel,
      handleApiErrorResponse,
    ]
  );

  const runAutoChatterRef = useRef(runAutonomousChatter);
  useEffect(() => {
    runAutoChatterRef.current = runAutonomousChatter;
  }, [runAutonomousChatter]);

  useEffect(() => {
    return () => {
      if (stepAwayTimerRef.current) {
        clearTimeout(stepAwayTimerRef.current);
      }
    };
  }, []);

  // Periodic autonomous object-to-object chatter loop
  useEffect(() => {
    const activeCount = objects.filter((o) => !o.removed).length;
    if (!autoChatEnabled || isBlankSession || activeCount < 2) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        await runAutoChatterRef.current();
        if (!cancelled) {
          scheduleNext(26000);
        }
      }, delayMs);
    };

    const initialDelay = firstAutoDelayRef.current ? 5000 : 26000;
    firstAutoDelayRef.current = false;
    scheduleNext(initialDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autoChatEnabled, isBlankSession, currentSessionId, objects]);

  const handleToggleAutoChat = useCallback(() => {
    setAutoChatEnabled((prev) => {
      const next = !prev;
      if (next) {
        idleChatterTurnsRef.current = 0;
        firstAutoDelayRef.current = true;
      }
      return next;
    });
  }, []);

  const handleStepAway = useCallback(() => {
    if (!hasBrokenIn || ownerSteppedAway || isBlankSession) return;
    if (stepAwayTimerRef.current) {
      clearTimeout(stepAwayTimerRef.current);
      stepAwayTimerRef.current = null;
    }

    const stepNotice: ChatMessage = {
      id: `sys-stepaway-${Date.now()}`,
      senderId: "system",
      senderName: "SYSTEM",
      text: t.steppedAwayNotice,
      timestamp: nowHHMM(),
      isSystem: true,
    };

    const nextHistory = [...messages, stepNotice];
    setOwnerSteppedAway(true);
    idleChatterTurnsRef.current = 0;
    firstAutoDelayRef.current = false;
    setAutoChatEnabled(true);
    setMessages(nextHistory);
    setVisibleCount(nextHistory.length);

    stepAwayTimerRef.current = setTimeout(() => {
      stepAwayTimerRef.current = null;
      runAutoChatterRef.current({
        bypassCap: true,
        historyOverride: nextHistory,
        ownerSteppedAwayOverride: true,
      });
    }, 1800);
  }, [hasBrokenIn, ownerSteppedAway, isBlankSession, t.steppedAwayNotice, messages]);

  const handleSendOwnerMessage = async (text: string) => {
    if (stepAwayTimerRef.current) {
      clearTimeout(stepAwayTimerRef.current);
      stepAwayTimerRef.current = null;
    }
    idleChatterTurnsRef.current = 0;

    const isFirstBreach = !hasBrokenIn && !messages.some((m) => m.isOwner);
    const ts = nowHHMM();
    const mentionedIds = extractMentionIds(objects, text);

    const appended: ChatMessage[] = [];
    if (isFirstBreach && objects.length > 0) {
      setHasBrokenIn(true);
      appended.push({
        id: `sys-breach-${Date.now()}`,
        senderId: "system",
        senderName: "SYSTEM",
        text: t.ownerJoinedAlert,
        timestamp: ts,
        isSystem: true,
      });
    } else if (ownerSteppedAway) {
      setOwnerSteppedAway(false);
      appended.push({
        id: `sys-return-${Date.now()}`,
        senderId: "system",
        senderName: "SYSTEM",
        text: t.ownerReturnedNotice,
        timestamp: ts,
        isSystem: true,
      });
    }

    const ownerMsg: ChatMessage = {
      id: `owner-${Date.now()}`,
      senderId: "owner",
      senderName: t.ownerName,
      text,
      timestamp: ts,
      isOwner: true,
    };
    appended.push(ownerMsg);

    const updatedHistory = [...messages, ...appended];
    setMessages(updatedHistory);
    setVisibleCount(updatedHistory.length);
    setIsReplaying(false);

    // If Live Cam + Vision Chat is on, grab current webcam frame alongside dialogue
    if (isLiveCamActive && chatVisionEnabled && videoRef.current) {
      setIsReplying(true);
      try {
        await runLiveCameraTurn("chat", text, mentionedIds);
      } finally {
        setIsReplying(false);
      }
      return;
    }

    setIsReplying(true);
    setErrorMsg(null);

    try {
      const cleanKey = apiKey.trim();
      let data: ReplyResult;
      if (cleanKey && !cleanKey.startsWith("sk-or-")) {
        data = await browserReplyToOwner({
          apiKey: cleanKey,
          locale,
          tone,
          objects,
          history: updatedHistory,
          ownerMessage: text,
          isFirstBreach,
          mentionedObjectIds: mentionedIds,
          model: agyModel,
        });
      } else {
        const res = await fetch("/api/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            tone,
            objects: stripObjectAvatars(objects),
            history: updatedHistory,
            ownerMessage: text,
            isFirstBreach,
            mentionedObjectIds: mentionedIds,
            localTimeContext: getLocalTimeContext(locale),
            model: agyModel,
            ...(cleanKey ? { apiKey: cleanKey } : {}),
          }),
        });
        const raw = (await res.json()) as ReplyResult & {
          error?: string;
          code?: ApiErrorCode;
        };
        if (!res.ok) {
          throw new Error(
            handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
          );
        }
        data = raw;
      }
      setResentmentScore((prev) =>
        Math.max(0, Math.min(100, prev + (data.tensionDelta || 0)))
      );
      setMessages((prev) => [...prev, ...data.messages]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setIsReplying(false);
    }
  };

  const handleSubmitAfter = async (afterDataUrl: string, mimeType: string) => {
    setIsComparing(true);
    setErrorMsg(null);
    try {
      let beforeDataUrl = imageSrc;
      if (!beforeDataUrl.startsWith("data:")) {
        const compressed = await compressImageToDataUrl(imageSrc, 1280, 0.85);
        beforeDataUrl = compressed.dataUrl;
      }

      const prevScore = resentmentScore;
      const cleanKey = apiKey.trim();
      let data: DiffResult;
      if (cleanKey && !cleanKey.startsWith("sk-or-")) {
        data = await browserDiffDesks({
          apiKey: cleanKey,
          beforeImageBase64: beforeDataUrl,
          afterImageBase64: afterDataUrl,
          mimeType,
          locale,
          tone,
          objects,
          history: messages,
          model: agyModel,
        });
      } else {
        const res = await fetch("/api/diff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beforeImageBase64: beforeDataUrl,
            afterImageBase64: afterDataUrl,
            mimeType,
            locale,
            tone,
            objects: stripObjectAvatars(objects),
            history: messages,
            model: agyModel,
            ...(cleanKey ? { apiKey: cleanKey } : {}),
          }),
        });
        const raw = (await res.json()) as DiffResult & {
          error?: string;
          code?: ApiErrorCode;
        };
        if (!res.ok) {
          throw new Error(
            handleApiErrorResponse(res.status, raw, `HTTP ${res.status}`)
          );
        }
        data = raw;
      }

      const croppedNew =
        data.newObjects.length > 0
          ? await cropObjectAvatars(afterDataUrl, data.newObjects)
          : [];

      const removedSet = new Set(data.removedIds);
      const removedNames = objects
        .filter((o) => removedSet.has(o.id))
        .map((o) => o.name);
      const addedNames = croppedNew.map((o) => o.name);

      setObjects((prev) => [
        ...prev.map((o) => (removedSet.has(o.id) ? { ...o, removed: true } : o)),
        ...croppedNew,
      ]);

      setAfterImageSrc(afterDataUrl);
      setResentmentScore(data.resentmentScore);

      const diffCardMsg: ChatMessage = {
        id: `sys-diff-${Date.now()}`,
        senderId: "system",
        senderName: "SYSTEM",
        text: data.summary,
        timestamp: nowHHMM(),
        isSystem: true,
        diffMeta: {
          removedNames,
          addedNames,
          prevScore,
          nextScore: data.resentmentScore,
        },
      };

      setMessages((prev) => [...prev, diffCardMsg, ...data.messages]);
      setIsSequelOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Comparison failed");
      setIsSequelOpen(false);
    } finally {
      setIsComparing(false);
    }
  };

  const handleSaveEngine = (newModel: string, newKey: string) => {
    setAgyModel(newModel);
    setApiKey(newKey);
    if (newKey.trim()) {
      setDrawerPromptReason(null);
    }
    try {
      localStorage.setItem("desktea_agy_model", newModel);
      localStorage.setItem("desktea_api_key", newKey);
    } catch {
      // ignore
    }
  };

  const handleToggleSidebarExpand = useCallback(() => {
    setIsSidebarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("desktea_sidebar_open", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Draggable vertical divider for desktop chat rail
  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizingRail(true);
    let latestWidth = railWidth;

    const onMove = (ev: PointerEvent) => {
      const maxAllowed = Math.min(700, Math.round(window.innerWidth * 0.58));
      const next = Math.max(
        360,
        Math.min(maxAllowed, window.innerWidth - ev.clientX)
      );
      latestWidth = next;
      setRailWidth(next);
    };

    const onUp = () => {
      setIsResizingRail(false);
      try {
        localStorage.setItem("desktea_rail_width", String(latestWidth));
      } catch {
        // ignore
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const isStreaming = !isScanning && visibleCount < messages.length;
  const speakingObjectId =
    !isScanning && visibleCount > 0 && visibleCount <= messages.length
      ? messages[visibleCount - 1]?.isSystem || messages[visibleCount - 1]?.isOwner
        ? null
        : messages[visibleCount - 1]?.senderId || null
      : null;

  const hoveredMsg = hoveredMessageId
    ? messages.find((m) => m.id === hoveredMessageId)
    : null;
  const latestMsg =
    isStreaming && visibleCount > 0 && visibleCount <= messages.length
      ? messages[visibleCount - 1]
      : null;
  const bubbleMsg =
    hoveredMsg && !hoveredMsg.isSystem && !hoveredMsg.isOwner
      ? hoveredMsg
      : latestMsg && !latestMsg.isSystem && !latestMsg.isOwner
      ? latestMsg
      : null;

  const activeSpeechBubble: LiveSpeechBubble | null = bubbleMsg
    ? {
        objectId: bubbleMsg.senderId,
        senderName: bubbleMsg.senderName,
        text: bubbleMsg.text,
        reaction: bubbleMsg.reaction,
      }
    : null;

  const activeSample = activeSampleId
    ? CURATED_SAMPLES.find((s) => s.id === activeSampleId) || null
    : null;
  const quickReplies = activeSample
    ? activeSample.quickReplies[locale]
    : t.defaultQuickReplies;

  const caseTitle = activeSample
    ? activeSample.title[locale]
    : isBlankSession
    ? t.newSession
    : groupName || t.tagline;

  return (
    <div
      className={`flex min-h-dvh flex-col bg-[var(--stage)] text-[var(--ink)] lg:h-dvh lg:flex-row lg:overflow-hidden ${
        isResizingRail ? "select-none cursor-col-resize" : ""
      }`}
    >
      {/* Floating Error Banner */}
      {errorMsg && (
        <div className="fixed left-1/2 top-4 z-50 w-[92%] max-w-lg -translate-x-1/2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--accent)]/30 bg-[#1B1314]/95 px-4 py-3 text-[13px] text-[#FF8A80] shadow-2xl backdrop-blur-xl">
            <span>
              {t.errorPrefix}
              {errorMsg}
            </span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-white/10"
              aria-label={t.dismiss}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Left Collapsible Navigation Rail */}
      <SidebarRail
        locale={locale}
        isExpanded={isSidebarExpanded}
        isMobileOpen={isMobileSidebarOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        samples={CURATED_SAMPLES}
        activeSampleId={activeSampleId}
        isBlankSession={isBlankSession}
        health={health}
        hasCustomKey={Boolean(apiKey.trim())}
        onToggleExpand={handleToggleSidebarExpand}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
        onClearChat={handleClearChat}
        onSelectSample={handleSelectSample}
        onToggleLocale={handleToggleLocale}
        onOpenSettings={() => {
          setDrawerPromptReason(null);
          setIsDrawerOpen(true);
        }}
      />

      {/* Center Serene Photographic Stage */}
      <div className="min-w-0 flex-1 lg:h-full">
        <DeskCanvas
          locale={locale}
          caseTitle={caseTitle}
          imageSrc={imageSrc}
          afterImageSrc={afterImageSrc}
          isBlankSession={isBlankSession}
          objects={objects}
          isScanning={isScanning}
          isReplaying={isReplaying}
          activeObjectId={activeObjectId}
          selectedObjectId={selectedObjectId}
          speakingObjectId={speakingObjectId}
          activeSpeechBubble={activeSpeechBubble}
          isDrawMode={isDrawMode}
          isAddingObject={isAddingObject}
          onToggleDrawMode={() => setIsDrawMode((v) => !v)}
          onAddBoxObject={handleAddBoxObject}
          isLiveCamActive={isLiveCamActive}
          isLiveTurnRunning={isLiveTurnRunning}
          liveCountdownSec={liveCountdownSec}
          autoWatchEnabled={autoWatchEnabled}
          autoWatchInterval={autoWatchInterval}
          motionGateEnabled={motionGateEnabled}
          chatVisionEnabled={chatVisionEnabled}
          liveStatusNote={liveStatusNote}
          videoDeviceCount={videoDevices.length}
          videoRef={videoRef}
          onToggleLiveCam={handleToggleLiveCam}
          onSwitchCamera={handleSwitchCamera}
          onSnapLiveNow={() => runLiveCameraTurn("auto")}
          onToggleAutoWatch={() => {
            setAutoWatchEnabled((v) => !v);
            setLiveCountdownSec(autoWatchInterval);
          }}
          onChangeAutoInterval={(sec) => {
            setAutoWatchInterval(sec);
            setLiveCountdownSec(sec);
          }}
          onToggleMotionGate={() => setMotionGateEnabled((v) => !v)}
          onToggleChatVision={() => setChatVisionEnabled((v) => !v)}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onToggleLocale={handleToggleLocale}
          onHoverObject={setActiveObjectId}
          onSelectObject={setSelectedObjectId}
          onReplay={handleReplay}
          onUploadClick={() => fileInputRef.current?.click()}
          onCameraClick={() => cameraInputRef.current?.click()}
          onReanalyzeLive={handleReanalyzeLive}
          onOpenSequel={() => setIsSequelOpen(true)}
          onOpenShareCard={() => setIsShareOpen(true)}
        />
      </div>

      {/* Draggable Vertical Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        onPointerDown={handleStartResize}
        onDoubleClick={() => {
          setRailWidth(440);
          try {
            localStorage.setItem("desktea_rail_width", "440");
          } catch {
            // ignore
          }
        }}
        className="group relative z-30 -mx-1.5 hidden w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center lg:flex"
      >
        <div
          className={`h-full w-px transition-colors ${
            isResizingRail
              ? "bg-white/50"
              : "bg-transparent group-hover:bg-white/30"
          }`}
        />
        <div
          className={`absolute h-10 w-1 rounded-full transition-opacity ${
            isResizingRail
              ? "bg-white/80 opacity-100"
              : "bg-white/45 opacity-0 group-hover:opacity-100"
          }`}
        />
      </div>

      {/* Right Full-Height Resizable Chat Rail */}
      <div
        style={{ "--rail-w": `${railWidth}px` } as React.CSSProperties}
        className="w-full shrink-0 lg:h-full lg:w-[var(--rail-w)]"
      >
        <GroupChatPanel
          locale={locale}
          tone={tone}
          isBlankSession={isBlankSession}
          isLiveCamActive={isLiveCamActive}
          groupName={groupName}
          resentmentScore={resentmentScore}
          verdict={verdict}
          mostLikelyToLeave={mostLikelyToLeave}
          objects={objects}
          messages={messages}
          visibleCount={visibleCount}
          isScanning={isScanning}
          isStreaming={isStreaming}
          isReplying={isReplying || isLiveTurnRunning}
          isChattering={isChattering}
          autoChatEnabled={autoChatEnabled}
          canStepAway={
            hasBrokenIn &&
            !ownerSteppedAway &&
            !isBlankSession &&
            objects.filter((o) => !o.removed).length >= 2
          }
          activeObjectId={activeObjectId}
          selectedObjectId={selectedObjectId}
          speakingObjectId={speakingObjectId}
          quickReplies={[...quickReplies]}
          situationalPrompts={[...t.situationalPrompts]}
          onChangeTone={setTone}
          onToggleAutoChat={handleToggleAutoChat}
          onStepAway={handleStepAway}
          onHoverObject={setActiveObjectId}
          onSelectObject={setSelectedObjectId}
          onClearFilter={() => setSelectedObjectId(null)}
          onRevealAll={handleRevealAll}
          onHoverMessage={setHoveredMessageId}
          onSendOwnerMessage={handleSendOwnerMessage}
        />
      </div>

      {/* Global Drag & Drop Frosted Overlay */}
      {isDraggingWindow && (
        <div
          onDragLeave={() => setIsDraggingWindow(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-md"
        >
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-[var(--border-strong)] bg-[#131315]/95 px-12 py-14 text-center shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0A0A0A]">
              <Upload className="h-5 w-5" />
            </div>
            <div className="text-[18px] font-semibold text-[#FAFAFA]">
              {t.dropOverlayTitle}
            </div>
            <div className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">
              {t.dropOverlaySub}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleSelectFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleSelectFile(f);
          e.target.value = "";
        }}
      />

      <DeskSequelModal
        locale={locale}
        isOpen={isSequelOpen}
        isComparing={isComparing}
        beforeImageSrc={imageSrc}
        objects={objects}
        isLiveCamActive={isLiveCamActive}
        onCaptureFromLive={() =>
          videoRef.current ? captureVideoFrame(videoRef.current, 1024, 0.85) : null
        }
        onClose={() => setIsSequelOpen(false)}
        onSubmitAfter={handleSubmitAfter}
      />

      <ShareCardModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        locale={locale}
        imageSrc={afterImageSrc || imageSrc}
        groupName={groupName}
        resentmentScore={resentmentScore}
        mostLikelyToLeave={mostLikelyToLeave}
        objects={objects}
        messages={messages}
      />

      <EngineDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setDrawerPromptReason(null);
        }}
        locale={locale}
        health={health}
        promptReason={drawerPromptReason}
        agyModel={agyModel}
        apiKey={apiKey}
        onSave={handleSaveEngine}
      />
    </div>
  );
}
