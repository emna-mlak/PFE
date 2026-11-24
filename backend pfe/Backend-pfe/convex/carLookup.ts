import { query } from "./_generated/server";
import { v } from "convex/values";
import { infractionsWithPhotoUrls } from "./infractions";
import {
  collectVignettesByMatriculeAliases,
  findVehiculeByMatriculeAliases,
  listInfractionsByMatriculeAliases,
  mergeMatriculeAliasKeys,
} from "./matriculeResolve";

function activeVignetteFromList(
  vignettes: Array<{ statutPaiement: string; dateExpiration: string }>
) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    vignettes.find(
      (row) => row.statutPaiement === "paye" && row.dateExpiration >= today
    ) ?? null
  );
}

/**
 * Single round-trip for mobile: vehicle + vignettes + active vignette + recent infractions.
 */
export const getByPlate = query({
  args: {
    matricule: v.string(),
    /** Max infractions returned (newest first). Default 50. */
    infractionsLimit: v.optional(v.number()),
    /** Variantes explicites (ex. client Python) ; fusionnées avec les dérivations serveur. */
    matriculeSearchKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const raw = args.matricule;
    const extra = args.matriculeSearchKeys;
    const limit = Math.min(Math.max(args.infractionsLimit ?? 50, 1), 200);

    const vehicule = await findVehiculeByMatriculeAliases(ctx, raw, extra);
    const matriculeNormalized =
      vehicule?.matricule ??
      mergeMatriculeAliasKeys(raw, extra)[0] ??
      raw.trim().toUpperCase();
    const vignettes = await collectVignettesByMatriculeAliases(
      ctx,
      raw,
      vehicule,
      extra
    );

    const activeVignette = activeVignetteFromList(vignettes);

    const infractionRows = await listInfractionsByMatriculeAliases(
      ctx,
      raw,
      vehicule,
      vignettes,
      limit,
      extra
    );

    const infractions = await infractionsWithPhotoUrls(ctx, infractionRows);

    const hasAnyData =
      vehicule !== null || vignettes.length > 0 || infractions.length > 0;

    return {
      matriculeNormalized,
      vehicule,
      vignettes,
      activeVignette,
      infractions,
      hasAnyData,
    };
  },
});
