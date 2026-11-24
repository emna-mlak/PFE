import { useMutation } from "@tanstack/react-query";

import { authStorage, agentStorage, tokenStorage } from "../../lib/storage";
import { convexApi } from "../../services/convex/api";

/** Match typical Convex agent lookups (trim + lowercase). */
function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function useLogin() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const result = await convexApi.agents.login({
        email: normalizeLoginEmail(email),
        password,
        deviceInfo: "expo-mobile",
      });
      if (!result?.agent?.agentId) {
        throw new Error("Reponse login invalide depuis Convex.");
      }
      await tokenStorage.set(`session-${result.agent.agentId}`);
      await authStorage.setAgentId(result.agent.agentId);
      await authStorage.setAuthUserId(result.agent.agentId);
      await agentStorage.setProfile(JSON.stringify(result.agent));
      return result;
    },
  });
}

export function useSetPassword() {
  return useMutation({
    mutationFn: ({ agentId, newPassword }: { agentId: string; newPassword: string }) =>
      convexApi.agents.setPassword({ agentId, newPassword }),
  });
}
