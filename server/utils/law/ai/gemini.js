// Gemini REST client (no SDK): models.generateContent with JSON output, and the Files API for large media.
// Endpoint shapes verified against ai.google.dev (2026-10): x-goog-api-key header; resumable upload
// returns the upload URL in `x-goog-upload-url`; parts use inlineData / fileData.
// Base URL and model names come from configuration only (spec §1.8).
const fs = require("fs");
const { ProviderError, PermanentError } = require("./errors");
const { generateDeadlineMs, resolveTimeouts, retryAfterMs, readBody, timedFetch } = require("./http");

const INLINE_LIMIT_BYTES = 15 * 1024 * 1024; // larger media goes through the Files API

function client({ apiKey, baseUrl, timeouts }) {
  if (!apiKey) throw new PermanentError("Gemini API key not configured");
  const base = baseUrl.replace(/\/$/, "");
  const headers = { "x-goog-api-key": apiKey };
  const { generateMs, uploadMs } = resolveTimeouts(timeouts);

  async function request(url, init, { expectJson = true, timeoutMs = generateMs } = {}) {
    const res = await timedFetch("gemini", url, init, timeoutMs);
    if (!res.ok) {
      const body = await readBody("gemini", res, "text").catch(() => "");
      const msg = `gemini ${res.status}: ${body.slice(0, 300)}`;
      if ([400, 401, 403, 404].includes(res.status))
        throw new PermanentError(msg);
      throw new ProviderError(msg, res.status, { retryAfterMs: retryAfterMs(res) });
    }
    return expectJson ? readBody("gemini", res) : res;
  }

  /**
   * @param {{model:string, system?:string, parts:object[], schema?:object, temperature?:number, maxOutputTokens?:number}} req
   * parts: {text} | {inlineData:{mimeType,data}} | {fileData:{mimeType,fileUri}}
   */
  async function generate({
    model,
    system,
    parts,
    schema,
    temperature = 0.2,
    maxOutputTokens = 8192,
  }) {
    if (!model) throw new PermanentError("Gemini model not configured");
    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(schema && {
          responseMimeType: "application/json",
          responseSchema: schema,
        }),
      },
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    };
    const data = await request(
      `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { timeoutMs: generateDeadlineMs(timeouts, maxOutputTokens) }
    );
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
    // The provider bills these tokens even when the answer is unusable, so the errors carry them.
    const u = data.usageMetadata || {};
    const audioTokens = (u.promptTokensDetails || [])
      .filter((d) => d.modality === "AUDIO")
      .reduce((s, d) => s + (d.tokenCount || 0), 0);
    const usage = {
      tokensIn: u.promptTokenCount || 0,
      audioTokensIn: audioTokens,
      tokensOut: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    };
    if (cand?.finishReason === "MAX_TOKENS")
      throw new ProviderError("gemini output truncated (MAX_TOKENS)", 0, { usage });
    if (!text)
      throw new ProviderError(
        `gemini returned no text (finishReason: ${cand?.finishReason || "none"})`,
        0,
        { usage }
      );
    let json = null;
    if (schema) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError("gemini returned invalid JSON", 0, { usage });
      }
    }
    return {
      text,
      json,
      model: data.modelVersion || model,
      usage,
    };
  }

  /** Resumable upload; waits until the file is ACTIVE. Returns { name, uri, mimeType }. */
  async function uploadFile(absPath, mimeType, displayName = "lawos") {
    const bytes = fs.statSync(absPath).size;
    const start = await request(
      `${base}/upload/v1beta/files`,
      {
        method: "POST",
        headers: {
          ...headers,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(bytes),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      },
      { expectJson: false, timeoutMs: uploadMs }
    );
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new ProviderError("gemini upload: no upload URL");
    const done = await request(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(bytes),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: fs.readFileSync(absPath),
    }, { timeoutMs: uploadMs });
    let file = done.file;
    for (let i = 0; i < 60 && file?.state === "PROCESSING"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await request(`${base}/v1beta/${file.name}`, { headers });
    }
    if (!file?.uri) throw new ProviderError("gemini upload: no file uri");
    if (file.state === "FAILED")
      throw new ProviderError("gemini upload: file processing failed");
    return {
      name: file.name,
      uri: file.uri,
      mimeType: file.mimeType || mimeType,
    };
  }

  async function deleteFile(name) {
    try {
      await request(
        `${base}/v1beta/${name}`,
        { method: "DELETE", headers },
        { expectJson: false }
      );
    } catch {
      // Files expire after 48 h anyway.
    }
  }

  /** A media part: inline when small, uploaded otherwise. Returns { part, cleanup }. */
  async function mediaPart(absPath, mimeType, displayName) {
    const bytes = fs.statSync(absPath).size;
    if (bytes <= INLINE_LIMIT_BYTES)
      return {
        part: {
          inlineData: {
            mimeType,
            data: fs.readFileSync(absPath).toString("base64"),
          },
        },
        cleanup: async () => {},
      };
    const f = await uploadFile(absPath, mimeType, displayName);
    return {
      part: { fileData: { mimeType: f.mimeType, fileUri: f.uri } },
      cleanup: () => deleteFile(f.name),
    };
  }

  return { generate, uploadFile, deleteFile, mediaPart };
}

module.exports = { geminiClient: client, INLINE_LIMIT_BYTES };
