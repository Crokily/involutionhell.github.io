"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DocContextPayload } from "@/lib/assistant/context";
import { AssistantProvider, useAssistant } from "./AssistantProvider";
import type { AssistantMessage } from "@/types/assistant";

interface AssistantDockProps {
  context: DocContextPayload;
}

export default function AssistantDock({ context }: AssistantDockProps) {
  return (
    <AssistantProvider context={context}>
      <AssistantShell />
    </AssistantProvider>
  );
}

function AssistantShell() {
  const {
    settings,
    setSettings,
    provider,
    descriptors,
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
  } = useAssistant();

  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming, expanded]);

  const providerKey = settings[settings.providerId].apiKey;
  const providerModel = settings[settings.providerId].modelId;

  const collapsedView = useMemo(
    () => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft.trim();
          if (!value) {
            return;
          }
          setExpanded(true);
          sendMessage(value).finally(() => {
            setDraft("");
          });
        }}
        className="flex w-full max-w-sm items-center gap-2 rounded-full border border-white/20 bg-zinc-900/85 px-4 py-2 text-zinc-100 shadow-lg shadow-black/40 backdrop-blur"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="Ask this page…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
        >
          Ask
        </button>
      </form>
    ),
    [draft, sendMessage, setExpanded],
  );

  const expandedPanel = useMemo(
    () => (
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-zinc-950/90 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-md">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-zinc-100">
              Page Assistant
            </span>
            <span className="truncate text-xs text-zinc-400">
              Provider: {provider.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Model
              <input
                value={providerModel}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    [prev.providerId]: {
                      ...prev[prev.providerId],
                      modelId: event.target.value,
                    },
                  }))
                }
                className="w-32 rounded-md border border-white/10 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-100"
              />
            </label>
            <select
              value={settings.providerId}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  providerId: event.target.value as typeof prev.providerId,
                }))
              }
              className="rounded-md border border-white/10 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-100"
            >
              {descriptors.map((descriptor) => (
                <option key={descriptor.id} value={descriptor.id}>
                  {descriptor.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (isStreaming) {
                  stop();
                }
                setExpanded(false);
              }}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              Collapse
            </button>
          </div>
        </header>
        <div className="grid gap-3 px-4 py-3 text-sm">
          {context.error === "too_long" && (
            <ContextBanner
              tone="warning"
              message={`This document exceeds the ${context.limit.toLocaleString()} character context limit. Context will not be attached.`}
            />
          )}
          {context.error === "missing" && (
            <ContextBanner
              tone="info"
              message="Document source could not be read. Replies will use general knowledge only."
            />
          )}
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-zinc-900/40 p-3">
            {messages.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Start a conversation to get guidance tailored to this page.
              </p>
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  isStreaming={isStreaming && index === messages.length - 1}
                />
              ))
            )}
            <div ref={endRef} />
          </div>
          {error && (
            <div className="rounded-md border border-rose-400/40 bg-rose-600/10 px-3 py-2 text-rose-200">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs text-rose-200/90 hover:text-rose-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = draft.trim();
              if (!value) {
                return;
              }
              sendMessage(value).finally(() => setDraft(""));
            }}
            className="space-y-2"
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                providerKey
                  ? "Write your question. Use Shift+Enter for a new line."
                  : `Enter a ${provider.label} API key before chatting.`
              }
              rows={3}
              disabled={!providerKey || context.error === "too_long"}
              className="h-24 w-full resize-none rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.sendContext}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      sendContext: event.target.checked,
                    }))
                  }
                  className="h-3 w-3 rounded border border-white/20 bg-transparent"
                />
                Attach page context
              </label>
              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-400"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!providerKey || context.error === "too_long"}
                    className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
                  >
                    Send
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  Clear
                </button>
              </div>
            </div>
          </form>
          <details className="rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300">
            <summary className="cursor-pointer select-none text-zinc-200">
              API key & privacy
            </summary>
            <div className="mt-2 space-y-2">
              <label className="block">
                <span className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {provider.label} API key
                </span>
                <input
                  type="password"
                  value={providerKey}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      [prev.providerId]: {
                        ...prev[prev.providerId],
                        apiKey: event.target.value,
                      },
                    }))
                  }
                  placeholder={provider.id === "openai" ? "sk-..." : "AIza..."}
                  className="w-full rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1 text-zinc-100 placeholder:text-zinc-500"
                />
              </label>
              <p className="text-[11px] text-zinc-500">
                Keys stay in local storage only. Nothing is sent to this site.
              </p>
            </div>
          </details>
        </div>
      </div>
    ),
    [
      context,
      descriptors,
      draft,
      error,
      isStreaming,
      messages,
      provider,
      providerKey,
      providerModel,
      reset,
      sendMessage,
      setError,
      setExpanded,
      setSettings,
      settings,
      stop,
    ],
  );

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex w-full justify-center px-4">
      <div className="pointer-events-auto flex w-full justify-center">
        {expanded ? expandedPanel : collapsedView}
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: AssistantMessage["role"];
  content: string;
  isStreaming: boolean;
}) {
  const isAssistant = role === "assistant";
  const bubbleClass = isAssistant
    ? "bg-emerald-500/10 text-emerald-100"
    : "bg-zinc-800 text-zinc-100";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-inherit">
          {content || (isAssistant && isStreaming ? "Thinking…" : "")}
        </pre>
      </div>
    </div>
  );
}

function ContextBanner({
  tone,
  message,
}: {
  tone: "warning" | "info";
  message: string;
}) {
  const variant =
    tone === "warning"
      ? {
          border: "border-amber-400/40",
          bg: "bg-amber-500/10",
          text: "text-amber-100",
        }
      : {
          border: "border-sky-400/40",
          bg: "bg-sky-500/10",
          text: "text-sky-100",
        };
  return (
    <div
      className={`rounded-md border ${variant.border} ${variant.bg} px-3 py-2 ${variant.text}`}
    >
      {message}
    </div>
  );
}
