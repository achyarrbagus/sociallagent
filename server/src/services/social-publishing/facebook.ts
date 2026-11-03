import type { SocialAdapter } from "./types.js";
import { redactSecrets } from "./redact.js";

const GRAPH_API = "https://graph.facebook.com/v22.0";
const PAGE_ID_PATTERN = /^\d{5,30}$/;

interface GraphPage {
  id?: unknown;
  name?: unknown;
  error?: { message?: unknown };
}

interface GraphPost {
  id?: unknown;
  post_id?: unknown;
  error?: { message?: unknown };
}

class FacebookUncertainOutcomeError extends Error {}

function errorMessage(payload: GraphPage | GraphPost, token: string, status: number): string {
  const providerMessage = typeof payload.error?.message === "string" ? payload.error.message : null;
  return redactSecrets(providerMessage ?? `Facebook Graph API returned HTTP ${status}.`, [token]);
}

async function parseResponse<T extends GraphPage | GraphPost>(response: Response, token: string): Promise<T> {
  let payload: T;
  try {
    payload = await response.json() as T;
  } catch {
    if (response.ok || response.status >= 500) throw new FacebookUncertainOutcomeError();
    throw new Error(`Facebook Graph API returned an invalid response (HTTP ${response.status}).`);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    if (response.ok || response.status >= 500) throw new FacebookUncertainOutcomeError();
    throw new Error(`Facebook Graph API returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok || payload.error) {
    const message = errorMessage(payload, token, response.status);
    if (response.status >= 500) throw new FacebookUncertainOutcomeError(message);
    throw new Error(message);
  }
  return payload;
}

export const facebookPageAdapter: SocialAdapter = {
  platform: "facebook",
  label: "Facebook Pages",
  credentialFields: [
    { key: "pageId", label: "Facebook Page ID", help: "Numeric ID of the Page to connect." },
    { key: "pageAccessToken", label: "Page access token", help: "A Page token with pages_manage_posts and pages_read_engagement permissions. It is encrypted at rest and never shown again." },
  ],
  rules: {
    maxTextLength: 63_206,
    shapes: ["text", "photo"],
    carousel: null,
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 0,
    imageTypes: ["image/jpeg", "image/png"],
    videoTypes: [],
    publicUrlShapes: [],
  },
  async verify(credentials, fetchImpl) {
    const pageId = credentials.pageId?.trim();
    const token = credentials.pageAccessToken?.trim();
    if (!pageId || !PAGE_ID_PATTERN.test(pageId)) throw new Error("Enter a valid numeric Facebook Page ID.");
    if (!token) throw new Error("Enter a Facebook Page access token.");

    let response: Response;
    try {
      response = await fetchImpl(`${GRAPH_API}/${encodeURIComponent(pageId)}?fields=id,name`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Could not reach Facebook to verify this Page. Try again later.");
    }
    const page = await parseResponse<GraphPage>(response, token);
    if (page.id !== pageId || typeof page.name !== "string" || !page.name.trim()) {
      throw new Error("Facebook did not return the requested Page identity. Check the Page ID and token.");
    }
    return { externalAccountId: pageId, displayName: page.name.trim(), tokenExpiresAt: null };
  },
  async publish(context) {
    const pageId = context.credentials.pageId?.trim();
    const token = context.credentials.pageAccessToken?.trim();
    if (!pageId || !PAGE_ID_PATTERN.test(pageId) || !token) {
      return { status: "failed", reason: "The connected Facebook Page credentials are invalid." };
    }
    if (context.checkpoint.finalSent === true) {
      return { status: "unknown", reason: "Facebook may have accepted this post before the previous run stopped. Verify the Page before retrying." };
    }

    const url = `${GRAPH_API}/${encodeURIComponent(pageId)}/${context.shape === "photo" ? "photos" : "feed"}`;
    let init: RequestInit;
    if (context.shape === "photo") {
      const media = context.media[0];
      if (!media || media.kind !== "image") return { status: "failed", reason: "Facebook photo posts require one image." };
      const form = new FormData();
      const bytes = await media.read();
      const imageBytes = new Uint8Array(bytes.byteLength);
      imageBytes.set(bytes);
      form.set("source", new Blob([imageBytes.buffer], { type: media.contentType }), media.filename ?? "image");
      form.set("caption", context.text);
      form.set("published", "true");
      init = {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(60_000),
      };
    } else if (context.shape === "text") {
      const form = new URLSearchParams({ message: context.text });
      init = {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(30_000),
      };
    } else {
      return { status: "failed", reason: `Facebook does not support ${context.shape} posts through this integration.` };
    }

    await context.saveCheckpoint({ ...context.checkpoint, finalSent: true });
    let response: Response;
    try {
      response = await context.fetch(url, init);
    } catch {
      return { status: "unknown", reason: "Facebook may have accepted the post, but its response was not received. Verify the Page before retrying." };
    }
    let result: GraphPost;
    try {
      result = await parseResponse<GraphPost>(response, token);
    } catch (error) {
      if (error instanceof FacebookUncertainOutcomeError) {
        return { status: "unknown", reason: "Facebook may have accepted the post, but the outcome could not be confirmed. Verify the Page before retrying." };
      }
      return { status: "failed", reason: error instanceof Error ? error.message : "Facebook rejected the post." };
    }
    const providerPostId = context.shape === "photo" ? result.post_id : result.id;
    if (typeof providerPostId !== "string" || !providerPostId) {
      return { status: "unknown", reason: "Facebook accepted the request but returned no post identifier. Verify the Page before retrying." };
    }
    return {
      status: "published",
      providerPostId,
      externalUrl: `https://www.facebook.com/${encodeURIComponent(providerPostId)}`,
    };
  },
};
