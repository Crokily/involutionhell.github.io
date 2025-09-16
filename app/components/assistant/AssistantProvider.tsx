"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePersistentState } from "@/hooks/usePersistentState";
import type { DocContextPayload } from "@/lib/assistant/context";
import {
  GEMINI_DEFAULT_MODEL,
  OPENAI_DEFAULT_MODEL,
  PROVIDER_DESCRIPTORS,
  getProviderAdapter,
  streamWithProvider,
} from "@/lib/assistant/providers";
import type {
  AssistantMessage,
  AssistantProviderId,
  AssistantSettings,
  ProviderDescriptor,
} from "@/types/assistant";

interface AssistantContextValue {
  settings: AssistantSettings;
  setSettings: (
    updater:
      | AssistantSettings
      | ((prev: AssistantSettings) => AssistantSettings),
  ) => void;
  provider: ProviderDescriptor;
  descriptors: ProviderDescriptor[];
  messages: AssistantMessage[];
  sendMessage: (input: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  isStreaming: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  context: DocContextPayload;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

const SETTINGS_KEY = "ih-assistant-settings";

function createDefaultSettings(): AssistantSettings {
  return {
    providerId: "openai",
    openai: {
      apiKey: "",
      modelId: OPENAI_DEFAULT_MODEL,
    },
    gemini: {
      apiKey: "",
      modelId: GEMINI_DEFAULT_MODEL,
    },
    sendContext: true,
  };
}

function createMessage(
  role: "user" | "assistant" | "system",
  content: string,
  providerId: AssistantProviderId,
): AssistantMessage {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return {
    id,
    role,
    content,
    providerId,
    createdAt: Date.now(),
  };
}

export function AssistantProvider({
  children,
  context,
}: {
  children: React.ReactNode;
  context: DocContextPayload;
}) {
  const [settings, setSettings] = usePersistentState<AssistantSettings>(
    SETTINGS_KEY,
    createDefaultSettings,
  );
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const provider = useMemo(
    () => getProviderDescriptor(settings.providerId),
    [settings.providerId],
  );

  const sendMessage = useCallback(
    async (rawInput: string) => {
      const input = rawInput.trim();
      if (!input) {
        return;
      }

      if (isStreaming) {
        setError("Wait for the current response to finish or stop it first.");
        return;
      }

      if (context.error === "too_long") {
        setError("This page is longer than the current context limit.");
        return;
      }

      const adapter = getProviderAdapter(settings.providerId);
      const apiKey = adapter.getApiKey(settings);
      if (!apiKey) {
        setError(
          settings.providerId === "openai"
            ? "Please enter a valid OpenAI API key."
            : "Please enter a valid Gemini API key.",
        );
        return;
      }

      setExpanded(true);
      setError(null);

      const userMessage = createMessage("user", input, settings.providerId);
      const assistantMessage = createMessage(
        "assistant",
        "",
        settings.providerId,
      );
      const history = [...messages, userMessage];

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const chunk of streamWithProvider({
          input,
          history,
          context,
          settings,
          signal: controller.signal,
        })) {
          if (!chunk) {
            continue;
          }
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setError("Generation stopped.");
        } else {
          setError(normaliseError(err, settings.providerId));
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [context, isStreaming, messages, settings],
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      settings,
      setSettings,
      provider,
      descriptors: PROVIDER_DESCRIPTORS,
      messages,
      sendMessage,
      stop,
      reset,
      isStreaming,
      error,
      setError,
      expanded,
      setExpanded,
      context,
    }),
    [
      settings,
      setSettings,
      provider,
      messages,
      sendMessage,
      stop,
      reset,
      isStreaming,
      error,
      setError,
      expanded,
      setExpanded,
      context,
    ],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return ctx;
}

function getProviderDescriptor(id: AssistantProviderId): ProviderDescriptor {
  return (
    PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id) ??
    PROVIDER_DESCRIPTORS[0]
  );
}

function normaliseError(
  error: unknown,
  providerId: AssistantProviderId,
): string {
  if (error instanceof Error) {
    const code = error.message;
    if (code === "OPENAI_MISSING_KEY" || code === "GEMINI_MISSING_KEY") {
      return providerId === "openai"
        ? "Please enter a valid OpenAI API key."
        : "Please enter a valid Gemini API key.";
    }
    if (code.startsWith("OPENAI_HTTP_")) {
      return "OpenAI request failed. Check your key, model, or try again later.";
    }
    if (code.startsWith("GEMINI_HTTP_")) {
      return "Gemini request failed. Check your key, model, or try again later.";
    }
    return code;
  }
  return "Request failed. Please try again.";
}
