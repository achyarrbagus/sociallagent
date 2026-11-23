import { headers } from "next/headers";
import {
  convertToModelMessages, createIdGenerator, createUIMessageStreamResponse, isStepCount, streamText,
  toUIMessageStream, TypeValidationError, validateUIMessages, type UIMessage,
} from "ai";
import { describeModelError, languageModel } from "@/lib/ai/model";
import { recordUsage } from "@/lib/ai/usage";
import { auth } from "@/lib/auth";
import { chatTools } from "@/lib/chat/tools";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 300;

const MANAGER_ROLES = ["owner", "admin"];

export async function POST(request: Request, { params }: RouteContext<"/api/chat/[agency]/[agentId]">) {
  const { agency: slug, agentId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const member = await prisma.member.findFirst({ where: { userId: session.user.id, organization: { slug } }, include: { organization: true } });
  if (!member) return new Response("Not found", { status: 404 });
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId: member.organizationId } });
  if (!agent) return new Response("Not found", { status: 404 });
  if (agent.status === "paused") return new Response("Agent sedang dijeda.", { status: 409 });

  const { message } = await request.json() as { message: UIMessage };
  if (!message || message.role !== "user") return new Response("Bad request", { status: 400 });

  const canManage = member.role.split(",").some((r) => MANAGER_ROLES.includes(r.trim()));
  const tools = chatTools({ organizationId: member.organizationId, userId: session.user.id, canManage, agentName: agent.name });
  const thread = await prisma.chatThread.upsert({
    where: { userId_agentId: { userId: session.user.id, agentId } },
    create: { organizationId: member.organizationId, userId: session.user.id, agentId },
    update: {},
  });

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: [...(thread.messages as unknown as UIMessage[]), message], tools });
  } catch (error) {
    // Stored history no longer matches current tools: keep the conversation going without it.
    if (!(error instanceof TypeValidationError)) throw error;
    messages = await validateUIMessages({ messages: [message], tools });
  }

  const isDirector = !agent.reportsToId;
  const result = streamText({
    model: languageModel(),
    system: [
      `You are ${agent.name}, the ${agent.title} of the creative agency "${member.organization.name}", chatting with ${session.user.name}, ${canManage ? "the agency owner" : "a team member"}.`,
      agent.instructions,
      isDirector
        ? "This is the board chat. Give the owner a clear picture across brands, propose priorities, and delegate production to the right specialist with assignTask."
        : "Stay within your specialty. If the owner needs another specialty, name the right teammate.",
      `## Chat rules
- Reply in the owner's language (default Bahasa Indonesia), concise, with markdown when it helps.
- Use tools to read real agency data before answering questions about it. Never invent brands, content, numbers or results.
- ${canManage ? "You may create content ideas and assign production tasks when asked or clearly useful; say what you did." : "You can only read; ask the owner to make changes."}
- Only the human owner approves, rejects or publishes content. Never claim something is approved or posted.
- Today is ${new Date().toLocaleDateString("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" })}.`,
    ].join("\n\n"),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(8),
    onEnd: ({ usage }) => recordUsage({
      organizationId: member.organizationId, source: "chat", agentId, userId: session.user.id,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    }),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onError: describeModelError,
      onEnd: async ({ messages: all }) => {
        await prisma.chatThread.update({ where: { id: thread.id }, data: { messages: all as unknown as Prisma.InputJsonValue } });
      },
    }),
  });
}
