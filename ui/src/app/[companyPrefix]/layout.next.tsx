import type { ReactNode } from "react";
import { getCompanyShellBootstrap } from "../_lib/next-server-bootstrap";
import CompanyShellClient from "./CompanyShellClient.next";

type CompanyLayoutProps = {
  children: ReactNode;
  params: Promise<{ companyPrefix: string }>;
};

export default async function CompanyLayout({ children, params }: CompanyLayoutProps) {
  const { companyPrefix } = await params;
  const bootstrap = await getCompanyShellBootstrap(companyPrefix);
  return (
    <CompanyShellClient
      dehydratedState={bootstrap.dehydratedState}
      initialCompanyId={bootstrap.initialCompanyId}
    >
      {children}
    </CompanyShellClient>
  );
}
