import type { DocContextPayload } from "@/lib/assistant/context";

export type AssistantProviderId = "openai" | "gemini";

export type AssistantRole = "user" | "assistant" | "system";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  providerId: AssistantProviderId;
  createdAt: number;
}

export interface AssistantSettings {
  providerId: AssistantProviderId;
  openai: {
    apiKey: string;
    modelId: string;
  };
  gemini: {
    apiKey: string;
    modelId: string;
  };
  sendContext: boolean;
}

export interface AssistantConversationState {
  messages: AssistantMessage[];
  isStreaming: boolean;
  pendingMessage?: AssistantMessage | null;
  error?: string | null;
}

export interface AssistantUiState {
  expanded: boolean;
  context: DocContextPayload;
}

export interface ProviderDescriptor {
  id: AssistantProviderId;
  label: string;
  description: string;
  defaultModel: string;
  docsUrl?: string;
}

export interface SendMessagePayload {
  input: string;
  history: AssistantMessage[];
  context: DocContextPayload;
  settings: AssistantSettings;
  signal: AbortSignal;
}

export interface StreamChunk {
  text: string;
}
