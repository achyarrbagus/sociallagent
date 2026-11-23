import Link from "next/link";
import { SocialAgentLockup } from "@/components/brand/SocialAgentLockup";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { prisma } from "@/lib/prisma";
import { listAgencies, requireAgency } from "@/lib/session";

export default async function AgencyLayout({ children, params }: LayoutProps<"/[agency]">) {
  const { agency: slug } = await params;
  const { user, agency } = await requireAgency(slug);
  const [agencies, agentRows] = await Promise.all([
    listAgencies(user.id),
    prisma.agent.findMany({ where: { organizationId: agency.id }, select: { id: true, name: true, paletteId: true, status: true, reportsToId: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const directorId = agentRows.find((a) => !a.reportsToId)?.id;
  const agents = agentRows.map(({ reportsToId, ...a }) => ({ ...a, isDirector: !reportsToId, isLead: !!directorId && reportsToId === directorId }));
  const pick = ({ id, name, slug }: { id: string; name: string; slug: string }) => ({ id, name, slug });

  return (
    <div className="socialagent-shell flex h-dvh">
      <div className="socialagent-shell-frame flex min-w-0 flex-1 overflow-hidden">
        <aside className="sidebar-shell-panel hidden w-64 shrink-0 flex-col gap-4 md:flex">
          <Link href={`/${agency.slug}/dashboard`} className="socialagent-brand-home" aria-label="SocialAgent beranda">
            <SocialAgentLockup decorative />
          </Link>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav slug={agency.slug} agents={agents} />
          </div>
          <div className="p-3">
            <AccountMenu user={{ name: user.name, email: user.email }} agency={pick(agency)} agencies={agencies.map(pick)} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sidebar-shell-panel border-b md:hidden">
            <div className="flex items-center justify-between gap-3 p-3">
              <Link href={`/${agency.slug}/dashboard`} aria-label="SocialAgent beranda"><SocialAgentLockup decorative className="h-5 w-auto" /></Link>
              <div className="w-48"><AccountMenu user={{ name: user.name, email: user.email }} agency={pick(agency)} agencies={agencies.map(pick)} /></div>
            </div>
            <SidebarNav slug={agency.slug} compact />
          </header>
          <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
