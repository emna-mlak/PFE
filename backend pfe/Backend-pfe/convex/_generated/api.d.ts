/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as audit from "../audit.js";
import type * as carLookup from "../carLookup.js";
import type * as http from "../http.js";
import type * as infractions from "../infractions.js";
import type * as matriculeResolve from "../matriculeResolve.js";
import type * as roadLaws from "../roadLaws.js";
import type * as seed from "../seed.js";
import type * as vehicleStatus from "../vehicleStatus.js";
import type * as vehicules from "../vehicules.js";
import type * as vignettes from "../vignettes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  audit: typeof audit;
  carLookup: typeof carLookup;
  http: typeof http;
  infractions: typeof infractions;
  matriculeResolve: typeof matriculeResolve;
  roadLaws: typeof roadLaws;
  seed: typeof seed;
  vehicleStatus: typeof vehicleStatus;
  vehicules: typeof vehicules;
  vignettes: typeof vignettes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
