/**
 * Shared attachment content-type configuration.
 *
 * By default a curated set of image/document/text/media types are allowed. Set the
 * `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` environment variable to a
 * comma-separated list of MIME types or wildcard patterns to expand the
 * allowed set for routes that use this allowlist.
 *
 * Examples:
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf,text/*
 *
 * Supported pattern syntax:
 *   - Exact types:   "application/pdf"
 *   - Wildcards:     "image/*"  or  "application/vnd.openxmlformats-officedocument.*"
 */
export const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "application/zip",
  "text/markdown",
  "text/plain",
  "application/json",
  "text/csv",
  "text/html",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
];

export const DEFAULT_ATTACHMENT_CONTENT_TYPE = "application/octet-stream";
export const SVG_CONTENT_TYPE = "image/svg+xml";
export const GENERIC_ATTACHMENT_CONTENT_TYPES: readonly string[] = [
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-binary",
];
export const INLINE_ATTACHMENT_TYPES: readonly string[] = [
  "image/*",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
];

/**
 * Parse a comma-separated list of MIME type patterns into a normalised array.
 * Returns the default image-only list when the input is empty or undefined.
 */
export function parseAllowedTypes(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_ALLOWED_TYPES];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_TYPES];
}

/**
 * Check whether `contentType` matches any entry in `allowedPatterns`.
 *
 * Supports exact matches ("application/pdf") and wildcard / prefix
 * patterns ("image/*", "application/vnd.openxmlformats-officedocument.*").
 */
export function matchesContentType(contentType: string, allowedPatterns: string[]): boolean {
  const ct = contentType.toLowerCase();
  return allowedPatterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("/*") || pattern.endsWith(".*")) {
      return ct.startsWith(pattern.slice(0, -1));
    }
    return ct === pattern;
  });
}

