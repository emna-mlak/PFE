import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  collectVignettesByMatriculeAliases,
  findVehiculeByMatriculeAliases,
  mergeMatriculeAliasKeys,
} from "./matriculeResolve";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type VignetteIssue =
  | "absente"
  | "impaye"
  | "expiree"
  | "ok";

function classifyVignettes(
  rows: Doc<"vignettes">[],
  today: string
): { vignetteStatus: string; issue: VignetteIssue } {
  if (rows.length === 0) {
    return { vignetteStatus: "absente", issue: "absente" };
  }
  if (rows.some((r) => r.statutPaiement === "impaye")) {
    return { vignetteStatus: "non_payee", issue: "impaye" };
  }
  const hasExpire =
    rows.some((r) => r.statutPaiement === "expire") ||
    rows.some((r) => r.statutPaiement === "paye" && r.dateExpiration < today);
  if (hasExpire) {
    return { vignetteStatus: "expiree", issue: "expiree" };
  }
  const hasValid = rows.some(
    (r) => r.statutPaiement === "paye" && r.dateExpiration >= today
  );
  if (hasValid) {
    return { vignetteStatus: "payee_valide", issue: "ok" };
  }
  return { vignetteStatus: "expiree", issue: "expiree" };
}

/**
 * Statut métier consolidé pour affichage (ex. lunettes / LCD) : priorité
 * véhicule recherché > vignette (impayée / absente / expirée) > OK.
 */
export const getVehicleStatusByMatricule = query({
  args: {
    matricule: v.string(),
    /** Variantes explicites (ex. client Python) ; fusionnées avec les dérivations serveur. */
    matriculeSearchKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const raw = args.matricule;
    const extra = args.matriculeSearchKeys;
    const today = todayISO();

    const vehicule = await findVehiculeByMatriculeAliases(ctx, raw, extra);
    const matricule =
      vehicule?.matricule ??
      mergeMatriculeAliasKeys(raw, extra)[0] ??
      raw.trim().toUpperCase();
    const vignettes = await collectVignettesByMatriculeAliases(
      ctx,
      raw,
      vehicule,
      extra
    );

    const { vignetteStatus, issue } = classifyVignettes(vignettes, today);

    if (!vehicule) {
      return {
        matricule,
        vehicleFound: false,
        wantedVehicle: false,
        vignetteStatus: vignettes.length === 0 ? "inconnue" : vignetteStatus,
        vehicleStatus: "inconnu" as const,
        alertLevel: "medium" as const,
        message: "Véhicule inconnu dans la base",
      };
    }

    const wantedVehicle =
      vehicule.vehiculeRecherche === true || vehicule.statutVehicule === "recherche";

    if (wantedVehicle) {
      return {
        matricule,
        vehicleFound: true,
        wantedVehicle: true,
        vignetteStatus,
        vehicleStatus: "vehicule_recherche" as const,
        alertLevel: "critical" as const,
        message: "Véhicule recherché",
      };
    }

    if (issue === "impaye" || issue === "absente") {
      return {
        matricule,
        vehicleFound: true,
        wantedVehicle: false,
        vignetteStatus: issue === "absente" ? "absente" : "non_payee",
        vehicleStatus: "vignette_impayee" as const,
        alertLevel: "high" as const,
        message:
          issue === "absente"
            ? "Vignette absente ou non enregistrée"
            : "Vignette impayée",
      };
    }

    if (issue === "expiree") {
      return {
        matricule,
        vehicleFound: true,
        wantedVehicle: false,
        vignetteStatus: "expiree",
        vehicleStatus: "vignette_expiree" as const,
        alertLevel: "high" as const,
        message: "Vignette expirée",
      };
    }

    return {
      matricule,
      vehicleFound: true,
      wantedVehicle: false,
      vignetteStatus: "payee_valide",
      vehicleStatus: "ok" as const,
      alertLevel: "low" as const,
      message: "Véhicule en règle",
    };
  },
});
