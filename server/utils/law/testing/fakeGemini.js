// A local stand-in for the Gemini REST API (generateContent + Files API), for pipeline tests without a
// real key. It answers deterministically from the request: transcription segments every 60 s for the
// part duration stated in the prompt, one OCR page per image, topics for segmentation.
const http = require("http");

function startFakeGemini() {
  const state = { generateCalls: [], uploads: 0, deleted: 0, files: new Map() };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify(obj));
      };
      if (
        !req.headers["x-goog-api-key"] &&
        !req.url.startsWith("/upload-session/")
      )
        return send(401, { error: "no key" });

      if (req.method === "POST" && req.url === "/upload/v1beta/files") {
        const id = `f${++state.uploads}`;
        return send(
          200,
          {},
          {
            "x-goog-upload-url": `http://127.0.0.1:${server.address().port}/upload-session/${id}`,
          }
        );
      }
      if (req.method === "POST" && req.url.startsWith("/upload-session/")) {
        const id = req.url.split("/").pop();
        const file = {
          name: `files/${id}`,
          uri: `fake://files/${id}`,
          mimeType: "application/octet-stream",
          state: "ACTIVE",
          sizeBytes: body.length,
        };
        state.files.set(file.name, file);
        return send(200, { file });
      }
      if (req.method === "GET" && req.url.startsWith("/v1beta/files/"))
        return send(200, state.files.get(req.url.slice(8)) || {});
      if (req.method === "DELETE" && req.url.startsWith("/v1beta/files/")) {
        state.deleted++;
        return send(200, {});
      }
      const m = /^\/v1beta\/models\/([^:]+):generateContent$/.exec(req.url);
      if (req.method === "POST" && m) {
        const json = JSON.parse(body.toString("utf8"));
        const system = json.systemInstruction?.parts?.[0]?.text || "";
        const parts = json.contents[0].parts;
        const text = parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("\n");
        const media = parts.filter((p) => p.inlineData || p.fileData);
        state.generateCalls.push({
          model: m[1],
          system: system.slice(0, 40),
          mediaCount: media.length,
        });
        let out;
        let audioTokens = 0;
        if (system.includes("ناسخ محترف")) {
          const dur = Number(
            (/مدة هذا المقطع: (\d+)/.exec(text) || [])[1] || 60
          );
          const segments = [];
          for (let t = 0; t < dur; t += 60)
            segments.push({
              start: t,
              end: Math.min(dur, t + 60),
              text: `مقطع عند ${t}`,
              uncertain: [],
            });
          out = { segments };
          audioTokens = dur * 32;
        } else if (system.includes("صفحات محاضرات")) {
          out = {
            pages: media.map((_, i) => ({
              index: i,
              text: `نص الصفحة ${i}`,
              headings: [],
              frenchTerms: ["contrat"],
              illegible: [],
            })),
          };
        } else if (system.includes("وحدات معرفية")) {
          // one atom per numbered unit, plus an out-of-range index that must be dropped
          const n = (text.match(/^\[\d+\]/gm) || []).length;
          out = {
            atoms: [
              ...Array.from({ length: n }, (_, i) => ({
                body: `وحدة ${i}`,
                sourceIndex: i,
                headingPath: [],
                profEmphasis: i === 0,
                kind: "definition",
              })),
              { body: "خارج النطاق", sourceIndex: 999 },
            ],
          };
        } else if (system.includes("مكانها في التصميم")) {
          out = { pages: [{ page: 1, headingPath: ["المبحث الأول"] }] };
        } else if (system.includes("تنظيم محاضرات")) {
          out = {
            topics: [
              { title: "مقدمة", startSec: 0, endSec: 600, headingPath: [] },
            ],
          };
        } else {
          out = { pages: [] };
        }
        return send(200, {
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify(out) }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 1000 + audioTokens,
            candidatesTokenCount: 500,
            promptTokensDetails: audioTokens
              ? [{ modality: "AUDIO", tokenCount: audioTokens }]
              : [],
          },
          modelVersion: m[1],
        });
      }
      send(404, { error: "not found" });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        state,
        close: () => new Promise((r) => server.close(r)),
      })
    )
  );
}

module.exports = { startFakeGemini };
