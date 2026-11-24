import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

export type AgentLocationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "denied" }
  | {
      kind: "ready";
      latitude: number;
      longitude: number;
      accuracyM: number | null;
    };

export type UseAgentLocationOptions = {
  fetchOnMount?: boolean;
};

export function useAgentLocation(options?: UseAgentLocationOptions) {
  const fetchOnMount = options?.fetchOnMount !== false;
  const [state, setState] = useState<AgentLocationState>(() =>
    fetchOnMount ? { kind: "loading" } : { kind: "idle" },
  );

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") {
      setState({
        kind: "unavailable",
        message: "La géolocalisation n’est pas disponible dans le navigateur pour cette application.",
      });
      return;
    }

    setState({ kind: "loading" });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setState({ kind: "denied" });
        return;
      }

      if (Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // optionnel
        }
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude, accuracy } = pos.coords;

      setState({
        kind: "ready",
        latitude,
        longitude,
        accuracyM: accuracy ?? null,
      });
    } catch (e) {
      setState({
        kind: "unavailable",
        message:
          e instanceof Error ? e.message : "Impossible d’obtenir la position. Réessayez plus tard.",
      });
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) void refresh();
  }, [fetchOnMount, refresh]);

  return { state, refresh };
}
