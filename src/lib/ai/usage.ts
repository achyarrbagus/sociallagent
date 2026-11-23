import "server-only";
import { prisma } from "@/lib/prisma";

export const modelName = () => process.env.AI_MODEL ?? "anthropic/claude-sonnet-5-5";

/** One row per model call (task run or chat turn). Never throws: usage logging must not break a reply. */
export async function recordUsage(event: {
  organizationId: string; source: "task" | "chat"; agentId?: string; userId?: string; brandId?: string; contentId?: string;
  inputTokens?: number; outputTokens?: number;
}) {
  try {
    await prisma.aiUsageEvent.create({
      data: { ...event, model: modelName(), inputTokens: event.inputTokens ?? 0, outputTokens: event.outputTokens ?? 0 },
    });
  } catch (error) {
    console.error("[ai-usage]", error);
  }
}
