import type { VehicleBackendResult } from "../types/vehicle";

type RealtimeHandlers = {
  onVehicleEvent: (payload: VehicleBackendResult) => void;
  onStatus?: (status: "connecting" | "open" | "closed" | "error") => void; // optional
  onError?: (error: unknown) => void;
};

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly wsUrl: string,
    private readonly handlers: RealtimeHandlers
  ) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect() {
    this.handlers.onStatus?.("connecting");
    let opened = false;
    const connectionTimer = setTimeout(() => {
      if (!opened && this.ws && this.ws.readyState !== WebSocket.OPEN) {
        this.handlers.onError?.(
          new Error(
            `Delai depasse (>10s) pour ${this.wsUrl}. Verifiez IP Pi, port 8000, pare-feu, et ?backend=IP dans l'URL.`
          )
        );
        try {
          this.ws.close();
        } catch {
          /* ignore */
        }
      }
    }, 10_000);

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      opened = true;
      clearTimeout(connectionTimer);
      this.handlers.onStatus?.("open");
      // Le backend FastAPI attend receive_text() en boucle : envoyer un texte évite un WS « coincé » côté certains proxies / gardes idle.
      try {
        this.ws?.send("ping");
      } catch {
        /* ignore */
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data));
        this.handlers.onVehicleEvent(parsed);
      } catch (error) {
        this.handlers.onError?.(error);
      }
    };

    this.ws.onerror = () => {
      clearTimeout(connectionTimer);
      this.handlers.onStatus?.("error");
      this.handlers.onError?.(
        new Error(`Erreur WebSocket vers ${this.wsUrl} (verifiez que uvicorn ecoute sur 0.0.0.0:8000)`)
      );
    };

    this.ws.onclose = (ev) => {
      clearTimeout(connectionTimer);
      this.handlers.onStatus?.("closed");
      this.ws = null;
      if (this.stopped) return;
      // Codes utiles : 1006 = fermeture anormale (souvent reseau / pare-feu)
      if (ev.code === 1006 || ev.code === 1002) {
        const proxyHint = this.wsUrl.includes(":8765")
          ? " Lancez dans terrain-dashboard-app : `npm run proxy:all` (recommandé) ou `npm run proxy:alerts`. Sans processus sur le port 8765, le navigateur coupe en 1006. Test : `nc -zv 127.0.0.1 8765`."
          : "";
        const chromeHint =
          this.wsUrl.includes("10.") || this.wsUrl.includes("192.168.")
            ? " Chrome depuis localhost bloque souvent les WS vers une IP privée : essayez Firefox, ou `npm run proxy:alerts` + EXPO_PUBLIC_WS_URL=ws://127.0.0.1:8765"
            : "";
        this.handlers.onError?.(
          new Error(`WebSocket coupe (code ${ev.code}) — ${this.wsUrl}.${proxyHint}${chromeHint}`)
        );
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 1500);
    };
  }
}