// DeepSeek (OpenAI-compatible chat completions). Text only: DeepSeek's API takes no audio (spec §7.1).
const { ProviderError, PermanentError } = require("./errors");
const { generateDeadlineMs, retryAfterMs, readBody, timedFetch } = require("./http");

function client({ apiKey, baseUrl, timeouts }) {
  if (!apiKey || !baseUrl)
    throw new PermanentError("DeepSeek API key/base URL not configured");
  const base = baseUrl.replace(/\/$/, "");

  async function generate({
    model,
    system,
    parts,
    schema,
    temperature = 0.2,
    maxOutputTokens = 8192,
  }) {
    if (!model) throw new PermanentError("DeepSeek model not configured");
    if (parts.some((p) => !("text" in p)))
      throw new PermanentError("DeepSeek cannot take media input");
    const user = parts.map((p) => p.text).join("\n\n");
    const messages = [
      ...(system || schema
        ? [
            {
              role: "system",
              content: [
                system,
                schema &&
                  `أجب بكائن JSON فقط يطابق هذا المخطط:\n${JSON.stringify(schema)}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ]
        : []),
      { role: "user", content: user },
    ];
    const res = await timedFetch(
      "deepseek",
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
          ...(schema && { response_format: { type: "json_object" } }),
        }),
      },
      generateDeadlineMs(timeouts, maxOutputTokens)
    );
    if (!res.ok) {
      const body = await readBody("deepseek", res, "text").catch(() => "");
      const msg = `deepseek ${res.status}: ${body.slice(0, 300)}`;
      if ([400, 401, 402, 403, 404].includes(res.status))
        throw new PermanentError(msg);
      throw new ProviderError(msg, res.status, { retryAfterMs: retryAfterMs(res) });
    }
    const data = await readBody("deepseek", res);
    const choice = data.choices?.[0];
    const text = choice?.message?.content || "";
    const usage = {
      tokensIn: data.usage?.prompt_tokens || 0,
      audioTokensIn: 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
    if (choice?.finish_reason === "length")
      throw new ProviderError("deepseek output truncated", 0, { usage });
    let json = null;
    if (schema) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError("deepseek returned invalid JSON", 0, { usage });
      }
    }
    return {
      text,
      json,
      model: data.model || model,
      usage,
    };
  }

  return { generate };
}

module.exports = { deepseekClient: client };
