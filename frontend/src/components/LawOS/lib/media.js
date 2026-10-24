// Client-side media helpers (spec §2.1: resize on the phone, not on the dv6).

export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const LONG_EDGE = 2400;
const QUALITY = 0.85;

/**
 * Resizes an image (File/Blob, or a canvas source) to a 2400 px long edge and re-encodes as JPEG.
 * EXIF orientation is applied, so the stored page is upright.
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function resizeImage(source) {
  const bitmap =
    source instanceof Blob
      ? await createImageBitmap(source, { imageOrientation: "from-image" })
      : source;
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, LONG_EDGE / Math.max(w, h));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/jpeg",
      QUALITY
    )
  );
  return { blob, width, height };
}

/** Duration of an audio file from its metadata, or null (MediaRecorder WebM often has none). */
export function audioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });
}

export function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
