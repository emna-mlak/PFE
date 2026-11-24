import type { PlateReading } from "../../screens/dashboard/types";

export type TimelineTone = "critical" | "warn" | "success" | "info" | "muted";

export type TimelineDisplayRow = {
  id: string;
  ts: number;
  icon: string;
  timeLabel: string;
  /** Plaque affichée en entier (pas de troncature). */
  plate: string;
  statusLabel: string;
  tone: TimelineTone;
};

const DEDUP_MS = 12_000;

export type BuildTimelineOptions = {
  maxItems: number;
  /** Limite les lignes « OK / payé » pour réduire le bruit visuel. */
  maxOkRows: number;
};

function statusBucket(s: string): "critical" | "warn" | "ok" | "other" {
  const x = s.toLowerCase();
  if (x === "vignette_impayee" || x.includes("impay")) return "critical";
  if (x === "vehicule_recherche" || x.includes("recherche")) return "warn";
  if (x === "vignette_payee" || x === "ok" || x.includes("payee") || x.includes("payé")) return "ok";
  return "other";
}

function hasGps(r: PlateReading): boolean {
  return r.latitude != null && r.longitude != null && Number.isFinite(r.latitude) && Number.isFinite(r.longitude);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatPlateFull(plate: string): string {
  return plate.trim().toUpperCase() || "—";
}

/** Icône + libellé statut ; la plaque est portée à part pour affichage intégral. */
export function plateReadingToTimelineParts(r: PlateReading): {
  icon: string;
  plate: string;
  statusLabel: string;
  tone: TimelineTone;
} {
  const b = statusBucket(r.status);
  const gps = hasGps(r);
  const plate = formatPlateFull(r.plate || "—");

  if (b === "critical") {
    return { icon: "⚠️", plate, statusLabel: "Impayé", tone: "critical" };
  }
  if (b === "warn") {
    return { icon: "🚨", plate, statusLabel: "Recherché", tone: "warn" };
  }
  if (b === "ok") {
    if (gps) return { icon: "📍", plate, statusLabel: "OK+GPS", tone: "success" };
    return { icon: "✅", plate, statusLabel: "OK", tone: "success" };
  }
  if (gps) {
    return { icon: "📍", plate, statusLabel: "GPS", tone: "info" };
  }
  if (b === "other" && (r.status === "inconnu" || r.status.toLowerCase().includes("indisp"))) {
    return { icon: "❔", plate, statusLabel: "Indispo", tone: "muted" };
  }
  return { icon: "🚗", plate, statusLabel: "Détection", tone: "info" };
}

/**
 * Filtre anti-bruit + priorité aux événements récents.
 * - Tri : plus récent en premier.
 * - Supprime les doublons même plaque + même famille de statut si un événement plus récent existe dans la fenêtre DEDUP_MS.
 * - Plafonne les lignes « OK » pour laisser la place aux alertes / GPS.
 */
export function buildFilteredTimeline(readings: PlateReading[], options: BuildTimelineOptions): TimelineDisplayRow[] {
  const { maxItems, maxOkRows } = options;
  const sorted = [...readings].sort((a, b) => b.ts - a.ts);

  const accepted: PlateReading[] = [];
  let okKept = 0;

  for (const r of sorted) {
    if (accepted.length >= maxItems) break;

    const b = statusBucket(r.status);
    if (b === "ok" && okKept >= maxOkRows) continue;

    const dup = accepted.some(
      (a) =>
        a.plate === r.plate &&
        statusBucket(a.status) === b &&
        a.ts > r.ts &&
        a.ts - r.ts < DEDUP_MS
    );
    if (dup) continue;

    accepted.push(r);
    if (b === "ok") okKept += 1;
  }

  return accepted.map((r) => {
    const { icon, plate, statusLabel, tone } = plateReadingToTimelineParts(r);
    return {
      id: r.id,
      ts: r.ts,
      icon,
      timeLabel: formatTime(r.ts),
      plate,
      statusLabel,
      tone,
    };
  });
}
