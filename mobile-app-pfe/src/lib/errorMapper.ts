function mapConvexAuthMessage(message: string): string | undefined {
  const m = message.trim();
  if (/\bAuthentification\b/i.test(m) && /\b(é|e)chou/i.test(m)) {
    return "Email ou mot de passe incorrect.";
  }
  return undefined;
}

export const mapApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return mapConvexAuthMessage(error.message) ?? error.message;
  }
  return "Une erreur inattendue est survenue.";
};
