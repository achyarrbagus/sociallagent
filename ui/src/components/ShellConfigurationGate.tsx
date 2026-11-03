import type { ReactNode } from "react";
import { Outlet } from "@/lib/router";
import { PaperclipLoading } from "./AnimatedPaperclipIcon";

/** Keep shell selection stable while the independent access gate loads. */
export function ShellConfigurationGate({ loaded, children }: { loaded: boolean; children?: ReactNode }) {
  return loaded ? <>{children ?? <Outlet />}</> : <PaperclipLoading />;
}
