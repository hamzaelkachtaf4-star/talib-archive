const { geminiClient } = require("../../../utils/law/ai/gemini");
const { deepseekClient } = require("../../../utils/law/ai/deepseek");
const { PermanentError, ProviderError } = require("../../../utils/law/ai/errors");
const { loadPrompt, listPrompts } = require("../../../utils/law/prompts");
const { mergeSegments } = require("../../../utils/law/jobs/transcribeAudio");
const { estimateCost } = require("../../../utils/law/ai/router");

afterEach(() => jest.restoreAllMocks());

function mockFetch(response, status = 200) {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers: new Map(),
  });
}

describe("gemini client", () => {
  test("sends key header, system instruction, JSON schema; parses usage incl. audio tokens", async () => {
    const f = mockFetch({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 60 }] },
      modelVersion: "m-1",
    });
    const g = geminiClient({ apiKey: "KEY", baseUrl: "https://g.example/" });
    const out = await g.generate({ model: "m", system: "sys", parts: [{ text: "hi" }], schema: { type: "OBJECT" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://g.example/v1beta/models/m:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(out.json).toEqual({ ok: true });
    expect(out.usage).toEqual({ tokensIn: 100, audioTokensIn: 60, tokensOut: 25 });
  });

  test("truncated output is a retryable provider error; 4xx is permanent", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] });
    const g = geminiClient({ apiKey: "K", baseUrl: "https://g" });
    await expect(g.generate({ model: "m", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
    jest.restoreAllMocks();
    mockFetch({ error: "bad" }, 400);
    await expect(g.generate({ model: "m", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(PermanentError);
  });

  test("no key / no model is a permanent configuration error", async () => {
    expect(() => geminiClient({ apiKey: null, baseUrl: "x" })).toThrow(PermanentError);
    await expect(geminiClient({ apiKey: "k", baseUrl: "x" }).generate({ model: null, parts: [] })).rejects.toBeInstanceOf(PermanentError);
  });
});

describe("deepseek client", () => {
  test("OpenAI-compatible request, refuses media", async () => {
    const f = mockFetch({ choices: [{ message: { content: '{"a":1}' }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
    const d = deepseekClient({ apiKey: "K", baseUrl: "https://ds/v1" });
    const out = await d.generate({ model: "r", system: "s", parts: [{ text: "q" }], schema: { type: "OBJECT" } });
    expect(f.mock.calls[0][0]).toBe("https://ds/v1/chat/completions");
    expect(JSON.parse(f.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    expect(out.json).toEqual({ a: 1 });
    await expect(d.generate({ model: "r", parts: [{ inlineData: {} }] })).rejects.toBeInstanceOf(PermanentError);
  });
});

describe("billed failures keep their usage", () => {
  const usageMetadata = { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 60 }] };
  const g = () => geminiClient({ apiKey: "K", baseUrl: "https://g" });

  test.each([
    ["MAX_TOKENS", { candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }], usageMetadata }, undefined],
    ["empty text", { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }], usageMetadata }, undefined],
    ["invalid JSON", { candidates: [{ content: { parts: [{ text: "nope" }] }, finishReason: "STOP" }], usageMetadata }, { type: "OBJECT" }],
  ])("gemini %s is a ProviderError that carries token usage", async (_n, body, schema) => {
    mockFetch(body);
    const e = await g().generate({ model: "m", parts: [{ text: "x" }], schema }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.usage).toEqual({ tokensIn: 100, audioTokensIn: 60, tokensOut: 50 });
  });

  test.each([
    ["truncation", { choices: [{ message: { content: "{" }, finish_reason: "length" }], usage: { prompt_tokens: 7, completion_tokens: 9 } }, undefined],
    ["invalid JSON", { choices: [{ message: { content: "nope" }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 9 } }, { type: "OBJECT" }],
  ])("deepseek %s carries token usage", async (_n, body, schema) => {
    mockFetch(body);
    const d = deepseekClient({ apiKey: "K", baseUrl: "https://ds" });
    const e = await d.generate({ model: "r", parts: [{ text: "x" }], schema }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.usage).toEqual({ tokensIn: 7, audioTokensIn: 0, tokensOut: 9 });
  });

  test("HTTP errors expose Retry-After as retryAfterMs", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 429, text: async () => "slow down", headers: new Map([["retry-after", "7"]]),
    });
    const e = await g().generate({ model: "m", parts: [{ text: "x" }] }).catch((x) => x);
    expect(e.status).toBe(429);
    expect(e.retryAfterMs).toBe(7000);
  });
});

