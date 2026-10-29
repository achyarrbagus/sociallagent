import { describe, expect, it } from "vitest";
import { mailerConfigured, passwordResetEmail, verificationEmail } from "./mailer.js";

describe("account email", () => {
  it("needs both an SMTP URL and a sender", () => {
    expect(mailerConfigured({})).toBe(false);
    expect(mailerConfigured({ SOCIALAGENT_SMTP_URL: "smtps://u:p@smtp.example.com:465" })).toBe(false);
    expect(mailerConfigured({ SOCIALAGENT_SMTP_URL: "smtps://u:p@smtp.example.com:465", SOCIALAGENT_MAIL_FROM: "SocialAgent <no-reply@example.com>" })).toBe(true);
  });

  it("puts the action link in reset and verification emails", () => {
    const reset = passwordResetEmail("rina@example.com", "Rina", "https://app.example.com/reset?token=t");
    expect(reset).toMatchObject({ to: "rina@example.com", subject: "Reset your SocialAgent password" });
    expect(reset.text).toContain("https://app.example.com/reset?token=t");
    expect(verificationEmail("rina@example.com", null, "https://app.example.com/verify").text).toContain("https://app.example.com/verify");
  });
});
