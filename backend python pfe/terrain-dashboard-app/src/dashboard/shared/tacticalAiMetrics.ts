import type { PlateReading, RealtimeStatus } from "../../screens/dashboard/types";

export type TacticalTone = "good" | "warn" | "bad" | "neutral";

export type TacticalMetric = {
  value: string;
  tone: TacticalTone;
};

export type TacticalAiMetrics = {
  fps: TacticalMetric;
  ocr: TacticalMetric;
  net: TacticalMetric;
  bat: TacticalMetric;
};

export function computeTacticalAiMetrics(input: {
  wsStatus: RealtimeStatus;
  eventsPerSec: number;
  reconnectCount: number;
  hasWsError: boolean;
  readings: PlateReading[];
  batteryPercent: number | null;
}): TacticalAiMetrics {
  const slice = input.readings.slice(0, 24).filter((r) => typeof r.confidence === "number");
  const ocrAvg =
    slice.length === 0 ? null : Math.round(slice.reduce((a, r) => a + (r.confidence as number), 0) / slice.length);

  let fps: TacticalMetric = { value: "—", tone: "neutral" };
  if (input.wsStatus === "open") {
    const n = Math.round(input.eventsPerSec);
    if (n >= 15) fps = { value: String(n), tone: "good" };
    else if (n >= 5) fps = { value: String(n), tone: "warn" };
    else fps = { value: String(n), tone: "bad" };
  }

  let ocr: TacticalMetric = { value: "—", tone: "neutral" };
  if (ocrAvg != null) {
    if (ocrAvg >= 85) ocr = { value: "OK", tone: "good" };
    else if (ocrAvg >= 60) ocr = { value: "SLOW", tone: "warn" };
    else ocr = { value: "ERR", tone: "bad" };
  }

  let net: TacticalMetric = { value: "OFF", tone: "neutral" };
  if (input.wsStatus === "error" || input.hasWsError) net = { value: "ERR", tone: "bad" };
  else if (input.wsStatus === "connecting") net = { value: "SYN", tone: "warn" };
  else if (input.wsStatus === "open") {
    net = input.reconnectCount > 0 ? { value: "REC", tone: "warn" } : { value: "OK", tone: "good" };
  }

  let bat: TacticalMetric = { value: "—", tone: "neutral" };
  if (input.batteryPercent != null) {
    const v = `${input.batteryPercent}%`;
    if (input.batteryPercent > 50) bat = { value: v, tone: "good" };
    else if (input.batteryPercent >= 20) bat = { value: v, tone: "warn" };
    else bat = { value: v, tone: "bad" };
  }

  return { fps, ocr, net, bat };
}

export const TACTICAL_TONE_COLOR: Record<TacticalTone, string> = {
  good: "#22C55E",
  warn: "#FB923C",
  bad: "#EF4444",
  neutral: "#64748B",
};
