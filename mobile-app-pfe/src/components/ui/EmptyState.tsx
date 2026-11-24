import { Text, View } from "react-native";

export function EmptyState({ label = "Aucune donnée." }: { label?: string }) {
  return (
    <View style={{ padding: 20 }}>
      <Text>{label}</Text>
    </View>
  );
}
