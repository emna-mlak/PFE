import { Platform } from "react-native";

import { env } from "../config/env";

const REQUEST_TIMEOUT_MS = (() => {
  const raw = process.env.EXPO_PUBLIC_VOICE_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 10000) return parsed;
  return 60000;
})();

type RawVoiceCommandResponse = {
  status?: unknown;
  matricule?: unknown;
  typeInfraction?: unknown;
  description?: unknown;
  montant?: unknown;
  command_id?: unknown;
  stt_provider?: unknown;
  language?: unknown;
  stt_confidence?: unknown;
  command_confidence?: unknown;
};

export type VoiceCommandResponse = {
  status: "ok" | "error";
  matricule: string;
  typeInfraction: string;
  description: string;
  montant: number;
  command_id: string | null;
  stt_provider: string;
  language: string | null;
  stt_confidence: number;
  command_confidence: number;
};

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeApiBaseUrl(baseUrl?: string): string {
  const configured = [baseUrl, env.apiUrl, env.voiceApiUrl, env.pythonApiUrl]
    .map((value) => (value ?? "").trim())
    .find((value) => value.length > 0);
  if (!configured) {
    throw new Error(
      "URL API voix manquante. Configurez EXPO_PUBLIC_API_URL (ou EXPO_PUBLIC_PYTHON_API_URL) dans .env.",
    );
  }

  // Android emulator cannot reach localhost on host directly.
  if (Platform.OS === "android") {
    return configured.replace("://localhost", "://10.0.2.2").replace("://127.0.0.1", "://10.0.2.2");
  }
  return configured;
}

function parseVoiceCommandResponse(payload: RawVoiceCommandResponse): VoiceCommandResponse {
  const status = toStringValue(payload.status).toLowerCase() === "ok" ? "ok" : "error";
  return {
    status,
    matricule: toStringValue(payload.matricule).trim(),
    typeInfraction: toStringValue(payload.typeInfraction).trim(),
    description: toStringValue(payload.description).trim(),
    montant: toNumberValue(payload.montant),
    command_id: toNullableStringValue(payload.command_id),
    stt_provider: toStringValue(payload.stt_provider).trim(),
    language: toNullableStringValue(payload.language),
    stt_confidence: toNumberValue(payload.stt_confidence),
    command_confidence: toNumberValue(payload.command_confidence),
  };
}

function guessMimeType(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "webm":
      return "audio/webm";
    case "ogg":
      return "audio/ogg";
    case "m4a":
    default:
      return "audio/mp4";
  }
}

export async function uploadVoiceCommand(uri: string): Promise<VoiceCommandResponse> {
  const baseUrl = normalizeApiBaseUrl();
  const controller = new globalThis.AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append(
      "file",
      {
        uri,
        name: `voice-${Date.now()}.m4a`,
        type: guessMimeType(uri),
      } as unknown as Blob,
    );

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/voice-command`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Analyse vocale indisponible (${response.status}). ${details || response.statusText}`);
    }

    const raw = (await response.json()) as RawVoiceCommandResponse;
    if (process.env.NODE_ENV !== "production") {
      globalThis.console.log("voice-command raw response", raw);
    }

    const parsed = parseVoiceCommandResponse(raw);
    if (parsed.status !== "ok") {
      throw new Error("Le serveur a rejeté la commande vocale. Réessayez avec une phrase plus claire.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Délai dépassé lors de l'analyse vocale. Le premier traitement peut être plus long (chargement modèle). Réessayez ou augmentez EXPO_PUBLIC_VOICE_TIMEOUT_MS.",
        { cause: error },
      );
    }
    if (error instanceof Error && /network request failed|failed to fetch|load failed/i.test(error.message)) {
      throw new Error("Échec réseau. Vérifiez l'URL API et la connectivité, puis réessayez.", { cause: error });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
