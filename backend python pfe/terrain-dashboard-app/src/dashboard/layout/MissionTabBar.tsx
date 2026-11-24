import React from "react";
import { Pressable, Text, View } from "react-native";

import { useMissionControlStyles } from "../shared/styles";

/** Terminal tactique 7" : 3 modes opérationnels. */
export type MissionTab = "live" | "events" | "patrol";

type Props = {
  active: MissionTab;
  onChange: (tab: MissionTab) => void;
};

const TABS: Array<{ key: MissionTab; label: string }> = [
  { key: "live", label: "LIVE" },
  { key: "events", label: "EVENTS" },
  { key: "patrol", label: "PATROL" },
];

export function MissionTabBar({ active, onChange }: Props) {
  const styles = useMissionControlStyles();

  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[styles.tab, on && styles.tabActive]}>
            <Text style={[styles.tabText, on && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
