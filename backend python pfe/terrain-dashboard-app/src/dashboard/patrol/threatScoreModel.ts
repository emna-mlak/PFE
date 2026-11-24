import type { PlateReading } from "../../screens/dashboard/types";

export type ThreatFactor = {
  priority: number;
  label: string;
};

function isWanted(s: string): boolean {
  const x = s.toLowerCase();
  return x === "vehicule_recherche" || x.includes("recherche");
}

function isUnpaid(s: string): boolean {
  const x = s.toLowerCase();
  return x === "vignette_impayee" || x.includes("impay");
}

function withinMs(ts: number, now: number, ms: number): boolean {
  return now - ts <= ms;
}

/**
 * Score 0–100 + facteurs (priorité décroissante, max 3 affichés côté UI).
 * Données = tampon `readings` (session) — pas de backend dédié requis.
 */
export function computeThreatScore(readings: PlateReading[], now: number): { score: number; factors: ThreatFactor[] } {
  const factors: ThreatFactor[] = [];
  let score = 6;

  const last5m = readings.filter((r) => withinMs(r.ts, now, 5 * 60_000)).length;
  score += Math.min(10, last5m);

  const wanted = readings.filter((r) => isWanted(r.status));
  if (wanted.length > 0) {
    const bump = Math.min(42, 22 + wanted.length * 6);
    score += bump;
    factors.push({ priority: 95, label: "Corresp. liste" });
  }

  const unpaid1h = readings.filter((r) => withinMs(r.ts, now, 60 * 60_000) && isUnpaid(r.status)).length;
  if (unpaid1h > 0) {
    score += Math.min(28, 8 + unpaid1h * 5);
    factors.push({ priority: 72, label: "Impayés actifs" });
  }

  const last15 = readings.filter((r) => withinMs(r.ts, now, 15 * 60_000));
  const byPlate = new Map<string, number>();
  for (const r of last15) {
    byPlate.set(r.plate, (byPlate.get(r.plate) ?? 0) + 1);
  }
  const maxRep = Math.max(0, ...byPlate.values());
  if (maxRep >= 3) {
    score += 24;
    factors.push({ priority: 68, label: "Répétition" });
  }

  const gps20 = readings.filter(
    (r) => withinMs(r.ts, now, 20 * 60_000) && r.latitude != null && r.longitude != null
  ).length;
  if (gps20 >= 4) {
    score += 18;
    factors.push({ priority: 55, label: "Zone dense" });
  }

  const lowOcr = readings
    .filter((r) => typeof r.confidence === "number" && withinMs(r.ts, now, 10 * 60_000))
    .slice(0, 8);
  if (lowOcr.length >= 3) {
    const avg = lowOcr.reduce((a, r) => a + (r.confidence as number), 0) / lowOcr.length;
    if (avg < 58) {
      score += 14;
      factors.push({ priority: 48, label: "OCR fragile" });
    }
  }

  if (readings.length > 0 && factors.length === 0) {
    factors.push({ priority: 10, label: "Veille standard" });
  }

  const sorted = [...factors].sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const top3: ThreatFactor[] = [];
  for (const f of sorted) {
    if (top3.length >= 3) break;
    if (seen.has(f.label)) continue;
    seen.add(f.label);
    top3.push(f);
  }

  return { score: Math.min(100, Math.round(score)), factors: top3 };
}

export function threatScoreColor(score: number): { main: string; glow: string; track: string } {
  if (score <= 34) return { main: "#22C55E", glow: "rgba(34,197,94,0.35)", track: "rgba(34,197,94,0.2)" };
  if (score <= 64) return { main: "#F59E0B", glow: "rgba(245,158,11,0.4)", track: "rgba(245,158,11,0.22)" };
  return { main: "#EF4444", glow: "rgba(239,68,68,0.45)", track: "rgba(239,68,68,0.22)" };
}
