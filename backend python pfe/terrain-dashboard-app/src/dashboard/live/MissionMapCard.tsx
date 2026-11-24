import React from "react";
import { Platform } from "react-native";

import type { MissionMapCardProps } from "./MissionMapCard.types";
import { MissionMapCard as MissionMapCardWeb } from "./MissionMapCard.web";

/** Pont d’import : Metro charge `.native` ou `.web` ; ce fichier évite les erreurs TS sur l’import unique. */
export function MissionMapCard(props: MissionMapCardProps) {
  if (Platform.OS === "web") {
    return <MissionMapCardWeb {...props} />;
  }
  const { MissionMapCard: NativeMap } = require("./MissionMapCard.native") as {
    MissionMapCard: React.ComponentType<MissionMapCardProps>;
  };
  return <NativeMap {...props} />;
}
