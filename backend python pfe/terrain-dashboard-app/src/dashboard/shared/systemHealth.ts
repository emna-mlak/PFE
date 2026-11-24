import type { RealtimeStatus } from "../../screens/dashboard/types";

export type SystemHealth = "OK" | "WARN" | "FAIL";

export function computeSystemHealth(
  status: RealtimeStatus,
  reconnectCount: number,
  hasError: boolean
): SystemHealth {
  if (status === "error") return "FAIL";
  if (status === "closed" && hasError) return "FAIL";
  if (status !== "open") return "WARN";
  if (hasError || reconnectCount > 0) return "WARN";
  return "OK";
}
