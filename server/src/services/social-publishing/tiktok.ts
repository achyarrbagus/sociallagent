import { redactSecrets } from "./redact.js";
import type { PublishContext, SocialAdapter } from "./types.js";

const API = "https://open.tiktokapis.com/v2";
const TOKEN_URL = `${API}/oauth/token/`;
const VIDEO_INIT_URL = `${API}/post/publish/video/init/`;
const CREATOR_INFO_URL = `${API}/post/publish/creator_info/query/`;
const STATUS_URL = `${API}/post/publish/status/fetch/`;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const REFRESH_MARGIN_MS = 5 * 60_000;

interface Payload extends Record<string, unknown> {}

function record(value: unknown): Payload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Payload : null;
}

async function json(response: Response): Promise<Payload | null> {
  try { return record(await response.json()); } catch { return null; }
}

function nestedData(payload: Payload | null): Payload | null {
  return record(payload?.data) ?? payload;
}

function credentialsForRedaction(credentials: Record<string, string>) {
  return Object.values(credentials);
}

function providerError(payload: Payload | null, credentials: Record<string, string>, status: number): string {
  const error = record(payload?.error);
  const detail = typeof error?.message === "string"
    ? error.message
    : typeof payload?.error_description === "string"
      ? payload.error_description
      : typeof error?.code === "string"
        ? error.code
        : `HTTP ${status}`;
  return `TikTok refused the request: ${redactSecrets(detail, credentialsForRedaction(credentials))}`;
}

function tokenExpiry(payload: Payload, field: "expires_in" | "refresh_expires_in"): Date {
  const seconds = payload[field];
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("TikTok returned an invalid token lifetime.");
  }
  return new Date(Date.now() + seconds * 1000);
}

async function refreshCredentials(
  credentials: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ credentials: Record<string, string>; tokenExpiresAt: Date }> {
  const clientKey = credentials.clientKey?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  const refreshToken = credentials.refreshToken?.trim();
  if (!clientKey || !clientSecret || !refreshToken) throw new Error("TikTok app credentials or refresh token are missing.");
  const refreshExpiry = credentials.refreshTokenExpiresAt ? Date.parse(credentials.refreshTokenExpiresAt) : Number.NaN;
  if (Number.isFinite(refreshExpiry) && refreshExpiry <= Date.now()) {
    throw new Error("The TikTok refresh token has expired. Reconnect the account with a new authorization.");
  }

  let response: Response;
  try {
    const form = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Could not reach TikTok to refresh the account token.");
  }
  const payload = await json(response);
  if (!response.ok) throw new Error(providerError(payload, credentials, response.status));
  const data = nestedData(payload);
  const accessToken = typeof data?.access_token === "string" ? data.access_token : null;
  const rotatedRefreshToken = typeof data?.refresh_token === "string" ? data.refresh_token : null;
  const openId = typeof data?.open_id === "string" ? data.open_id : credentials.openId;
  if (!accessToken || !rotatedRefreshToken || typeof openId !== "string" || !openId) {
    throw new Error("TikTok did not return refreshed account tokens. Reconnect the account.");
  }
  const expiresAt = tokenExpiry(data!, "expires_in");
  const refreshTokenExpiresAt = tokenExpiry(data!, "refresh_expires_in");
  const scope = typeof data?.scope === "string" ? data.scope : credentials.scope ?? "";
  return {
    credentials: {
      ...credentials,
      accessToken,
      refreshToken: rotatedRefreshToken,
      openId,
      scope,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    },
    tokenExpiresAt: expiresAt,
  };
}

async function creatorInfo(accessToken: string, fetchImpl: typeof fetch): Promise<Payload> {
  let response: Response;
  try {
    response = await fetchImpl(CREATOR_INFO_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json; charset=UTF-8" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Could not reach TikTok to verify creator permissions.");
  }
  const payload = await json(response);
  const data = nestedData(payload);
  const error = record(payload?.error);
  if (!response.ok || (typeof error?.code === "string" && error.code !== "ok")) {
    throw new Error(`TikTok creator verification failed (HTTP ${response.status}). Check video.publish access.`);
  }
  if (!data || !Array.isArray(data.privacy_level_options)) throw new Error("TikTok did not return creator privacy settings.");
  return data;
}

