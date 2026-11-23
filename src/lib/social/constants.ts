export const CREDENTIALS_PURPOSE = "social-credentials";

export const PLATFORMS = ["facebook", "instagram", "x", "linkedin", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

/** Credential fields per platform, safe to send to the browser (no adapter code). */
export const CREDENTIAL_FIELDS: Record<Platform, { key: string; label: string; secret: boolean }[]> = {
  facebook: [{ key: "pageId", label: "Facebook Page ID", secret: false }, { key: "pageAccessToken", label: "Page access token", secret: true }],
  instagram: [{ key: "accessToken", label: "Instagram access token", secret: true }],
  x: [{ key: "accessToken", label: "X user access token", secret: true }],
  linkedin: [{ key: "accessToken", label: "LinkedIn access token", secret: true }, { key: "authorUrn", label: "Member author URN", secret: false }],
  tiktok: [{ key: "clientKey", label: "TikTok Client Key", secret: false }, { key: "clientSecret", label: "TikTok Client Secret", secret: true }, { key: "refreshToken", label: "TikTok refresh token", secret: true }],
};
