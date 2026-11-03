"use client";

import { Suspense } from "react";
import { Agents } from "@/pages/Agents";
import { Agents as ProductionAgentsImpl } from "@/pages/Agents.production";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { useStreamlinedUiEnabled } from "@/hooks/useStreamlinedUiEnabled";

export default function AgentsClient() {
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  if (!streamlinedUiEnabled) {
    return (
      <Suspense fallback={<PaperclipLoading />}>
        <ProductionAgentsImpl />
      </Suspense>
    );
  }
  return <Agents />;
}
