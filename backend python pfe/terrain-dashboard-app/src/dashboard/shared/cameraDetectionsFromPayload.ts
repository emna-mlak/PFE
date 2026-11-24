import type { DashboardVehiclePayload } from "../../screens/dashboard/types";
import type { CameraDetectionBox } from "../shared/cameraOverlayTypes";

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function normalizeBox(
  o: Record<string, unknown>,
  frameW: number,
  frameH: number
): { x: number; y: number; w: number; h: number } | null {
  const x1 = num(o.x1) ?? num(o.left);
  const y1 = num(o.y1) ?? num(o.top);
  const x2 = num(o.x2) ?? num(o.right);
  const y2 = num(o.y2) ?? num(o.bottom);
  let x = num(o.x) ?? x1;
  let y = num(o.y) ?? y1;
  let w = num(o.w) ?? num(o.width);
  let h = num(o.h) ?? num(o.height);

  if (x1 != null && y1 != null && x2 != null && y2 != null && x2 > x1 && y2 > y1) {
    x = x1;
    y = y1;
    w = x2 - x1;
    h = y2 - y1;
  }

  if (x == null || y == null || w == null || h == null || w <= 0 || h <= 0) return null;

  const maxC = Math.max(x + w, y + h, x, y);
  const pixelish = maxC > 1.01;
  if (pixelish && frameW > 0 && frameH > 0) {
    return { x: x / frameW, y: y / frameH, w: w / frameW, h: h / frameH };
  }
  if (pixelish) {
    const s = Math.max(maxC, 1);
    return { x: x / s, y: y / s, w: w / s, h: h / s };
  }
  return { x, y, w, h };
}

function tryArray(source: Record<string, unknown>): unknown[] | null {
  const d = source.detections ?? source.yolo_boxes ?? source.boxes;
  return Array.isArray(d) ? d : null;
}

function collectSources(payload: DashboardVehiclePayload): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [payload as Record<string, unknown>];
  for (const key of ["data", "vehicle", "result", "frame", "ai"] as const) {
    const n = (payload as Record<string, unknown>)[key];
    if (n && typeof n === "object") out.push(n as Record<string, unknown>);
  }
  return out;
}

/** Extrait les boîtes détection depuis le payload véhicule / frame AI (formats variés). */
export function pickDetectionsFromPayload(payload: DashboardVehiclePayload): CameraDetectionBox[] {
  const sources = collectSources(payload);
  let frameW = 0;
  let frameH = 0;
  for (const s of sources) {
    frameW = num(s.imageWidth) ?? num(s.frame_w) ?? num(s.width) ?? frameW;
    frameH = num(s.imageHeight) ?? num(s.frame_h) ?? num(s.height) ?? frameH;
  }

  const boxes: CameraDetectionBox[] = [];
  let idx = 0;
  for (const s of sources) {
    const arr = tryArray(s);
    if (!arr || arr.length === 0) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const g = normalizeBox(o, frameW ?? 0, frameH ?? 0);
      if (!g) continue;
      const confRaw = num(o.confidence) ?? num(o.score) ?? num(o.conf);
      let confidence: number | undefined;
      if (confRaw != null) {
        confidence = confRaw > 1 ? confRaw / 100 : confRaw;
        if (confidence > 1) confidence = 1;
      }
      const label = [o.label, o.class_name, o.plate].map((x) => (typeof x === "string" ? x : "")).find(Boolean);
      boxes.push({
        id: `d-${idx++}-${g.x.toFixed(3)}`,
        x: Math.min(1, Math.max(0, g.x)),
        y: Math.min(1, Math.max(0, g.y)),
        w: Math.min(1, Math.max(0, g.w)),
        h: Math.min(1, Math.max(0, g.h)),
        confidence,
        label: typeof label === "string" ? String(label).slice(0, 16) : undefined,
      });
    }
    break;
  }
  return boxes;
}

export function payloadHasDetectionsKey(payload: DashboardVehiclePayload): boolean {
  return collectSources(payload).some((s) => tryArray(s) != null);
}
