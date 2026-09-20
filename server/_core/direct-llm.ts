import { randomUUID } from "node:crypto";

import {
  loadDirectProviderMedia,
  type DirectProviderMediaConfig,
} from "./direct-provider-media";
import type {
  FileContent,
  ImageContent,
  InvokeParams,
  InvokeResult,
  Message,
  MessageContent,
  ResponseFormat,
  TextContent,
  Tool,
  ToolCall,
  ToolChoice,
} from "./llm";

export type DirectLlmProvider = "gemini" | "anthropic";

export type DirectLlmConfig = DirectProviderMediaConfig & {
  provider: DirectLlmProvider;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
};

type NormalizedResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    }
  | undefined;

function contentParts(content: Message["content"]): MessageContent[] {
  return Array.isArray(content) ? content : [content];
}

function textFromContent(part: MessageContent): string | null {
  if (typeof part === "string") return part;
  return part.type === "text" ? part.text : null;
}

function normalizeResponseFormat(
  params: InvokeParams
): NormalizedResponseFormat {
  const explicit = params.responseFormat ?? params.response_format;
  if (explicit) {
    if (
      explicit.type === "json_schema" &&
      (!explicit.json_schema.name || !explicit.json_schema.schema)
    ) {
      throw new Error("responseFormat json_schema requires a schema and name");
    }
    return explicit;
  }

  const outputSchema = params.outputSchema ?? params.output_schema;
  if (!outputSchema) return undefined;
  if (!outputSchema.name || !outputSchema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: outputSchema,
  };
}

function directToolChoice(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | "required" | { name: string } | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") {
    if (!tools?.length) {
      throw new Error("tool_choice required needs at least one tool");
    }
    return "required";
  }
  if ("name" in toolChoice) return { name: toolChoice.name };
  return { name: toolChoice.function.name };
}

function compactText(parts: MessageContent[]): string {
  const values = parts.map(textFromContent);
  if (values.some(value => value === null)) {
    throw new Error(
      "System messages must use text-only content in direct mode"
    );
  }
  return values.join("\n");
}

async function geminiPart(
  part: MessageContent,
  mediaConfig: DirectProviderMediaConfig
): Promise<Record<string, unknown>> {
  if (typeof part === "string") return { text: part };
  if (part.type === "text") return { text: part.text };

  const value = await loadDirectProviderMedia(
    part.type === "image_url" ? part.image_url.url : part.file_url.url,
    part.type === "file_url" ? part.file_url.mime_type : undefined,
    mediaConfig
  );
  return { inlineData: { mimeType: value.mimeType, data: value.data } };
}

async function anthopicPart(
  part: MessageContent,
  mediaConfig: DirectProviderMediaConfig
): Promise<Record<string, unknown>> {
  if (typeof part === "string") return { type: "text", text: part };
  if (part.type === "text") return { type: "text", text: part.text };

  const value = await loadDirectProviderMedia(
    part.type === "image_url" ? part.image_url.url : part.file_url.url,
    part.type === "file_url" ? part.file_url.mime_type : undefined,
    mediaConfig
  );

  if (part.type === "image_url") {
    if (!value.mimeType.startsWith("image/")) {
      throw new Error(
        "Anthropic image content must resolve to an image MIME type"
      );
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: value.mimeType,
        data: value.data,
      },
    };
  }

  if (value.mimeType !== "application/pdf") {
    throw new Error("Anthropic direct file input supports PDFs only");
  }
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: value.mimeType,
      data: value.data,
    },
  };
}

function directRole(role: Message["role"]): "user" | "assistant" {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  throw new Error(
    `Direct provider mode does not support ${role} transcript messages; use a current pipeline entrypoint without tool transcripts`
  );
}

