import { Text } from "react-native";
import { useEffect, useState } from "react";

import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { Agent } from "../../types/domain";
import { agentStorage } from "../../lib/storage";
import { useAgentProfile } from "./useAgentProfile";

export function AgentProfileScreen() {
  const agent = useAgentProfile();
  const [sessionAgent, setSessionAgent] = useState<Agent | null>(null);

  useEffect(() => {
    agentStorage.getProfile().then((value) => {
      if (!value) return;
      setSessionAgent(JSON.parse(value) as Agent);
    });
  }, []);

  if (agent.isLoading && !sessionAgent) return <LoadingState />;
  if (!agent.data && !sessionAgent) return <EmptyState label="Vous n&apos;êtes pas connecté." />;
  const current = agent.data ?? sessionAgent;
  if (!current) return <EmptyState label="Vous n&apos;êtes pas connecté." />;

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Mon compte</Text>
      <Card>
        <Text>Nom : {current.nom}</Text>
        <Text>E-mail : {current.email}</Text>
        <Text>Rôle : {current.role}</Text>
        <Text>Statut : {current.statut}</Text>
      </Card>
    </Screen>
  );
}
