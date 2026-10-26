/** Display aliases never replace the model ID in configuration or API requests. */
export function modelDisplayName(modelId?: string | null): string {
  const id = modelId?.trim();
  if (!id) return "Default";
  if (id.toLowerCase() === "auto") return "Automatic";
  if (/(?:^|[\/_.:-])sol(?:$|[\/_.:-])/i.test(id)) return "Bruno";
  if (/(?:^|[\/_.:-])luna(?:$|[\/_.:-])/i.test(id)) return "Yuna";
  return `SocialAgent Model ${modelDisplayCode(id)}`;
}

export function modelDisplayCode(modelId: string): string {
  // Stable display fingerprint only; this is not encryption or an access boundary.
  let hash = 0x811c9dc5;
  for (const character of modelId.trim()) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
