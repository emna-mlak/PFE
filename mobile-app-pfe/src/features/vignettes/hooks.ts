import { useVignetteActiveByMatricule, useVignettesByMatricule } from "../../services/convex/api";

export const useVignettes = (matricule: string) => useVignettesByMatricule(matricule);
export const useVignetteActive = (matricule: string) => useVignetteActiveByMatricule(matricule);
