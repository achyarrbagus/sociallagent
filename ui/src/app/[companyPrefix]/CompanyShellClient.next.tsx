"use client";

import type { ReactNode } from "react";
import type { DehydratedState } from "@tanstack/react-query";
import { AppProviders } from "@/AppProviders";
import { CloudAccessGate } from "@/components/CloudAccessGate";
import { Layout } from "@/components/Layout";
import { ShellConfigurationGate } from "@/components/ShellConfigurationGate";
import { useStreamlinedUiEnabled } from "@/hooks/useStreamlinedUiEnabled";

function CompanyBoardRoutes({ children }: { children: ReactNode }) {
  const { loaded } = useStreamlinedUiEnabled();
  return (
    <CloudAccessGate>
      <ShellConfigurationGate loaded={loaded}>
        <Layout>{children}</Layout>
      </ShellConfigurationGate>
    </CloudAccessGate>
  );
}

export default function CompanyShellClient({
  children,
  dehydratedState,
  initialCompanyId,
}: {
  children: ReactNode;
  dehydratedState: DehydratedState | null;
  initialCompanyId: string | null;
}) {
  return (
    <AppProviders
      enableServiceWorker={false}
      dehydratedState={dehydratedState}
      initialCompanyId={initialCompanyId}
    >
      <CompanyBoardRoutes>{children}</CompanyBoardRoutes>
    </AppProviders>
  );
}
