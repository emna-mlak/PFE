import { ActivityIndicator, Text, View } from "react-native";

export function LoadingState({ label = "Chargement..." }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 20, gap: 8 }}>
      <ActivityIndicator />
      <Text>{label}</Text>
    </View>
  );
}