function privacyOptions(data: Payload): string[] {
  return Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((option): option is string => typeof option === "string")
    : [];
}

function safeUploadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^open-upload(?:-[a-z0-9]+)?\.tiktokapis\.com$/u.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function postIdFromStatus(data: Payload): string | null {
  const ids = data.publicaly_available_post_id;
  return Array.isArray(ids) && typeof ids[0] === "string" && ids[0] ? ids[0] : null;
}

export const tiktokAdapter: SocialAdapter = {
  platform: "tiktok",
  label: "TikTok profile",
  credentialFields: [
    { key: "clientKey", label: "TikTok Client Key", help: "Client key from your TikTok for Developers app." },
    { key: "clientSecret", label: "TikTok Client Secret", help: "Client secret for your TikTok app. Stored encrypted and never shown again." },
    { key: "refreshToken", label: "TikTok refresh token", help: "Refresh token from a user authorization that grants video.publish. TikTok rotates this token." },
  ],
  rules: {
    maxTextLength: 2200,
    shapes: ["video"],
    carousel: null,
    maxImageBytes: 0,
    maxVideoBytes: 512 * 1024 * 1024,
    imageTypes: [],
    videoTypes: ["video/mp4", "video/quicktime", "video/webm"],
    publicUrlShapes: [],
  },
  async verify(credentials, fetchImpl) {
    const refreshed = await refreshCredentials(credentials, fetchImpl);
    const info = await creatorInfo(refreshed.credentials.accessToken!, fetchImpl);
    if (!privacyOptions(info).includes("SELF_ONLY")) {
      throw new Error("TikTok did not offer private-only visibility for this account, so it cannot be connected safely.");
    }
    const openId = refreshed.credentials.openId;
    const username = typeof info.creator_username === "string" ? info.creator_username.trim() : "";
    const nickname = typeof info.creator_nickname === "string" ? info.creator_nickname.trim() : "";
    if (!openId || (!username && !nickname)) throw new Error("TikTok did not return the authenticated creator identity.");
    return {
      externalAccountId: openId,
      displayName: nickname || `@${username}`,
      tokenExpiresAt: refreshed.tokenExpiresAt,
      credentials: {
        ...refreshed.credentials,
        creatorUsername: username,
      },
    };
  },
  async publish(context: PublishContext) {
    if (context.shape !== "video" || context.media.length !== 1 || context.media[0]?.kind !== "video") {
      return { status: "failed", reason: "TikTok direct publishing currently accepts one video per post; text-only, photo, and carousel posts are not supported." };
    }
    if (context.checkpoint.finalSent === true) {
      return { status: "unknown", reason: "TikTok may already be processing this post. Verify the TikTok account before retrying." };
    }
    if (typeof context.withFreshCredentials !== "function") {
      return { status: "failed", reason: "TikTok token refresh is unavailable in this publishing context." };
    }

    let credentials: Record<string, string>;
    try {
      credentials = await context.withFreshCredentials(current => refreshCredentials(current, context.fetch));
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? redactSecrets(error.message, credentialsForRedaction(context.credentials)) : "TikTok account token refresh failed." };
    }
    const token = credentials.accessToken?.trim();
    const username = credentials.creatorUsername?.trim() ?? "";
    if (!token || !username) return { status: "failed", reason: "The connected TikTok creator credentials are incomplete." };

    let creator: Payload;
    try {
      creator = await creatorInfo(token, context.fetch);
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? redactSecrets(error.message, credentialsForRedaction(credentials)) : "TikTok creator settings could not be loaded." };
    }
    if (!privacyOptions(creator).includes("SELF_ONLY")) {
      return { status: "failed", reason: "TikTok no longer offers private-only visibility for this account; nothing was posted." };
    }

    const media = context.media[0]!;
    const chunkSize = Math.min(MAX_CHUNK_BYTES, Math.max(MIN_CHUNK_BYTES, media.byteSize));
    const totalChunkCount = Math.ceil(media.byteSize / chunkSize);
    const initBody = {
      post_info: { title: context.text, privacy_level: "SELF_ONLY" },
      source_info: { source: "FILE_UPLOAD", video_size: media.byteSize, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
    };

    let initResponse: Response;
    try {
      initResponse = await context.fetch(VIDEO_INIT_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify(initBody),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { status: "unknown", reason: "TikTok may have accepted the post initialization, but no response was received. Verify the account before retrying." };
    }
    const initPayload = await json(initResponse);
    const initData = nestedData(initPayload);
    const initError = record(initPayload?.error);
    const providerCode = typeof initError?.code === "string" ? initError.code : null;
    if (!initResponse.ok || (providerCode !== null && providerCode !== "ok")) {
      if (initResponse.status >= 500) return { status: "unknown", reason: "TikTok may have accepted the post initialization, but its response could not be confirmed. Verify the account before retrying." };
      return { status: "failed", reason: providerError(initPayload, credentials, initResponse.status) };
    }
    const publishId = typeof initData?.publish_id === "string" ? initData.publish_id : null;
    const uploadUrl = safeUploadUrl(initData?.upload_url);
    if (!publishId || !uploadUrl) {
      return { status: "unknown", reason: "TikTok accepted the post initialization but returned incomplete upload details. Verify the account before retrying." };
    }

    const checkpoint = { ...context.checkpoint, publishId, finalSent: true, uploadComplete: false };
    try {
      await context.saveCheckpoint(checkpoint);
    } catch {
      return { status: "unknown", reason: `TikTok created a pending post (${publishId}), but the checkpoint could not be saved. Verify the account before retrying.` };
    }

    let bytes: Buffer;
    try {
      bytes = await media.read();
    } catch {
      return { status: "unknown", reason: `TikTok created a pending post (${publishId}), but the approved video could not be read. Verify the account before retrying.` };
    }
    if (bytes.byteLength !== media.byteSize) {
      return { status: "unknown", reason: `TikTok created a pending post (${publishId}), but the approved video size changed. Verify the account before retrying.` };
    }

    try {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
        const body = new Uint8Array(chunk.byteLength);
        body.set(chunk);
        const end = offset + chunk.byteLength - 1;
        const response = await context.fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": media.contentType,
            "content-length": String(chunk.byteLength),
            "content-range": `bytes ${offset}-${end}/${media.byteSize}`,
          },
          body,
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          return { status: "unknown", reason: `TikTok is processing post ${publishId}, but the video upload response was not successful. Verify the account before retrying.` };
        }
      }
    } catch {
      return { status: "unknown", reason: `TikTok may be processing post ${publishId}, but the video upload response was lost. Verify the account before retrying.` };
    }

    try {
      await context.saveCheckpoint({ ...checkpoint, uploadComplete: true });
    } catch {
      return { status: "unknown", reason: `TikTok received the video for post ${publishId}, but its checkpoint could not be updated. Verify the account before retrying.` };
    }

    let statusResponse: Response;
    try {
      statusResponse = await context.fetch(STATUS_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: publishId }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { status: "unknown", reason: `TikTok received the video for post ${publishId}, but its publication status could not be confirmed.` };
    }
    const statusPayload = await json(statusResponse);
    const statusData = nestedData(statusPayload);
    const statusError = record(statusPayload?.error);
    if (!statusResponse.ok || (typeof statusError?.code === "string" && statusError.code !== "ok") || !statusData) {
      return { status: "unknown", reason: `TikTok received the video for post ${publishId}, but its publication status could not be confirmed.` };
    }
    if (statusData.status === "FAILED") {
      const failure = typeof statusData.fail_reason === "string" ? statusData.fail_reason : "TikTok could not process the video.";
      return { status: "failed", reason: `TikTok failed post ${publishId}: ${redactSecrets(failure, credentialsForRedaction(credentials))}` };
    }
    const postId = postIdFromStatus(statusData);
    if (statusData.status !== "PUBLISH_COMPLETE" || !postId) {
      return { status: "unknown", reason: `TikTok is still processing post ${publishId}. Verify the account before retrying.` };
    }
    return {
      status: "published",
      providerPostId: postId,
      externalUrl: `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${encodeURIComponent(postId)}`,
    };
  },
};

export async function refreshTikTokCredentials(credentials: Record<string, string>, fetchImpl: typeof fetch) {
  return refreshCredentials(credentials, fetchImpl);
}
