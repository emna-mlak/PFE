import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Android / Expo Go renvoie souvent content://… — certains modules exigent file://.
 */
export async function resolveFileUriForUpload(uri: string): Promise<string> {
  if (Platform.OS === "web" || uri.startsWith("file://")) {
    return uri;
  }
  if (!uri.startsWith("content://")) {
    return uri;
  }

  const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("Cache indisponible pour copier l'image.");
  }

  const dest = `${cacheDir}upload-${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}
