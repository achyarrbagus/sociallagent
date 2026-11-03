import { redactSecrets } from "./redact.js";
import type { SocialAdapter } from "./types.js";

const API = "https://api.x.com/2";
const URL_PATTERN = /https?:\/\/[^\s<>{}\[\]"']+/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}]+$/u;

export function xWeightedLength(text: string): number {
  let weighted = 0;
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const url = rawUrl.replace(TRAILING_URL_PUNCTUATION, "");
    const urlEnd = start + url.length;
    weighted += countWeightedCodePoints(text.slice(cursor, start));
    weighted += 23;
    weighted += countWeightedCodePoints(text.slice(urlEnd, start + rawUrl.length));
    cursor = start + rawUrl.length;
  }
  return weighted + countWeightedCodePoints(text.slice(cursor));
}

function countWeightedCodePoints(text: string): number {
  let count = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    count += isOneWeight(codePoint) ? 1 : 2;
  }
  return count;
}

function isOneWeight(codePoint: number): boolean {
  return codePoint <= 0x10ff
    || (codePoint >= 0x2000 && codePoint <= 0x200d)
    || (codePoint >= 0x2010 && codePoint <= 0x201f)
    || (codePoint >= 0x2032 && codePoint <= 0x2037);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function json(response: Response): Promise<Record<string, unknown> | null> {
  try { return record(await response.json()); } catch { return null; }
}

function errorReason(payload: Record<string, unknown> | null, token: string, status: number): string {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const details = errors.map((item) => {
    const error = record(item);
    return typeof error?.detail === "string" ? error.detail : typeof error?.title === "string" ? error.title : null;
  }).filter((item): item is string => Boolean(item));
  const detail = typeof payload?.detail === "string"
    ? payload.detail
    : typeof payload?.title === "string"
      ? payload.title
      : details.join("; ") || `HTTP ${status}`;
  if (status === 403 || status === 429) {
    return "X refused the request. Check that your developer account plan and app permissions allow this operation.";
  }
  return `X refused the request: ${redactSecrets(detail, [token])}`;
}

function tokenFrom(credentials: Record<string, string>): string | null {
  const token = credentials.accessToken?.trim();
  return token || null;
}

export const xAdapter: SocialAdapter = {
  platform: "x",
  label: "X",
  credentialFields: [
    { key: "accessToken", label: "User access token", help: "X OAuth 2.0 user-context token with users.read, tweet.read, tweet.write, and media.write for photos. App-only bearer tokens cannot publish." },
  ],
  rules: {
    maxTextLength: 280,
    countText: xWeightedLength,
    shapes: ["text", "photo", "carousel"],
    carousel: { min: 2, max: 4, allowVideo: false },
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 0,
    imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    videoTypes: [],
    publicUrlShapes: [],
  },
  async verify(credentials, fetchImpl) {
    const token = tokenFrom(credentials);
    if (!token) throw new Error("Enter an X OAuth 2.0 user access token.");
    let response: Response;
    try {
      response = await fetchImpl(`${API}/users/me?user.fields=name,username`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Could not reach X to verify this account. Try again later.");
    }
    const payload = await json(response);
    const data = record(payload?.data);
    if (!response.ok) throw new Error(errorReason(payload, token, response.status));
    if (typeof data?.id !== "string" || typeof data.username !== "string" || !data.username.trim()) {
      throw new Error("X did not return the authenticated user identity. Confirm this is a user-context token with users.read.");
    }
    return { externalAccountId: data.id, displayName: `@${data.username}`, tokenExpiresAt: null };
  },
  async publish(context) {
    const token = tokenFrom(context.credentials);
    if (!token) return { status: "failed", reason: "The connected X user access token is missing." };
    if (context.shape !== "text" && context.shape !== "photo" && context.shape !== "carousel") {
      return { status: "failed", reason: `X does not support ${context.shape} posts through this integration.` };
    }
    if (context.shape === "carousel" && (context.media.length < 2 || context.media.length > 4 || context.media.some((item) => item.kind !== "image"))) {
      return { status: "failed", reason: "X photo posts need one image or a carousel of two to four images." };
    }
    if (context.shape === "photo" && (context.media.length !== 1 || context.media[0]?.kind !== "image")) {
      return { status: "failed", reason: "X photo posts need one image." };
    }
    if (context.checkpoint.finalSent === true) {
      return { status: "unknown", reason: "X may have accepted this post before the previous run stopped. Verify the account before retrying." };
    }

    const checkpoint = { ...context.checkpoint };
    let mediaIds = Array.isArray(checkpoint.mediaIds) ? checkpoint.mediaIds.filter((id): id is string => typeof id === "string") : [];
    for (const media of context.media.slice(mediaIds.length)) {
      let upload: Response;
      try {
        const bytes = await media.read();
        upload = await context.fetch(`${API}/media/upload`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ media: bytes.toString("base64"), media_category: media.contentType === "image/gif" ? "tweet_gif" : "tweet_image" }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        return { status: "failed", reason: "Could not reach X while uploading the photo. The post was not sent." };
      }
      const payload = await json(upload);
      const data = record(payload?.data);
      const mediaId = typeof data?.id === "string" ? data.id : null;
      if (!upload.ok || !mediaId) {
        return { status: "failed", reason: errorReason(payload, token, upload.status) };
      }
      mediaIds = [...mediaIds, mediaId];
      await context.saveCheckpoint({ ...checkpoint, mediaIds });
    }

    const body = context.shape === "text" ? { text: context.text } : { text: context.text, media: { media_ids: mediaIds } };
    await context.saveCheckpoint({ ...checkpoint, mediaIds, finalSent: true });
    let response: Response;
    try {
      response = await context.fetch(`${API}/tweets`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { status: "unknown", reason: "X may have accepted the post, but its response was not received. Verify the account before retrying." };
    }
    const payload = await json(response);
    if (!response.ok) {
      if (response.status >= 500) return { status: "unknown", reason: "X may have accepted the post, but its response could not be confirmed. Verify the account before retrying." };
      return { status: "failed", reason: errorReason(payload, token, response.status) };
    }
    const id = record(payload?.data)?.id;
    if (typeof id !== "string" || !id) {
      return { status: "unknown", reason: "X accepted the request but returned no post identifier. Verify the account before retrying." };
    }
    return { status: "published", providerPostId: id, externalUrl: `https://x.com/i/status/${encodeURIComponent(id)}` };
  },
};
