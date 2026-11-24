import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { useAgentId } from "../../lib/session";
import { useLogAction } from "../../services/convex/api";

export function ManualVehicleCheckScreen() {
  const router = useRouter();
  const agentId = useAgentId();
  const [matricule, setMatricule] = useState("DK-1234-AA");
  const log = useLogAction();

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Verification manuelle</Text>
      <Input label="Matricule" value={matricule} onChangeText={setMatricule} />
      <Button
        label="Rechercher"
        onPress={async () => {
          await log.mutateAsync({
            action: "VEHICULE_CHECK",
            details: `Recherche du vehicule ${matricule}`,
            actorAgentId: agentId,
          });
          router.push({ pathname: "/vehicule-details", params: { matricule } });
        }}
      />
    </Screen>
  );
}
