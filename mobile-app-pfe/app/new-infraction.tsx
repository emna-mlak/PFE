import { Stack } from "expo-router";

import { CreateInfractionScreen } from "../src/features/infractions/CreateInfractionScreen";

export default function NewInfractionRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Signaler une infraction", headerBackTitle: "Retour" }} />
      <CreateInfractionScreen />
    </>
  );
}
