import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "fumadocs-core/source";

const CONTEXT_CHAR_LIMIT = 6000;

export interface DocContextPayload {
  context: string | null;
  originalLength: number;
  trimmedLength: number;
  limit: number;
  error?: "too_long" | "missing";
  meta: {
    title: string | undefined;
    slug: string;
    headings: string[];
  };
}

export async function extractDocContext(
  page: Page<unknown>,
): Promise<DocContextPayload> {
  const slug = page.slugs.join("/");
  const headings = Array.isArray((page.data as { toc?: unknown }).toc)
    ? ((page.data as { toc?: Array<{ title?: string }> }).toc ?? [])
        .map((item) => item.title)
        .filter((value): value is string => Boolean(value))
    : [];

  if (!page.absolutePath) {
    return buildPayload({
      context: null,
      originalLength: 0,
      trimmedLength: 0,
      error: "missing",
      slug,
      headings,
      title: (page.data as { title?: string }).title,
    });
  }

  const raw = await readFile(path.resolve(page.absolutePath), "utf8").catch(
    () => null,
  );
  if (!raw) {
    return buildPayload({
      context: null,
      originalLength: 0,
      trimmedLength: 0,
      error: "missing",
      slug,
      headings,
      title: (page.data as { title?: string }).title,
    });
  }

  const plain = markdownToPlain(raw);
  const normalised = collapseWhitespace(plain).trim();
  const truncated = normalised.slice(0, CONTEXT_CHAR_LIMIT);

  if (normalised.length > CONTEXT_CHAR_LIMIT) {
    return buildPayload({
      context: null,
      originalLength: normalised.length,
      trimmedLength: truncated.length,
      error: "too_long",
      slug,
      headings,
      title: (page.data as { title?: string }).title,
    });
  }

  return buildPayload({
    context: truncated,
    originalLength: normalised.length,
    trimmedLength: truncated.length,
    slug,
    headings,
    title: (page.data as { title?: string }).title,
  });
}

function buildPayload(input: {
  context: string | null;
  originalLength: number;
  trimmedLength: number;
  slug: string;
  headings: string[];
  title: string | undefined;
  error?: "too_long" | "missing";
}): DocContextPayload {
  return {
    context: input.context,
    originalLength: input.originalLength,
    trimmedLength: input.trimmedLength,
    limit: CONTEXT_CHAR_LIMIT,
    error: input.error,
    meta: {
      title: input.title,
      slug: input.slug,
      headings: input.headings,
    },
  };
}

function markdownToPlain(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\|/g, " ");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

export const DOC_CONTEXT_CHAR_LIMIT = CONTEXT_CHAR_LIMIT;
