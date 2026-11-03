import { redactSecrets } from "./redact.js";
import type { PublishContext, PublishOutcome, SocialAdapter } from "./types.js";

const API = "https://graph.instagram.com/v26.0";
const ACCOUNT_ID_PATTERN = /^\d{5,30}$/;
const MAX_STATUS_POLLS = 12;
const STATUS_POLL_DELAY_MS = 2_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

type Payload = Record<string, unknown>;

class InstagramUncertainOutcomeError extends Error {}

function record(value: unknown): Payload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Payload : null;
}

function sensitiveValues(credentials: Record<string, string>, context?: PublishContext): string[] {
  return [...Object.values(credentials), ...(context?.media.map(media => media.signedUrl).filter((value): value is string => Boolean(value)) ?? [])];
}

function errorDetail(payload: Payload | null, credentials: Record<string, string>, context?: PublishContext): string {
  const error = record(payload?.error);
  const message = typeof error?.message === "string" ? error.message : null;
  return redactSecrets(message ?? "Instagram rejected the request.", sensitiveValues(credentials, context));
}

async function readJson(response: Response, credentials: Record<string, string>, context?: PublishContext): Promise<Payload> {
  let payload: Payload | null;
  try {
    payload = record(await response.json());
  } catch {
    payload = null;
  }
  if (!payload) {
    if (response.ok || response.status >= 500) throw new InstagramUncertainOutcomeError();
    throw new Error(`Instagram returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok || payload.error) {
    const detail = errorDetail(payload, credentials, context);
    if (response.status >= 500) throw new InstagramUncertainOutcomeError(detail);
    throw new Error(detail);
  }
  return payload;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

async function waitForContainers(ids: string[], token: string, credentials: Record<string, string>, context: PublishContext): Promise<"ready" | "processing" | "failed"> {
  for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt += 1) {
    const statuses = await Promise.all(ids.map(async id => {
      let response: Response;
      try {
        response = await context.fetch(`${API}/${encodeURIComponent(id)}?fields=status_code,status`, {
          headers: authHeaders(token),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error("Could not reach Instagram to check media processing status. No post was published.");
      }
      try {
        const payload = await readJson(response, credentials, context);
        return typeof payload.status_code === "string" ? payload.status_code : "";
      } catch (error) {
        if (error instanceof InstagramUncertainOutcomeError) {
          throw new Error("Instagram media processing status could not be confirmed. No post was published.");
        }
        throw error;
      }
    }));
    if (statuses.some(status => status === "ERROR" || status === "EXPIRED")) return "failed";
    if (statuses.every(status => status === "FINISHED")) return "ready";
    if (attempt < MAX_STATUS_POLLS - 1) await new Promise(resolve => setTimeout(resolve, STATUS_POLL_DELAY_MS));
  }
  return "processing";
}

async function createContainer(context: PublishContext, token: string, fields: Record<string, string>): Promise<string> {
  const accountId = context.credentials.instagramAccountId?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("The connected Instagram account ID is invalid.");
  const form = new URLSearchParams(fields);
  let response: Response;
  try {
    response = await context.fetch(`${API}/${encodeURIComponent(accountId)}/media`, {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Could not reach Instagram to create a media container. No post was published; schedule it again later.");
  }
  let payload: Payload;
  try {
    payload = await readJson(response, context.credentials, context);
  } catch (error) {
    if (error instanceof InstagramUncertainOutcomeError) {
      throw new Error("Instagram's media-container response could not be confirmed. No post was published; schedule it again later.");
    }
    throw error;
  }
  const id = typeof payload.id === "string" && payload.id ? payload.id : null;
  if (!id) throw new Error("Instagram did not return a media-container ID. No post was published.");
  return id;
}

async function saveCheckpoint(context: PublishContext, next: Record<string, unknown>): Promise<boolean> {
  try {
    await context.saveCheckpoint(next);
    return true;
  } catch {
    return false;
  }
}

async function publishedMedia(context: PublishContext, token: string, containerId: string): Promise<{ providerPostId: string; externalUrl: string | null } | null> {
  const accountId = context.credentials.instagramAccountId!.trim();
  let response: Response;
  try {
    response = await context.fetch(`${API}/${encodeURIComponent(accountId)}/media_publish`, {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }
  let payload: Payload;
  try {
    payload = await readJson(response, context.credentials, context);
  } catch (error) {
    if (error instanceof InstagramUncertainOutcomeError) return null;
    throw error;
  }
  const providerPostId = typeof payload.id === "string" && payload.id ? payload.id : null;
  if (!providerPostId) return null;

  let permalink: string | null = null;
  try {
    const permalinkResponse = await context.fetch(`${API}/${encodeURIComponent(providerPostId)}?fields=permalink`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(15_000),
    });
    const permalinkPayload = record(await permalinkResponse.json());
    if (permalinkResponse.ok && typeof permalinkPayload?.permalink === "string") permalink = permalinkPayload.permalink;
  } catch {
    // The provider post ID is authoritative even when its optional permalink lookup is unavailable.
  }
  return { providerPostId, externalUrl: permalink };
}

export const instagramAdapter: SocialAdapter = {
  platform: "instagram",
  label: "Instagram professional account",
  credentialFields: [
    { key: "accessToken", label: "Instagram access token", help: "Long-lived Business or Creator user token with instagram_business_basic and instagram_business_content_publish. The account ID is detected during verification; token stored encrypted and never shown again." },
  ],
  rules: {
    maxTextLength: 2_200,
    shapes: ["photo", "carousel", "video"],
    carousel: { min: 2, max: 10, allowVideo: true },
    maxImageBytes: MAX_IMAGE_BYTES,
    maxVideoBytes: MAX_VIDEO_BYTES,
    imageTypes: ["image/jpeg"],
    videoTypes: ["video/mp4", "video/quicktime"],
    publicUrlShapes: ["photo", "carousel", "video"],
  },
  async verify(credentials, fetchImpl) {
    const token = credentials.accessToken?.trim();
    if (!token) throw new Error("Enter an Instagram access token.");
    let response: Response;
    try {
      response = await fetchImpl(`${API}/me?fields=user_id,username`, {
        headers: authHeaders(token),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Could not reach Instagram to verify this account. Try again later.");
    }
    const payload = await readJson(response, credentials);
    const accountId = typeof payload.user_id === "string" ? payload.user_id : "";
    if (!ACCOUNT_ID_PATTERN.test(accountId) || typeof payload.username !== "string" || !payload.username.trim()) {
      throw new Error("Instagram did not return a professional account identity. Check the account type and token permissions.");
    }
    return {
      externalAccountId: accountId,
      displayName: `@${payload.username.trim()}`,
      tokenExpiresAt: null,
      credentials: { ...credentials, instagramAccountId: accountId },
    };
  },
  publish(context) {
    return publishInstagram(context).catch(error => ({
      status: "failed" as const,
      reason: error instanceof Error
        ? redactSecrets(error.message, sensitiveValues(context.credentials, context))
        : "Instagram could not prepare the approved media. No post was published.",
    }));
  },
};

async function publishInstagram(context: PublishContext): Promise<PublishOutcome> {
    if (!["photo", "carousel", "video"].includes(context.shape)) {
      return { status: "failed", reason: "Instagram requires one photo, one video, or a carousel of 2 to 10 media items." };
    }
    if (context.checkpoint.finalSent === true) {
      return { status: "unknown", reason: "Instagram may already have published this post. Verify the account before retrying." };
    }
    const accountId = context.credentials.instagramAccountId?.trim();
    const token = context.credentials.accessToken?.trim();
    if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId) || !token) {
      return { status: "failed", reason: "The connected Instagram credentials are incomplete." };
    }
    if (context.media.some(media => !media.signedUrl || !media.signedUrl.startsWith("https://"))) {
      return { status: "failed", reason: "Instagram needs publicly reachable HTTPS media URLs. Configure SOCIALAGENT_PUBLIC_URL and schedule the post again." };
    }

    let containerId: string;
    const savedContainerId = typeof context.checkpoint.instagramContainerId === "string" ? context.checkpoint.instagramContainerId : null;
    if (savedContainerId) {
      containerId = savedContainerId;
    } else if (context.shape === "photo") {
      const image = context.media[0];
      if (!image || image.kind !== "image") return { status: "failed", reason: "Instagram photo posts require one JPEG image." };
      containerId = await createContainer(context, token, { image_url: image.signedUrl!, caption: context.text });
      if (!await saveCheckpoint(context, { ...context.checkpoint, instagramContainerId: containerId })) {
        return { status: "unknown", reason: "Instagram created a media container but its checkpoint could not be saved. Verify the account before retrying." };
      }
    } else if (context.shape === "video") {
      const video = context.media[0];
      if (!video || video.kind !== "video") return { status: "failed", reason: "Instagram video posts require one video." };
      containerId = await createContainer(context, token, { media_type: "REELS", video_url: video.signedUrl!, caption: context.text });
      if (!await saveCheckpoint(context, { ...context.checkpoint, instagramContainerId: containerId })) {
        return { status: "unknown", reason: "Instagram created a Reel container but its checkpoint could not be saved. Verify the account before retrying." };
      }
    } else {
      if (context.media.length < 2 || context.media.length > 10) {
        return { status: "failed", reason: "Instagram carousels require 2 to 10 media items." };
      }
      let childIds = Array.isArray(context.checkpoint.instagramChildContainerIds)
        ? context.checkpoint.instagramChildContainerIds.filter((value): value is string => typeof value === "string")
        : [];
      if (childIds.length > context.media.length) return { status: "failed", reason: "The saved Instagram carousel checkpoint does not match the approved media." };
      for (let index = childIds.length; index < context.media.length; index += 1) {
        const media = context.media[index]!;
        const fields: Record<string, string> = media.kind === "image"
          ? { image_url: media.signedUrl!, is_carousel_item: "true" }
          : { media_type: "VIDEO", video_url: media.signedUrl!, is_carousel_item: "true" };
        const childId = await createContainer(context, token, fields);
        childIds = [...childIds, childId];
        if (!await saveCheckpoint(context, { ...context.checkpoint, instagramChildContainerIds: childIds })) {
          return { status: "unknown", reason: "Instagram created a carousel item but its checkpoint could not be saved. Verify the account before retrying." };
        }
      }
      const childStatus = await waitForContainers(childIds, token, context.credentials, context);
      if (childStatus === "failed") return { status: "failed", reason: "Instagram could not process a carousel item. Nothing was published." };
      if (childStatus === "processing") return { status: "failed", reason: "Instagram is still processing a carousel item. Nothing was published; schedule it again later." };
      containerId = typeof context.checkpoint.instagramContainerId === "string" ? context.checkpoint.instagramContainerId : "";
      if (!containerId) {
        containerId = await createContainer(context, token, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: context.text,
        });
        if (!await saveCheckpoint(context, { ...context.checkpoint, instagramChildContainerIds: childIds, instagramContainerId: containerId })) {
          return { status: "unknown", reason: "Instagram created a carousel container but its checkpoint could not be saved. Verify the account before retrying." };
        }
      }
    }

    let status: "ready" | "processing" | "failed";
    try {
      status = await waitForContainers([containerId], token, context.credentials, context);
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? error.message : "Instagram media processing could not be checked. No post was published." };
    }
    if (status === "failed") return { status: "failed", reason: "Instagram could not process the media. Nothing was published." };
    if (status === "processing") return { status: "failed", reason: "Instagram is still processing the media. Nothing was published; schedule it again later." };

    if (!await saveCheckpoint(context, { ...context.checkpoint, instagramContainerId: containerId, finalSent: true })) {
      return { status: "unknown", reason: "Instagram media is ready but the publish checkpoint could not be saved. Verify the account before retrying." };
    }
    let published: { providerPostId: string; externalUrl: string | null } | null;
    try {
      published = await publishedMedia(context, token, containerId);
    } catch (error) {
      return { status: "failed", reason: error instanceof Error ? error.message : "Instagram rejected the publish request." };
    }
    if (!published) return { status: "unknown", reason: "Instagram may have accepted the post but its response could not be confirmed. Verify the account before retrying." };
    return { status: "published", ...published } as const;
}
