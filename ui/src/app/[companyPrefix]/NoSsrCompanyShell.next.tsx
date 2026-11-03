"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";

const ClientCompanyShell = dynamic(() => import("./CompanyShellClient.next"), {
  ssr: false,
  loading: () => <PaperclipLoading />,
});

export function NoSsrCompanyShell({ children }: { children: ReactNode }) {
  return <ClientCompanyShell>{children}</ClientCompanyShell>;
}
