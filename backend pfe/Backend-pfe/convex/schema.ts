import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    agentId: v.string(),
    authUserId: v.string(),
    email: v.string(),
    nom: v.string(),
    role: v.union(v.literal("agent"), v.literal("admin")),
    statut: v.union(v.literal("actif"), v.literal("inactif")),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"]),

  vehicules: defineTable({
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idVehicule", ["idVehicule"])
    .index("by_matricule", ["matricule"]),

  vignettes: defineTable({
    idVignette: v.string(),
    matricule: v.string(),
    annee: v.number(),
    montant: v.number(),
    datePaiement: v.string(),
    dateExpiration: v.string(),
    statutPaiement: v.union(v.literal("paye"), v.literal("impaye"), v.literal("expire")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idVignette", ["idVignette"])
    .index("by_matricule", ["matricule"])
    .index("by_matricule_annee", ["matricule", "annee"]),

  infractions: defineTable({
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
    /** Set after client uploads via generateUploadUrl; use photoUrl from queries for display. */
    photoStorageId: v.optional(v.id("_storage")),
    /** GPS when the agent records on site (WGS84 decimal degrees). Both or neither. */
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idInfraction", ["idInfraction"])
    .index("by_matricule", ["matricule"])
    .index("by_statutInfraction", ["statutInfraction"])
    .index("by_dateInfraction", ["dateInfraction"]),

  auditLogs: defineTable({
    actorAgentId: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_actorAgentId", ["actorAgentId"])
    .index("by_action", ["action"])
    .index("by_createdAt", ["createdAt"]),

  roadLaws: defineTable({
    article: v.string(),
    type: v.optional(v.string()),
    description: v.optional(v.string()),
    details: v.optional(v.string()),
    sanction: v.optional(v.string()),
    keywords: v.array(v.string()),
  })
    .index("by_article", ["article"])
    .index("by_type", ["type"]),
});
