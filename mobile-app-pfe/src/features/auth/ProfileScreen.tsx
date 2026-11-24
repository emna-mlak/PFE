import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FooterNav } from "../../components/ui/FooterNav";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { agentStorage } from "../../lib/storage";
import type { Agent } from "../../types/domain";

export function ProfileScreen() {
  const [agent, setAgent] = useState<Agent | null>(null);

  const loadSession = useCallback(async () => {
    const raw = await agentStorage.getProfile();
    if (!raw) return;
    setAgent(JSON.parse(raw) as Agent);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <Screen footer={<FooterNav current="profile" />}>
      <Text style={styles.title}>Mon compte</Text>
      <Text style={styles.subtitle}>Vos informations de connexion (lecture seule)</Text>

      <Card>
        <Row label="Nom" value={agent?.nom ?? "—"} />
        <Row label="E-mail" value={agent?.email ?? "—"} />
        <Row label="Rôle" value={agent?.role ?? "—"} />
        <Row label="Statut" value={agent?.statut ?? "—"} />
        <Row label="Identifiant" value={agent?.agentId ?? "—"} />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "700", color: "#101828" },
  subtitle: { fontSize: 14, color: "#667085", marginTop: 4, marginBottom: 12 },
  row: { gap: 4 },
  rowLabel: { fontSize: 12, color: "#667085", fontWeight: "600" },
  rowValue: { fontSize: 16, color: "#101828", fontWeight: "500" },
});
