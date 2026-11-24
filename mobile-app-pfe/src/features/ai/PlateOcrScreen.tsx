import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";
import { z } from "zod";

import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { FooterNav } from "../../components/ui/FooterNav";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { env } from "../../config/env";
import { api } from "../../convex/api";
import { formatLocationTextAsOnMainScreen } from "../../lib/formatLocationText";
import { generateBusinessInfractionId } from "../../lib/generateInfractionId";
import { mapInfractionError } from "../../lib/infractionMutationErrors";
import { authStorage } from "../../lib/storage";
import { useAgentLocation } from "../../lib/useAgentLocation";
import { postImageToConvexUploadUrl } from "../../lib/uploadConvexStorage";
import { resolveFileUriForUpload } from "../../lib/resolveLocalImageUri";
import {
  STATUT_INFRACTION_LABELS,
  STATUT_INFRACTION_OPTIONS,
  type StatutInfractionCreate,
} from "../../types/infractions";

/* ── Infraction type categories (dropdown) ─────────────────────────── */

const INFRACTION_CATEGORIES = [
  "Stationnement",
  "Vitesse",
  "Administratif",
  "Conduite",
  "Comportement",
  "Technique",
  "Signalisation",
  "Sécurité",
] as const;

/* ── OCR result type ───────────────────────────────────────────────── */

/** Aligné sur les `status` renvoyés par l’API Python `/api/plate-ocr`. */
type OcrApiStatus = "success" | "low_confidence" | "not_detected";

type OcrResult = {
  plate_text: string;
  confidence: number;
  yolo_confidence: number;
  ocr_confidence: number;
  cropped_plate_image_base64?: string;
  raw_ocr_text?: string;
  /** Statut métier renvoyé par le backend (pas le code HTTP). */
  ocrServerStatus?: OcrApiStatus;
};

/* ── Form schema ───────────────────────────────────────────────────── */

