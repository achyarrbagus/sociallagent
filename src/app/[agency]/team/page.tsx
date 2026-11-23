import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AgentCharacter } from "@/components/agents/AgentCharacter";
import { PauseToggle } from "@/components/agents/PauseToggle";
import { TeamSetup } from "@/components/agents/TeamSetup";
import { Badge } from "@/components/ui/badge";
import { characterStateForAgent } from "@/lib/agent-appearance";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

const STATUS_LABELS = { idle: "Siap", running: "Bekerja", paused: "Dijeda", error: "Error" } as const;

export default async function TeamPage({ params }: PageProps<"/[agency]/team">) {
  const { agency: slug } = await params;
  const { agency, canManage } = await requireAgency(slug);
  const agents = await prisma.agent.findMany({
    where: { organizationId: agency.id },
    include: { _count: { select: { tasks: { where: { status: "done" } } } } },
    orderBy: { createdAt: "asc" },
  });

  if (!agents.length) return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">Tim AI</h1><p className="text-sm text-muted-foreground">Agensi kamu belum punya tim AI.</p></div>
    {canManage ? <TeamSetup slug={slug} /> : <p className="text-sm text-muted-foreground">Minta owner agensi untuk menyiapkan tim.</p>}
  </div>;

  const director = agents.find((a) => !a.reportsToId) ?? agents[0];
  const byId = new Map(agents.map((a) => [a.id, a]));
  const groups = agents.filter((a) => a.reportsToId === director.id);

  return <div className="space-y-6">
    <section className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-6">
      <AgentCharacter paletteId={director.paletteId} name={director.name} size={128} state={characterStateForAgent(director.status)} label={director.name} />
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Memimpin {agents.length - 1} spesialis</p>
        <h1 className="text-2xl font-semibold">{director.name}</h1>
        <p className="text-sm">{director.title} · {STATUS_LABELS[director.status]}</p>
        <p className="max-w-xl text-sm text-muted-foreground">Hanya kamu, owner, yang menyetujui konten final. Agent bekerja saat diberi tugas dari halaman Konten.</p>
      </div>
    </section>
    {groups.map((lead) => {
      const members = [lead, ...agents.filter((a) => a.reportsToId === lead.id)];
      return <section key={lead.id} className="space-y-3">
        <h2 className="text-lg font-semibold">{lead.title}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{members.map((agent) => <article key={agent.id} className="flex gap-3 rounded-lg border bg-card p-4">
          <AgentAvatar paletteId={agent.paletteId} name={agent.name} size={64} pose={characterStateForAgent(agent.status)} muted={agent.status === "paused"} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{agent.name}</h3><Badge variant="outline">{STATUS_LABELS[agent.status]}</Badge></div>
            <p className="text-xs text-muted-foreground">Lapor ke {agent.reportsToId ? byId.get(agent.reportsToId)?.name : "owner"} · {agent._count.tasks} tugas selesai</p>
            <p className="line-clamp-3 text-sm text-muted-foreground">{agent.instructions}</p>
            {canManage && <PauseToggle slug={slug} agentId={agent.id} paused={agent.status === "paused"} disabled={agent.status === "running"} />}
          </div>
        </article>)}</div>
      </section>;
    })}
  </div>;
}
