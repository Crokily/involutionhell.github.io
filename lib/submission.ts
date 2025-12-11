export type DirNode = {
  name: string;
  path: string;
  children?: DirNode[];
};

export const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const MAX_SLUG_LENGTH = 100;

export function ensureMarkdownExtension(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().endsWith(".md")
    ? trimmed.toLowerCase()
    : `${trimmed.toLowerCase()}.md`;
}

export function stripMarkdownExtension(filename: string) {
  return filename.toLowerCase().replace(/\.md$/i, "");
}

export function sanitizeSlug(input: string) {
  const normalized = input.normalize("NFKC").toLowerCase().trim();
  let slug = normalized.replace(/[^a-z0-9_-]+/g, "-");
  slug = slug.replace(/[-_]{2,}/g, (match) =>
    match.includes("-") ? "-" : "_",
  );
  slug = slug.replace(/^[-_]+|[-_]+$/g, "");

  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/^[-_]+|[-_]+$/g, "");
  }

  return slug;
}

export function validateSlug(slug: string) {
  if (typeof slug !== "string") return false;
  const sanitized = sanitizeSlug(slug);

  return (
    sanitized.length > 0 &&
    sanitized === slug &&
    sanitized.length <= MAX_SLUG_LENGTH &&
    FILENAME_PATTERN.test(sanitized)
  );
}
