import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConvexHttpClient } from "convex/browser";

import { env } from "../../config/env";
import { Agent, AuditLog, Infraction, StatutInfraction, Vehicule, Vignette } from "../../types/domain";

if (!env.convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL non configure");
}

const convexHttp = new ConvexHttpClient(env.convexUrl);

export const convexApi = {
  agents: {
    async login(input: { email: string; password: string; deviceInfo?: string }) {
      return convexHttp.mutation("agents:login" as never, input as never) as Promise<{
        success: true;
        agent: Agent;
      }>;
    },
    async logout(input: { agentId: string; deviceInfo?: string }) {
      return convexHttp.mutation("agents:logout" as never, input as never) as Promise<{ success: true }>;
    },
    async setPassword(input: { agentId: string; newPassword: string }) {
      return convexHttp.mutation("agents:setPassword" as never, input as never) as Promise<{ success: true }>;
    },
    async getCurrentAgent(input: { authUserId: string }) {
      return convexHttp.query("agents:getCurrentAgent" as never, input as never) as Promise<Agent | null>;
    },
  },
  vehicules: {
    async getByMatricule(input: { matricule: string }) {
      return convexHttp.query("vehicules:getByMatricule" as never, input as never) as Promise<Vehicule | null>;
    },
  },
  vignettes: {
    async getByMatricule(input: { matricule: string }) {
      return convexHttp.query("vignettes:getByMatricule" as never, input as never) as Promise<Vignette[]>;
    },
    async getActiveByMatricule(input: { matricule: string }) {
      return convexHttp.query("vignettes:getActiveByMatricule" as never, input as never) as Promise<Vignette | null>;
    },
  },
  infractions: {
    async create(input: Record<string, unknown>) {
      return convexHttp.mutation("infractions:create" as never, input as never) as Promise<Infraction>;
    },
    async listByMatricule(input: { matricule: string }) {
      return convexHttp.query("infractions:listByMatricule" as never, input as never) as Promise<Infraction[]>;
    },
    async updateStatut(input: { idInfraction: string; statutInfraction: StatutInfraction }) {
      return convexHttp.mutation("infractions:updateStatut" as never, input as never) as Promise<Infraction>;
    },
  },
  audit: {
    async logAction(input: Record<string, unknown>) {
      return convexHttp.mutation("audit:logAction" as never, input as never) as Promise<{ success: true }>;
    },
    async listByActorAgentId(input: { actorAgentId: string }) {
      return convexHttp.query("audit:listByActorAgentId" as never, input as never) as Promise<AuditLog[]>;
    },
  },
};

export function useCurrentAgent(authUserId: string) {
  return useQuery({
    queryKey: ["agents.getCurrentAgent", authUserId],
    queryFn: () => convexApi.agents.getCurrentAgent({ authUserId }),
    enabled: Boolean(authUserId),
  });
}

export function useVehiculeByMatricule(matricule: string) {
  return useQuery({
    queryKey: ["vehicules.getByMatricule", matricule],
    queryFn: () => convexApi.vehicules.getByMatricule({ matricule }),
    enabled: Boolean(matricule),
  });
}

export function useVignettesByMatricule(matricule: string) {
  return useQuery({
    queryKey: ["vignettes.getByMatricule", matricule],
    queryFn: () => convexApi.vignettes.getByMatricule({ matricule }),
    enabled: Boolean(matricule),
  });
}

export function useVignetteActiveByMatricule(matricule: string) {
  return useQuery({
    queryKey: ["vignettes.getActiveByMatricule", matricule],
    queryFn: () => convexApi.vignettes.getActiveByMatricule({ matricule }),
    enabled: Boolean(matricule),
  });
}

export function useCreateInfraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: convexApi.infractions.create,
    onSuccess: (value) => {
      qc.invalidateQueries({ queryKey: ["infractions.listByMatricule", value.matricule] });
    },
  });
}

export function useInfractionsByMatricule(matricule: string) {
  return useQuery({
    queryKey: ["infractions.listByMatricule", matricule],
    queryFn: () => convexApi.infractions.listByMatricule({ matricule }),
    enabled: Boolean(matricule),
  });
}

export function useUpdateInfractionStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idInfraction, statutInfraction }: { idInfraction: string; statutInfraction: StatutInfraction }) =>
      convexApi.infractions.updateStatut({ idInfraction, statutInfraction }),
    onSuccess: (value) => {
      qc.invalidateQueries({ queryKey: ["infractions.listByMatricule", value.matricule] });
    },
  });
}

export function useLogAction() {
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => convexApi.audit.logAction(input),
  });
}

export function useAuditLogs(actorAgentId: string) {
  return useQuery({
    queryKey: ["audit.listByActorAgentId", actorAgentId],
    queryFn: () => convexApi.audit.listByActorAgentId({ actorAgentId }),
    enabled: Boolean(actorAgentId),
  });
}
