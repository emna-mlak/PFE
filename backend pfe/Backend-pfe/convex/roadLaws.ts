import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const roadLawFields = {
  article: v.string(),
  type: v.optional(v.string()),
  description: v.optional(v.string()),
  details: v.optional(v.string()),
  sanction: v.optional(v.string()),
  keywords: v.array(v.string()),
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const t = value.trim();
  return t === "" ? undefined : t;
}

function descriptionKey(description: string | undefined): string {
  return description === undefined ? "" : description;
}

async function findDuplicateByArticleAndDescription(
  ctx: MutationCtx,
  article: string,
  description: string | undefined
) {
  const candidates = await ctx.db
    .query("roadLaws")
    .withIndex("by_article", (q) => q.eq("article", article))
    .collect();
  const key = descriptionKey(description);
  return candidates.find((row) => descriptionKey(row.description) === key);
}

export function normalizeRoadLawInput(args: {
  article: string;
  type?: string;
  description?: string;
  details?: string;
  sanction?: string;
  keywords: string[];
}) {
  return {
    article: args.article.trim(),
    type: normalizeOptionalString(args.type),
    description: normalizeOptionalString(args.description),
    details: normalizeOptionalString(args.details),
    sanction: normalizeOptionalString(args.sanction),
    keywords: args.keywords,
  };
}

/** Shared batch import; used by `importMany` and `seed.seedRoadLaws`. */
export async function importRoadLawsBatch(
  ctx: MutationCtx,
  laws: Array<{
    article: string;
    type?: string;
    description?: string;
    details?: string;
    sanction?: string;
    keywords: string[];
  }>
) {
  let inserted = 0;
  let skipped = 0;
  for (const raw of laws) {
    const row = normalizeRoadLawInput(raw);
    const existing = await findDuplicateByArticleAndDescription(
      ctx,
      row.article,
      row.description
    );
    if (existing) {
      skipped += 1;
      continue;
    }
    await ctx.db.insert("roadLaws", row);
    inserted += 1;
  }
  return { inserted, skipped };
}

export const insertOne = mutation({
  args: roadLawFields,
  handler: async (ctx, args) => {
    const row = normalizeRoadLawInput(args);
    const existing = await findDuplicateByArticleAndDescription(
      ctx,
      row.article,
      row.description
    );
    if (existing) {
      return { id: existing._id, inserted: false as const };
    }
    const id = await ctx.db.insert("roadLaws", row);
    return { id, inserted: true as const };
  },
});

export const importMany = mutation({
  args: {
    laws: v.array(v.object(roadLawFields)),
  },
  handler: async (ctx, args) => importRoadLawsBatch(ctx, args.laws),
});

export const getByArticle = query({
  args: { article: v.string() },
  handler: async (ctx, args) => {
    const article = args.article.trim();
    return await ctx.db
      .query("roadLaws")
      .withIndex("by_article", (q) => q.eq("article", article))
      .collect();
  },
});

export const getByType = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    const type = args.type.trim();
    return await ctx.db
      .query("roadLaws")
      .withIndex("by_type", (q) => q.eq("type", type))
      .collect();
  },
});

function matchesKeywordSearch(doc: Doc<"roadLaws">, needle: string, includeDescription: boolean) {
  const kwHit = doc.keywords.some((k) =>
    k.toLowerCase().includes(needle)
  );
  if (kwHit) {
    return true;
  }
  if (!includeDescription) {
    return false;
  }
  const desc = doc.description ?? "";
  return desc.toLowerCase().includes(needle);
}

export const searchByKeyword = query({
  args: {
    q: v.string(),
    includeDescription: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const needle = args.q.trim().toLowerCase();
    if (needle === "") {
      return [];
    }
    const includeDescription = args.includeDescription !== false;
    const all = await ctx.db.query("roadLaws").collect();
    return all.filter((doc) => matchesKeywordSearch(doc, needle, includeDescription));
  },
});

/** Total rows in `roadLaws` (useful to verify seed). */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("roadLaws").collect();
    return rows.length;
  },
});
