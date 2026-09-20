import { afterEach, describe, expect, it, vi } from "vitest";

import { invokeDirectLlm } from "./direct-llm";

const geminiConfig = {
  provider: "gemini" as const,
  geminiApiKey: "gemini-test-key",
  geminiModel: "gemini-test-model",
  anthropicApiKey: "",
  anthropicModel: "",
  allowedHosts: [],
};

const anthropicConfig = {
  provider: "anthropic" as const,
  geminiApiKey: "",
  geminiModel: "",
  anthropicApiKey: "anthropic-test-key",
  anthropicModel: "anthropic-test-model",
  allowedHosts: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("direct provider adapters", () => {
  it("maps structured Gemini requests without a Forge endpoint or credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: '{"claim":"ok"}' }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 11,
            candidatesTokenCount: 5,
            totalTokenCount: 16,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await invokeDirectLlm(
      {
        messages: [
          { role: "system", content: "Return JSON only" },
          {
            role: "user",
            content: [
              { type: "text", text: "Assess this image" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,aGVsbG8=" },
              },
            ],
          },
        ],
        outputSchema: {
          name: "claim",
          schema: { type: "object", properties: { claim: { type: "string" } } },
        },
      },
      geminiConfig
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).not.toContain("forge");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "gemini-test-key"
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual({
      type: "object",
      properties: { claim: { type: "string" } },
    });
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: "image/png",
      data: "aGVsbG8=",
    });
    expect(response.choices[0].message.content).toBe('{"claim":"ok"}');
    expect(response.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 5,
      total_tokens: 16,
    });
  });

  it("maps Anthropic PDF and strict JSON output without a Forge fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-direct",
          model: "anthropic-test-model",
          stop_reason: "end_turn",
          content: [{ type: "text", text: '{"answer":"ok"}' }],
          usage: { input_tokens: 8, output_tokens: 3 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await invokeDirectLlm(
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the claim" },
              {
                type: "file_url",
                file_url: {
                  url: "data:application/pdf;base64,cGRm",
                  mime_type: "application/pdf",
                },
              },
            ],
          },
        ],
        outputSchema: {
          name: "claim",
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
          },
        },
      },
      anthropicConfig
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "anthropic-test-key"
    );
    expect(body.output_config.format).toEqual({
      type: "json_schema",
      schema: { type: "object", properties: { answer: { type: "string" } } },
    });
    expect(body.messages[0].content[1].source).toEqual({
      type: "base64",
      media_type: "application/pdf",
      data: "cGRm",
    });
    expect(response.choices[0].message.content).toBe('{"answer":"ok"}');
  });

  it("fails closed before network access when the selected provider is unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      invokeDirectLlm(
        { messages: [{ role: "user", content: "hello" }] },
        {
          ...geminiConfig,
          geminiApiKey: "",
        }
      )
    ).rejects.toThrow("GEMINI_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
