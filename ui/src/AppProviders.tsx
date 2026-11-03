"use client";

import * as React from "react";
import { StrictMode, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import * as ReactDOM from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoiceCallProvider } from "./components/voice/VoiceCallProvider";
import { useAccountIdentity } from "./api/companies-query";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { SentryGate } from "./components/SentryGate";
import { CompanyProvider, useCompany } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { DialogProvider } from "./context/DialogContext";
import { EditorAutocompleteProvider } from "./context/EditorAutocompleteContext";
import { PrimaryAgentProvider } from "./context/PrimaryAgentProvider";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { DesignSandboxProvider } from "./context/DesignSandboxContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initPluginBridge } from "./plugins/bridge-init";
import { PluginLauncherProvider } from "./plugins/launchers";
import { startPerfMeasureReaper } from "./lib/perf-measure-reaper";
import { startServiceWorkerUpdates } from "./lib/service-worker-updates";

function CompanyAwareBreadcrumbProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useCompany();
  return <BreadcrumbProvider companyName={selectedCompany?.name ?? null}>{children}</BreadcrumbProvider>;
}

function CompanyVoiceCalls({ children }: { children: ReactNode }) {
  const { selectedCompanyId } = useCompany();
  const { userId } = useAccountIdentity();
  return <VoiceCallProvider companyId={selectedCompanyId} userId={userId}>{children}</VoiceCallProvider>;
}

function createApplicationQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function AppProviders({
  children,
  router: Router,
  enableServiceWorker = true,
}: {
  children: ReactNode;
  router?: ComponentType<{ children: ReactNode }>;
  enableServiceWorker?: boolean;
}) {
  const [queryClient] = useState(createApplicationQueryClient);
  const bridgeInitialized = useRef(false);
  if (typeof window !== "undefined" && !bridgeInitialized.current) {
    initPluginBridge(React, ReactDOM);
    bridgeInitialized.current = true;
  }

  useEffect(() => startPerfMeasureReaper(), []);
  useEffect(() => {
    if (!enableServiceWorker) return;
    let stopUpdates = () => {};
    const startUpdates = () => {
      stopUpdates = startServiceWorkerUpdates();
    };
    if (document.readyState === "complete") {
      startUpdates();
    } else {
      window.addEventListener("load", startUpdates, { once: true });
    }
    return () => {
      window.removeEventListener("load", startUpdates);
      stopUpdates();
    };
  }, [enableServiceWorker]);

  const app = (
    <CompanyProvider>
      <EditorAutocompleteProvider>
        <ToastProvider>
          <PrimaryAgentProvider>
            <LiveUpdatesProvider>
              <TooltipProvider>
                <CompanyAwareBreadcrumbProvider>
                  <SidebarProvider>
                    <PanelProvider>
                      <PluginLauncherProvider>
                        <DialogProvider>
                          <DesignSandboxProvider>
                            <CompanyVoiceCalls>{children}</CompanyVoiceCalls>
                          </DesignSandboxProvider>
                        </DialogProvider>
                      </PluginLauncherProvider>
                    </PanelProvider>
                  </SidebarProvider>
                </CompanyAwareBreadcrumbProvider>
              </TooltipProvider>
            </LiveUpdatesProvider>
          </PrimaryAgentProvider>
        </ToastProvider>
      </EditorAutocompleteProvider>
    </CompanyProvider>
  );

  return (
    <StrictMode>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SentryGate />
          <ThemeProvider>{Router ? <Router>{app}</Router> : app}</ThemeProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </StrictMode>
  );
}
