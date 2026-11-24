import { Text } from "react-native";

import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";
import { useAgentId } from "../../lib/session";
import { useAuditLogs } from "../../services/convex/api";

export function AgentLogsScreen() {
  const agentId = useAgentId();
  const logs = useAuditLogs(agentId);

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Journal agent</Text>
      {!logs.data?.length && <EmptyState label="Aucune action journalisee." />}
      {logs.data?.map((log) => (
        <Card key={log.id}>
          <Text>{log.action}</Text>
          <Text>{log.details}</Text>
          <Text>{new Date(log.at).toLocaleString()}</Text>
        </Card>
      ))}
    </Screen>
  );
}
