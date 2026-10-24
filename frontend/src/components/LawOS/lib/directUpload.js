// Online-only upload of a single file through the same chunk protocol as captures (spec §9.2), for
// flows that need the asset id immediately (e.g. an official PDF for a corpus import).
import { API_BASE, AUTH_TOKEN } from "@/utils/constants";
import { sha256Hex } from "./media";

function headers(extra = {}) {
  const token = localStorage.getItem(AUTH_TOKEN);
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}/law${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** @returns {Promise<object>} the stored LawAsset */
export async function uploadFileNow(file, onProgress) {
  const sha256 = await sha256Hex(file);
  const init = await post("/uploads/init", {
    clientCaptureId: crypto.randomUUID(),
    sha256,
    bytes: file.size,
    mime: file.type || "application/octet-stream",
    originalFilename: file.name,
  });
  if (init.alreadyHave) return init.asset;
  const have = new Set(init.receivedChunks);
  for (let i = 0; i < init.chunkCount; i++) {
    if (have.has(i)) continue;
    const res = await fetch(
      `${API_BASE}/law/uploads/${init.uploadId}/chunks/${i}`,
      {
        method: "PUT",
        headers: headers({ "Content-Type": "application/octet-stream" }),
        body: file.slice(i * init.chunkSize, (i + 1) * init.chunkSize),
      }
    );
    if (!res.ok) throw new Error(`chunk ${i}: HTTP ${res.status}`);
    onProgress?.((i + 1) / init.chunkCount);
  }
  const done = await post(`/uploads/${init.uploadId}/complete`);
  if (done.sha256 !== sha256) throw new Error("hash mismatch");
  return done.asset;
}
