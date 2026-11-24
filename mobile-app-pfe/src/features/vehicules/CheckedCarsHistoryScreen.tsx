import { Text } from "react-native";

import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";

export function CheckedCarsHistoryScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Historique vehicules verifies</Text>
      <Card>
        <Text>- DK-1234-AA</Text>
        <Text>- DK-8750-BB</Text>
      </Card>
    </Screen>
  );
}
