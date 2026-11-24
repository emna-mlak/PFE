/** Aligné sur le schéma Convex `infractions.create` */
export type StatutInfractionCreate =
  | "brouillon"
  | "enregistree"
  | "contestee"
  | "payee"
  | "annulee";

export const STATUT_INFRACTION_OPTIONS: readonly StatutInfractionCreate[] = [
  "brouillon",
  "enregistree",
  "contestee",
  "payee",
  "annulee",
] as const;

/** Libellés affichés dans l’app (les valeurs envoyées au serveur restent inchangées). */
export const STATUT_INFRACTION_LABELS: Record<StatutInfractionCreate, string> = {
  brouillon: "Brouillon",
  enregistree: "Enregistrée",
  contestee: "Contestée",
  payee: "Payée",
  annulee: "Annulée",
};
