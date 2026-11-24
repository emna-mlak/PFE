export const env = {
  convexUrl: (process.env.EXPO_PUBLIC_CONVEX_URL ?? "").trim(),
  convexHttpUrl: (process.env.EXPO_PUBLIC_CONVEX_HTTP_URL ?? "").trim(),
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "").trim(),
  pythonApiUrl: (process.env.EXPO_PUBLIC_PYTHON_API_URL ?? "").trim(),
  voiceApiUrl: (process.env.EXPO_PUBLIC_VOICE_API_URL ?? process.env.EXPO_PUBLIC_PYTHON_API_URL ?? "").trim(),
};

export const isConvexConfigured = Boolean(env.convexUrl && env.convexHttpUrl);
