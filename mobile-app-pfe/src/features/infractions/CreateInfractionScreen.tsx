import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";
import { z } from "zod";

import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { api } from "../../convex/api";
import { generateBusinessInfractionId } from "../../lib/generateInfractionId";
import { formatLocationTextAsOnMainScreen } from "../../lib/formatLocationText";
import { mapInfractionError } from "../../lib/infractionMutationErrors";
import { useAgentLocation } from "../../lib/useAgentLocation";
import { authStorage } from "../../lib/storage";
import { postImageToConvexUploadUrl } from "../../lib/uploadConvexStorage";
import {
  STATUT_INFRACTION_LABELS,
  STATUT_INFRACTION_OPTIONS,
  type StatutInfractionCreate,
} from "../../types/infractions";

const schema = z.object({
  matricule: z.string().min(1, "Matricule requis"),
  dateInfraction: z.string().min(1, "Date requise"),
  typeInfraction: z.string().min(1, "Type requis"),
  description: z.string().min(1, "Description requise"),
  montantAmende: z.number().positive("Montant doit être supérieur à 0"),
  statutInfraction: z.enum([
    "brouillon",
    "enregistree",
    "contestee",
    "payee",
    "annulee",
  ]),
  lieu: z.string().min(1, "Attendez la position ou réessayez."),
});

