import { Link, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { Screen } from "../../components/ui/Screen";
import {
  useInfractionsByMatricule,
  useVehiculeByMatricule,
  useVignetteActiveByMatricule,
} from "../../services/convex/api";

export function VehicleDetailsScreen() {
  const { matricule = "" } = useLocalSearchParams<{ matricule: string }>();
  const vehicule = useVehiculeByMatricule(matricule);
  const vignette = useVignetteActiveByMatricule(matricule);
  const infractions = useInfractionsByMatricule(matricule);

  if (vehicule.isLoading) return <LoadingState />;
  if (!vehicule.data) return <EmptyState label="Vehicule introuvable." />;

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Details vehicule</Text>
      <Card>
        <Text>Matricule: {vehicule.data.matricule}</Text>
        <Text>{vehicule.data.marque + " " + vehicule.data.modele}</Text>
        <Text>Proprietaire: {vehicule.data.proprietaire}</Text>
      </Card>
      <Card>
        <Text>Vignette active</Text>
        {vignette.data ? (
          <Badge label={`Active jusqu'au ${vignette.data.expiration}`} />
        ) : (
          <Badge label="Aucune vignette active" />
        )}
      </Card>
      <Card>
        <Text>Infractions: {infractions.data?.length ?? 0}</Text>
        <Link href={{ pathname: "/new-infraction", params: { matricule } }}>
          Creer une nouvelle infraction
        </Link>
        <Link href={{ pathname: "/infractions-history", params: { matricule } }}>
          Voir historique infractions
        </Link>
      </Card>
    </Screen>
  );
}
