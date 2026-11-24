import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

function deploymentEnv(name: string): string | undefined {
  const proc = (
    globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return proc?.env?.[name];
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Optional shared secret between Convex and trusted callers (e.g. Python).
 * Set the same value in Convex deployment env and as CONVEX_VEHICLE_HTTP_SECRET in Python.
 * If unset, auth is skipped (dev only).
 */
function isAuthorized(req: Request): boolean {
  const secret = deploymentEnv("CONVEX_VEHICLE_HTTP_SECRET");
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const header = req.headers.get("x-vehicle-secret");
  return bearer === secret || header === secret;
}

function parseMatriculeSearchKeysFromBody(
  body: Record<string, unknown>
): string[] | undefined {
  const value = body.matriculeSearchKeys;
  if (!Array.isArray(value)) return undefined;
  const keys = value.filter((x): x is string => typeof x === "string");
  return keys.length > 0 ? keys : undefined;
}

async function readMatricule(req: Request): Promise<{
  matricule?: string;
  infractionsLimit?: number;
  matriculeSearchKeys?: string[];
  error?: Response;
}> {
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      const matricule =
        typeof body.matricule === "string" ? body.matricule : undefined;
      const infractionsLimit =
        typeof body.infractionsLimit === "number"
          ? body.infractionsLimit
          : undefined;
      const matriculeSearchKeys = parseMatriculeSearchKeysFromBody(body);
      return { matricule, infractionsLimit, matriculeSearchKeys };
    } catch {
      return { error: json({ error: "Invalid JSON body" }, 400) };
    }
  }
  const url = new URL(req.url);
  const matricule = url.searchParams.get("matricule") ?? undefined;
  const lim = url.searchParams.get("infractionsLimit");
  const infractionsLimit =
    lim !== null && lim !== "" ? Number.parseInt(lim, 10) : undefined;
  return {
    matricule: matricule ?? undefined,
    infractionsLimit: Number.isNaN(infractionsLimit)
      ? undefined
      : infractionsLimit,
  };
}

const vehicleLookup = httpAction(async (ctx, req) => {
  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const parsed = await readMatricule(req);
  if (parsed.error) return parsed.error;
  const matricule = parsed.matricule?.trim();
  if (!matricule) {
    return json({ error: "matricule required (body or ?matricule=)" }, 400);
  }
  const data = await ctx.runQuery(api.carLookup.getByPlate, {
    matricule,
    ...(parsed.infractionsLimit !== undefined
      ? { infractionsLimit: parsed.infractionsLimit }
      : {}),
    ...(parsed.matriculeSearchKeys !== undefined
      ? { matriculeSearchKeys: parsed.matriculeSearchKeys }
      : {}),
  });
  return json(data, 200);
});

const vehicleStatus = httpAction(async (ctx, req) => {
  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const parsed = await readMatricule(req);
  if (parsed.error) return parsed.error;
  const matricule = parsed.matricule?.trim();
  if (!matricule) {
    return json({ error: "matricule required (body or ?matricule=)" }, 400);
  }
  const data = await ctx.runQuery(api.vehicleStatus.getVehicleStatusByMatricule, {
    matricule,
    ...(parsed.matriculeSearchKeys !== undefined
      ? { matriculeSearchKeys: parsed.matriculeSearchKeys }
      : {}),
  });
  return json(data, 200);
});

const http = httpRouter();
http.route({ path: "/vehicleLookup", method: "POST", handler: vehicleLookup });
http.route({ path: "/vehicleLookup", method: "GET", handler: vehicleLookup });
http.route({ path: "/vehicleStatus", method: "POST", handler: vehicleStatus });
http.route({ path: "/vehicleStatus", method: "GET", handler: vehicleStatus });

export default http;
