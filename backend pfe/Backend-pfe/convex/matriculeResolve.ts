import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * OCR / affichage envoie souvent "217 TUN 4505" alors que la base peut stocker
 * "217TUN4505", "217-TUN-4505", etc. On essaie plusieurs clés compatibles avec l'index.
 */
export function matriculeSearchKeys(raw: string): string[] {
  const u = raw.trim().toUpperCase();
  const strip = u.replace(/[\s-]+/g, "");
  const spaced = u.replace(/\s+/g, " ").trim();
  return [...new Set([strip, spaced, u].filter((k) => k.length > 0))];
}

/**
 * Clés client (ex. Python) en premier, puis dérivations depuis `raw`.
 * Permet compact en base + `matricule` compact côté client sans perdre "217 TUN 4505".
 */
export function mergeMatriculeAliasKeys(
  raw: string,
  extraKeys?: string[] | null
): string[] {
  const normalizedExtra = (extraKeys ?? [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k.length > 0);
  const fromRaw = matriculeSearchKeys(raw);
  return [...new Set([...normalizedExtra, ...fromRaw])];
}

export async function findVehiculeByMatriculeAliases(
  ctx: QueryCtx,
  raw: string,
  extraKeys?: string[] | null
): Promise<Doc<"vehicules"> | null> {
  for (const key of mergeMatriculeAliasKeys(raw, extraKeys)) {
    const row = await ctx.db
      .query("vehicules")
      .withIndex("by_matricule", (q) => q.eq("matricule", key))
      .first();
    if (row) return row;
  }
  return null;
}

export async function collectVignettesByMatriculeAliases(
  ctx: QueryCtx,
  raw: string,
  vehicule: Doc<"vehicules"> | null,
  extraKeys?: string[] | null
): Promise<Doc<"vignettes">[]> {
  if (vehicule) {
    return await ctx.db
      .query("vignettes")
      .withIndex("by_matricule", (q) => q.eq("matricule", vehicule.matricule))
      .collect();
  }
  for (const key of mergeMatriculeAliasKeys(raw, extraKeys)) {
    const rows = await ctx.db
      .query("vignettes")
      .withIndex("by_matricule", (q) => q.eq("matricule", key))
      .collect();
    if (rows.length > 0) return rows;
  }
  return [];
}

export async function collectInfractionsByMatriculeAliases(
  ctx: QueryCtx,
  raw: string,
  vehicule: Doc<"vehicules"> | null,
  vignettes: Doc<"vignettes">[],
  extraKeys?: string[] | null
): Promise<Doc<"infractions">[]> {
  const orderedKeys = [
    vehicule?.matricule,
    vignettes[0]?.matricule,
    ...mergeMatriculeAliasKeys(raw, extraKeys),
  ].filter((k): k is string => Boolean(k));
  const uniqueKeys = [...new Set(orderedKeys)];
  for (const key of uniqueKeys) {
    const rows = await ctx.db
      .query("infractions")
      .withIndex("by_matricule", (q) => q.eq("matricule", key))
      .order("desc")
      .collect();
    if (rows.length > 0) return rows;
  }
  if (uniqueKeys.length === 0) return [];
  return await ctx.db
    .query("infractions")
    .withIndex("by_matricule", (q) =>
      q.eq("matricule", uniqueKeys[uniqueKeys.length - 1]!)
    )
    .order("desc")
    .collect();
}

export async function listInfractionsByMatriculeAliases(
  ctx: QueryCtx,
  raw: string,
  vehicule: Doc<"vehicules"> | null,
  vignettes: Doc<"vignettes">[],
  limit: number,
  extraKeys?: string[] | null
): Promise<Doc<"infractions">[]> {
  const rows = await collectInfractionsByMatriculeAliases(
    ctx,
    raw,
    vehicule,
    vignettes,
    extraKeys
  );
  return rows.slice(0, limit);
}
