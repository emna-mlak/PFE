import type { VehicleBackendResult } from "../../types/vehicle";

export type AlertTier = "critical" | "warning" | "info";

export type AlertTrigger = {
  tier: AlertTier;
  /** Clé anti-spam (plaque normalisée ou préfixe `info:`). */
  plateKey: string;
  plate: string;
  title: string;
  ttsText: string;
  hideAfterMs: number;
  /** Niveau info uniquement. */
  message?: string;
};

type EngineOptions = {
  cooldownMs?: number;
  hideAfterMs?: number;
  infoCooldownMs?: number;
};

export class AlertEngine {
  private readonly cooldownMs: number;
  private readonly hideAfterMs: number;
  private readonly infoCooldownMs: number;
  private readonly lastByPlate = new Map<string, number>();
  private lastInfoAt = 0;

  constructor(options: EngineOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 12_000;
    this.hideAfterMs = options.hideAfterMs ?? 4_500;
    this.infoCooldownMs = options.infoCooldownMs ?? 4_500;
  }

  /**
   * Évalue le payload sans consommer le cooldown (pour décision UI / priorité critique).
   */
  peek(payload: VehicleBackendResult): AlertTrigger | null {
    const status = this.resolveStatus(payload);
    const infoMsg = this.resolveInfoMessage(payload);

    if (status === "vehicule_recherche" || status === "vignette_impayee") {
      const plate = String(payload.secondaryText ?? payload.matricule ?? "")
        .trim()
        .toUpperCase();
      if (!plate) return null;
      const key = plate.replace(/[^0-9A-Z]/g, "");
      const now = Date.now();
      const last = this.lastByPlate.get(key) ?? 0;
      if (now - last < this.cooldownMs) return null;

      if (status === "vehicule_recherche") {
        return {
          tier: "critical",
          plateKey: key,
          plate,
          title: "VEHICULE RECHERCHE",
          ttsText: `Alerte, vehicule recherche ${plate}`,
          hideAfterMs: Math.max(this.hideAfterMs, 5_000),
        };
      }
      return {
        tier: "warning",
        plateKey: key,
        plate,
        title: "VIGNETTE IMPAYEE",
        ttsText: `Attention, vehicule ${plate}, vignette impayee`,
        hideAfterMs: this.hideAfterMs,
      };
    }

    if (infoMsg) {
      const now = Date.now();
      if (now - this.lastInfoAt < this.infoCooldownMs) return null;
      const slug = infoMsg.slice(0, 24).replace(/\s+/g, "_");
      return {
        tier: "info",
        plateKey: `info:${slug}`,
        plate: "",
        title: "INFO",
        message: infoMsg,
        ttsText: "",
        hideAfterMs: 2_400,
      };
    }

    return null;
  }

  /** Enregistre le déclenchement (cooldown) après affichage accepté. */
  commit(plateKey: string, tier: AlertTier): void {
    const now = Date.now();
    if (tier === "info") {
      this.lastInfoAt = now;
      return;
    }
    this.lastByPlate.set(plateKey, now);
  }

  private resolveInfoMessage(payload: VehicleBackendResult): string | null {
    const o = payload as Record<string, unknown>;
    const raw = o.terrainInfo ?? o.infoBanner ?? o.uiInfo;
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return t.slice(0, 56);
  }

  private resolveStatus(payload: VehicleBackendResult): "vignette_impayee" | "vehicule_recherche" | null {
    const rawStatus = String(payload.vehicleStatus ?? "").trim().toLowerCase();
    if (rawStatus === "vehicule_recherche" || rawStatus === "recherche") return "vehicule_recherche";
    if (rawStatus === "vignette_impayee") return "vignette_impayee";

    if (payload.vehiculeRecherche === true) return "vehicule_recherche";

    const legacyVehicleStatus = String(payload.statutVehicule ?? "").trim().toLowerCase();
    if (legacyVehicleStatus === "recherche") return "vehicule_recherche";
    return null;
  }
}
