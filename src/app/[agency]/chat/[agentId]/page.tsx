import Link from "next/link";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { characterStateForAgent } from "@/lib/agent-appearance";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function AgentChatPage({ params }: PageProps<"/[agency]/chat/[agentId]">) {
  const { agency: slug, agentId } = await params;
  const { agency, user } = await requireAgency(slug);
  const agents = await prisma.agent.findMany({ where: { organizationId: agency.id }, orderBy: { createdAt: "asc" } });
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) notFound();
  const isDirector = !agent.reportsToId;
  const [thread, activity] = await Promise.all([
    prisma.chatThread.findUnique({ where: { userId_agentId: { userId: user.id, agentId } } }),
    isDirector ? prisma.activityLog.findMany({ where: { organizationId: agency.id }, orderBy: { createdAt: "desc" }, take: 15 }) : [],
  ]);

  return <div className="grid h-full gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]">
    <nav aria-label="Agent" className="hidden space-y-1 lg:block">
      <h1 className="mb-2 text-xl font-semibold">Chat</h1>
      {agents.map((a) => <Link key={a.id} href={`/${slug}/chat/${a.id}`} aria-current={a.id === agentId ? "page" : undefined}
        className={cn("flex items-center gap-2 rounded-full border border-transparent px-2 py-1.5 text-sm", a.id === agentId ? "border-border bg-[var(--sa-yellow)] text-[var(--sa-ink)]" : "hover:bg-accent")}>
        <AgentAvatar paletteId={a.paletteId} name={a.name} size={24} pose={characterStateForAgent(a.status)} muted={a.status === "paused"} />
        <span className="min-w-0 truncate">{a.reportsToId ? a.name : `${a.name} · Board`}</span>
      </Link>)}
    </nav>
    <ChatPanel
      key={agent.id}
      slug={slug}
      agent={{ id: agent.id, name: agent.name, title: agent.title, paletteId: agent.paletteId, paused: agent.status === "paused", isDirector }}
      agents={agents.map((a) => ({ id: a.id, name: a.name }))}
      initialMessages={(thread?.messages ?? []) as unknown as UIMessage[]}
    />
    {isDirector && <aside className="hidden space-y-2 xl:block" aria-label="Aktivitas tim">
      <h2 className="text-sm font-semibold">Aktivitas tim</h2>
      <ul className="space-y-2">{activity.map((a) => <li key={a.id} className="rounded-md border bg-card p-2 text-xs">
        <p>{a.summary}</p><time className="text-muted-foreground">{a.createdAt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</time>
      </li>)}</ul>
    </aside>}
  </div>;
}
