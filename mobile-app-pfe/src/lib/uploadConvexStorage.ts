import { env } from "../config/env";
import { resolveFileUriForUpload } from "./resolveLocalImageUri";

/**
 * Convex self-hosted sur la Pi renvoie souvent une upload URL en 127.0.0.1 / localhost.
 * Le téléphone (10.42.0.x) ne peut pas joindre cette adresse → on réécrit avec l'hôte client.
 */
export function rewriteConvexUploadUrlForDevice(uploadUrl: string): string {
  const convexBase = env.convexUrl.replace(/\/+$/, "");
  if (!convexBase) return uploadUrl;

  try {
    const target = new URL(convexBase);
    const upload = new URL(uploadUrl);
    const unreachableHost =
      upload.hostname === "localhost" ||
      upload.hostname === "127.0.0.1" ||
      upload.hostname === "0.0.0.0";

    if (unreachableHost) {
      upload.hostname = target.hostname;
      if (target.port) upload.port = target.port;
      upload.protocol = target.protocol;
      return upload.toString();
    }
  } catch {
  }

  return uploadUrl
    .replace(/\/\/127\.0\.0\.1(?=[:/])/g, `//${extractConvexHost(convexBase)}`)
    .replace(/\/\/localhost(?=[:/])/g, `//${extractConvexHost(convexBase)}`);
}

function extractConvexHost(convexBase: string): string {
  try {
    const u = new URL(convexBase);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return convexBase.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

/**
 * Envoie les octets de l’image vers l’URL renvoyée par `infractions.generateUploadUrl`,
 * puis lit le JSON `{ storageId }` renvoyé par Convex.
 */
export async function postImageToConvexUploadUrl(
  uploadUrl: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const resolvedUploadUrl = rewriteConvexUploadUrlForDevice(uploadUrl);
  const localFileUri = await resolveFileUriForUpload(localUri);

  const fileRes = await fetch(localFileUri);
  if (!fileRes.ok) {
    throw new Error("Impossible de lire le fichier image local.");
  }
  const blob = await fileRes.blob();

  console.log("[Convex upload] request", {
    uploadUrlOriginal: uploadUrl,
    uploadUrlResolved: resolvedUploadUrl,
    localUri,
    mimeType: mimeType || "image/jpeg",
    blobSize: blob.size,
  });

  let post: Response;
  try {
    post = await fetch(resolvedUploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": mimeType || "image/jpeg",
      },
      body: blob,
    });
  } catch (error) {
    const hint =
      resolvedUploadUrl !== uploadUrl
        ? ` URL réécrite : ${resolvedUploadUrl}`
        : ` URL : ${resolvedUploadUrl}`;
    throw new Error(
      `Échec réseau lors du téléversement photo.${hint} Vérifiez Convex Pi (${env.convexUrl}).`,
      { cause: error },
    );
  }

  if (!post.ok) {
    throw new Error(`Échec du téléversement (${post.status}).`);
  }

  const json = (await post.json()) as { storageId?: string };
  console.log("[Convex upload] response json", json);
  if (!json?.storageId) {
    throw new Error("Réponse de téléversement invalide (storageId manquant).");
  }
  return json.storageId;
}
