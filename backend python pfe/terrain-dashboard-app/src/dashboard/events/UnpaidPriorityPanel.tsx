import React from "react";
import { Pressable, Text, View } from "react-native";

import type { UnpaidEntry } from "../../screens/dashboard/types";
import { useMissionControlStyles } from "../shared/styles";

/* Focus opérationnel sur les vignettes impayées encore "ouvertes" côté terrain. */
type Props = {
  unpaidEntries: UnpaidEntry[];
  activeUnpaid: UnpaidEntry | null;
  onToggleTreated: (plate: string) => void;
};

export function UnpaidPriorityPanel({ unpaidEntries, activeUnpaid, onToggleTreated }: Props) {
  const styles = useMissionControlStyles();

  return (
    <View style={styles.unpaidContainer}>
      <Text style={styles.unpaidTitle}>Impayes prioritaires</Text>
      {/* Résumé : première impayée non traitée, ou message neutre */}
      {activeUnpaid ? (
        <Text style={styles.unpaidActive}>
          Alerte active: {activeUnpaid.plate} (vu {activeUnpaid.count} fois)
        </Text>
      ) : (
        <Text style={styles.unpaidNone}>Aucune alerte impayee active</Text>
      )}
      {/* Au plus 5 entrées : évite de noyer l’écran si beaucoup de passages */}
      {unpaidEntries.slice(0, 5).map((entry) => (
        <View key={entry.plate} style={styles.unpaidRow}>
          <View style={styles.unpaidRowMain}>
            <Text style={styles.unpaidPlate}>{entry.plate}</Text>
            <Text style={styles.unpaidMeta}>
              Derniere detection {new Date(entry.lastSeenTs).toLocaleTimeString("fr-FR")} | Vu {entry.count} fois
            </Text>
          </View>
          <Pressable style={styles.unpaidAction} onPress={() => onToggleTreated(entry.plate)}>
            <Text style={styles.unpaidActionText}>{entry.treated ? "Reouvrir" : "Marquer traite"}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
