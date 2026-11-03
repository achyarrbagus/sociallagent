"use client";

import type { ReactNode } from "react";
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

export default function CompanyShellClient({ children }: { children: ReactNode }) {
  return (
    <AppProviders enableServiceWorker={false}>
      <CompanyBoardRoutes>{children}</CompanyBoardRoutes>
    </AppProviders>
  );
}
