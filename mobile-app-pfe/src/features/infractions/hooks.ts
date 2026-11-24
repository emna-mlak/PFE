import { useCreateInfraction, useInfractionsByMatricule, useUpdateInfractionStatut } from "../../services/convex/api";

export const useInfractions = (matricule: string) => useInfractionsByMatricule(matricule);
export const useCreateInfractionAction = () => useCreateInfraction();
export const useUpdateInfractionStatutAction = () => useUpdateInfractionStatut();