async function invokeGemini(
  params: InvokeParams,
  config: DirectLlmConfig,
  responseFormat: NormalizedResponseFormat
): Promise<InvokeResult> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
  }
  if (!config.geminiModel) {
    throw new Error("GEMINI_MODEL is required when AI_PROVIDER=gemini");
  }

  const systemInstruction: Array<Record<string, string>> = [];
  const contents: Array<Record<string, unknown>> = [];
  for (const message of params.messages) {
    if (message.role === "system") {
      systemInstruction.push({
        text: compactText(contentParts(message.content)),
      });
      continue;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : directRole(message.role),
      parts: await Promise.all(
        contentParts(message.content).map(part => geminiPart(part, config))
      ),
    });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? params.max_tokens ?? 8192,
    },
  };
  if (systemInstruction.length) {
    payload.systemInstruction = { parts: systemInstruction };
  }

  const generationConfig = payload.generationConfig as Record<string, unknown>;
  if (responseFormat?.type === "json_schema") {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = responseFormat.json_schema.schema;
  } else if (responseFormat?.type === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  if (params.tools?.length) {
    payload.tools = [
      {
        functionDeclarations: params.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parametersJsonSchema: tool.function.parameters ?? { type: "object" },
        })),
      },
    ];
  }
  const toolChoice = directToolChoice(
    params.toolChoice ?? params.tool_choice,
    params.tools
  );
  if (toolChoice) {
    const functionCallingConfig: Record<string, unknown> = {
      mode:
        toolChoice === "none" ? "NONE" : toolChoice === "auto" ? "AUTO" : "ANY",
    };
    if (typeof toolChoice === "object") {
      functionCallingConfig.allowedFunctionNames = [toolChoice.name];
    }
    payload.toolConfig = { functionCallingConfig };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify(payload),
      signal: config.signal,
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini direct request failed (${response.status})`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name?: string; args?: unknown };
        }>;
      };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const candidate = result.candidates?.[0];
  if (!candidate) {
    throw new Error("Gemini direct response contains no candidate");
  }

  const toolCalls: ToolCall[] = (candidate.content?.parts ?? [])
    .filter(part => part.functionCall?.name)
    .map((part, index) => ({
      id: `gemini-${index}`,
      type: "function",
      function: {
        name: part.functionCall!.name!,
        arguments: JSON.stringify(part.functionCall?.args ?? {}),
      },
    }));
  const text = (candidate.content?.parts ?? [])
    .map(part => part.text ?? "")
    .join("");

  return {
    id: `gemini-${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    model: config.geminiModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: candidate.finishReason ?? null,
      },
    ],
    usage: {
      prompt_tokens: result.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: result.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

async function invokeAnthropic(
  params: InvokeParams,
  config: DirectLlmConfig,
  responseFormat: NormalizedResponseFormat
): Promise<InvokeResult> {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic");
  }
  if (!config.anthropicModel) {
    throw new Error("ANTHROPIC_MODEL is required when AI_PROVIDER=anthropic");
  }

  const system: Array<{ type: "text"; text: string }> = [];
  const messages: Array<Record<string, unknown>> = [];
  for (const message of params.messages) {
    if (message.role === "system") {
      system.push({
        type: "text",
        text: compactText(contentParts(message.content)),
      });
      continue;
    }
    messages.push({
      role: directRole(message.role),
      content: await Promise.all(
        contentParts(message.content).map(part => anthopicPart(part, config))
      ),
    });
  }

  const payload: Record<string, unknown> = {
    model: config.anthropicModel,
    max_tokens: params.maxTokens ?? params.max_tokens ?? 8192,
    messages,
    ...(system.length ? { system } : {}),
  };

  if (responseFormat?.type === "json_schema") {
    payload.output_config = {
      format: {
        type: "json_schema",
        schema: responseFormat.json_schema.schema,
      },
    };
  } else if (responseFormat?.type === "json_object") {
    throw new Error(
      "Anthropic direct mode requires outputSchema for structured JSON responses"
    );
  }

  if (params.tools?.length) {
    payload.tools = params.tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters ?? { type: "object" },
    }));
  }
  const toolChoice = directToolChoice(
    params.toolChoice ?? params.tool_choice,
    params.tools
  );
  if (toolChoice) {
    payload.tool_choice =
      toolChoice === "none"
        ? { type: "none" }
        : toolChoice === "auto"
          ? { type: "auto" }
          : toolChoice === "required"
            ? { type: "any" }
            : { type: "tool", name: toolChoice.name };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
    signal: config.signal,
  });
  if (!response.ok) {
    throw new Error(`Anthropic direct request failed (${response.status})`);
  }

  const result = (await response.json()) as {
    id?: string;
    model?: string;
    stop_reason?: string | null;
    content?: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown }
    >;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const content = result.content ?? [];
  const toolCalls: ToolCall[] = content
    .filter(
      (part): part is Extract<(typeof content)[number], { type: "tool_use" }> =>
        part.type === "tool_use"
    )
    .map(part => ({
      id: part.id,
      type: "function",
      function: { name: part.name, arguments: JSON.stringify(part.input) },
    }));
  const text = content
    .filter(
      (part): part is Extract<(typeof content)[number], { type: "text" }> =>
        part.type === "text"
    )
    .map(part => part.text)
    .join("");

  return {
    id: result.id ?? `anthropic-${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    model: result.model ?? config.anthropicModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: result.stop_reason ?? null,
      },
    ],
    usage: {
      prompt_tokens: result.usage?.input_tokens ?? 0,
      completion_tokens: result.usage?.output_tokens ?? 0,
      total_tokens:
        (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    },
  };
}

export async function invokeDirectLlm(
  params: InvokeParams,
  config: DirectLlmConfig
): Promise<InvokeResult> {
  const responseFormat = normalizeResponseFormat(params);
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 45_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestConfig = { ...config, signal: controller.signal };

  try {
    if (config.provider === "gemini") {
      return await invokeGemini(params, requestConfig, responseFormat);
    }
    return await invokeAnthropic(params, requestConfig, responseFormat);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Direct LLM invoke timed out after ${timeoutMs / 1000} seconds`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const DIRECT_LLM_ADAPTER_INTERNALS = {
  directToolChoice,
  normalizeResponseFormat,
};
