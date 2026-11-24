/**
 * Pont WebSocket local pour le dashboard (Chrome sur localhost → Pi en 10.x).
 * Chrome peut fermer en 1006 les WS vers une IP RFC1918 depuis une page localhost
 * (Private Network Access). Ce proxy écoute en local et relaie vers la Raspberry.
 *
 * Usage :
 *   ALERTS_UPSTREAM=ws://10.42.0.1:8000/alerts node scripts/alerts-ws-proxy.cjs
 * Puis dans .env Expo : EXPO_PUBLIC_WS_URL=ws://127.0.0.1:8765
 *
 * Optionnel : ALERTS_UPSTREAM_CONNECT_MS (défaut 15000) si le handshake WS vers la Pi est lent.
 */
const { WebSocketServer, WebSocket } = require("ws");

const UPSTREAM = process.env.ALERTS_UPSTREAM || "ws://10.42.0.1:8000/alerts";
const UPSTREAM_CONNECT_MS = Number(process.env.ALERTS_UPSTREAM_CONNECT_MS || 15000);
const PORT = Number(process.env.ALERTS_PROXY_PORT || 8765);
/** Écouter sur toutes les interfaces pour les connexions depuis le téléphone / IP LAN du Mac. */
const HOST = process.env.ALERTS_PROXY_HOST || "0.0.0.0";

const wss = new WebSocketServer({ port: PORT, host: HOST });
const bindHint =
  HOST === "0.0.0.0" || HOST === "::"
    ? `ws://127.0.0.1:${PORT} (et ws://<IP_LAN_MAC>:${PORT} si l’UI n’est pas sur localhost)`
    : `ws://${HOST}:${PORT}`;

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[alerts-ws-proxy] le port ${PORT} est déjà utilisé (ancienne instance du proxy ou autre programme).\n` +
        `  Libérer : lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
        `            kill <PID>\n` +
        `  Ou autre port : ALERTS_PROXY_PORT=8766 npm run proxy:alerts\n` +
        `                  puis dans .env : EXPO_PUBLIC_WS_URL=ws://127.0.0.1:8766`
    );
  } else {
    console.error("[alerts-ws-proxy]", err.message);
  }
  process.exit(1);
});

wss.on("listening", () => {
  console.log(`[alerts-ws-proxy] écoute ${bindHint} -> upstream ${UPSTREAM}`);
});

wss.on("connection", (client, req) => {
  const from = req.socket.remoteAddress || "?";
  console.log(`[alerts-ws-proxy] client ${from} connecté, tentative upstream ${UPSTREAM}…`);
  const upstream = new WebSocket(UPSTREAM);
  const clientQueue = [];
  let upstreamReady = false;

  let upstreamHint = UPSTREAM;
  try {
    const u = new URL(UPSTREAM);
    upstreamHint = `http://${u.hostname}:${u.port || "80"}`;
  } catch {
    /* ignore */
  }

  const connectTimer = setTimeout(() => {
    if (upstreamReady || upstream.readyState === WebSocket.CLOSED) return;
    console.error(
      `[alerts-ws-proxy] pas de handshake WebSocket vers l’upstream après ${UPSTREAM_CONNECT_MS} ms (${UPSTREAM}).\n` +
        `  HTTP depuis le Mac : curl -sS -o /dev/null -w "HTTP %{http_code}\\n" ${upstreamHint}/docs\n` +
        `  Sur la Pi : uvicorn doit écouter sur 0.0.0.0:8000 ; vérifiez le pare-feu et ALERTS_UPSTREAM.\n` +
        `  Délai : ALERTS_UPSTREAM_CONNECT_MS=${UPSTREAM_CONNECT_MS * 2} npm run proxy:alerts`
    );
    try {
      upstream.terminate();
    } catch {
      /* ignore */
    }
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }, UPSTREAM_CONNECT_MS);

  const flushQueue = () => {
    while (clientQueue.length && upstream.readyState === WebSocket.OPEN) {
      const item = clientQueue.shift();
      upstream.send(item.data, { binary: item.isBinary });
    }
  };

  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      clientQueue.push({ data, isBinary });
    }
  });

  upstream.on("open", () => {
    upstreamReady = true;
    clearTimeout(connectTimer);
    console.log(`[alerts-ws-proxy] upstream OK pour ${from}`);
    flushQueue();
  });

  upstream.on("unexpected-response", (_req, res) => {
    clearTimeout(connectTimer);
    console.error(
      `[alerts-ws-proxy] upstream HTTP ${res.statusCode} ${res.statusMessage} — attendu 101 Switching Protocols pour ${UPSTREAM}`
    );
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  const closeBoth = () => {
    try {
      client.close();
    } catch {
      /* ignore */
    }
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
  };

  client.on("close", closeBoth);
  client.on("error", (e) => {
    console.error("[alerts-ws-proxy] client error:", e.message);
    closeBoth();
  });
  upstream.on("close", () => {
    clearTimeout(connectTimer);
    closeBoth();
  });
  upstream.on("error", (e) => {
    clearTimeout(connectTimer);
    console.error(
      "[alerts-ws-proxy] upstream error (vérifiez Pi, uvicorn 0.0.0.0:8000, ALERTS_UPSTREAM):",
      e.message
    );
    closeBoth();
  });
});
