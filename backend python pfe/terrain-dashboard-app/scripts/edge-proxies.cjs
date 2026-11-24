/**
 * Un seul terminal : proxy WebSocket alertes (:8765) + proxy HTTP MJPEG caméra (:8780).
 * Usage : npm run proxy:all
 *
 * Lit CAMERA_UPSTREAM depuis terrain-dashboard-app/.env si présent.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const envPath = path.join(appRoot, ".env");

function loadCameraUpstreamFromDotenv() {
  if (process.env.CAMERA_UPSTREAM) return;
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== "CAMERA_UPSTREAM") continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) process.env.CAMERA_UPSTREAM = val;
    break;
  }
}

loadCameraUpstreamFromDotenv();

const dir = __dirname;
const node = process.execPath;
const upstream = process.env.CAMERA_UPSTREAM || "http://10.42.0.1:8001/camera/mjpeg";

const children = [
  spawn(node, [path.join(dir, "alerts-ws-proxy.cjs")], { stdio: "inherit", env: process.env }),
  spawn(node, [path.join(dir, "camera-mjpeg-proxy.cjs")], { stdio: "inherit", env: process.env }),
];

let closing = false;

function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const c of children) {
    if (c && !c.killed) {
      try {
        c.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code ?? 0), 200);
}

for (const c of children) {
  c.on("exit", (code, signal) => {
    if (closing) return;
    if (signal === "SIGTERM" || signal === "SIGINT") return;
    if (code === 0) return;
    console.error(`[edge-proxies] un proxy s'est arrêté (code ${code}, signal ${signal || "none"}).`);
    shutdown(code || 1);
  });
}

process.on("SIGINT", () => {
  console.log("\n[edge-proxies] arrêt…");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

console.log(
  `[edge-proxies] démarrage : alertes ws://127.0.0.1:8765 + caméra http://127.0.0.1:8780/camera/mjpeg → ${upstream} (Ctrl+C pour quitter)`
);
