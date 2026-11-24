import { makeFunctionReference } from "convex/server";

import type { CarLookupByPlateResult } from "../types/carLookup";
import type { StatutInfractionCreate } from "../types/infractions";
import type { Agent } from "../types/domain";

export type InfractionCreateArgs = {
  idInfraction: string;
  matricule: string;
  dateInfraction: string;
  typeInfraction: string;
  description: string;
  montantAmende: number;
  statutInfraction: StatutInfractionCreate;
  lieu: string;
  agentId?: string;
  photoStorageId?: string;
};

export const api = {
  agents: {
    getCurrentAgent: makeFunctionReference<
      "query",
      { authUserId: string },
      Agent | null
    >("agents:getCurrentAgent"),
  },
  infractions: {
    create: makeFunctionReference<"mutation", InfractionCreateArgs, string>(
      "infractions:create",
    ),
    generateUploadUrl: makeFunctionReference<"mutation", Record<string, never>, string>(
      "infractions:generateUploadUrl",
    ),
    setPhoto: makeFunctionReference<
      "mutation",
      { idInfraction: string; photoStorageId: string | null },
      null
    >("infractions:setPhoto"),
    listByMatricule: makeFunctionReference<
      "query",
      { matricule: string },
      unknown[]
    >("infractions:listByMatricule"),
  },
  carLookup: {
    getByPlate: makeFunctionReference<
      "query",
      {
        matricule: string;
        infractionsLimit?: number;
      },
      CarLookupByPlateResult
    >("carLookup:getByPlate"),
  },
};
