import type { PlateReading } from "../../screens/dashboard/types";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SLOT_MS = 10 * 60_000;

function isUnpaidStatus(s: string): boolean {
  return s.toLowerCase() === "vignette_impayee" || s.toLowerCase().includes("impay");
}

function isWantedStatus(s: string): boolean {
  const x = s.toLowerCase();
  return x === "vehicule_recherche" || x.includes("recherche");
}

function isAlertStatus(s: string): boolean {
  return isUnpaidStatus(s) || isWantedStatus(s);
}

export type AnalyticsSnapshot = {
  detectionsPerHour: number;
  alertsPerDayWindow: number;
  /** 6 tranches de 10 min (dernière heure), ancien → récent. */
  detectionBuckets6: number[];
  /** Fenêtre 24 h sur les lectures en mémoire. */
  alertBars: { unpaid: number; wanted: number; other: number };
  topPlates: Array<{ plate: string; count: number }>;
  perfEventsPerSec: number;
};

export function buildAnalyticsSnapshot(
  readings: PlateReading[],
  now: number,
  eventsPerSec: number
): AnalyticsSnapshot {
  const hourAgo = now - HOUR_MS;
  const dayAgo = now - DAY_MS;

  const inHour = readings.filter((r) => r.ts >= hourAgo);
  const inDay = readings.filter((r) => r.ts >= dayAgo);

  const detectionsPerHour = inHour.length;
  const alertsPerDayWindow = inDay.filter((r) => isAlertStatus(r.status)).length;

  const detectionBuckets6: number[] = [];
  for (let i = 0; i < 6; i++) {
    const slotStart = now - (6 - i) * SLOT_MS;
    const slotEnd = now - (5 - i) * SLOT_MS;
    detectionBuckets6.push(readings.filter((r) => r.ts >= slotStart && r.ts < slotEnd).length);
  }

  let unpaid = 0;
  let wanted = 0;
  let other = 0;
  for (const r of inDay) {
    if (isUnpaidStatus(r.status)) unpaid += 1;
    else if (isWantedStatus(r.status)) wanted += 1;
    else other += 1;
  }

  const plateCount = new Map<string, number>();
  for (const r of readings) {
    if (!r.plate) continue;
    plateCount.set(r.plate, (plateCount.get(r.plate) ?? 0) + 1);
  }
  const topPlates = [...plateCount.entries()]
    .map(([plate, count]) => ({ plate, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    detectionsPerHour,
    alertsPerDayWindow,
    detectionBuckets6,
    alertBars: { unpaid, wanted, other },
    topPlates,
    perfEventsPerSec: eventsPerSec,
  };
}

export function maxInArray(values: number[]): number {
  const m = Math.max(0, ...values);
  return m > 0 ? m : 1;
}
