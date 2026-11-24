/**
 * Sortie de `carLookup.getByPlate` (aligné sur le schéma Convex).
 * Les documents peuient contenir d'autres champs.
 */
export type VehiculeDoc = {
  _id?: string;
  matricule?: string;
  marque?: string;
  modele?: string;
  proprietaire?: string;
  [key: string]: unknown;
};

export type VignetteDoc = {
  _id?: string;
  matricule?: string;
  numero?: string;
  statutPaiement?: string;
  dateExpiration?: string;
  [key: string]: unknown;
};

export type InfractionDoc = {
  _id?: string;
  id?: string;
  matricule?: string;
  motif?: string;
  montant?: number;
  statut?: string;
  date?: string;
  [key: string]: unknown;
};

export type CarLookupByPlateResult = {
  matriculeNormalized: string;
  vehicule: VehiculeDoc | null;
  vignettes: VignetteDoc[];
  activeVignette: VignetteDoc | null;
  infractions: InfractionDoc[];
  hasAnyData: boolean;
};
