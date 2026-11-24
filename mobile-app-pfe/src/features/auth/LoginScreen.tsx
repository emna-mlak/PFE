import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text } from "react-native";
import Toast from "react-native-toast-message";
import { z } from "zod";

import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { mapApiError } from "../../lib/errorMapper";
import { useLogin } from "./useAuth";

const schema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(4, "Mot de passe trop court"),
});

type FormData = z.infer<typeof schema>;

export function LoginScreen() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const login = useLogin();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      Toast.show({ type: "success", text1: "Connexion réussie" });
      setIsConnected(true);
      router.replace("/main");
    } catch {
      // Mutation error is rendered by login.isError / ErrorState.
    }
  });

  return (
    <Screen>
      <Text style={styles.sectionTitle}>Connexion</Text>
      <Text style={styles.sectionHint}>
        Entrez l&apos;adresse e-mail et le mot de passe de votre compte agent.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => <Input label="Adresse e-mail" value={field.value} onChangeText={field.onChange} />}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input
            label="Mot de passe"
            value={field.value}
            onChangeText={field.onChange}
            secureTextEntry
          />
        )}
      />
      {login.isError && <ErrorState label={mapApiError(login.error)} />}
      <Button label="Se connecter" onPress={onSubmit} loading={login.isPending} />
      {isConnected && <Text style={{ color: "#067647" }}>Connecté avec succès.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#101828", marginBottom: 4 },
  sectionHint: { fontSize: 14, color: "#667085", marginBottom: 12 },
});
