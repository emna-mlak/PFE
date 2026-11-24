import { mutation } from "./_generated/server";
import { importRoadLawsBatch } from "./roadLaws";
import tunisiaRoadLaws from "../data/tunisia_road_laws.json";

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const ts = Date.now();

    const existingVehicle = await ctx.db
      .query("vehicules")
      .withIndex("by_matricule", (q) => q.eq("matricule", "12345-A-6"))
      .first();

    if (!existingVehicle) {
      await ctx.db.insert("vehicules", {
        idVehicule: "VH-001",
        matricule: "12345-A-6",
        marque: "Dacia",
        modele: "Logan",
        couleur: "Blanc",
        typeVehicule: "voiture",
        categorie: "particulier",
        anneeMiseEnCirculation: 2019,
        statutVehicule: "actif",
        vehiculeRecherche: false,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const existingVignette = await ctx.db
      .query("vignettes")
      .withIndex("by_idVignette", (q) => q.eq("idVignette", "VG-001"))
      .first();

    if (!existingVignette) {
      await ctx.db.insert("vignettes", {
        idVignette: "VG-001",
        matricule: "12345-A-6",
        annee: 2026,
        montant: 700,
        datePaiement: "2026-01-10",
        dateExpiration: "2026-12-31",
        statutPaiement: "paye",
        createdAt: ts,
        updatedAt: ts,
      });
    }

    const existingAgent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", "AG-001"))
      .first();

    if (!existingAgent) {
      await ctx.db.insert("agents", {
        agentId: "AG-001",
        authUserId: "demo-auth-user-1",
        email: "agent1@demo.local",
        nom: "Agent Demo",
        role: "agent",
        statut: "actif",
        createdAt: ts,
        updatedAt: ts,
      });
    }

    return { ok: true };
  },
});

type TunisiaRoadLawJson = {
  article: string;
  type?: string;
  description?: string;
  details?: string;
  sanction?: string;
  keywords: string[];
};

export const seedRoadLaws = mutation({
  args: {},
  handler: async (ctx) => {
    const laws = tunisiaRoadLaws as TunisiaRoadLawJson[];
    const payload = laws.map((law) => ({
      article: law.article,
      ...(law.type !== undefined && law.type !== "" ? { type: law.type } : {}),
      ...(law.description !== undefined && law.description !== ""
        ? { description: law.description }
        : {}),
      ...(law.details !== undefined && law.details !== "" ? { details: law.details } : {}),
      ...(law.sanction !== undefined && law.sanction !== ""
        ? { sanction: law.sanction }
        : {}),
      keywords: law.keywords ?? [],
    }));
    return await importRoadLawsBatch(ctx, payload);
  },
});
