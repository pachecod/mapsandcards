import B2 from "backblaze-b2";

function trimEnv(v) {
  return typeof v === "string" ? v.trim() : v;
}

const B2_KEY_ID = trimEnv(process.env.B2_KEY_ID);
const B2_APP_KEY = trimEnv(process.env.B2_APP_KEY);
const B2_BUCKET_NAME = trimEnv(process.env.B2_BUCKET_NAME);
const B2_BUCKET_ID = trimEnv(process.env.B2_BUCKET_ID);

export const B2_CONFIGURED = !!(B2_KEY_ID && B2_APP_KEY && B2_BUCKET_NAME);

let b2 = null;
let authorized = false;
let bucketId = null;
let downloadUrl = null;

async function ensureAuth() {
  if (!B2_CONFIGURED) throw new Error("B2 not configured");
  if (!b2) {
    b2 = new B2({ applicationKeyId: B2_KEY_ID, applicationKey: B2_APP_KEY });
  }
  if (!authorized) {
    const res = await b2.authorize();
    downloadUrl = res.data.downloadUrl;
    authorized = true;
  }
  if (!bucketId) {
    if (B2_BUCKET_ID) {
      bucketId = B2_BUCKET_ID;
    } else {
      const res = await b2.getBucket({ bucketName: B2_BUCKET_NAME });
      const bucket = res.data.buckets && res.data.buckets[0];
      if (!bucket) throw new Error(`Bucket "${B2_BUCKET_NAME}" not found`);
      bucketId = bucket.bucketId;
    }
  }
}

/**
 * Upload a file to B2.
 * @param {string} remotePath - e.g. "stories/my-tour/scroll-map-story.json"
 * @param {Buffer|string} data
 * @param {string} [mimeType="application/octet-stream"]
 */
export async function uploadFile(remotePath, data, mimeType = "application/octet-stream") {
  await ensureAuth();
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const urlRes = await b2.getUploadUrl({ bucketId });
  await b2.uploadFile({
    uploadUrl: urlRes.data.uploadUrl,
    uploadAuthToken: urlRes.data.authorizationToken,
    fileName: remotePath,
    data: buf,
    mime: mimeType,
  });
}

/**
 * Download a file from B2.
 * @param {string} remotePath
 * @returns {Buffer}
 */
export async function downloadFile(remotePath) {
  await ensureAuth();
  const res = await b2.downloadFileByName({
    bucketName: B2_BUCKET_NAME,
    fileName: remotePath,
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data);
}

/**
 * Delete a file from B2.
 * @param {string} remotePath
 */
export async function deleteFile(remotePath) {
  await ensureAuth();
  const versions = await b2.listFileVersions({
    bucketId,
    startFileName: remotePath,
    maxFileCount: 100,
    prefix: remotePath,
  });
  const files = (versions.data.files || []).filter((f) => f.fileName === remotePath);
  for (const f of files) {
    await b2.deleteFileVersion({ fileId: f.fileId, fileName: f.fileName });
  }
}

/**
 * List files under a prefix.
 * @param {string} prefix - e.g. "stories/my-tour/"
 * @returns {string[]} file names
 */
export async function listFiles(prefix) {
  await ensureAuth();
  const res = await b2.listFileNames({
    bucketId,
    prefix,
    maxFileCount: 1000,
    delimiter: "",
  });
  return (res.data.files || []).map((f) => f.fileName);
}

/**
 * Public download URL for a file.
 */
export function publicUrl(remotePath) {
  return `${downloadUrl}/file/${B2_BUCKET_NAME}/${remotePath}`;
}
