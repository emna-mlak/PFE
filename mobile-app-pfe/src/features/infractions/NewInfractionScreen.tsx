import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { Text } from "react-native";
import Toast from "react-native-toast-message";
import { z } from "zod";

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { useAgentId } from "../../lib/session";
import { useCreateInfraction, useLogAction } from "../../services/convex/api";

const schema = z.object({
  motif: z.string().min(3),
  montant: z.string().min(1),
});

type FormData = z.infer<typeof schema>;

export function NewInfractionScreen() {
  const { matricule = "" } = useLocalSearchParams<{ matricule: string }>();
  const agentId = useAgentId();
  const router = useRouter();
  const createInfraction = useCreateInfraction();
  const log = useLogAction();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { motif: "Stationnement dangereux", montant: "15000" },
  });

  const onSubmit = handleSubmit(async (values) => {
    await createInfraction.mutateAsync({
      matricule,
      motifInfraction: values.motif,
      montant: Number(values.montant),
      idAgent: agentId,
    });
    await log.mutateAsync({
      action: "INFRACTION_CREATE",
      details: `Nouvelle infraction pour ${matricule}`,
      actorAgentId: agentId,
    });
    Toast.show({ type: "success", text1: "Infraction enregistree" });
    router.replace({ pathname: "/infractions-history", params: { matricule } });
  });

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Nouvelle infraction</Text>
      <Text>Matricule: {matricule}</Text>
      <Controller
        control={control}
        name="motif"
        render={({ field }) => <Input label="Motif" value={field.value} onChangeText={field.onChange} />}
      />
      <Controller
        control={control}
        name="montant"
        render={({ field }) => (
          <Input
            label="Montant (FCFA)"
            value={field.value}
            onChangeText={field.onChange}
          />
        )}
      />
      <Button label="Creer" onPress={onSubmit} loading={createInfraction.isPending} />
    </Screen>
  );
}
