import type { PlateReading, SortMode, StatusFilter, UnpaidEntry } from "./types";

export function filterReadings(readings: PlateReading[], statusFilter: StatusFilter, normalizedSearch: string): PlateReading[] {
  return readings.filter((item) => {
    if (statusFilter === "unpaid" && item.status !== "vignette_impayee") return false;
    if (statusFilter === "ok" && item.status !== "ok" && item.status !== "vignette_payee") return false;
    if (statusFilter === "unavailable" && item.status !== "indisponible" && item.status !== "inconnu") return false;
    if (!normalizedSearch) return true;
    return item.plate.includes(normalizedSearch);
  });
}

export function sortReadings(readings: PlateReading[], sortMode: SortMode): PlateReading[] {
  if (sortMode === "recent") return readings;
  return [...readings].sort((a, b) => a.ts - b.ts);
}

export function computeCounters(readings: PlateReading[], shown: number) {
  const unpaid = readings.filter((r) => r.status === "vignette_impayee").length;
  const ok = readings.filter((r) => r.status === "ok" || r.status === "vignette_payee").length;
  const unavailable = readings.filter((r) => r.status === "indisponible" || r.status === "inconnu").length;
  return {
    total: readings.length,
    unpaid,
    ok,
    unavailable,
    shown,
  };
}

export function computeUnpaidEntries(readings: PlateReading[], treatedPlates: Record<string, true>): UnpaidEntry[] {
  const byPlate = new Map<string, { count: number; lastSeenTs: number }>();
  for (const item of readings) {
    if (item.status !== "vignette_impayee") continue;
    const existing = byPlate.get(item.plate);
    if (!existing) {
      byPlate.set(item.plate, { count: 1, lastSeenTs: item.ts });
    } else {
      existing.count += 1;
      if (item.ts > existing.lastSeenTs) existing.lastSeenTs = item.ts;
    }
  }
  return [...byPlate.entries()]
    .map(([plate, meta]) => ({
      plate,
      count: meta.count,
      lastSeenTs: meta.lastSeenTs,
      treated: Boolean(treatedPlates[plate]),
    }))
    .sort((a, b) => b.lastSeenTs - a.lastSeenTs);
}
