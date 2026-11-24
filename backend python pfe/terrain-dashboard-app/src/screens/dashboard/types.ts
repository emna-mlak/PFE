import type { VehicleBackendResult } from "../../types/vehicle";

export type RealtimeStatus = "connecting" | "open" | "closed" | "error";

export type PlateReading = {
  id: string;
  plate: string;
  status: string;
  ts: number;
  /** GPS événement si le backend les envoie (smart glasses / device). */
  latitude?: number;
  longitude?: number;
  /** Confiance OCR 0–100 si le backend l’envoie. */
  confidence?: number;
};

export type UnpaidEntry = {
  plate: string;
  count: number;
  lastSeenTs: number;
  treated: boolean;
};

export type StatusFilter = "all" | "unpaid" | "ok" | "unavailable";
export type SortMode = "recent" | "oldest";

export const MAX_VISIBLE_READINGS = 100;

export const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "Tous" },
  { key: "unpaid", label: "Impayee" },
  { key: "ok", label: "OK" },
  { key: "unavailable", label: "Indisponible" },
];

export type DashboardVehiclePayload = VehicleBackendResult;