describe("request timeouts", () => {
  // A fetch that never answers until its signal aborts, like a stalled TCP connection.
  function hangingFetch() {
    return jest.spyOn(global, "fetch").mockImplementation(
      (url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        })
    );
  }

  test("gemini generate aborts with a ProviderError (status 0, so never auto-retried) and carries a signal", async () => {
    const f = hangingFetch();
    const g = geminiClient({ apiKey: "K", baseUrl: "https://g", timeouts: { generateMs: 30 } });
    await expect(g.generate({ model: "m", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("deepseek generate aborts with a provider error", async () => {
    hangingFetch();
    const d = deepseekClient({ apiKey: "K", baseUrl: "https://ds", timeouts: { generateMs: 30 } });
    await expect(d.generate({ model: "r", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
  });

  // Headers arrive, then the body stalls until the deadline: res.json() rejects with a TimeoutError.
  const stalledBody = () =>
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })),
      text: () => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
    });

  test("a timeout while reading the response body is also a ProviderError (gemini)", async () => {
    stalledBody();
    const g = geminiClient({ apiKey: "K", baseUrl: "https://g" });
    const e = await g.generate({ model: "m", parts: [{ text: "x" }] }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.status).toBe(0);
  });

  test("a timeout while reading the response body is also a ProviderError (deepseek)", async () => {
    stalledBody();
    const d = deepseekClient({ apiKey: "K", baseUrl: "https://ds" });
    await expect(d.generate({ model: "r", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
  });

  test("a non-JSON 200 body is a ProviderError, not a SyntaxError", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, headers: new Map(),
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      text: async () => "<html>",
    });
    const g = geminiClient({ apiKey: "K", baseUrl: "https://g" });
    await expect(g.generate({ model: "m", parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
  });

  test("large outputs get a longer deadline than the 300 s floor", () => {
    const { generateDeadlineMs } = require("../../../utils/law/ai/http");
    expect(generateDeadlineMs(undefined, 8192)).toBe(300000);
    expect(generateDeadlineMs(undefined, 65536)).toBeGreaterThan(300000);
    expect(generateDeadlineMs({ generateMs: 30 }, 65536)).toBe(30); // explicit overrides win
  });

  test("defaults: 300 s for generate, 600 s for uploads", () => {
    const { DEFAULT_TIMEOUTS } = require("../../../utils/law/ai/http");
    expect(DEFAULT_TIMEOUTS).toEqual({ generateMs: 300000, uploadMs: 600000 });
  });

  test("gemini file upload uses the upload timeout", async () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const file = path.join(os.tmpdir(), `lawos-up-${Date.now()}.bin`);
    fs.writeFileSync(file, "abc");
    hangingFetch();
    const g = geminiClient({ apiKey: "K", baseUrl: "https://g", timeouts: { uploadMs: 30 } });
    try {
      await expect(g.uploadFile(file, "audio/webm")).rejects.toBeInstanceOf(ProviderError);
    } finally {
      fs.unlinkSync(file);
    }
  });
});

describe("prompts", () => {
  test("versioned files load without their English header", () => {
    const ids = listPrompts().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["ocr_photo_batch", "transcribe_audio", "segment_transcript", "extract_pdf_vision"]));
    for (const { id, version } of listPrompts()) {
      const p = loadPrompt(id, version);
      expect(p.text).not.toMatch(/<!--|Intent:/);
      expect(p.text).toMatch(/[؀-ۿ]/); // Arabic body
      expect(p.hash).toHaveLength(16);
    }
  });
});

describe("transcript merge", () => {
  test("places parts on one timeline, keeps asset-relative times, clamps model times", () => {
    const merged = mergeSegments([
      { assetId: "a1", durationSec: 600, assetOffsetSec: 0, timelineOffsetSec: 0, segments: [{ start: 0, end: 30, text: "أ" }, { start: 590, end: 700, text: "ب" }] },
      { assetId: "a1", durationSec: 300, assetOffsetSec: 600, timelineOffsetSec: 600, segments: [{ start: 10, end: 20, text: "ج" }] },
      { assetId: "a2", durationSec: 300, assetOffsetSec: 0, timelineOffsetSec: 900, segments: [{ start: 5, end: 9, text: "د" }, { start: 1, end: 2, text: "  " }] },
    ]);
    expect(merged.map((s) => [s.text, s.start, s.end, s.assetId, s.assetStart])).toEqual([
      ["أ", 0, 30, "a1", 0],
      ["ب", 590, 600, "a1", 590],
      ["ج", 610, 620, "a1", 610],
      ["د", 905, 909, "a2", 5],
    ]);
  });
});

describe("cost estimate", () => {
  test("audio input tokens are priced separately", () => {
    const cfg = { prices: { gemini: { input: 0.3, audioInput: 1.0, output: 2.5 } } };
    expect(estimateCost("gemini", { tokensIn: 1_000_000, audioTokensIn: 1_000_000, tokensOut: 0 }, cfg)).toBeCloseTo(1.0);
    expect(estimateCost("gemini", { tokensIn: 2_000_000, audioTokensIn: 1_000_000, tokensOut: 1_000_000 }, cfg)).toBeCloseTo(3.8);
  });
});
