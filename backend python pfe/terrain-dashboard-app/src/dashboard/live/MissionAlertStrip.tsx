import React from "react";
import { Text, View } from "react-native";

import type { UnpaidEntry } from "../../screens/dashboard/types";
import { useMissionControlStyles } from "../shared/styles";

type Props = {
  unpaidOpenCount: number;
  activeUnpaid: UnpaidEntry | null;
};

/** Bande alerte LIVE — une ligne (glance 7"). */
export function MissionAlertStrip({ unpaidOpenCount, activeUnpaid }: Props) {
  const styles = useMissionControlStyles();
  const hot = unpaidOpenCount > 0;
  const line =
    hot && activeUnpaid ? `ALT ${unpaidOpenCount} · ${activeUnpaid.plate} · IMPAYÉ` : "ALT OK · aucune alerte";

  return (
    <View style={[styles.alertStripCompact, hot ? styles.alertStripHot : styles.alertStripOk]}>
      <Text
        style={styles.alertStripCompactText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {line}
      </Text>
    </View>
  );
}
