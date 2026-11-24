import React from "react";
import { FlatList, Text, View } from "react-native";

import type { PlateReading } from "../types";
import { useDashboardStyles } from "../styles";

/* Liste des lectures reçues par WebSocket (données déjà filtrées / triées par l’écran parent). */
type Props = {
  readings: PlateReading[];
  shownCount: number;
};

export function ReadingsList({ readings, shownCount }: Props) {
  const styles = useDashboardStyles();

  return (
    <View style={styles.feedContainer}>
      <Text style={styles.feedTitle}>Flux immatriculations continu ({shownCount})</Text>
      <FlatList
        data={readings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.feedList}
        ListEmptyComponent={<Text style={styles.emptyText}>Aucune plaque lue pour le moment</Text>}
        renderItem={({ item }) => {
          /* Couleur du statut selon la chaîne renvoyée par le backend */
          const statusStyle =
            item.status === "vignette_impayee"
              ? styles.statusUnpaid
              : item.status === "vehicule_recherche"
                ? styles.statusWanted
                : item.status === "vignette_payee"
                  ? styles.statusPaid
                  : styles.statusUnknown;
          return (
            <View style={styles.row}>
              <Text style={styles.rowPlate}>{item.plate}</Text>
              <Text style={[styles.rowStatus, statusStyle]}>{item.status}</Text>
              <Text style={styles.rowTime}>{new Date(item.ts).toLocaleTimeString("fr-FR")}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}