type FormData = z.infer<typeof schema>;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateInfractionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ matricule?: string }>();
  const { state: locationState } = useAgentLocation();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [idInfraction] = useState(() => generateBusinessInfractionId());
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentAgent = useQuery(
    api.agents.getCurrentAgent,
    authUserId ? { authUserId } : "skip",
  );

  const createInfraction = useMutation(api.infractions.create);
  const generateUploadUrl = useMutation(api.infractions.generateUploadUrl);

  useEffect(() => {
    authStorage.getAuthUserId().then((id) => setAuthUserId(id ?? null));
  }, []);

  const defaultMatricule = useMemo(() => {
    const p = params.matricule;
    if (typeof p === "string" && p.trim()) return p.trim().toUpperCase();
    return "";
  }, [params.matricule]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      matricule: defaultMatricule,
      dateInfraction: todayISODate(),
      typeInfraction: "",
      description: "",
      montantAmende: 1,
      statutInfraction: "enregistree",
      lieu: "",
    },
  });

  useEffect(() => {
    const text = formatLocationTextAsOnMainScreen(locationState);
    if (text != null) {
      setValue("lieu", text);
      return;
    }
    if (locationState.kind === "denied" || locationState.kind === "unavailable") {
      setValue("lieu", "Localisation non disponible");
    }
  }, [locationState, setValue]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.show({ type: "error", text1: "Accès à la galerie refusé." });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setPicked(res.assets[0]);
      setSubmitError(null);
    }
  };

  const clearPhoto = () => setPicked(null);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const matricule = values.matricule.trim().toUpperCase();

    setSubmitting(true);
    try {
      let photoStorageId: string | undefined;

      if (picked?.uri) {
        const uploadUrl = await generateUploadUrl({});
        const mime = picked.mimeType ?? "image/jpeg";
        photoStorageId = await postImageToConvexUploadUrl(uploadUrl, picked.uri, mime);
      }

      await createInfraction({
        idInfraction,
        matricule,
        dateInfraction: values.dateInfraction.trim(),
        typeInfraction: values.typeInfraction.trim(),
        description: values.description.trim(),
        montantAmende: values.montantAmende,
        statutInfraction: values.statutInfraction as StatutInfractionCreate,
        lieu: values.lieu.trim(),
        ...(currentAgent?.agentId ? { agentId: currentAgent.agentId } : {}),
        ...(photoStorageId ? { photoStorageId } : {}),
      });

      Toast.show({ type: "success", text1: "Infraction enregistrée." });
      router.back();
    } catch (e) {
      const msg = mapInfractionError(e);
      setSubmitError(msg);
      Toast.show({ type: "error", text1: msg });
    } finally {
      setSubmitting(false);
    }
  });

  const busy = submitting;

  const lieuStatusLabel =
    locationState.kind === "loading" || locationState.kind === "idle"
      ? "Récupération des coordonnées GPS…"
      : locationState.kind === "ready"
        ? "Latitude et longitude enregistrées automatiquement."
        : null;

  return (
    <Screen>
      <Text style={styles.title}>Signaler une infraction</Text>
      <Text style={styles.hint}>
        Numéro de dossier : <Text style={styles.mono}>{idInfraction}</Text>
      </Text>

      {currentAgent === undefined && authUserId ? (
        <Text style={styles.muted}>Chargement de l’agent…</Text>
      ) : null}
      {currentAgent && (
        <Text style={styles.muted}>
          Agent : {currentAgent.nom} ({currentAgent.agentId})
        </Text>
      )}

      <Controller
        control={control}
        name="matricule"
        render={({ field }) => (
          <Input
            label="Matricule"
            value={field.value}
            onChangeText={(t) => field.onChange(t.toUpperCase())}
            placeholder="852 TUN 6674"
          />
        )}
      />
      {errors.matricule && <ErrorState label={errors.matricule.message ?? ""} />}

      <Text style={styles.label}>Lieu</Text>
      {lieuStatusLabel ? <Text style={styles.fieldHint}>{lieuStatusLabel}</Text> : null}
      <Controller
        control={control}
        name="lieu"
        render={({ field }) => (
          <View style={styles.lieuBox}>
            <Text style={styles.lieuLabel}>Latitude, longitude</Text>
            <Text style={styles.lieuText} selectable>
              {field.value.trim() !== ""
                ? field.value
                : locationState.kind === "loading" || locationState.kind === "idle"
                  ? "…"
                  : "—"}
            </Text>
          </View>
        )}
      />
      {errors.lieu && <ErrorState label={errors.lieu.message ?? ""} />}

      <Controller
        control={control}
        name="dateInfraction"
        render={({ field }) => (
          <Input label="Date de l'infraction (AAAA-MM-JJ)" value={field.value} onChangeText={field.onChange} />
        )}
      />
      {errors.dateInfraction && <ErrorState label={errors.dateInfraction.message ?? ""} />}

      <Controller
        control={control}
        name="typeInfraction"
        render={({ field }) => (
          <Input label="Type d’infraction" value={field.value} onChangeText={field.onChange} />
        )}
      />
      {errors.typeInfraction && <ErrorState label={errors.typeInfraction.message ?? ""} />}

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <Input label="Description" value={field.value} onChangeText={field.onChange} />
        )}
      />
      {errors.description && <ErrorState label={errors.description.message ?? ""} />}

      <Controller
        control={control}
        name="montantAmende"
        render={({ field }) => (
          <Input
            label="Montant de l’amende"
            value={String(field.value)}
            onChangeText={(t) => {
              const n = parseFloat(t.replace(",", "."));
              field.onChange(Number.isFinite(n) ? n : field.value);
            }}
            placeholder="0"
          />
        )}
      />
      {errors.montantAmende && <ErrorState label={errors.montantAmende.message ?? ""} />}

      <Text style={styles.label}>Statut</Text>
      <Controller
        control={control}
        name="statutInfraction"
        render={({ field }) => (
          <View style={styles.statutRow}>
            {STATUT_INFRACTION_OPTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => field.onChange(s)}
                style={[styles.statutChip, field.value === s && styles.statutChipOn]}
              >
                <Text style={[styles.statutTxt, field.value === s && styles.statutTxtOn]}>
                  {STATUT_INFRACTION_LABELS[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      <Text style={styles.label}>Photo du véhicule (facultatif)</Text>
      <View style={styles.photoRow}>
        <Button label="Ajouter une photo" onPress={pickImage} loading={false} />
        {picked ? (
          <Pressable onPress={clearPhoto} style={styles.clearPhoto}>
            <Text style={styles.clearPhotoTxt}>Retirer la photo</Text>
          </Pressable>
        ) : null}
      </View>
      {picked?.uri ? (
        <Image source={{ uri: picked.uri }} style={styles.preview} />
      ) : null}

      {submitError ? <ErrorState label={submitError} /> : null}

      <Button label="Enregistrer l’infraction" onPress={onSubmit} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", color: "#101828" },
  hint: { fontSize: 13, color: "#667085", marginBottom: 8 },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#344054" },
  muted: { fontSize: 13, color: "#667085", marginBottom: 6 },
  fieldHint: { fontSize: 12, color: "#667085", lineHeight: 18, marginBottom: 8 },
  label: { fontWeight: "600", marginBottom: 6, color: "#344054" },
  lieuBox: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },
  lieuLabel: { fontSize: 12, fontWeight: "600", color: "#667085", marginBottom: 6 },
  lieuText: { fontSize: 14, color: "#101828", lineHeight: 20 },
  statutRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  statutChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F2F4F7",
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },
  statutChipOn: { backgroundColor: "#155EEF", borderColor: "#155EEF" },
  statutTxt: { fontSize: 12, color: "#344054", fontWeight: "600" },
  statutTxtOn: { color: "#fff" },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  clearPhoto: { padding: 8 },
  clearPhotoTxt: { color: "#B42318", fontWeight: "600" },
  preview: { width: "100%", height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: "#EEF2F6" },
});
