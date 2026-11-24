import { Text, View } from "react-native";

export function ErrorState({ label }: { label: string }) {
  return (
    <View style={{ padding: 20 }}>
      <Text style={{ color: "#B42318" }}>{label}</Text>
    </View>
  );
}
