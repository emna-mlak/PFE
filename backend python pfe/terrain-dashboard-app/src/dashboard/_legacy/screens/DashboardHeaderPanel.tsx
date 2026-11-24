import React from "react";
import { Text, View } from "react-native";

import { useDashboardStyles } from "../styles";
import type { RealtimeStatus } from "../types";

/* Panneau du haut : état WebSocket, URL, compteurs agrégés. */
type Props = {
  status: RealtimeStatus;
  reconnectCount: number;
  lastEventAt: number | null;
  lastError: string;
  wsUrl: string;
  counters: {
    total: number;
    unpaid: number;
    ok: number;
    unavailable: number;
  };
  unpaidOpenCount: number;
};

export function DashboardHeaderPanel({
  status,
  reconnectCount,
  lastEventAt,
  lastError,
  wsUrl,
  counters,
  unpaidOpenCount,
}: Props) {
  const styles = useDashboardStyles();

  return (
    <>
      {/* Encadré technique (connexion, dernier message, erreur éventuelle) */}
      <View style={styles.healthPanel}>
        <Text style={styles.status}>Etat flux: {status}</Text>
        <Text style={styles.healthText} selectable>
          WS: {wsUrl}
        </Text>
        <Text style={styles.healthText}>Reconnexions: {reconnectCount}</Text>
        <Text style={styles.healthText}>
          Dernier evenement: {lastEventAt ? new Date(lastEventAt).toLocaleTimeString("fr-FR") : "--:--:--"}
        </Text>
        {lastError ? (
          <Text style={styles.healthError} selectable>
            Erreur: {lastError}
          </Text>
        ) : null}
        {status === "closed" && !lastError ? (
          <Text style={styles.healthError}>
            Si l&apos;API est sur la Raspberry Pi, ouvrez l&apos;URL avec{" "}
            ?backend=IP_DE_LA_PI ou definissez EXPO_PUBLIC_BACKEND_HOST puis redemarrez Metro avec -c.
          </Text>
        ) : null}
      </View>

      {/* Résumé chiffré : total lectures, répartition par type */}
      <View style={styles.countersRow}>
        <Text style={styles.counterBadge}>Total: {counters.total}</Text>
        <Text style={styles.counterBadge}>Impayee: {counters.unpaid}</Text>
        <Text style={styles.counterBadge}>Impayee a traiter: {unpaidOpenCount}</Text>
        <Text style={styles.counterBadge}>OK: {counters.ok}</Text>
        <Text style={styles.counterBadge}>Indisponible: {counters.unavailable}</Text>
      </View>
    </>
  );
}
