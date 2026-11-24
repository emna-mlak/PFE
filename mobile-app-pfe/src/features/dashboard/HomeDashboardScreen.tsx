import { Link } from "expo-router";
import { Text } from "react-native";

import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";

export function HomeDashboardScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Tableau de bord</Text>
      <Card>
        <Link href="/vehicule-check">Verification manuelle</Link>
        <Link href="/new-infraction?matricule=DK-1234-AA">Nouvelle infraction</Link>
        <Link href="/infractions-history?matricule=DK-1234-AA">Historique infractions</Link>
        <Link href="/live-capture">Capture en direct</Link>
        <Link href="/voice">Commandes vocales</Link>
        <Link href="/profile">Profil agent</Link>
        <Link href="/set-password">Definir/Reset mot de passe</Link>
        <Link href="/logs">Journal d'actions</Link>
        <Link href="/checked-history">Historique vehicules verifies</Link>
      </Card>
    </Screen>
  );
}
