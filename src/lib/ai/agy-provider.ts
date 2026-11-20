import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProxyEnv } from "./proxy";
import type { Box2D } from "./types";

export const DEFAULT_AGY_MODEL = process.env.DESKTEA_AGY_MODEL || "gemini-3.8-flash-low";

export interface AgyImageInput {
  filename: string;
  base64: string;
  mimeType?: string;
}

interface AgyEnvelope<T> {
  status?: string;
  response?: string;
  structured_output?: T;
  duration_seconds?: number;
  error?: string;
}

let cachedAgyPath: string | null | undefined;

export function findAgyBinary(): string | null {
  if (cachedAgyPath !== undefined) return cachedAgyPath;

  const localDefault = path.join(os.homedir(), "AppData", "Local", "agy", "bin", "agy.exe");
  if (process.platform === "win32" && fs.existsSync(localDefault)) {
    cachedAgyPath = localDefault;
    return cachedAgyPath;
  }

  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, ["agy"], { encoding: "utf8", windowsHide: true, timeout: 2500 });
    const first = out.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() || null;
    cachedAgyPath = first;
    return first;
  } catch {
    cachedAgyPath = null;
    return null;
  }
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

function mimeToExt(mimeType?: string): string {
  if (!mimeType) return ".jpg";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}

function stripDataUrlPrefix(base64: string): string {
  const commaIdx = base64.indexOf(",");
  if (base64.startsWith("data:") && commaIdx !== -1) {
    return base64.slice(commaIdx + 1);
  }
  return base64;
}

function extractJsonEnvelope<T>(stdout: string): AgyEnvelope<T> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Empty output from agy CLI");
  }
  try {
    return JSON.parse(trimmed) as AgyEnvelope<T>;
  } catch {
    // Fallback: search for last JSON line in stdout
    const lines = trimmed.split(/\r?\n/).reverse();
    for (const line of lines) {
      const candidate = line.trim();
      if (candidate.startsWith("{") && candidate.endsWith("}")) {
        return JSON.parse(candidate) as AgyEnvelope<T>;
      }
    }
    throw new Error(`Failed to parse agy JSON output: ${trimmed.slice(0, 300)}`);
  }
}

export async function runAgyStructured<T>(params: {
  prompt: string;
  schema: Record<string, unknown>;
  images?: AgyImageInput[];
  model?: string;
  timeoutMs?: number;
  buildPromptWithPaths?: (filePaths: string[]) => string;
}): Promise<{ data: T; model: string; durationMs: number }> {
  const binary = findAgyBinary();
  if (!binary) {
    throw new Error("Antigravity CLI (agy) was not found on this machine.");
  }

  const model = params.model || DEFAULT_AGY_MODEL;
  const timeoutMs = params.timeoutMs ?? 110_000;
  const startedAt = Date.now();
  const { env: proxyEnv } = resolveProxyEnv();

  let tempDir: string | null = null;
  const filePaths: string[] = [];

  try {
    if (params.images && params.images.length > 0) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktea-"));
      for (let i = 0; i < params.images.length; i++) {
        const img = params.images[i];
        const ext = path.extname(img.filename) || mimeToExt(img.mimeType);
        const safeBase = path.basename(img.filename, path.extname(img.filename)).replace(/[^a-zA-Z0-9_-]/g, "");
        const target = path.join(tempDir, `${safeBase || `desk-${i}`}${ext}`);
        const cleanB64 = stripDataUrlPrefix(img.base64);
        fs.writeFileSync(target, Buffer.from(cleanB64, "base64"));
        filePaths.push(target);
      }
    }

    const finalPrompt = params.buildPromptWithPaths
      ? params.buildPromptWithPaths(filePaths)
      : params.prompt;

    const args = [
      "-p",
      finalPrompt,
      "--model",
      model,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(params.schema),
      "--disable-slash-commands",
      "--effort",
      "low",
      "--print-timeout",
      `${Math.ceil(timeoutMs / 1000)}s`,
    ];

    if (tempDir) {
      args.push("--add-dir", tempDir, "--dangerously-skip-permissions");
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, {
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          ...proxyEnv,
        },
      });

      let out = "";
      let err = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill();
          } catch {
            // ignore kill error
          }
          reject(new Error(`agy CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
        }
      }, timeoutMs + 5000);

      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      child.on("error", (spawnErr) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(spawnErr);
        }
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code !== 0 && !out.trim()) {
          reject(new Error(`agy CLI exited with code ${code}: ${err.trim() || "unknown error"}`));
          return;
        }
        resolve(out);
      });
    });

    const envelope = extractJsonEnvelope<T>(stdout);
    if (envelope.status && envelope.status !== "SUCCESS") {
      throw new Error(`agy CLI status=${envelope.status}: ${envelope.error || envelope.response || "Failed"}`);
    }

    let parsed: T | undefined = envelope.structured_output;
    if (!parsed && envelope.response) {
      const cleanedResponse = envelope.response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      try {
        parsed = JSON.parse(cleanedResponse) as T;
      } catch (parseErr) {
        throw new Error(
          `agy CLI returned invalid JSON response: ${
            parseErr instanceof Error ? parseErr.message : "parse error"
          }`
        );
      }
    }
    if (!parsed) {
      throw new Error("agy CLI returned no structured_output — please verify agy CLI auth or try a Gemini API key in Settings.");
    }

    return {
      data: parsed,
      model,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
    }
  }
}
