import type { AgentLocationState } from "./useAgentLocation";

export function formatGpsCoordinates(state: Extract<AgentLocationState, { kind: "ready" }>): string {
  return `${state.latitude.toFixed(5)}, ${state.longitude.toFixed(5)}`;
}

/** Texte affiché et enregistré dans le champ `lieu` : latitude, longitude (+ précision). */
export function formatLocationTextAsOnMainScreen(state: AgentLocationState): string | null {
  if (state.kind !== "ready") return null;

  const coords = formatGpsCoordinates(state);
  if (state.accuracyM != null) {
    return `${coords}\nPrécision ≈ ${Math.round(state.accuracyM)} m`;
  }
  return coords;
}
