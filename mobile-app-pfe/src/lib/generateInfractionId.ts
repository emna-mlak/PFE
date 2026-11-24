/** Identifiant métier unique pour `idInfraction` (distinct du `_id` Convex). */
export function generateBusinessInfractionId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return `inf_${c.randomUUID()}`;
  }
  return `inf_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
