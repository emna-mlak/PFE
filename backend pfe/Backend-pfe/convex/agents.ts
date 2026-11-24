import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function now() {
  return Date.now();
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltHex(size = 16) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function hashPassword(password: string, salt: string) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export const upsertAgent = mutation({
  args: {
    agentId: v.string(),
    authUserId: v.string(),
    email: v.string(),
    nom: v.string(),
    role: v.union(v.literal("agent"), v.literal("admin")),
    statut: v.union(v.literal("actif"), v.literal("inactif")),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    const ts = now();
    const passwordSalt = args.password ? randomSaltHex() : undefined;
    const passwordHash = args.password ? await hashPassword(args.password, passwordSalt!) : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        authUserId: args.authUserId,
        email: args.email,
        nom: args.nom,
        role: args.role,
        statut: args.statut,
        ...(passwordHash && passwordSalt ? { passwordHash, passwordSalt } : {}),
        updatedAt: ts,
      });
      return existing._id;
    }

    return await ctx.db.insert("agents", {
      agentId: args.agentId,
      authUserId: args.authUserId,
      email: args.email,
      nom: args.nom,
      role: args.role,
      statut: args.statut,
      ...(passwordHash && passwordSalt ? { passwordHash, passwordSalt } : {}),
      createdAt: ts,
      updatedAt: ts,
    });
  },
});

export const getCurrentAgent = query({
  args: {
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
  },
});

export const getByAgentId = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    deviceInfo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!agent || agent.statut !== "actif") {
      await ctx.db.insert("auditLogs", {
        action: "AUTH_LOGIN_FAILED",
        entityType: "agent",
        entityId: agent?.agentId ?? email,
        metadata: {
          reason: !agent ? "agent_not_found" : "agent_inactive",
          email,
          deviceInfo: args.deviceInfo,
        },
        createdAt: now(),
      });
      throw new Error("Authentification echouee");
    }

    if (!agent.passwordHash || !agent.passwordSalt) {
      await ctx.db.insert("auditLogs", {
        actorAgentId: agent.agentId,
        action: "AUTH_LOGIN_FAILED",
        entityType: "agent",
        entityId: agent.agentId,
        metadata: {
          reason: "password_not_set",
          email,
          deviceInfo: args.deviceInfo,
        },
        createdAt: now(),
      });
      throw new Error("Mot de passe non configure");
    }

    const computedHash = await hashPassword(args.password, agent.passwordSalt);
    if (computedHash !== agent.passwordHash) {
      await ctx.db.insert("auditLogs", {
        actorAgentId: agent.agentId,
        action: "AUTH_LOGIN_FAILED",
        entityType: "agent",
        entityId: agent.agentId,
        metadata: {
          reason: "invalid_password",
          email,
          deviceInfo: args.deviceInfo,
        },
        createdAt: now(),
      });
      throw new Error("Authentification echouee");
    }

    await ctx.db.insert("auditLogs", {
      actorAgentId: agent.agentId,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "agent",
      entityId: agent.agentId,
      metadata: {
        email,
        deviceInfo: args.deviceInfo,
      },
      createdAt: now(),
    });

    return {
      success: true,
      agent: {
        agentId: agent.agentId,
        email: agent.email,
        nom: agent.nom,
        role: agent.role,
        statut: agent.statut,
      },
    };
  },
});

export const updateProfile = mutation({
  args: {
    agentId: v.string(),
    nom: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error("Agent introuvable");
    }

    const patch: {
      nom?: string;
      email?: string;
      updatedAt: number;
    } = { updatedAt: now() };

    const changedFields: string[] = [];

    if (args.nom !== undefined) {
      const nom = args.nom.trim();
      if (!nom) {
        throw new Error("Le nom ne peut pas etre vide");
      }
      patch.nom = nom;
      changedFields.push("nom");
    }

    if (args.email !== undefined) {
      const email = args.email.trim().toLowerCase();
      if (!email) {
        throw new Error("L'email ne peut pas etre vide");
      }
      const other = await ctx.db
        .query("agents")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (other && other._id !== agent._id) {
        throw new Error("Cet email est deja utilise");
      }
      patch.email = email;
      changedFields.push("email");
    }

    if (changedFields.length === 0) {
      throw new Error("Aucune modification");
    }

    await ctx.db.patch(agent._id, patch);

    await ctx.db.insert("auditLogs", {
      actorAgentId: agent.agentId,
      action: "AGENT_PROFILE_UPDATED",
      entityType: "agent",
      entityId: agent.agentId,
      metadata: { fields: changedFields },
      createdAt: now(),
    });

    const updated = await ctx.db.get(agent._id);
    if (!updated) {
      throw new Error("Agent introuvable");
    }

    return {
      success: true,
      agent: {
        agentId: updated.agentId,
        email: updated.email,
        nom: updated.nom,
        role: updated.role,
        statut: updated.statut,
      },
    };
  },
});

export const setPassword = mutation({
  args: {
    agentId: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caracteres");
    }

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error("Agent introuvable");
    }

    const passwordSalt = randomSaltHex();
    const passwordHash = await hashPassword(args.newPassword, passwordSalt);

    await ctx.db.patch(agent._id, {
      passwordHash,
      passwordSalt,
      updatedAt: now(),
    });

    await ctx.db.insert("auditLogs", {
      actorAgentId: agent.agentId,
      action: "AUTH_PASSWORD_SET",
      entityType: "agent",
      entityId: agent.agentId,
      createdAt: now(),
    });

    return { success: true };
  },
});

export const logout = mutation({
  args: {
    agentId: v.string(),
    deviceInfo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) {
      throw new Error("Agent introuvable");
    }

    await ctx.db.insert("auditLogs", {
      actorAgentId: agent.agentId,
      action: "AUTH_LOGOUT",
      entityType: "agent",
      entityId: agent.agentId,
      metadata: {
        deviceInfo: args.deviceInfo,
      },
      createdAt: now(),
    });

    return { success: true };
  },
});
