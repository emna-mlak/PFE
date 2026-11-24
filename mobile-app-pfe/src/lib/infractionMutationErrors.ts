const MAP: Record<string, string> = {
  "Fichier photo introuvable ou expiré": "Fichier photo introuvable ou expiré.",
  "Infraction introuvable": "Infraction introuvable.",
};

export function mapInfractionError(error: unknown): string {
  if (error instanceof Error) {
    const m = error.message.trim();
    if (/network request failed|failed to fetch|load failed/i.test(m)) {
      return "Échec réseau vers Convex (Pi). Vérifiez http://10.42.0.1:3210 depuis le téléphone.";
    }
    return MAP[m] ?? m;
  }
  return "Une erreur est survenue.";
}
