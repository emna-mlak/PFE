import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  collectInfractionsByMatriculeAliases,
  collectVignettesByMatriculeAliases,
  findVehiculeByMatriculeAliases,
} from "./matriculeResolve";

function now() {
  return Date.now();
}

function normalizeMatricule(matricule: string) {
  return matricule.trim().toUpperCase();
}

function assertValidCoordinates(
  latitude: number | undefined,
  longitude: number | undefined
) {
  if (latitude === undefined && longitude === undefined) {
    return;
  }
  if (latitude === undefined || longitude === undefined) {
    throw new Error("Latitude et longitude doivent être fournies ensemble");
  }
  if (latitude < -90 || latitude > 90) {
    throw new Error("Latitude invalide");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("Longitude invalide");
  }
}

async function assertStorageExists(ctx: MutationCtx, storageId: Id<"_storage">) {
  const meta = await ctx.storage.getMetadata(storageId);
  if (!meta) {
    throw new Error("Fichier photo introuvable ou expiré");
  }
}

async function infractionWithPhotoUrl(ctx: QueryCtx, row: Doc<"infractions">) {
  const photoUrl =
    row.photoStorageId !== undefined
      ? await ctx.storage.getUrl(row.photoStorageId)
      : null;
  return { ...row, photoUrl };
}

/** Used by `carLookup` so infraction lists resolve photo URLs in one place. */
export async function infractionsWithPhotoUrls(
  ctx: QueryCtx,
  rows: Doc<"infractions">[]
) {
  return Promise.all(rows.map((row) => infractionWithPhotoUrl(ctx, row)));
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    idInfraction: v.string(),
    matricule: v.string(),
    dateInfraction: v.string(),
    typeInfraction: v.string(),
    description: v.string(),
    montantAmende: v.number(),
    statutInfraction: v.union(
      v.literal("brouillon"),
      v.literal("enregistree"),
      v.literal("contestee"),
      v.literal("payee"),
      v.literal("annulee")
    ),
    lieu: v.string(),
    agentId: v.optional(v.string()),
    /** After uploading the file to the URL from `generateUploadUrl`, pass the returned storage id. */
    photoStorageId: v.optional(v.id("_storage")),
    /** GPS from the device (e.g. expo-location). Omit both if unknown. */
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { photoStorageId, latitude, longitude, ...fields } = args;
    assertValidCoordinates(latitude, longitude);
    if (photoStorageId) {
      await assertStorageExists(ctx, photoStorageId);
    }
    const ts = now();
    return await ctx.db.insert("infractions", {
      ...fields,
      ...(photoStorageId !== undefined ? { photoStorageId } : {}),
      ...(latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {}),
      matricule: normalizeMatricule(args.matricule),
      createdAt: ts,
      updatedAt: ts,
    });
  },
});

export const setPhoto = mutation({
  args: {
    idInfraction: v.string(),
    /** New file id from upload, or `null` to remove the photo. */
    photoStorageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("infractions")
      .withIndex("by_idInfraction", (q) => q.eq("idInfraction", args.idInfraction))
      .first();

    if (!existing) {
      throw new Error("Infraction introuvable");
    }

    const previousId = existing.photoStorageId;

    if (args.photoStorageId !== null) {
      await assertStorageExists(ctx, args.photoStorageId);
    }

    if (previousId && previousId !== args.photoStorageId) {
      await ctx.storage.delete(previousId);
    }

    await ctx.db.patch(existing._id, {
      ...(args.photoStorageId === null
        ? { photoStorageId: undefined }
        : { photoStorageId: args.photoStorageId }),
      updatedAt: now(),
    });

    return existing._id;
  },
});

export const updateStatut = mutation({
  args: {
    idInfraction: v.string(),
    statutInfraction: v.union(
      v.literal("brouillon"),
      v.literal("enregistree"),
      v.literal("contestee"),
      v.literal("payee"),
      v.literal("annulee")
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("infractions")
      .withIndex("by_idInfraction", (q) => q.eq("idInfraction", args.idInfraction))
      .first();

    if (!existing) {
      throw new Error("Infraction introuvable");
    }

    await ctx.db.patch(existing._id, {
      statutInfraction: args.statutInfraction,
      updatedAt: now(),
    });

    return existing._id;
  },
});

export const listByMatricule = query({
  args: {
    matricule: v.string(),
    matriculeSearchKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const extra = args.matriculeSearchKeys;
    const vehicule = await findVehiculeByMatriculeAliases(
      ctx,
      args.matricule,
      extra
    );
    const vignettes = await collectVignettesByMatriculeAliases(
      ctx,
      args.matricule,
      vehicule,
      extra
    );
    const rows = await collectInfractionsByMatriculeAliases(
      ctx,
      args.matricule,
      vehicule,
      vignettes,
      extra
    );
    return infractionsWithPhotoUrls(ctx, rows);
  },
});
