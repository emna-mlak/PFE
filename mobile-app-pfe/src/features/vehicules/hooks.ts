import { useVehiculeByMatricule } from "../../services/convex/api";

export const useVehiculeLookup = (matricule: string) => useVehiculeByMatricule(matricule);
