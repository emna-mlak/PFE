export type StatutInfraction = "ouverte" | "en_cours" | "resolue";

export interface Agent {
  agentId: string;
  nom: string;
  email: string;
  role: "agent" | "admin";
  statut: "actif" | "inactif";
}

export interface Vehicule {
  matricule: string;
  marque: string;
  modele: string;
  proprietaire: string;
}

export interface Vignette {
  matricule: string;
  numero: string;
  active: boolean;
  expiration: string;
}

export interface Infraction {
  id: string;
  matricule: string;
  motif: string;
  montant: number;
  statut: StatutInfraction;
  date: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  at: string;
}
