import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * LLM_BASE_URL points at any OpenAI-compatible router (9Router, OpenRouter, LiteLLM).
 * Without it, AI_MODEL is a Vercel AI Gateway model string.
 */
export function languageModel(): LanguageModel {
  const id = process.env.AI_MODEL ?? "anthropic/claude-sonnet-5-5";
  const baseURL = process.env.LLM_BASE_URL;
  if (!baseURL) return id;
  return createOpenAICompatible({ name: "llm-router", baseURL, apiKey: process.env.LLM_API_KEY, supportsStructuredOutputs: true })(id);
}

/** Provider errors arrive with terminal colour codes and long bodies; keep one readable line. */
export function describeModelError(error: unknown) {
  const raw = error instanceof Error ? error.message.replace(/\u001b\[[0-9;]*m/g, "") : "";
  if (/AI_GATEWAY_API_KEY|Unauthenticated|\b401\b/i.test(raw)) return "Model AI belum dikonfigurasi. Isi LLM_BASE_URL + LLM_API_KEY atau AI_GATEWAY_API_KEY.";
  if (/\b429\b|usage limit/i.test(raw)) return "Model AI sedang kena batas pemakaian. Coba lagi beberapa saat lagi.";
  if (/\b402\b|insufficient balance/i.test(raw)) return "Saldo provider model AI habis.";
  return raw ? `Model AI gagal: ${raw.split("\n")[0].slice(0, 300)}` : "Model AI gagal.";
}
