export type MediaKind = "image" | "video";
export type PostShape = "text" | "photo" | "carousel" | "video";
export interface PublishMedia { assetId: string; kind: MediaKind; contentType: string; byteSize: number; filename: string | null; read(): Promise<Buffer>; signedUrl: string | null }
export interface PlatformRules { maxTextLength: number; countText?: (text: string) => number; shapes: PostShape[]; carousel: { min: number; max: number; allowVideo: boolean } | null; maxImageBytes: number; maxVideoBytes: number; imageTypes: string[]; videoTypes: string[]; publicUrlShapes: PostShape[] }
export interface VerifiedAccount { externalAccountId: string; displayName: string; tokenExpiresAt: Date | null; credentials?: Record<string, string> }
export interface PublishContext { text: string; shape: PostShape; media: PublishMedia[]; credentials: Record<string, string>; checkpoint: Record<string, unknown>; saveCheckpoint(next: Record<string, unknown>): Promise<void>; withFreshCredentials?: (refresh: (credentials: Record<string, string>) => Promise<{ credentials: Record<string, string>; tokenExpiresAt: Date }>) => Promise<Record<string, string>>; fetch: typeof fetch }
export type PublishOutcome = { status: "published"; providerPostId: string; externalUrl: string | null } | { status: "failed"; reason: string } | { status: "unknown"; reason: string };
export interface SocialAdapter { platform: "facebook" | "instagram" | "x" | "linkedin" | "tiktok"; label: string; credentialFields: Array<{ key: string; label: string; help: string }>; rules: PlatformRules; verify(credentials: Record<string, string>, fetchImpl: typeof fetch): Promise<VerifiedAccount>; publish(context: PublishContext): Promise<PublishOutcome> }

export function mediaKindOf(contentType: string | null): MediaKind | null {
  if (contentType?.startsWith("image/")) return "image";
  if (contentType?.startsWith("video/")) return "video";
  return null;
}
export function postShapeOf(media: Array<{ kind: MediaKind }>): PostShape {
  if (media.length === 0) return "text";
  if (media.length > 1) return "carousel";
  return media[0]!.kind === "image" ? "photo" : "video";
}
export function checkPostAgainstRules(label: string, rules: PlatformRules, post: { text: string; media: Array<{ kind: MediaKind; contentType: string; byteSize: number; filename?: string | null }> }, env: { publicBaseUrl: boolean }): string[] {
  const messages: string[] = [];
  const shape = postShapeOf(post.media);
  const textLength = rules.countText?.(post.text) ?? post.text.length;
    if (textLength > rules.maxTextLength) messages.push(`${label} allows at most ${rules.maxTextLength} characters; this text has ${textLength}.`);
  if (!rules.shapes.includes(shape)) messages.push(`${label} does not support ${shape} posts.`);
  if (shape === "carousel" && rules.carousel) {
    if (post.media.length < rules.carousel.min || post.media.length > rules.carousel.max) messages.push(`${label} carousels take ${rules.carousel.min}–${rules.carousel.max} items.`);
    if (!rules.carousel.allowVideo && post.media.some((item) => item.kind === "video")) messages.push(`${label} carousels cannot include videos.`);
  }
  for (const item of post.media) {
    const allowed = item.kind === "image" ? rules.imageTypes : rules.videoTypes;
    const limit = item.kind === "image" ? rules.maxImageBytes : rules.maxVideoBytes;
    const name = item.filename || "File";
    if (!allowed.includes(item.contentType)) messages.push(`${name} is ${item.contentType}, which ${label} does not accept.`);
    if (item.byteSize > limit) messages.push(`${name} is larger than ${label}'s ${limit / (1024 * 1024)} MB limit.`);
  }
  if (!env.publicBaseUrl && rules.publicUrlShapes.includes(shape)) messages.push(`${label} needs a public domain to fetch media. Set SOCIALAGENT_PUBLIC_URL.`);
  return messages;
}
