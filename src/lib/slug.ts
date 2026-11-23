/** Agency slugs share the URL root with app routes, so these are never valid. */
export const RESERVED_SLUGS = new Set(["app", "api", "sign-in", "sign-up", "onboarding", "_next"]);

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
