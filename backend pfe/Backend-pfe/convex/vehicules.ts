import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { findVehiculeByMatriculeAliases } from "./matriculeResolve";

function now() {
  return Date.now();
}

function normalizeMatricule(matricule: string) {
  return matricule.trim().toUpperCase();
}

export const upsertVehicule = mutation({
  args: {
    idVehicule: v.string(),
    matricule: v.string(),
    marque: v.string(),
    modele: v.string(),
    couleur: v.string(),
    typeVehicule: v.string(),
    categorie: v.string(),
    anneeMiseEnCirculation: v.number(),
    statutVehicule: v.union(
      v.literal("actif"),
      v.literal("saisi"),
      v.literal("recherche"),
      v.literal("inactif")
    ),
    vehiculeRecherche: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const matricule = normalizeMatricule(args.matricule);
    const ts = now();
    const vehiculeRecherche = args.vehiculeRecherche ?? args.statutVehicule === "recherche";

    const existing = await ctx.db
      .query("vehicules")
      .withIndex("by_idVehicule", (q) => q.eq("idVehicule", args.idVehicule))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        matricule,
        marque: args.marque,
        modele: args.modele,
        couleur: args.couleur,
        typeVehicule: args.typeVehicule,
        categorie: args.categorie,
        anneeMiseEnCirculation: args.anneeMiseEnCirculation,
        statutVehicule: args.statutVehicule,
        vehiculeRecherche,
        updatedAt: ts,
      });
      return existing._id;
    }

    return await ctx.db.insert("vehicules", {
      ...args,
      matricule,
      vehiculeRecherche,
      createdAt: ts,
      updatedAt: ts,
    });
  },
});

export const getByMatricule = query({
  args: {
    matricule: v.string(),
    matriculeSearchKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await findVehiculeByMatriculeAliases(
      ctx,
      args.matricule,
      args.matriculeSearchKeys
    );
  },
});
