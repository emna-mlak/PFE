import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { APP_BUILD_LABEL } from "../../config/appBranding";

export function FooterNav({ current }: { current: "main" | "profile" | "ai" }) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
    <View style={styles.row}>
      <Pressable style={[styles.item, current === "main" && styles.active]} onPress={() => router.replace("/main")}>
        <Text style={[styles.label, current === "main" && styles.labelActive]}>Accueil</Text>
      </Pressable>
      <Pressable
        style={[styles.item, current === "ai" && styles.active]}
        onPress={() => router.replace("/ai")}
      >
        <Text style={[styles.label, current === "ai" && styles.labelActive]}>Scan plaque</Text>
      </Pressable>
      <Pressable
        style={[styles.item, current === "profile" && styles.active]}
        onPress={() => router.replace("/profile")}
      >
        <Text style={[styles.label, current === "profile" && styles.labelActive]}>Mon compte</Text>
      </Pressable>
    </View>
    <Text style={styles.buildStamp}>{APP_BUILD_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", gap: 10 },
  buildStamp: {
    fontSize: 10,
    color: "#98A2B3",
    textAlign: "center",
    fontWeight: "600",
  },
  item: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#EEF2F6",
  },
  active: { backgroundColor: "#155EEF" },
  label: { fontWeight: "600", color: "#344054" },
  labelActive: { color: "#FFFFFF" },
});
