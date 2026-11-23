"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

export async function clearChat(slug: string, agentId: string) {
  const { user, agency } = await requireAgency(slug);
  await prisma.chatThread.updateMany({ where: { userId: user.id, agentId, organizationId: agency.id }, data: { messages: [] } });
  revalidatePath(`/${slug}/chat/${agentId}`);
}
