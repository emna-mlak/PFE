import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Screen } from "../../components/ui/Screen";
import { useAgentId } from "../../lib/session";
import { useInfractionsByMatricule, useLogAction, useUpdateInfractionStatut } from "../../services/convex/api";

export function InfractionsHistoryScreen() {
  const { matricule = "" } = useLocalSearchParams<{ matricule: string }>();
  const agentId = useAgentId();
  const infractions = useInfractionsByMatricule(matricule);
  const updateStatut = useUpdateInfractionStatut();
  const logAction = useLogAction();

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Historique infractions</Text>
      {!infractions.data?.length && <EmptyState label="Aucune infraction." />}
      {infractions.data?.map((item) => (
        <Card key={item.id}>
          <Text>{item.motif}</Text>
          <Text>{item.montant} FCFA</Text>
          <Badge label={item.statut} />
          <View style={{ gap: 8 }}>
            <Button
              label="Passer en cours"
              onPress={async () => {
                await updateStatut.mutateAsync({
                  idInfraction: item.id,
                  statutInfraction: "en_cours",
                });
                await logAction.mutateAsync({
                  action: "INFRACTION_UPDATE_STATUT",
                  details: `${item.id} -> en_cours`,
                  actorAgentId: agentId,
                });
              }}
            />
            <Button
              label="Marquer resolue"
              onPress={async () => {
                await updateStatut.mutateAsync({
                  idInfraction: item.id,
                  statutInfraction: "resolue",
                });
                await logAction.mutateAsync({
                  action: "INFRACTION_UPDATE_STATUT",
                  details: `${item.id} -> resolue`,
                  actorAgentId: agentId,
                });
              }}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
