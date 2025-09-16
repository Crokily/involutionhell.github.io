import type { DocContextPayload } from "@/lib/assistant/context";
import type {
  AssistantMessage,
  AssistantProviderId,
  AssistantSettings,
  ProviderDescriptor,
  SendMessagePayload,
} from "@/types/assistant";

export const OPENAI_DEFAULT_MODEL = "gpt-4.1-nano";
export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_STREAM_URL = "https://generativelanguage.googleapis.com/v1beta";

const DOC_ASSISTANT_PRIMER =
  "You are the Involution Hell documentation assistant. Answer with clear, concise explanations that reference the current page when relevant. If the page does not cover the question, say so.";

type StreamGenerator = AsyncGenerator<string, void, unknown>;

interface GeminiContentPart {
  text?: string;
}

interface GeminiStreamCandidate {
  content?: {
    parts?: GeminiContentPart[];
  };
}

interface GeminiStreamChunk {
  candidates?: GeminiStreamCandidate[];
}

interface ProviderAdapter {
  id: AssistantProviderId;
  label: string;
  description: string;
  defaultModel: string;
  docsUrl?: string;
  getModel(settings: AssistantSettings): string;
  getApiKey(settings: AssistantSettings): string | undefined;
  validateKey(key: string): boolean;
  stream(payload: SendMessagePayload): StreamGenerator;
}

const adapters: Record<AssistantProviderId, ProviderAdapter> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "GPT-4.1 family via Chat Completions API",
    defaultModel: OPENAI_DEFAULT_MODEL,
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
    getModel: (settings) => settings.openai.modelId || OPENAI_DEFAULT_MODEL,
    getApiKey: (settings) => settings.openai.apiKey?.trim() || undefined,
    validateKey: (key) => /^sk-\w{20,}/.test(key.trim()),
    stream: (payload) => streamOpenAI(payload),
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini 2.0 family over Generative Language API",
    defaultModel: GEMINI_DEFAULT_MODEL,
    docsUrl: "https://ai.google.dev/api/generate-content",
    getModel: (settings) => settings.gemini.modelId || GEMINI_DEFAULT_MODEL,
    getApiKey: (settings) => settings.gemini.apiKey?.trim() || undefined,
    validateKey: (key) => key.trim().length >= 20,
    stream: (payload) => streamGemini(payload),
  },
};

export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = Object.values(
  adapters,
).map(({ id, label, description, defaultModel, docsUrl }) => ({
  id,
  label,
  description,
  defaultModel,
  docsUrl,
}));

export function getProviderAdapter(id: AssistantProviderId): ProviderAdapter {
  return adapters[id];
}

export async function* streamWithProvider(
  payload: SendMessagePayload,
): StreamGenerator {
  const adapter = getProviderAdapter(payload.settings.providerId);
  yield* adapter.stream(payload);
}

function buildSystemPrompt(
  context: DocContextPayload,
  includeContext: boolean,
): string {
  const lines = [DOC_ASSISTANT_PRIMER];

  if (includeContext && context.context) {
    const metaLines: string[] = [`Document slug: ${context.meta.slug}`];
    if (context.meta.title) {
      metaLines.push(`Title: ${context.meta.title}`);
    }
    if (context.meta.headings.length) {
      metaLines.push(`Headings: ${context.meta.headings.join(" | ")}`);
    }
    metaLines.push("Document content:\n" + context.context);
    lines.push(metaLines.join("\n"));
  }

  return lines.join("\n\n");
}

function buildOpenAIMessages(
  history: AssistantMessage[],
  userInput: string,
  context: DocContextPayload,
  settings: AssistantSettings,
) {
  const includeContext = settings.sendContext && Boolean(context.context);
  const systemPrompt = buildSystemPrompt(context, includeContext);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

  history.forEach((message) => {
    const role = message.role === "assistant" ? "assistant" : "user";
    if (message.role === "system") {
      messages.push({ role: "system", content: message.content });
    } else {
      messages.push({
        role,
        content: message.content,
      });
    }
  });

  messages.push({ role: "user", content: userInput });

  return messages;
}

async function* streamOpenAI(payload: SendMessagePayload): StreamGenerator {
  const adapter = adapters.openai;
  const apiKey = adapter.getApiKey(payload.settings);
  if (!apiKey) {
    throw new Error("OPENAI_MISSING_KEY");
  }

  const body = {
    model: adapter.getModel(payload.settings),
    stream: true,
    messages: buildOpenAIMessages(
      payload.history,
      payload.input,
      payload.context,
      payload.settings,
    ),
  };

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: payload.signal,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errorText = await safeReadText(response);
    throw new Error(`OPENAI_HTTP_${response.status}:${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part.startsWith("data:")) {
        continue;
      }
      const data = part.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const text = parsed?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text.length > 0) {
          yield text;
        }
        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason) {
          return;
        }
      } catch (error) {
        console.warn("openai chunk parse failed", error);
      }
    }
  }
}

function buildGeminiContents(
  history: AssistantMessage[],
  userInput: string,
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];
  history.forEach((message) => {
    if (message.role === "system") {
      return;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  });
  contents.push({ role: "user", parts: [{ text: userInput }] });
  return contents;
}

async function* streamGemini(payload: SendMessagePayload): StreamGenerator {
  const adapter = adapters.gemini;
  const apiKey = adapter.getApiKey(payload.settings);
  if (!apiKey) {
    throw new Error("GEMINI_MISSING_KEY");
  }

  const includeContext =
    payload.settings.sendContext && Boolean(payload.context.context);
  const systemPrompt = buildSystemPrompt(payload.context, includeContext);
  const model = adapter.getModel(payload.settings);
  const url = `${GEMINI_STREAM_URL}/models/${model}:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: buildGeminiContents(payload.history, payload.input),
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.6,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: payload.signal,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errorText = await safeReadText(response);
    throw new Error(`GEMINI_HTTP_${response.status}:${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line) {
        continue;
      }
      const payloadString = line.startsWith("data:")
        ? line.replace(/^data:\s*/, "")
        : line;
      if (payloadString === "[DONE]") {
        return;
      }
      try {
        const parsed = JSON.parse(payloadString);
        const text = extractGeminiText(parsed);
        if (text) {
          yield text;
        }
      } catch (error) {
        console.warn("gemini chunk parse failed", error);
      }
    }
  }
}

function extractGeminiText(chunk: GeminiStreamChunk): string {
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part: GeminiContentPart) => part?.text ?? "").join("");
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    return String(error);
  }
}
