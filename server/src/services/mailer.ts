import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../middleware/logger.js";

/**
 * Account email (password reset, address verification) over SMTP.
 *
 * Configure with SOCIALAGENT_SMTP_URL (for example
 * `smtps://user:password@smtp.example.com:465`) and SOCIALAGENT_MAIL_FROM
 * (`SocialAgent <no-reply@example.com>`). Any SMTP provider works.
 *
 * Without SMTP, development builds log the message link so the flow can be
 * tested locally; production builds log only that the email was not sent,
 * because the link is a credential.
 */
export function mailerConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.SOCIALAGENT_SMTP_URL?.trim() && env.SOCIALAGENT_MAIL_FROM?.trim());
}

let transport: Transporter | null = null;
let transportUrl: string | null = null;

function getTransport() {
  const url = process.env.SOCIALAGENT_SMTP_URL!.trim();
  if (!transport || transportUrl !== url) {
    transport = nodemailer.createTransport(url);
    transportUrl = url;
  }
  return transport;
}

export interface AccountEmail {
  to: string;
  subject: string;
  /** Plain text body. */
  text: string;
  /** The action link inside the message, logged in development without SMTP. */
  link: string;
}

export async function sendAccountEmail(message: AccountEmail) {
  if (!mailerConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.warn({ subject: message.subject }, "Account email not sent: SOCIALAGENT_SMTP_URL / SOCIALAGENT_MAIL_FROM are not set");
    } else {
      logger.info({ to: message.to, subject: message.subject, link: message.link }, "Account email (SMTP not configured; link logged for local testing)");
    }
    return;
  }
  await getTransport().sendMail({
    from: process.env.SOCIALAGENT_MAIL_FROM!.trim(),
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export function passwordResetEmail(to: string, name: string | null | undefined, link: string): AccountEmail {
  return {
    to,
    link,
    subject: "Reset your SocialAgent password",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Someone asked to reset the password for your SocialAgent account.",
      `Open this link to choose a new password (it expires in one hour):`,
      link,
      "",
      "If you did not ask for this, you can ignore this email.",
    ].join("\n"),
  };
}

export function verificationEmail(to: string, name: string | null | undefined, link: string): AccountEmail {
  return {
    to,
    link,
    subject: "Confirm your SocialAgent email",
    text: [
      `Hi${name ? ` ${name}` : ""},`,
      "",
      "Confirm your email address to finish setting up your SocialAgent account:",
      link,
      "",
      "If you did not create an account, you can ignore this email.",
    ].join("\n"),
  };
}
