/** Lecture insensible à la casse (API souvent en MAJUSCULES) */
export function getRecordField(
  record: Record<string, unknown>,
  ...candidates: string[]
): unknown {
  const keys = Object.keys(record);
  for (const want of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === want.toLowerCase());
    if (hit !== undefined) return record[hit];
  }
  return undefined;
}

/** Champs déjà mis en avant sur la fiche infraction — le reste apparaît sous « Plus » */
export const HERO_INFRACTION_KEYS = new Set([
  "description",
  "typeinfraction",
  "statutinfraction",
  "dateinfraction",
  "lieu",
  "montantamende",
  "idinfraction",
  /** Affiché comme image dans la fiche, pas comme texte */
  "photourl",
  "photostorageid",
]);

export function getExtraInfractionEntries(
  record: Record<string, unknown>,
): [string, unknown][] {
  return Object.entries(record)
    .filter(([k]) => !HERO_INFRACTION_KEYS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
}

export function formatMontant(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) return `${n} DT`;
  return String(value);
}

export function formatDateInfraction(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}
