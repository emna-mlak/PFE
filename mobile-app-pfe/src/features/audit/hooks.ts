import { useAuditLogs, useLogAction } from "../../services/convex/api";

export const useAgentAuditLogs = (actorAgentId: string) => useAuditLogs(actorAgentId);
export const useAuditLogger = () => useLogAction();