export function normalizeContentType(contentType: string | null | undefined): string {
  // Provider APIs commonly return a complete Content-Type header value (for
  // example Discord uses `text/plain; charset=utf-8`) while Paperclip's
  // allowlist and persisted asset metadata operate on the MIME essence. MIME
  // parameters do not change the media type, so normalize them away before
  // enforcing the allowlist. Invalid/empty essences still fail closed to the
  // generic binary type.
  const normalized = (contentType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  return normalized || DEFAULT_ATTACHMENT_CONTENT_TYPE;
}

export function inferOfficeAttachmentContentTypeFromFilename(
  filename: string | null | undefined,
): string | null {
  const lower = (filename ?? "").trim().toLowerCase();
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  return null;
}

export function normalizeUploadAttachmentContentType(input: {
  contentType: string | null | undefined;
  originalFilename?: string | null;
  isAllowedContentType?: (contentType: string) => boolean;
}): string {
  const normalized = normalizeContentType(input.contentType);
  if (!GENERIC_ATTACHMENT_CONTENT_TYPES.includes(normalized)) return normalized;
  const inferred = inferOfficeAttachmentContentTypeFromFilename(input.originalFilename);
  if (!inferred) return normalized;
  if (input.isAllowedContentType && !input.isAllowedContentType(inferred)) return normalized;
  return inferred;
}

export function isInlineAttachmentContentType(contentType: string): boolean {
  return matchesContentType(contentType, [...INLINE_ATTACHMENT_TYPES]);
}

// ---------- Module-level singletons read once at startup ----------

const allowedPatterns: string[] = parseAllowedTypes(
  process.env.PAPERCLIP_ALLOWED_ATTACHMENT_TYPES,
);

/** Convenience wrapper using the process-level allowed list. */
export function isAllowedContentType(contentType: string): boolean {
  return matchesContentType(contentType, allowedPatterns);
}

/**
 * The one attachment size ceiling for this deployment. Every upload path —
 * assets, task attachments, cases, and company import — bounds itself by this
 * value, so an operator raises or lowers the limit in exactly one place.
 */
export const MAX_ATTACHMENT_BYTES =
  Number(process.env.PAPERCLIP_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024;

const ATTACHMENT_SIZE_UNITS: readonly string[] = ["KB", "MB", "GB"];

/**
 * Render a byte count the way a person reading an error message expects it:
 * 1024-based steps under the conventional consumer labels, at most one decimal
 * place, and no trailing ".0". The default cap renders as "10 MB" rather than
 * "10485760 bytes". Sub-kilobyte values stay in bytes so a tiny configured cap
 * does not collapse to "0 KB".
 */
export function formatAttachmentSize(bytes: number): string {
  // Defensive: the cap itself can never be negative or NaN (`Number(env) || default`
  // falls back on both), but never render "NaN bytes" at a user.
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
  if (bytes < 1024) return bytes === 1 ? "1 byte" : `${bytes} bytes`;

  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < ATTACHMENT_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  // toFixed(1) then strip a trailing ".0": 10.5 -> "10.5", 10.0 -> "10".
  const rounded = value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${ATTACHMENT_SIZE_UNITS[unitIndex]}`;
}

// ---------- SaaS upload policy ----------
//
// In SaaS mode users upload individual media and document files only: no
// archives, no HTML, no SVG, no folders. The declared type must be on the
// allowlist AND the bytes must agree with it, so a renamed archive is judged
// by what it is, not what it is called.

const OFFICE_OOXML_TYPES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const SAAS_TEXT_TYPES: readonly string[] = ["text/plain", "text/markdown", "text/csv"];
const SAAS_VIDEO_TYPES: readonly string[] = ["video/mp4", "video/quicktime", "video/webm"];

export const SAAS_ALLOWED_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  ...SAAS_VIDEO_TYPES,
  "application/pdf",
  ...SAAS_TEXT_TYPES,
  ...OFFICE_OOXML_TYPES,
];

export function effectiveAllowedTypes(saasMode: boolean): string[] {
  return saasMode ? [...SAAS_ALLOWED_TYPES] : [...allowedPatterns];
}

/** Per-video cap in SaaS mode (`SOCIALAGENT_VIDEO_MAX_BYTES`, default 100 MB). */
export function videoMaxBytes(): number {
  return Number(process.env.SOCIALAGENT_VIDEO_MAX_BYTES) || 100 * 1024 * 1024;
}

export function maxUploadBytes(contentType: string, saasMode: boolean): number {
  if (saasMode && normalizeContentType(contentType).startsWith("video/")) return videoMaxBytes();
  return MAX_ATTACHMENT_BYTES;
}

/**
 * The ceiling to hand multer for a route: in SaaS mode it must admit a video;
 * the per-type cap is enforced after parsing by `checkUploadPolicy`.
 */
export function uploadParserLimitBytes(saasMode: boolean): number {
  return saasMode ? Math.max(MAX_ATTACHMENT_BYTES, videoMaxBytes()) : MAX_ATTACHMENT_BYTES;
}

function startsWithBytes(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function isZipMagic(buf: Buffer): boolean {
  return startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWithBytes(buf, [0x50, 0x4b, 0x05, 0x06]);
}

function looksLikeMarkup(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<svg") ||
    head.startsWith("<?xml") && head.includes("<svg");
}

/** True when the leading bytes are consistent with the declared type. */
export function bytesMatchDeclaredType(declaredType: string, buf: Buffer): boolean {
  const type = normalizeContentType(declaredType);
  if (buf.length === 0) return false;
  switch (type) {
    case "image/png": return startsWithBytes(buf, [0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg": return startsWithBytes(buf, [0xff, 0xd8, 0xff]);
    case "image/gif": return startsWithBytes(buf, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp": return startsWithBytes(buf, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(buf, [0x57, 0x45, 0x42, 0x50], 8);
    case "video/mp4":
    case "video/quicktime":
      return startsWithBytes(buf, [0x66, 0x74, 0x79, 0x70], 4) ||
        (type === "video/quicktime" && ["moov", "mdat", "wide", "free", "skip"].some((box) =>
          buf.subarray(4, 8).toString("latin1") === box));
    case "video/webm": return startsWithBytes(buf, [0x1a, 0x45, 0xdf, 0xa3]);
    case "application/pdf": return startsWithBytes(buf, [0x25, 0x50, 0x44, 0x46]);
    default:
      if (OFFICE_OOXML_TYPES.includes(type)) return isZipMagic(buf);
      if (SAAS_TEXT_TYPES.includes(type)) {
        if (buf.subarray(0, 8192).includes(0)) return false;
        if (isZipMagic(buf) || startsWithBytes(buf, [0x25, 0x50, 0x44, 0x46])) return false;
        return !looksLikeMarkup(buf);
      }
      return false;
  }
}

export type UploadPolicyResult = { ok: true } | { ok: false; error: string };

/**
 * Enforce the SaaS upload policy for one already-parsed file. Outside SaaS mode
 * it is a no-op so each route keeps its existing allowlist. `imageOnly` is for
 * routes that store pictures (assets/images, company logo).
 */
export function checkUploadPolicy(input: {
  saasMode: boolean;
  contentType: string;
  buffer: Buffer;
  filename?: string | null;
  imageOnly?: boolean;
}): UploadPolicyResult {
  if (!input.saasMode) return { ok: true };
  const type = normalizeContentType(input.contentType);
  if (/[\\/]/.test(input.filename ?? "")) {
    return { ok: false, error: "Folders are not supported. Upload individual files." };
  }
  if (!SAAS_ALLOWED_TYPES.includes(type) || (input.imageOnly && !type.startsWith("image/"))) {
    return { ok: false, error: `Unsupported file type: ${type}. Upload an image, video, PDF or document.` };
  }
  const cap = maxUploadBytes(type, true);
  if (input.buffer.length > cap) {
    return { ok: false, error: `File is larger than the ${formatAttachmentSize(cap)} limit` };
  }
  if (!bytesMatchDeclaredType(type, input.buffer)) {
    return { ok: false, error: "The file contents do not match its declared type" };
  }
  return { ok: true };
}
