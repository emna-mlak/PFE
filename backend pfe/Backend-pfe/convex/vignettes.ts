import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  collectVignettesByMatriculeAliases,
  findVehiculeByMatriculeAliases,
} from "./matriculeResolve";

function now() {
  return Date.now();
}

function normalizeMatricule(matricule: string) {
  return matricule.trim().toUpperCase();
}

export const upsertVignette = mutation({
  args: {
    idVignette: v.string(),
    matricule: v.string(),
    annee: v.number(),
    montant: v.number(),
    datePaiement: v.string(),
    dateExpiration: v.string(),
    statutPaiement: v.union(v.literal("paye"), v.literal("impaye"), v.literal("expire")),
  },
  handler: async (ctx, args) => {
    const ts = now();
    const matricule = normalizeMatricule(args.matricule);

    const existing = await ctx.db
      .query("vignettes")
      .withIndex("by_idVignette", (q) => q.eq("idVignette", args.idVignette))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        matricule,
        annee: args.annee,
        montant: args.montant,
        datePaiement: args.datePaiement,
        dateExpiration: args.dateExpiration,
        statutPaiement: args.statutPaiement,
        updatedAt: ts,
      });
      return existing._id;
    }

    return await ctx.db.insert("vignettes", {
      ...args,
      matricule,
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
    const vehicule = await findVehiculeByMatriculeAliases(
      ctx,
      args.matricule,
      args.matriculeSearchKeys
    );
    return await collectVignettesByMatriculeAliases(
      ctx,
      args.matricule,
      vehicule,
      args.matriculeSearchKeys
    );
  },
});

export const getActiveByMatricule = query({
  args: {
    matricule: v.string(),
    matriculeSearchKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const vehicule = await findVehiculeByMatriculeAliases(
      ctx,
      args.matricule,
      args.matriculeSearchKeys
    );
    const all = await collectVignettesByMatriculeAliases(
      ctx,
      args.matricule,
      vehicule,
      args.matriculeSearchKeys
    );

    const today = new Date().toISOString().slice(0, 10);
    return (
      all.find(
        (vignette) =>
          vignette.statutPaiement === "paye" && vignette.dateExpiration >= today
      ) ?? null
    );
  },
});
