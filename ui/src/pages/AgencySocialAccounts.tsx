import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { agencyApi } from "../api/agency";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Link } from "../lib/router";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { SocialAccounts } from "./Agency";

export function AgencySocialAccounts() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Social Accounts" }]); }, [setBreadcrumbs]);
  if (!selectedCompanyId) return <EmptyState icon={Share2} message="Select an agency to manage social accounts." />;
  return <SocialAccountsWorkspace key={selectedCompanyId} companyId={selectedCompanyId} />;
}

function SocialAccountsWorkspace({ companyId }: { companyId: string }) {
  const directory = useQuery({ queryKey: queryKeys.agency(companyId), queryFn: () => agencyApi.directory(companyId) });
  const socialAccounts = useQuery({ queryKey: ["agency-social-accounts", companyId], queryFn: () => agencyApi.socialAccounts(companyId) });
  if (directory.isLoading) return <PageSkeleton variant="list" />;
  if (directory.error || !directory.data) {
    return <div role="alert" className="space-y-3">
      <p className="text-destructive">{directory.error?.message ?? "Unable to load brands."}</p>
      <Button variant="outline" onClick={() => void directory.refetch()}>Retry</Button>
    </div>;
  }

  const activeBrands = directory.data.brands.filter(brand => !brand.archivedAt);
  return <div className="max-w-6xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">Social Accounts</h1>
        <p className="text-sm text-muted-foreground">Connect the social profiles used to publish content for each brand.</p>
      </div>
      <Link to="/agency" className="text-sm underline">Clients &amp; Brands</Link>
    </div>
    {socialAccounts.error && <p role="alert" className="text-sm text-destructive">Social accounts could not be loaded: {socialAccounts.error.message}</p>}
    {activeBrands.length === 0 && <EmptyState icon={Share2} message="Create a client and brand in Clients & Brands before connecting social accounts." />}
    {activeBrands.map(brand => {
      const client = directory.data.clients.find(item => item.id === brand.clientId);
      if (!client || client.archivedAt) return null;
      return <section key={brand.id} className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-semibold">{brand.name}</h2>
          <p className="text-sm text-muted-foreground">{client.name}</p>
        </div>
        <SocialAccounts
          companyId={companyId}
          brandId={brand.id}
          canManage={directory.data.canManage}
          accounts={socialAccounts.data?.filter(account => account.brandId === brand.id) ?? []}
        />
      </section>;
    })}
  </div>;
}