function nowISODatetime(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

const schema = z.object({
  matricule: z.string().min(1, "Matricule requis"),
  dateInfraction: z.string().min(1, "Date requise"),
  typeInfraction: z.string().min(1, "Choisissez un type"),
  description: z.string().min(1, "Description requise"),
  montantAmende: z.number().positive("Montant > 0"),
  statutInfraction: z.enum(["brouillon", "enregistree", "contestee", "payee", "annulee"]),
  lieu: z.string().min(1, "Lieu requis"),
});

type FormData = z.infer<typeof schema>;

/* ══════════════════════════════════════════════════════════════════════
   Main component — two steps: 1) OCR scan   2) Infraction form
   ══════════════════════════════════════════════════════════════════════ */

export function PlateOcrScreen() {
  const [step, setStep] = useState<"scan" | "form">("scan");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [pickedUri, setPickedUri] = useState<string | null>(null);

  const goToForm = (result: OcrResult, imageUri: string | null) => {
    setOcrResult(result);
    setPickedUri(imageUri);
    setStep("form");
  };

  const goBackToScan = () => {
    setStep("scan");
    setOcrResult(null);
    setPickedUri(null);
  };

  return step === "scan" ? (
    <ScanStep onPlateDetected={goToForm} />
  ) : (
    <InfractionFormStep ocrResult={ocrResult!} imageUri={pickedUri} onBack={goBackToScan} />
  );
}

/* ── Step 1: scan ──────────────────────────────────────────────────── */

function ScanStep({
  onPlateDetected,
}: {
  onPlateDetected: (result: OcrResult, imageUri: string | null) => void;
}) {
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = env.pythonApiUrl;
  const isHttpOnWeb = Platform.OS === "web" && apiUrl.startsWith("http://");

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: "error", text1: "Accès à la galerie refusé." });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (!res.canceled && res.assets[0]) {
        const uri = await resolveFileUriForUpload(res.assets[0].uri);
        setPicked({ ...res.assets[0], uri });
        setResult(null);
        setError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'ouvrir la galerie.";
      Toast.show({ type: "error", text1: msg });
    }
  };

  const pickFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: "error", text1: "Accès à la caméra refusé." });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (!res.canceled && res.assets[0]) {
        const uri = await resolveFileUriForUpload(res.assets[0].uri);
        setPicked({ ...res.assets[0], uri });
        setResult(null);
        setError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'utiliser la caméra.";
      Toast.show({ type: "error", text1: msg });
    }
  };

  const sendToOcr = async () => {
    if (!picked?.uri) return;
    if (!apiUrl) {
      setError("EXPO_PUBLIC_PYTHON_API_URL n'est pas configuré dans .env");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const uri = await resolveFileUriForUpload(picked.uri);
      const filename = uri.split("/").pop() ?? "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1].toLowerCase()}` : "image/jpeg";

      const formData = new FormData();
      formData.append("file", { uri, name: filename, type: mimeType } as unknown as Blob);

      const response = await fetch(`${apiUrl}/api/plate-ocr`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const responseText = await response.text().catch(() => "");
      console.log("[OCR] POST /api/plate-ocr", {
        url: `${apiUrl}/api/plate-ocr`,
        status: response.status,
        ok: response.ok,
        bodyPreview: responseText.slice(0, 500),
      });
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${responseText || response.statusText}`);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        throw new Error(
          "Le serveur a renvoyé du HTML ou du texte au lieu de JSON. Vérifiez l'URL (doit être POST /api/plate-ocr sur l'API FastAPI).",
        );
      }
      const statusStr = typeof json.status === "string" ? json.status : "";
      const accepted: OcrApiStatus[] = ["success", "low_confidence", "not_detected"];
      if (!accepted.includes(statusStr as OcrApiStatus)) {
        const detail =
          typeof json.detail === "string"
            ? json.detail
            : typeof json.message === "string"
              ? json.message
              : undefined;
        const got = json.status === undefined ? "(champ status absent)" : JSON.stringify(json.status);
        const keys = Object.keys(json).join(", ") || "(vide)";
        throw new Error(
          detail ??
            `Réponse OCR invalide : status attendu "success", "low_confidence" ou "not_detected". Reçu status=${got}. Clés: ${keys}`,
        );
      }
      const r: OcrResult = {
        plate_text: typeof json.plate_text === "string" ? json.plate_text : "",
        confidence: typeof json.confidence === "number" ? json.confidence : 0,
        yolo_confidence: typeof json.yolo_confidence === "number" ? json.yolo_confidence : 0,
        ocr_confidence: typeof json.ocr_confidence === "number" ? json.ocr_confidence : 0,
        raw_ocr_text: typeof json.raw_ocr_text === "string" ? json.raw_ocr_text : undefined,
        ocrServerStatus: statusStr as OcrApiStatus,
      };
      setResult(r);
      if (statusStr === "low_confidence") {
        Toast.show({
          type: "info",
          text1: "Lecture peu fiable",
          text2: "La plaque peut être vide : vérifiez l’image recadrée ou saisissez le matricule à la main.",
        });
      } else if (statusStr === "not_detected") {
        Toast.show({
          type: "info",
          text1: "Plaque non détectée",
          text2: "Reprenez une photo ou saisissez le matricule manuellement au rapport.",
        });
      }
    } catch (e) {
      console.log("[OCR] error", e);
      let msg = e instanceof Error ? e.message : "Erreur lors de l'envoi.";
      if (/load failed|network request failed|mixed content|blocked/i.test(msg)) {
        msg =
          Platform.OS === "web"
            ? "Requête bloquée (mixed content HTTP/HTTPS). Testez depuis Android ou utilisez HTTPS pour le serveur OCR."
            : `Impossible de joindre le serveur OCR (${apiUrl}). Téléphone sur le hotspot du Pi ? Testez http://10.42.0.1:8000/health et redémarrez l'API (systemctl restart terrain-backend-api).`;
      }
      setError(msg);
      Toast.show({ type: "error", text1: msg });
    } finally {
      setLoading(false);
    }
  };

  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

  return (
    <Screen footer={<FooterNav current="ai" />}>
      <Text style={s.title}>Scanner une plaque</Text>
      <Text style={s.hint}>
        Prenez une photo ou choisissez une image du véhicule. La plaque lue remplira automatiquement le
        formulaire d&apos;infraction.
      </Text>

      {!apiUrl && (
        <ErrorState label="Le service de lecture de plaque n'est pas configuré. Contactez votre administrateur." />
      )}
      {isHttpOnWeb && (
        <View style={s.warnBox}>
          <Text style={s.warnText}>
            Le serveur OCR utilise HTTP mais l'app est servie en HTTPS — le navigateur bloque les
            requêtes. Testez sur Android (Expo Go) ou exposez le serveur en HTTPS (ex. ngrok).
          </Text>
        </View>
      )}

      <View style={s.btnRow}>
        <View style={s.btnHalf}>
          <Button label="Galerie" onPress={pickFromGallery} />
        </View>
        <View style={s.btnHalf}>
          <Button label="Caméra" onPress={pickFromCamera} />
        </View>
      </View>

      {picked?.uri && <Image source={{ uri: picked.uri }} style={s.preview} resizeMode="cover" />}
      {picked?.uri && <Button label="Analyser la plaque" onPress={sendToOcr} loading={loading} />}

      {error && <ErrorState label={error} />}

      {result && (
        <View style={s.resultCard}>
          <Text style={s.resultEyebrow}>Plaque détectée</Text>
          {result.ocrServerStatus === "low_confidence" && (
            <View style={s.ocrWarnBanner}>
              <Text style={s.ocrWarnBannerText}>
                Confiance faible : la détection ou la lecture du texte n’est pas fiable. Vous pouvez
                continuer et corriger la plaque dans le formulaire.
              </Text>
            </View>
          )}
          {result.ocrServerStatus === "not_detected" && (
            <View style={s.ocrWarnBanner}>
              <Text style={s.ocrWarnBannerText}>
                Aucune plaque détectée sur cette photo. Reprenez une image ou continuez pour saisir le
                matricule à la main.
              </Text>
            </View>
          )}
          <Text style={s.plateText}>
            {result.plate_text.trim() !== "" ? result.plate_text : "— (non lu)"}
          </Text>
          <View style={s.statsRow}>
            <StatChip label="Fiabilité globale" value={pct(result.confidence)} />
            <StatChip label="Détection" value={pct(result.yolo_confidence)} />
            <StatChip label="Lecture texte" value={pct(result.ocr_confidence)} />
          </View>
          {result.raw_ocr_text != null && result.raw_ocr_text !== result.plate_text && (
            <Text style={s.rawHint}>Texte lu brut : {result.raw_ocr_text}</Text>
          )}
          <View style={{ marginTop: 8 }}>
            <Button
              label="Continuer vers le formulaire"
              onPress={() => onPlateDetected(result, picked?.uri ?? null)}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

/* ── Step 2: infraction form ───────────────────────────────────────── */

function InfractionFormStep({
  ocrResult,
  imageUri,
  onBack,
}: {
  ocrResult: OcrResult;
  imageUri: string | null;
  onBack: () => void;
}) {
  const { state: locationState } = useAgentLocation();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [idInfraction] = useState(() => generateBusinessInfractionId());
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

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      matricule: ocrResult.plate_text.trim().toUpperCase(),
      dateInfraction: nowISODatetime(),
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
    } else if (locationState.kind === "denied" || locationState.kind === "unavailable") {
      setValue("lieu", "Localisation non disponible");
    }
  }, [locationState, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      let photoStorageId: string | undefined;
      if (imageUri) {
        const uploadUrl = await generateUploadUrl({});
        photoStorageId = await postImageToConvexUploadUrl(uploadUrl, imageUri, "image/jpeg");
      }

      await createInfraction({
        idInfraction,
        matricule: values.matricule.trim().toUpperCase(),
        dateInfraction: values.dateInfraction.trim(),
        typeInfraction: values.typeInfraction.trim(),
        description: values.description.trim(),
        montantAmende: values.montantAmende,
        statutInfraction: values.statutInfraction as StatutInfractionCreate,
        lieu: values.lieu.trim(),
        ...(currentAgent?.agentId ? { agentId: currentAgent.agentId } : {}),
        ...(photoStorageId ? { photoStorageId } : {}),
      });

      Toast.show({ type: "success", text1: "Infraction enregistrée avec succès." });
      onBack();
    } catch (e) {
      console.log("[Infraction] create with OCR flow error", e);
      const msg = mapInfractionError(e);
      setSubmitError(msg);
      Toast.show({ type: "error", text1: msg });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Screen footer={<FooterNav current="ai" />}>
      <Pressable onPress={onBack} style={s.backBtn}>
        <Text style={s.backBtnText}>← Nouvelle photo</Text>
      </Pressable>

      <Text style={s.title}>Formulaire d&apos;infraction</Text>
      <Text style={s.hint}>
        Plaque lue :{" "}
        <Text style={s.mono}>
          {ocrResult.plate_text.trim() !== ""
            ? ocrResult.plate_text
            : ocrResult.ocrServerStatus === "low_confidence"
              ? "(non lu — lecture peu fiable)"
              : ocrResult.ocrServerStatus === "not_detected"
                ? "(plaque non détectée)"
                : "(vide)"}
        </Text>{" "}
        — Réf. <Text style={s.mono}>{idInfraction}</Text>
      </Text>
      {(ocrResult.ocrServerStatus === "low_confidence" ||
        ocrResult.ocrServerStatus === "not_detected") && (
        <Text style={s.muted}>Complétez le matricule manuellement si besoin.</Text>
      )}

      {currentAgent && (
        <Text style={s.muted}>
          Agent : {currentAgent.nom} ({currentAgent.agentId})
        </Text>
      )}

      {/* Matricule (prefilled, editable) */}
      <Controller
        control={control}
        name="matricule"
        render={({ field }) => (
          <Input
            label="Plaque d'immatriculation"
            value={field.value}
            onChangeText={(t) => field.onChange(t.toUpperCase())}
          />
        )}
      />
      {errors.matricule && <ErrorState label={errors.matricule.message ?? ""} />}

      {/* Date / heure (prefilled) */}
      <Controller
        control={control}
        name="dateInfraction"
        render={({ field }) => (
          <Input label="Date et heure" value={field.value} onChangeText={field.onChange} />
        )}
      />
      {errors.dateInfraction && <ErrorState label={errors.dateInfraction.message ?? ""} />}

      {/* Lieu (auto from GPS) */}
      <Controller
        control={control}
        name="lieu"
        render={({ field }) => (
          <View style={s.lieuBox}>
            <Text style={s.lieuLabel}>Latitude, longitude</Text>
            <Text style={s.lieuText} selectable>
              {field.value.trim() !== ""
                ? field.value
                : locationState.kind === "loading" || locationState.kind === "idle"
                  ? "Récupération…"
                  : "—"}
            </Text>
          </View>
        )}
      />
      {errors.lieu && <ErrorState label={errors.lieu.message ?? ""} />}

      {/* Type d'infraction — dropdown chips */}
      <Text style={s.label}>Type d'infraction</Text>
      <Controller
        control={control}
        name="typeInfraction"
        render={({ field }) => (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
            <View style={s.chipRow}>
              {INFRACTION_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => field.onChange(cat)}
                  style={[s.chip, field.value === cat && s.chipOn]}
                >
                  <Text style={[s.chipTxt, field.value === cat && s.chipTxtOn]}>{cat}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      />
      {errors.typeInfraction && <ErrorState label={errors.typeInfraction.message ?? ""} />}

      {/* Description */}
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <Input label="Description" value={field.value} onChangeText={field.onChange} placeholder="Décrivez les faits constatés" />
        )}
      />
      {errors.description && <ErrorState label={errors.description.message ?? ""} />}

      {/* Montant */}
      <Controller
        control={control}
        name="montantAmende"
        render={({ field }) => (
          <Input
            label="Montant de l'amende (DT)"
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

      {/* Statut */}
      <Text style={s.label}>Statut</Text>
      <Controller
        control={control}
        name="statutInfraction"
        render={({ field }) => (
          <View style={s.chipRow}>
            {STATUT_INFRACTION_OPTIONS.map((st) => (
              <Pressable
                key={st}
                onPress={() => field.onChange(st)}
                style={[s.chip, field.value === st && s.chipOn]}
              >
                <Text style={[s.chipTxt, field.value === st && s.chipTxtOn]}>
                  {STATUT_INFRACTION_LABELS[st]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      {/* Photo preview (from OCR step) */}
      {imageUri && (
        <>
          <Text style={s.label}>Photo du véhicule</Text>
          <Image source={{ uri: imageUri }} style={s.imgPreview} resizeMode="cover" />
        </>
      )}

      {submitError && <ErrorState label={submitError} />}

      <Button label="Enregistrer l'infraction" onPress={onSubmit} loading={submitting} />
    </Screen>
  );
}

/* ── Small helper ──────────────────────────────────────────────────── */

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", color: "#101828" },
  hint: { fontSize: 13, color: "#667085", marginBottom: 8 },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#344054" },
  muted: { fontSize: 13, color: "#667085", marginBottom: 6 },
  label: { fontWeight: "600", marginBottom: 6, color: "#344054" },
  backBtn: { marginBottom: 8 },
  backBtnText: { fontSize: 15, fontWeight: "600", color: "#175CD3" },

  btnRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  btnHalf: { flex: 1 },

  preview: { width: "100%", height: 220, borderRadius: 14, backgroundColor: "#E4E7EC", marginBottom: 12 },

  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    gap: 10,
  },
  resultEyebrow: { fontSize: 11, fontWeight: "700", color: "#667085", textTransform: "uppercase", letterSpacing: 0.6 },
  ocrWarnBanner: {
    backgroundColor: "#FEF3F2",
    borderWidth: 1,
    borderColor: "#FECDCA",
    borderRadius: 10,
    padding: 10,
  },
  ocrWarnBannerText: { fontSize: 13, color: "#B42318", lineHeight: 18 },
  plateText: { fontSize: 32, fontWeight: "800", color: "#101828", textAlign: "center", letterSpacing: 1.5, paddingVertical: 8 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, alignItems: "center" },
  statLabel: { fontSize: 10, fontWeight: "600", color: "#667085", marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: "700", color: "#344054" },
  rawHint: { fontSize: 12, color: "#667085" },
  croppedImg: { width: "100%", height: 80, borderRadius: 8, backgroundColor: "#F2F4F7" },

  warnBox: { backgroundColor: "#FFFAEB", borderWidth: 1, borderColor: "#FEC84B", borderRadius: 12, padding: 12 },
  warnText: { fontSize: 13, color: "#93370D", lineHeight: 19 },

  lieuBox: { marginBottom: 12, padding: 12, backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E4E7EC" },
  lieuLabel: { fontSize: 12, fontWeight: "600", color: "#667085", marginBottom: 6 },
  lieuText: { fontSize: 14, color: "#101828", lineHeight: 20 },

  chipScroll: { marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F2F4F7", borderWidth: 1, borderColor: "#E4E7EC" },
  chipOn: { backgroundColor: "#155EEF", borderColor: "#155EEF" },
  chipTxt: { fontSize: 13, color: "#344054", fontWeight: "600" },
  chipTxtOn: { color: "#FFFFFF" },

  imgPreview: { width: "100%", height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: "#EEF2F6" },
});
