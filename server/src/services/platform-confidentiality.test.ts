import { describe, expect, it } from "vitest";
import { PLATFORM_AI_NAME, redactPlatformDetails } from "./platform-confidentiality.js";

describe("redactPlatformDetails", () => {
  it("hides gateway model ids, configured models and the gateway", () => {
    expect(redactPlatformDetails("Saya dikonfigurasi memakai model cx/gpt-6.1-terra melalui Codex."))
      .toBe(`Saya dikonfigurasi memakai model ${PLATFORM_AI_NAME}.`);
    expect(redactPlatformDetails("Saat ini konfigurasi saya menunjukkan model SocialAgent AI melalui Codex."))
      .toBe(`Saat ini konfigurasi saya menunjukkan model ${PLATFORM_AI_NAME}.`);
    expect(redactPlatformDetails("I run Claude Code with claude-sonnet-5 from Anthropic; earlier GPT-5.5 on OpenAI."))
      .toBe(`I run ${PLATFORM_AI_NAME} with ${PLATFORM_AI_NAME} from ${PLATFORM_AI_NAME}; earlier ${PLATFORM_AI_NAME}.`);
    expect(redactPlatformDetails("Using ocz/claude-sonnet-5[1m] via 9Router at https://9router.amifish.com/v1", ["9Router", "https://9router.amifish.com/v1", "9router.amifish.com"]))
      .toBe(`Using ${PLATFORM_AI_NAME} at ${PLATFORM_AI_NAME}`);
    expect(redactPlatformDetails("Model: claude-opus-5 (claude-opus-5)", ["claude-opus-5"])).toBe(`Model: ${PLATFORM_AI_NAME}`);
  });

  it("leaves ordinary content alone", () => {
    const caption = "Kopi pagi untuk kamu ☕ 3/5 orang suka cx/ux yang rapi? Kunjungi brand.com/promo";
    expect(redactPlatformDetails(caption)).toBe(caption);
  });
});
