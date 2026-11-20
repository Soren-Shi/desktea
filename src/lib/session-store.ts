import type { DeskSession } from "./ai/types";
import { CURATED_SAMPLES } from "./samples";

const VALID_SAMPLE_IDS = new Set(CURATED_SAMPLES.map((s) => s.id));

const LEGACY_DB_NAME = "desktea_sessions_v1";
const DB_NAME = "desktea_sessions_v2";
const STORE_NAME = "state";
const RECORD_KEY = "sessions";
const MAX_STORED_SESSIONS = 10;

let clearedLegacyDb = false;

function purgeLegacyDatabase() {
  if (clearedLegacyDb || typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }
  clearedLegacyDb = true;
  try {
    window.indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    // ignore cleanup failures
  }
}

interface StoredState {
  sessions: DeskSession[];
  currentSessionId: string | null;
  updatedAt: number;
}

function openSessionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open error"));
  });
}

export async function loadSavedSessions(): Promise<{
  sessions: DeskSession[];
  currentSessionId: string | null;
} | null> {
  purgeLegacyDatabase();
  try {
    const db = await openSessionDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => {
        const val = req.result as StoredState | undefined;
        db.close();
        if (!val || !Array.isArray(val.sessions) || val.sessions.length === 0) {
          resolve(null);
          return;
        }
        const sanitized = val.sessions.filter(
          (s) => !s.activeSampleId || VALID_SAMPLE_IDS.has(s.activeSampleId)
        );
        if (sanitized.length === 0) {
          resolve(null);
          return;
        }
        const validCurrent = sanitized.some((s) => s.id === val.currentSessionId)
          ? val.currentSessionId
          : sanitized[0].id;
        resolve({
          sessions: sanitized,
          currentSessionId: validCurrent,
        });
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function saveSessionsToDb(
  sessions: DeskSession[],
  currentSessionId: string
): Promise<void> {
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const trimmed = sessions.slice(0, MAX_STORED_SESSIONS);
      const payload: StoredState = {
        sessions: trimmed,
        currentSessionId,
        updatedAt: Date.now(),
      };
      store.put(payload, RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore storage failures (e.g., strict private browsing)
  }
}

export async function clearAllSessionsFromDb(): Promise<void> {
  purgeLegacyDatabase();
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore storage failures
  }
}
