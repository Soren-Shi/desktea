import { execFileSync } from "node:child_process";

let cachedWinProxy: string | null | undefined = undefined;

function normalizeProxyUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Handle Windows WinINET format like "http=127.0.0.1:7897;https=127.0.0.1:7897"
  if (trimmed.includes("=")) {
    const parts = trimmed.split(";").map((s) => s.trim());
    const httpsPart = parts.find((p) => p.toLowerCase().startsWith("https="));
    const httpPart = parts.find((p) => p.toLowerCase().startsWith("http="));
    const chosen = (httpsPart || httpPart || parts[0]).split("=")[1]?.trim();
    if (!chosen) return null;
    return /^https?:\/\//i.test(chosen) ? chosen : `http://${chosen}`;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function detectWindowsProxy(): string | null {
  if (cachedWinProxy !== undefined) return cachedWinProxy;
  if (process.platform !== "win32") {
    cachedWinProxy = null;
    return null;
  }

  try {
    const output = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"],
      { encoding: "utf8", windowsHide: true, timeout: 2000 }
    );
    const enabledMatch = output.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    const serverMatch = output.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    const enabled = enabledMatch && parseInt(enabledMatch[1], 16) === 1;
    if (enabled && serverMatch) {
      cachedWinProxy = normalizeProxyUrl(serverMatch[1]);
      return cachedWinProxy;
    }
  } catch {
    // Ignore registry read failure
  }
  cachedWinProxy = null;
  return null;
}

export function resolveProxyEnv(): { env: Record<string, string>; proxyUrl: string | null } {
  const explicit =
    process.env.DESKTEA_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;

  const proxyUrl = explicit ? normalizeProxyUrl(explicit) : detectWindowsProxy();
  if (!proxyUrl) {
    return { env: {}, proxyUrl: null };
  }

  return {
    proxyUrl,
    env: {
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    },
  };
}
