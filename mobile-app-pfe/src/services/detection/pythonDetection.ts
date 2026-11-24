import { env } from "../../config/env";

export async function sendLiveCaptureFramePlaceholder(payload: {
  sessionId: string;
  note: string;
}): Promise<void> {
  // Placeholder intentionally keeps OCR call disabled for MVP.
  if (!env.pythonApiUrl) return;
  await Promise.resolve(payload);
}
