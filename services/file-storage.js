import { mkdir, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { B2_CONFIGURED, uploadFile, deleteFile, publicUrl } from "./b2-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_UPLOAD_ROOT = join(__dirname, "..", "uploads");

export async function storeFile(storageKey, buffer, _mimeType) {
  if (B2_CONFIGURED) {
    await uploadFile(storageKey, buffer, _mimeType);
    return { storageKey, publicUrl: publicUrl(storageKey) };
  }
  const localPath = join(LOCAL_UPLOAD_ROOT, storageKey);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  const urlPath = `/uploads/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
  return { storageKey, publicUrl: urlPath };
}

export async function removeFile(storageKey) {
  if (!storageKey) return;
  if (B2_CONFIGURED) {
    await deleteFile(storageKey);
    return;
  }
  const localPath = join(LOCAL_UPLOAD_ROOT, storageKey);
  try {
    await unlink(localPath);
  } catch {
    /* ignore missing */
  }
}

export function isFileStorageEnabled() {
  return true;
}
