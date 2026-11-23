import { AppSidebar, MobileHeader, ShellProvider, type ShellProps } from "@/components/shell/AppSidebar";
import { inboxCount } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { listAgencies, requireAgency } from "@/lib/session";

export default async function AgencyLayout({ children, params }: LayoutProps<"/[agency]">) {
  const { agency: slug } = await params;
  const { user, agency } = await requireAgency(slug);
  const [agencies, agentRows, inbox, brands, campaigns] = await Promise.all([
    listAgencies(user.id),
    prisma.agent.findMany({ where: { organizationId: agency.id }, select: { id: true, name: true, paletteId: true, status: true, reportsToId: true }, orderBy: { createdAt: "asc" } }),
    inboxCount(agency.id),
    prisma.brand.findMany({ where: { organizationId: agency.id, archivedAt: null, client: { archivedAt: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where: { organizationId: agency.id, status: { not: "cancelled" } }, select: { id: true, name: true, brandId: true }, orderBy: { name: "asc" } }),
  ]);
  const directorId = agentRows.find((a) => !a.reportsToId)?.id;
  const pick = ({ id, name, slug }: { id: string; name: string; slug: string }) => ({ id, name, slug });
  const shell: ShellProps = {
    studio: pick(agency),
    studios: agencies.map(pick),
    user: { name: user.name, email: user.email },
    agents: agentRows.map(({ reportsToId, ...a }) => ({ ...a, isDirector: !reportsToId, isLead: !!directorId && reportsToId === directorId })),
    inboxCount: inbox,
    brief: { brands, campaigns },
  };

  return (
    <ShellProvider studio={shell.studio} brief={shell.brief}>
    <div className="socialagent-shell flex h-dvh">
      <div className="socialagent-shell-frame flex min-w-0 flex-1 overflow-hidden">
        <AppSidebar {...shell} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader {...shell} />
          <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
    </ShellProvider>
  );
}
