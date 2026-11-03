import type { ReactNode } from "react";
import { NoSsrCompanyShell } from "./NoSsrCompanyShell.next";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return <NoSsrCompanyShell>{children}</NoSsrCompanyShell>;
}
