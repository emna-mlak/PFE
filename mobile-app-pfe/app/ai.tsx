import { Stack } from "expo-router";

import { PlateOcrScreen } from "../src/features/ai/PlateOcrScreen";

export default function AiRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Scan de plaque", headerBackTitle: "Retour" }} />
      <PlateOcrScreen />
    </>
  );
}
