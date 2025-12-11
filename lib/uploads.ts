export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_FILENAME_LENGTH = 255;

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
} as const;

export type AllowedImageContentType = keyof typeof ALLOWED_IMAGE_TYPES;

export function isAllowedImageContentType(
  contentType: string,
): contentType is AllowedImageContentType {
  return contentType in ALLOWED_IMAGE_TYPES;
}

export function isValidFileSize(size: unknown): size is number {
  return (
    typeof size === "number" &&
    Number.isSafeInteger(size) &&
    size > 0 &&
    size <= MAX_IMAGE_UPLOAD_BYTES
  );
}

export function sanitizeFilename(input: string) {
  const normalized = input.normalize("NFKC").trim();
  let cleaned = normalized.replace(/[^A-Za-z0-9._-]+/g, "_");
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  cleaned = cleaned.replace(/^\.+/, "_");
  cleaned = cleaned.replace(/\.+$/g, "");

  if (cleaned.length > MAX_FILENAME_LENGTH) {
    cleaned = cleaned.slice(0, MAX_FILENAME_LENGTH).replace(/\.+$/g, "");
  }

  if (!cleaned || !/[A-Za-z0-9]/.test(cleaned)) {
    return "";
  }

  return cleaned;
}

export function extractFileExtension(filename: string) {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.toLowerCase() ?? "";
}

export function isExtensionAllowedForContentType(
  filename: string,
  contentType: string,
) {
  if (!isAllowedImageContentType(contentType)) return false;
  const ext = extractFileExtension(filename);
  if (!ext) return false;
  const allowedExtensions: readonly string[] = ALLOWED_IMAGE_TYPES[contentType];
  return allowedExtensions.includes(ext);
}
