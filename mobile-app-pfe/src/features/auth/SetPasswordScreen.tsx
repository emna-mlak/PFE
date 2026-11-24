import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { Text } from "react-native";
import Toast from "react-native-toast-message";
import { z } from "zod";

import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { mapApiError } from "../../lib/errorMapper";
import { useAgentId } from "../../lib/session";
import { useSetPassword } from "./useAuth";

const schema = z.object({
  newPassword: z.string().min(6, "Mot de passe minimum 6 caracteres"),
});

type FormData = z.infer<typeof schema>;

export function SetPasswordScreen() {
  const router = useRouter();
  const agentId = useAgentId();
  const setPassword = useSetPassword();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    await setPassword.mutateAsync({ agentId, newPassword: values.newPassword });
    Toast.show({ type: "success", text1: "Mot de passe mis a jour" });
    router.back();
  });

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Definir mot de passe</Text>
      <Controller
        control={control}
        name="newPassword"
        render={({ field }) => (
          <Input
            label="Nouveau mot de passe"
            value={field.value}
            onChangeText={field.onChange}
            secureTextEntry
          />
        )}
      />
      {setPassword.isError && <ErrorState label={mapApiError(setPassword.error)} />}
      <Button label="Enregistrer" onPress={onSubmit} loading={setPassword.isPending} />
    </Screen>
  );
}
