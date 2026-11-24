/**
 * Proxy HTTP MJPEG : Chrome sur http://localhost:8081 bloque souvent les images
 * vers une IP privée (Private Network Access). Ce serveur écoute en local et
 * relaie le flux multipart vers la Pi.
 *
 * Terminal : npm run proxy:camera — ou npm run proxy:all (alertes + caméra).
 * (optionnel) CAMERA_UPSTREAM=http://10.42.0.1:8000/camera/mjpeg  (FastAPI si picamera2 dans le venv)
 * Défaut Pi Trixie + Paddle venv : sidecar Picamera2 port 8001 (terrain-camera-mjpeg.service)
 * (optionnel) CAMERA_UPSTREAM_CONNECT_MS=120000 — délai max avant la 1re réponse Pi (MJPEG peut dépasser 60 s au 1er frame)
 *
 * .env Expo : EXPO_PUBLIC_CAMERA_PROXY_URL=http://127.0.0.1:8780/camera/mjpeg
 *
 * Test sans attendre le flux : curl -sS http://127.0.0.1:8780/health
 */
const http = require("http");
const https = require("https");
const { URL } = require("url");

const UPSTREAM = process.env.CAMERA_UPSTREAM || "http://10.42.0.1:8001/camera/mjpeg";
const PORT = Number(process.env.CAMERA_PROXY_PORT || "8780");
const HOST = process.env.CAMERA_PROXY_HOST || "127.0.0.1";
const CONNECT_MS = Number(process.env.CAMERA_UPSTREAM_CONNECT_MS || "120000");

const upstreamUrl = new URL(UPSTREAM);
const useHttps = upstreamUrl.protocol === "https:";
const clientLib = useHttps ? https : http;

const corsJson = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
};

const server = http.createServer((req, res) => {
  const path = (req.url || "").split("?")[0];

  if (path === "/camera/mjpe") {
    res.writeHead(301, { Location: "/camera/mjpeg", "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }

  if (path === "/health") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, corsJson);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(
        JSON.stringify({
          ok: true,
          service: "camera-mjpeg-proxy",
          listen: `${HOST}:${PORT}`,
          upstream: UPSTREAM,
          connect_timeout_ms: CONNECT_MS,
        })
      );
      return;
    }
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("GET /health ou HEAD\n");
    return;
  }

  if (path !== "/camera/mjpeg" && path !== "/") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("GET /health  ou  GET /camera/mjpeg\n");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Méthode non autorisée (utilisez GET).\n");
    return;
  }

  const port = upstreamUrl.port ? Number(upstreamUrl.port) : useHttps ? 443 : 80;
  const opts = {
    hostname: upstreamUrl.hostname,
    port,
    path: upstreamUrl.pathname + upstreamUrl.search,
    method: "GET",
    headers: {
      Accept: "multipart/x-mixed-replace, image/jpeg, */*",
    },
  };

  const upstreamReq = clientLib.request(opts, (upRes) => {
    upstreamReq.setTimeout(0);
    if (req.method === "HEAD") {
      const headers = { ...upRes.headers };
      delete headers.connection;
      headers["access-control-allow-origin"] = "*";
      res.writeHead(upRes.statusCode || 502, headers);
      res.end();
      upRes.resume();
      return;
    }
    const headers = { ...upRes.headers };
    delete headers.connection;
    headers["access-control-allow-origin"] = "*";
    headers["access-control-allow-methods"] = "GET, HEAD, OPTIONS";
    res.writeHead(upRes.statusCode || 502, headers);
    upRes.pipe(res);
  });

  upstreamReq.setTimeout(CONNECT_MS, () => {
    if (!res.headersSent) {
      res.writeHead(504, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        `[camera-mjpeg-proxy] aucune réponse HTTP de la Pi dans les ${CONNECT_MS} ms.\n` +
          `  Upstream : ${UPSTREAM}\n\n` +
          `  Vérifications :\n` +
          `  • Mac connecté au Wi‑Fi du Pi (RPi-Hotspot), puis : ping 10.42.0.1\n` +
          `  • Depuis le Mac : curl -sS --max-time 5 http://10.42.0.1:8000/health\n` +
          `  • Test HEAD MJPEG (réponse immédiate si le backend est à jour) : curl -sS -I --max-time 5 http://10.42.0.1:8000/camera/mjpeg\n` +
          `  • 504 = délai dépassé : relancer le proxy avec CAMERA_UPSTREAM_CONNECT_MS=180000 npm run proxy:all\n` +
          `  • URL exacte du flux : http://127.0.0.1:${PORT}/camera/mjpeg\n`
      );
    }
    upstreamReq.destroy();
  });

  upstreamReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(`[camera-mjpeg-proxy] upstream: ${err.message}\n`);
    }
  });

  upstreamReq.end();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[camera-mjpeg-proxy] port ${PORT} déjà utilisé. Essayez CAMERA_PROXY_PORT=8781 npm run proxy:camera`
    );
  } else {
    console.error("[camera-mjpeg-proxy]", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[camera-mjpeg-proxy] connect_timeout_ms=${CONNECT_MS} upstream=${UPSTREAM}`);
  console.log(`[camera-mjpeg-proxy] http://${HOST}:${PORT}/health  (test rapide)`);
  console.log(`[camera-mjpeg-proxy] http://${HOST}:${PORT}/camera/mjpeg -> ${UPSTREAM}`);
});
