import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { FooterNav } from "../../components/ui/FooterNav";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { LoadingState } from "../../components/ui/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { api } from "../../convex/api";
import {
  formatDateInfraction,
  formatMontant,
  getExtraInfractionEntries,
  getRecordField,
} from "../../lib/infractionFields";
import { formatLocationTextAsOnMainScreen } from "../../lib/formatLocationText";
import { useAgentLocation } from "../../lib/useAgentLocation";
import { agentStorage } from "../../lib/storage";
import type { Agent } from "../../types/domain";
import type { InfractionDoc, VignetteDoc } from "../../types/carLookup";

export function MainScreen() {
  const router = useRouter();
  const { state: locationState, refresh: refreshLocation } = useAgentLocation();
  const [agentName, setAgentName] = useState("");
  const [plateInput, setPlateInput] = useState("");
  const [submittedPlate, setSubmittedPlate] = useState("");

  useEffect(() => {
    agentStorage.getProfile().then((value) => {
      if (!value) return;
      const profile = JSON.parse(value) as Agent;
      setAgentName(profile.nom);
    });
  }, []);

  const lookup = useQuery(
    api.carLookup.getByPlate,
    submittedPlate.length > 0
      ? { matricule: submittedPlate, infractionsLimit: 50 }
      : "skip",
  );

  const onSearch = () => {
    const m = plateInput.trim();
    if (!m) {
      setSubmittedPlate("");
      return;
    }
    setSubmittedPlate(m);
  };

  const formatVignetteLine = (v: VignetteDoc) => {
    const parts = [
      v.numero ? `#${v.numero}` : null,
      v.statutPaiement ? `Paiement ${v.statutPaiement}` : null,
      v.dateExpiration ? `Exp. ${v.dateExpiration}` : null,
    ].filter(Boolean);
    return parts.join(" · ") || "—";
  };

  const infractionKey = (i: InfractionDoc, idx: number) =>
    String(
      getRecordField(i as Record<string, unknown>, "_id", "id") ?? idx,
    );

  return (
    <Screen footer={<FooterNav current="main" />}>
      <View style={styles.hero}>
        <Text style={styles.greeting}>Bonjour</Text>
        <Text style={styles.agentName}>{agentName || "Agent"}</Text>
      </View>

      <View style={styles.locationCard}>
        <Text style={styles.locationEyebrow}>Position GPS</Text>
        {locationState.kind === "loading" && (
          <Text style={styles.locationBody}>Recherche de la position GPS…</Text>
        )}
        {locationState.kind === "denied" && (
          <>
            <Text style={styles.locationBody}>
              Autorisez la localisation dans les réglages Android pour afficher votre position.
            </Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.locationLink}>
              <Text style={styles.locationLinkText}>Ouvrir les réglages</Text>
            </Pressable>
            <Pressable onPress={() => void refreshLocation()} style={styles.locationSecondary}>
              <Text style={styles.locationSecondaryText}>Réessayer</Text>
            </Pressable>
          </>
        )}
        {locationState.kind === "unavailable" && (
          <>
            <Text style={styles.locationBody}>{locationState.message}</Text>
            <Pressable onPress={() => void refreshLocation()} style={styles.locationSecondary}>
              <Text style={styles.locationSecondaryText}>Réessayer</Text>
            </Pressable>
          </>
        )}
        {locationState.kind === "ready" && (
          <>
            <Text style={styles.locationAddress} selectable>
              {formatLocationTextAsOnMainScreen(locationState)}
            </Text>
            <Pressable onPress={() => void refreshLocation()} style={styles.locationSecondary}>
              <Text style={styles.locationSecondaryText}>Actualiser</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.ctaRow}>
        <Button
          label="Signaler une infraction"
          onPress={() =>
            router.push({
              pathname: "/new-infraction",
              params: {
                matricule: plateInput.trim() || submittedPlate || "",
              },
            })
          }
        />
        <Button label="Infraction à la voix" onPress={() => router.push("/voice")} />
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.searchTitle}>Rechercher un véhicule</Text>
        <Text style={styles.searchHint}>Entrez la plaque d&apos;immatriculation, puis appuyez sur Rechercher.</Text>
        <Input
          label="Matricule"
          value={plateInput}
          onChangeText={setPlateInput}
          placeholder="Ex. 852 TUN 6674"
        />
        <Button label="Rechercher" onPress={onSearch} />
      </View>

      {submittedPlate.length > 0 && lookup === undefined && (
        <LoadingState label="Recherche en cours…" />
      )}

      {submittedPlate.length > 0 && lookup !== undefined && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Plaque reconnue</Text>
            <View style={styles.plateChip}>
              <Text style={styles.plateChipText}>{lookup.matriculeNormalized}</Text>
            </View>
            {!lookup.hasAnyData && (
              <EmptyState label="Aucun véhicule ni dossier trouvé pour cette plaque." />
            )}
          </View>

          {lookup.vehicule && (
            <View style={styles.cardElevated}>
              <Text style={styles.cardEyebrow}>Véhicule</Text>
              <Text style={styles.vehicleTitle}>
                {[lookup.vehicule.marque, lookup.vehicule.modele].filter(Boolean).join(" ") ||
                  "Véhicule enregistré"}
              </Text>
              {lookup.vehicule.proprietaire != null && (
                <Text style={styles.muted}>
                  Propriétaire : {String(lookup.vehicule.proprietaire)}
                </Text>
              )}
              {lookup.vehicule.matricule != null && (
                <Text style={styles.muted}>Immatriculation : {String(lookup.vehicule.matricule)}</Text>
              )}
            </View>
          )}

          <View style={styles.cardElevated}>
            <Text style={styles.cardEyebrow}>Vignette</Text>
            {lookup.activeVignette ? (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.vignetteOk}>À jour</Text>
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>Active</Text>
                  </View>
                </View>
                <Text style={styles.body}>{formatVignetteLine(lookup.activeVignette)}</Text>
              </>
            ) : (
              <View style={styles.badgeWarn}>
                <Text style={styles.badgeWarnText}>Aucune vignette active</Text>
              </View>
            )}
          </View>

          {lookup.vignettes.length > 1 && (
            <View style={styles.cardElevated}>
              <Text style={styles.cardEyebrow}>Autres vignettes ({lookup.vignettes.length})</Text>
              {lookup.vignettes.map((v, idx) => (
                <Text key={String(v._id ?? idx)} style={[styles.body, idx > 0 && styles.listGap]}>
                  {formatVignetteLine(v)}
                </Text>
              ))}
            </View>
          )}

          {lookup.infractions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Infractions</Text>
              <Text style={styles.sectionSubtitle}>
                {lookup.infractions.length} dossier{lookup.infractions.length > 1 ? "s" : ""} lié
                {lookup.infractions.length > 1 ? "s" : ""} à ce véhicule
              </Text>
              {lookup.infractions.map((inf, idx) => (
                <InfractionCard key={infractionKey(inf, idx)} record={inf as Record<string, unknown>} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function InfractionCard({ record }: { record: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  const type = getRecordField(record, "TYPEINFRACTION", "typeInfraction");
  const statut = getRecordField(record, "STATUTINFRACTION", "statutInfraction");
  const description = getRecordField(record, "DESCRIPTION", "description");
  const dateInf = getRecordField(record, "DATEINFRACTION", "dateInfraction");
  const lieu = getRecordField(record, "LIEU", "lieu");
  const montant = getRecordField(record, "MONTANTAMENDE", "montantAmende");
  const idRef = getRecordField(record, "IDINFRACTION", "idInfraction");
  const photoUrlRaw = getRecordField(record, "photoUrl", "PHOTOURL");

  const extras = getExtraInfractionEntries(record);
  const hasExtras = extras.length > 0;
  const photoUri =
    typeof photoUrlRaw === "string" && /^https?:\/\//i.test(photoUrlRaw.trim())
      ? photoUrlRaw.trim()
      : null;

  return (
    <View style={styles.infCard}>
      <View style={styles.infHeader}>
        {type != null && type !== "" && (
          <View style={styles.pillOutline}>
            <Text style={styles.pillOutlineText}>{String(type)}</Text>
          </View>
        )}
        <StatusPill value={statut} />
      </View>

      {photoUri != null && (
        <Image
          accessibilityLabel="Photo de l'infraction"
          source={{ uri: photoUri }}
          style={styles.infPhoto}
          resizeMode="cover"
        />
      )}

      <Text style={styles.infTitle}>
        {description != null && String(description).trim() !== ""
          ? String(description)
          : "Infraction"}
      </Text>

      <View style={styles.infMeta}>
        <Text style={styles.infMetaText}>
          {formatDateInfraction(dateInf)}
          {lieu != null && String(lieu) !== "" ? ` · ${String(lieu)}` : ""}
        </Text>
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Montant de l&apos;amende</Text>
        <Text style={styles.amountValue}>{formatMontant(montant)}</Text>
      </View>

      {idRef != null && String(idRef) !== "" && (
        <Text style={styles.refText}>Réf. {String(idRef)}</Text>
      )}

      {hasExtras && (
        <>
          <Pressable onPress={() => setOpen((o) => !o)} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>{open ? "Masquer les détails" : "Afficher tous les détails"}</Text>
          </Pressable>
          {open && (
            <View style={styles.extraBox}>
              {extras.map(([key, value]) => (
                <View key={key} style={styles.kv}>
                  <Text style={styles.kvKey}>{key}</Text>
                  <Text style={styles.kvVal}>{formatExtraValue(value)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function StatusPill({ value }: { value: unknown }) {
  const s = value != null ? String(value).toLowerCase() : "";
  const isDraft = s.includes("brouillon");
  const isPaid = s.includes("pay") || s.includes("réglé") || s.includes("regle");
  const styleWrap = isDraft ? styles.pillDraft : isPaid ? styles.pillOk : styles.pillNeutral;
  const styleTxt = isDraft ? styles.pillDraftText : isPaid ? styles.pillOkText : styles.pillNeutralText;
  return (
    <View style={[styles.pill, styleWrap]}>
      <Text style={[styles.pillText, styleTxt]}>{value != null ? String(value) : "—"}</Text>
    </View>
  );
}

function formatExtraValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: 4,
  },
  greeting: {
    fontSize: 15,
    color: "#667085",
    fontWeight: "500",
  },
  agentName: {
    fontSize: 26,
    fontWeight: "700",
    color: "#101828",
    letterSpacing: -0.3,
  },
  ctaRow: {
    marginBottom: 12,
  },
  locationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    gap: 6,
  },
  locationEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  locationAddress: {
    fontSize: 15,
    fontWeight: "600",
    color: "#101828",
    lineHeight: 20,
  },
  locationBody: {
    fontSize: 14,
    color: "#475467",
    lineHeight: 20,
  },
  locationLink: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  locationLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#175CD3",
  },
  locationSecondary: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  locationSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#667085",
  },
  searchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    gap: 10,
    shadowColor: "#0C111D",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#101828",
  },
  searchHint: {
    fontSize: 13,
    color: "#667085",
    marginTop: -4,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#101828",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#667085",
    marginBottom: 4,
  },
  plateChip: {
    alignSelf: "flex-start",
    backgroundColor: "#1D2939",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  plateChipText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardElevated: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    gap: 6,
    shadowColor: "#0C111D",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  vehicleTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#101828",
  },
  muted: {
    fontSize: 14,
    color: "#667085",
  },
  body: {
    fontSize: 14,
    color: "#344054",
    lineHeight: 20,
  },
  listGap: {
    marginTop: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  vignetteOk: {
    fontSize: 16,
    fontWeight: "600",
    color: "#067647",
  },
  badgeSuccess: {
    backgroundColor: "#ECFDF3",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeSuccessText: {
    color: "#067647",
    fontSize: 12,
    fontWeight: "700",
  },
  badgeWarn: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  badgeWarnText: {
    color: "#B42318",
    fontWeight: "600",
    fontSize: 14,
  },
  infCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    shadowColor: "#0C111D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  infHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  infPhoto: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#E4E7EC",
    marginBottom: 12,
  },
  pillOutline: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillOutlineText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#344054",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillDraft: { backgroundColor: "#FFFAEB" },
  pillDraftText: { color: "#B54708" },
  pillOk: { backgroundColor: "#ECFDF3" },
  pillOkText: { color: "#067647" },
  pillNeutral: { backgroundColor: "#F2F4F7" },
  pillNeutralText: { color: "#344054" },
  infTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#101828",
    lineHeight: 24,
    marginBottom: 6,
  },
  infMeta: {
    marginBottom: 12,
  },
  infMetaText: {
    fontSize: 14,
    color: "#667085",
  },
  amountBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#101828",
    letterSpacing: -0.5,
  },
  refText: {
    marginTop: 10,
    fontSize: 12,
    color: "#667085",
    fontFamily: "monospace",
  },
  moreBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  moreBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#155EEF",
  },
  extraBox: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EAECF0",
    gap: 8,
  },
  kv: { gap: 2 },
  kvKey: {
    fontSize: 10,
    fontWeight: "700",
    color: "#98A2B3",
    textTransform: "uppercase",
  },
  kvVal: {
    fontSize: 13,
    color: "#475467",
  },
});
