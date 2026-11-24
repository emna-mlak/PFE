import { resolveBackendHttpBase } from "./alertsWsUrl";

const CAMERA_PATH = "/camera/mjpeg";

function explicitStreamUrl(): string | undefined {
  const u = process.env.EXPO_PUBLIC_CAMERA_STREAM_URL?.trim();
  if (u && (u.startsWith("http://") || u.startsWith("https://"))) return u;
  return undefined;
}

function proxyStreamUrl(): string | undefined {
  const u = process.env.EXPO_PUBLIC_CAMERA_PROXY_URL?.trim();
  if (u && (u.startsWith("http://") || u.startsWith("https://"))) return u;
  return undefined;
}

/**
 * URL affichée pour le flux caméra (MJPEG HTTP sur le backend Pi par défaut).
 *
 * Priorité :
 * 1. `EXPO_PUBLIC_CAMERA_STREAM_URL` si défini
 * 2. `EXPO_PUBLIC_CAMERA_PROXY_URL` (Chrome + localhost : `npm run proxy:camera`)
 * 3. Sinon `http://<BACKEND>/camera/mjpeg` (sauf `EXPO_PUBLIC_CAMERA_USE_BACKEND_MJPEG=0`)
 */
export function resolveCameraStreamUrl(): string | undefined {
  const explicit = explicitStreamUrl();
  if (explicit) return explicit;

  const viaProxy = proxyStreamUrl();
  if (viaProxy) return viaProxy;

  const disableBackend = process.env.EXPO_PUBLIC_CAMERA_USE_BACKEND_MJPEG?.trim() === "0";
  if (disableBackend) return undefined;

  const base = resolveBackendHttpBase();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}${CAMERA_PATH}`;
}
