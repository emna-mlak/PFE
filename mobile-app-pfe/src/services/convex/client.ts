import { ConvexReactClient } from "convex/react";

import { env } from "../../config/env";

export const convexClient = env.convexUrl ? new ConvexReactClient(env.convexUrl) : null;
