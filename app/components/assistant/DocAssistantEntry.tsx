"use client";

import dynamic from "next/dynamic";

import type { DocContextPayload } from "@/lib/assistant/context";

const AssistantDock = dynamic(() => import("./AssistantDock"), {
  ssr: false,
  loading: () => null,
});

interface DocAssistantEntryProps {
  context: DocContextPayload;
}

export function DocAssistantEntry({ context }: DocAssistantEntryProps) {
  return <AssistantDock context={context} />;
}
