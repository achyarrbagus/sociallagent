import { redactSecrets } from "./redact.js";
import type { SocialAdapter } from "./types.js";

const API = "https://api.linkedin.com";
const REST = `${API}/rest`;
const LINKEDIN_VERSION = "202608";
const PERSON_URN = /^urn:li:person:([A-Za-z0-9_-]+)$/;

type LinkedInPayload = Record<string, unknown>;
function record(value: unknown): LinkedInPayload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as LinkedInPayload : null;
}
async function json(response: Response): Promise<LinkedInPayload | null> {
  try { return record(await response.json()); } catch { return null; }
}
function tokenFrom(credentials: Record<string, string>): string | null {
  return credentials.accessToken?.trim() || null;
}
function apiHeaders(token: string) {
  return { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json", "linkedin-version": LINKEDIN_VERSION, "x-restli-protocol-version": "2.0.0" };
}
function errorReason(payload: LinkedInPayload | null, token: string, status: number): string {
  const detail = typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.serviceErrorCode === "number"
      ? `provider error ${payload.serviceErrorCode}`
      : `HTTP ${status}`;
  return status === 401
    ? "LinkedIn rejected the access token. Reconnect the member profile."
    : `LinkedIn refused the request: ${redactSecrets(detail, [token])}`;
}

export const linkedinAdapter: SocialAdapter = {
  platform: "linkedin",
  label: "LinkedIn member profile",
  credentialFields: [
    { key: "accessToken", label: "Access token", help: "LinkedIn OAuth token with openid, profile, and w_member_social. Tokens are encrypted at rest and not shown again." },
    { key: "authorUrn", label: "Member author URN", help: "Member profile URN in the form urn:li:person:… . Organization/Page posting is not enabled in this connector." },
  ],
  rules: {
    maxTextLength: 3000,
    shapes: ["text", "photo"],
    carousel: null,
    maxImageBytes: 36 * 1024 * 1024,
    maxVideoBytes: 0,
    imageTypes: ["image/jpeg", "image/png", "image/gif"],
    videoTypes: [],
    publicUrlShapes: [],
  },
  async verify(credentials, fetchImpl) {
    const token = tokenFrom(credentials);
    const authorUrn = credentials.authorUrn?.trim() ?? "";
    const urnMatch = PERSON_URN.exec(authorUrn);
    if (!token) throw new Error("Enter a LinkedIn member access token.");
    if (!urnMatch) throw new Error("Enter a member URN such as urn:li:person:12345. LinkedIn Page URNs are not supported here.");
    let response: Response;
    try {
      response = await fetchImpl(`${API}/v2/userinfo`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Could not reach LinkedIn to verify this member profile. Try again later.");
    }
    const payload = await json(response);
    if (!response.ok) throw new Error(errorReason(payload, token, response.status));
    if (typeof payload?.sub !== "string" || payload.sub !== urnMatch[1] || typeof payload.name !== "string" || !payload.name.trim()) {
      throw new Error("LinkedIn did not confirm that this access token belongs to the specified member URN. Check openid/profile access and the URN.");
    }
    return { externalAccountId: payload.sub, displayName: payload.name.trim(), tokenExpiresAt: null };
  },
  async publish(context) {
    const token = tokenFrom(context.credentials);
    const author = context.credentials.authorUrn?.trim() ?? "";
    if (!token || !PERSON_URN.test(author)) return { status: "failed", reason: "The connected LinkedIn member credentials are invalid." };
    if (context.shape !== "text" && context.shape !== "photo") {
      return { status: "failed", reason: `LinkedIn does not support ${context.shape} posts through this integration.` };
    }
    if (context.shape === "photo" && (context.media.length !== 1 || context.media[0]?.kind !== "image")) {
      return { status: "failed", reason: "LinkedIn photo posts need exactly one image." };
    }
    if (context.checkpoint.finalSent === true) {
      return { status: "unknown", reason: "LinkedIn may have accepted this post before the previous run stopped. Verify the profile before retrying." };
    }

    let imageUrn: string | null = typeof context.checkpoint.imageUrn === "string" ? context.checkpoint.imageUrn : null;
    if (context.shape === "photo" && !imageUrn) {
      const media = context.media[0]!;
      let initResponse: Response;
      try {
        initResponse = await context.fetch(`${REST}/images?action=initializeUpload`, {
          method: "POST",
          headers: apiHeaders(token),
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        return { status: "failed", reason: "Could not reach LinkedIn to initialize the photo upload. The post was not sent." };
      }
      const initPayload = await json(initResponse);
      const uploadInfo = record(initPayload?.value);
      const uploadUrl = typeof uploadInfo?.uploadUrl === "string" ? uploadInfo.uploadUrl : null;
      imageUrn = typeof uploadInfo?.image === "string" ? uploadInfo.image : null;
      if (!initResponse.ok || !uploadUrl || !imageUrn) {
        return { status: "failed", reason: errorReason(initPayload, token, initResponse.status) };
      }
      let uploadTarget: URL;
      try { uploadTarget = new URL(uploadUrl); } catch { return { status: "failed", reason: "LinkedIn returned an invalid photo upload URL." }; }
      if (uploadTarget.protocol !== "https:" || (uploadTarget.hostname !== "linkedin.com" && !uploadTarget.hostname.endsWith(".linkedin.com"))) {
        return { status: "failed", reason: "LinkedIn returned an untrusted photo upload host." };
      }
      let uploadResponse: Response;
      try {
        const bytes = await media.read();
        const body = new Uint8Array(bytes.byteLength);
        body.set(bytes);
        uploadResponse = await context.fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": media.contentType },
          body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        return { status: "failed", reason: "Could not upload the photo to LinkedIn. The post was not sent." };
      }
      if (!uploadResponse.ok) return { status: "failed", reason: `LinkedIn photo upload failed (HTTP ${uploadResponse.status}). The post was not sent.` };
      await context.saveCheckpoint({ ...context.checkpoint, imageUrn });
    }

    const body: Record<string, unknown> = {
      author,
      commentary: context.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (imageUrn) body.content = { media: { id: imageUrn } };
    await context.saveCheckpoint({ ...context.checkpoint, ...(imageUrn ? { imageUrn } : {}), finalSent: true });
    let response: Response;
    try {
      response = await context.fetch(`${REST}/posts`, {
        method: "POST",
        headers: apiHeaders(token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return { status: "unknown", reason: "LinkedIn may have accepted the post, but its response was not received. Verify the profile before retrying." };
    }
    if (!response.ok) {
      if (response.status >= 500) return { status: "unknown", reason: "LinkedIn may have accepted the post, but its response could not be confirmed. Verify the profile before retrying." };
      return { status: "failed", reason: errorReason(await json(response), token, response.status) };
    }
    const providerPostId = response.headers.get("x-restli-id");
    if (!providerPostId) return { status: "unknown", reason: "LinkedIn accepted the request but returned no post identifier. Verify the profile before retrying." };
    return {
      status: "published",
      providerPostId,
      externalUrl: `https://www.linkedin.com/feed/update/${providerPostId}`,
    };
  },
};
