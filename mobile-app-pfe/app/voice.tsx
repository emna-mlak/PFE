import { useMutation } from "convex/react";
import { Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";

import { Button } from "../src/components/ui/Button";
import { Card } from "../src/components/ui/Card";
import { Screen } from "../src/components/ui/Screen";
import { api } from "../src/convex/api";
import { generateBusinessInfractionId } from "../src/lib/generateInfractionId";
import { formatLocationTextAsOnMainScreen } from "../src/lib/formatLocationText";
import { useAgentLocation } from "../src/lib/useAgentLocation";
import { useAgentId } from "../src/lib/session";
import { useVoiceCommand } from "../src/hooks/useVoiceCommand";

function formatMontant(montant: number): string {
  const safe = Number.isFinite(montant) ? montant : 0;
  return `${safe.toFixed(3)} DT`;
}

function fieldValue(value: string): string {
  return value.trim() === "" ? "Non détecté" : value;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function VoiceRoute() {
  const agentId = useAgentId();
  const { state: locationState } = useAgentLocation();
  const createInfraction = useMutation(api.infractions.create);
  const [isSaving, setIsSaving] = useState(false);
  const {
    isRecording,
    isUploading,
    recordingSeconds,
    error,
    result,
    canRetry,
    startRecording,
    stopAndAnalyze,
    retry,
    reset,
  } =
    useVoiceCommand();

  const onStart = useCallback(() => {
    void startRecording();
  }, [startRecording]);

  const onStop = useCallback(() => {
    void stopAndAnalyze();
  }, [stopAndAnalyze]);

  const onRetry = useCallback(() => {
    void retry();
  }, [retry]);

  const resolvedLieu = useMemo(() => {
    const text = formatLocationTextAsOnMainScreen(locationState);
    if (text && text.trim() !== "") return text.trim();
    return "Localisation non disponible";
  }, [locationState]);

  const onUseResult = useCallback(() => {
    if (!result || isSaving) return;
    const matricule = result.matricule.trim().toUpperCase();
    if (!matricule) {
      Toast.show({ type: "error", text1: "Matricule non détecté. Impossible d'enregistrer." });
      return;
    }

    const payload = {
      idInfraction: generateBusinessInfractionId(),
      matricule,
      dateInfraction: new Date().toISOString().slice(0, 10),
      typeInfraction: (result.typeInfraction || "Administratif").trim(),
      description: (result.description || "Infraction saisie à la voix").trim(),
      montantAmende: Math.max(1, Number.isFinite(result.montant) ? result.montant : 0),
      statutInfraction: "enregistree" as const,
      lieu: resolvedLieu,
      ...(agentId ? { agentId } : {}),
    };

    setIsSaving(true);
    createInfraction(payload)
      .then(() => {
        Toast.show({ type: "success", text1: "Infraction enregistrée." });
        reset();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Erreur lors de l'enregistrement.";
        Toast.show({ type: "error", text1: msg });
      })
      .finally(() => setIsSaving(false));
  }, [agentId, createInfraction, isSaving, reset, resolvedLieu, result]);

  return (
    <>
      <Stack.Screen options={{ title: "Infraction à la voix", headerBackTitle: "Retour" }} />
      <Screen>
        <Text style={styles.title}>Décrire une infraction à voix haute</Text>
        <Text style={styles.subtitle}>
          Indiquez la plaque, le type d&apos;infraction et les faits constatés. L&apos;analyse commence lorsque vous
          arrêtez l&apos;enregistrement.
        </Text>

        {!isRecording ? <Button label="Commencer l'enregistrement" onPress={onStart} loading={isUploading} /> : null}
        {isRecording ? <Button label="Arrêter et analyser" onPress={onStop} loading={isUploading} /> : null}

        {isRecording ? (
          <Card>
            <Text style={styles.recordingLabel}>Enregistrement en cours…</Text>
            <Text style={styles.recordingHint}>Parlez clairement (8 à 11 secondes) : {recordingSeconds} s</Text>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <Text style={styles.errorTitle}>Analyse impossible</Text>
            <Text style={styles.errorText}>{error}</Text>
            {canRetry ? <Button label="Réessayer" onPress={onRetry} loading={isUploading} /> : null}
          </Card>
        ) : null}

        {result ? (
          <Card>
            <Text style={styles.resultTitle}>Ce que nous avons compris</Text>
            <Row label="Matricule" value={fieldValue(result.matricule)} />
            <Row label="Type d&apos;infraction" value={fieldValue(result.typeInfraction)} />
            <Row label="Description" value={fieldValue(result.description)} />
            <Row label="Montant" value={formatMontant(result.montant)} />

            <Button label="Enregistrer cette infraction" onPress={onUseResult} loading={isSaving} />
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: "#101828" },
  subtitle: { color: "#475467", lineHeight: 20 },
  recordingLabel: { color: "#155EEF", fontWeight: "700", fontSize: 16 },
  recordingHint: { color: "#344054" },
  errorTitle: { color: "#B42318", fontWeight: "700" },
  errorText: { color: "#B42318", lineHeight: 20 },
  resultTitle: { color: "#101828", fontWeight: "700", fontSize: 18 },
  row: { gap: 4, borderTopWidth: 1, borderTopColor: "#F2F4F7", paddingTop: 8 },
  rowLabel: { color: "#475467", fontSize: 12, textTransform: "uppercase" },
  rowValue: { color: "#101828", fontSize: 16, fontWeight: "600" },
});
