import type { DashboardVehiclePayload } from "./types";

const PLATE_FIELD_KEYS = [
  "secondaryText",
  "matricule",
  "display",
  "plate",
  "plate_text",
  "plateText",
  "matriculeDisplay",
  "matriculeCompact",
  "matricule_display",
  "matricule_compact",
  "licensePlate",
  "immatriculation",
  "plateNumber",
  "plate_number",
] as const;

function normalizePlateValue(raw: unknown): string {
  const plate = String(raw ?? "").trim().toUpperCase();
  if (!plate || plate === "UNDEFINED" || plate === "NULL") return "";
  return plate;
}

function plateFromRecord(source: Record<string, unknown>): string {
  for (const key of PLATE_FIELD_KEYS) {
    const plate = normalizePlateValue(source[key]);
    if (plate) return plate;
  }
  return "";
}

export function pickPlateFromPayload(payload: DashboardVehiclePayload): string {
  const root = payload as Record<string, unknown>;
  const direct = plateFromRecord(root);
  if (direct) return direct;

  const nestedKeys = ["data", "vehicle", "result", "event", "payload", "glasses", "device"] as const;
  for (const key of nestedKeys) {
    const candidate = root[key];
    if (!candidate || typeof candidate !== "object") continue;
    const plate = plateFromRecord(candidate as Record<string, unknown>);
    if (plate) return plate;
  }

  return "";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Extrait lat/lng si présents sur le payload ou objets imbriqués (gps, location, etc.). */
export function pickCoordsFromPayload(payload: DashboardVehiclePayload): { latitude?: number; longitude?: number } {
  const tryObj = (o: Record<string, unknown> | null | undefined) => {
    if (!o || typeof o !== "object") return {};
    const lat =
      num(o.latitude) ??
      num(o.lat) ??
      num((o.gps as Record<string, unknown> | undefined)?.latitude) ??
      num((o.gps as Record<string, unknown> | undefined)?.lat) ??
      num((o.location as Record<string, unknown> | undefined)?.latitude) ??
      num((o.location as Record<string, unknown> | undefined)?.lat);
    const lng =
      num(o.longitude) ??
      num(o.lng) ??
      num(o.lon) ??
      num((o.gps as Record<string, unknown> | undefined)?.longitude) ??
      num((o.gps as Record<string, unknown> | undefined)?.lng) ??
      num((o.location as Record<string, unknown> | undefined)?.longitude) ??
      num((o.location as Record<string, unknown> | undefined)?.lng);
    return { lat, lng };
  };

  const a = tryObj(payload as Record<string, unknown>);
  if (a.lat != null && a.lng != null) return { latitude: a.lat, longitude: a.lng };

  for (const key of ["data", "vehicle", "result", "glasses", "device"] as const) {
    const nested = (payload as Record<string, unknown>)[key];
    if (!nested || typeof nested !== "object") continue;
    const b = tryObj(nested as Record<string, unknown>);
    if (b.lat != null && b.lng != null) return { latitude: b.lat, longitude: b.lng };
  }

  return {};
}

export function pickStatusFromPayload(payload: DashboardVehiclePayload): string {
  const explicitWanted = payload.vehiculeRecherche === true;
  const legacyVehiculeStatut = String(payload.statutVehicule ?? "")
    .trim()
    .toLowerCase();
  if (explicitWanted || legacyVehiculeStatut === "recherche") return "vehicule_recherche";

  const direct = String(payload.vehicleStatus ?? payload.status ?? "")
    .trim()
    .toLowerCase();
  if (direct === "recherche") return "vehicule_recherche";
  if (direct) return direct;

  const nestedCandidates = [payload.data, payload.vehicle, payload.result];
  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = candidate as Record<string, unknown>;
    if (source.vehiculeRecherche === true) return "vehicule_recherche";
    const nestedLegacy = String(source.statutVehicule ?? "")
      .trim()
      .toLowerCase();
    if (nestedLegacy === "recherche") return "vehicule_recherche";
    const nested = String(source.vehicleStatus ?? source.status ?? "")
      .trim()
      .toLowerCase();
    if (nested === "recherche") return "vehicule_recherche";
    if (nested) return nested;
  }

  return "inconnu";
}

/** Confiance OCR 0–100 depuis le payload ou objets imbriqués. */
export function pickConfidenceFromPayload(payload: DashboardVehiclePayload): number | undefined {
  const tryObj = (o: Record<string, unknown> | null | undefined) => {
    if (!o || typeof o !== "object") return undefined;
    const raw =
      o.confidence ??
      o.ocr_confidence ??
      o.ocrConfidence ??
      o.score ??
      (o.ocr as Record<string, unknown> | undefined)?.confidence ??
      (o.text as Record<string, unknown> | undefined)?.confidence;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
    if (!Number.isFinite(n)) return undefined;
    const x = n <= 1 && n >= 0 ? n * 100 : n;
    if (x < 0 || x > 100) return undefined;
    return Math.round(x);
  };

  const direct = tryObj(payload as Record<string, unknown>);
  if (direct != null) return direct;

  for (const key of ["data", "vehicle", "result", "glasses", "device"] as const) {
    const nested = (payload as Record<string, unknown>)[key];
    if (!nested || typeof nested !== "object") continue;
    const v = tryObj(nested as Record<string, unknown>);
    if (v != null) return v;
  }

  return undefined;
}
