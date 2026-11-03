export function redactSecrets(text: string, secrets: string[]): string {
  let redacted = text.replace(/access_token=[^&\s"]+/gi, "access_token=[redacted]");
  for (const secret of secrets.filter((value) => value.length >= 6).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted.slice(0, 500);
}
