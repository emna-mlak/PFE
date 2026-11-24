import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const DEFAULT_PORT = 8000;
const PATH = "/alerts";

const LS_WS_URL = "terrain_ws_url";
const LS_BACKEND_HOST = "terrain_backend_host";

/**
 * Si l’UI est ouverte via l’IP LAN du Mac (ex. http://192.168.x.x:8081), une URL
 * `ws://127.0.0.1:8765` désignerait la boucle locale du client — pas le proxy Node.
 * On substitue alors par le même hôte que la page (le Mac qui exécute Metro).
 */
function adaptLoopbackWsUrlForWebBrowser(wsUrl: string): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return wsUrl;
  const pageHost = window.location.hostname;
  if (!pageHost || pageHost === "localhost" || pageHost === "127.0.0.1") {
    return wsUrl;
  }
  try {
    const u = new URL(wsUrl);
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
      return wsUrl;
    }
    u.hostname = pageHost;
    return u.href;
  } catch {
    return wsUrl;
  }
}

/**
 * Expo Go exposes the packager host (often your Mac's LAN IP). Use it so a physical
 * phone does not connect to ws://127.0.0.1 (which is the phone itself).
 */
function hostFromExpoDebugger(): string | null {
  const dbg =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    // Legacy manifest (older Expo / edge cases)
    (Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost;
  if (!dbg || typeof dbg !== "string") return null;
  const host = dbg.split(":")[0]?.trim();
  if (!host || host === "localhost") return null;
  return host;
}

/**
 * React Native exposes the bundle URL, which includes Metro host on device.
 * Example: http://192.168.1.10:8081/index.bundle?platform=ios...
 */
function hostFromBundleUrl(): string | null {
  const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
  if (!scriptURL || typeof scriptURL !== "string") return null;
  const match = scriptURL.match(/^https?:\/\/([^/:?#]+)(?::\d+)?/i);
  const host = match?.[1]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

/**
 * Web-only: ?ws=ws://host:8000/alerts or ?backend=192.168.x.x (no rebuild needed).
 * Also reads localStorage set manually or by saveAlertsBackendHost().
 */
export function readWebRuntimeOverride(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const wsFull = q.get("ws")?.trim();
    if (wsFull) return wsFull;
    const backend = q.get("backend")?.trim();
    if (backend) return `ws://${backend}:${DEFAULT_PORT}${PATH}`;
    const lsWs = window.localStorage.getItem(LS_WS_URL)?.trim();
    if (lsWs) return lsWs;
    const lsHost = window.localStorage.getItem(LS_BACKEND_HOST)?.trim();
    if (lsHost) return `ws://${lsHost}:${DEFAULT_PORT}${PATH}`;
  } catch {
    /* private mode / SSR */
  }
  return null;
}

/** Persist Pi / backend host for web so reload works without query string. */
export function saveAlertsBackendHost(host: string): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const h = host.trim();
    if (!h) return;
    window.localStorage.setItem(LS_BACKEND_HOST, h);
  } catch {
    /* ignore */
  }
}

const API_PORT = Number(process.env.EXPO_PUBLIC_API_PORT || "8000") || 8000;

/**
 * Hôte LAN du backend FastAPI (sans schéma ni port) — partagé WebSocket + URL caméra MJPEG.
 */
export function resolveBackendLanHostname(): string | undefined {
  const backendHostEnv = process.env.EXPO_PUBLIC_BACKEND_HOST?.trim();
  if (backendHostEnv) return backendHostEnv;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("backend")?.trim();
      if (q) return q;
      const lsHost = window.localStorage.getItem(LS_BACKEND_HOST)?.trim();
      if (lsHost) return lsHost;
    } catch {
      /* ignore */
    }
    const h = window.location.hostname;
    if (h && h !== "localhost" && h !== "127.0.0.1") {
      return h;
    }
  }

  const host = hostFromExpoDebugger();
  if (host) return host;

  const bundleHost = hostFromBundleUrl();
  if (bundleHost) return bundleHost;

  return undefined;
}

/** Base HTTP du backend (ex. `http://192.168.1.10:8000`) pour caméra MJPEG, etc. */
export function resolveBackendHttpBase(): string | undefined {
  const host = resolveBackendLanHostname();
  if (!host) return undefined;
  return `http://${host}:${API_PORT}`;
}

/**
 * Resolved WebSocket URL for `/alerts`.
 *
 * Web (Expo on Mac, API on Raspberry Pi):
 * - Use `EXPO_PUBLIC_WS_URL` or `EXPO_PUBLIC_BACKEND_HOST` in `.env`, restart Metro with `--clear`
 * - Or open `http://localhost:8081/?backend=IP_DE_LA_PI` (no rebuild)
 *
 * Order:
 * 1. `EXPO_PUBLIC_WS_URL`
 * 2. Web: query string / localStorage override
 * 3. `EXPO_PUBLIC_BACKEND_HOST`
 * 4. Web + non-local page hostname → same host as UI :8000
 * 5. Web + localhost → ws://127.0.0.1 (API must run locally)
 * 6. Native: debugger / bundle / fallback
 */
export function resolveAlertsWsUrl(): string {
  const explicitRaw = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (explicitRaw) {
    return adaptLoopbackWsUrlForWebBrowser(explicitRaw);
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const override = readWebRuntimeOverride();
    if (override) return override;

    const h = window.location.hostname;
    if (h && h !== "localhost" && h !== "127.0.0.1") {
      return `ws://${h}:${DEFAULT_PORT}${PATH}`;
    }

    const backendHostEnv = process.env.EXPO_PUBLIC_BACKEND_HOST?.trim();
    if (backendHostEnv) {
      return `ws://${backendHostEnv}:${DEFAULT_PORT}${PATH}`;
    }

    return `ws://127.0.0.1:${DEFAULT_PORT}${PATH}`;
  }

  const lanHost = resolveBackendLanHostname();
  if (lanHost) {
    return `ws://${lanHost}:${DEFAULT_PORT}${PATH}`;
  }

  return `ws://127.0.0.1:${DEFAULT_PORT}${PATH}`;
}
