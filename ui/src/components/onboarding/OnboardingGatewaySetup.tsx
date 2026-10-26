import { useState } from "react";
import type { AiConnectionBinding } from "@paperclipai/shared";
import { AiProviderSetup } from "../ai-connections/AiProviderSetup";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export function OnboardingGatewaySetup({
  companyId,
  agentId,
  environmentId,
  adapterType,
  disabled,
  onComplete,
}: {
  companyId: string;
  agentId?: string;
  environmentId?: string;
  adapterType: "codex_local" | "claude_local";
  disabled?: boolean;
  onComplete: (binding: Exclude<AiConnectionBinding, { mode: "responsible_user" }>) => void;
}) {
  const [source, setSource] = useState<"9router" | "custom" | null>(null);
  return <>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => setSource("9router")}>
      Connect 9Router
    </Button>
    <Button type="button" variant="ghost" disabled={disabled} onClick={() => setSource("custom")}>
      Use a custom gateway
    </Button>
    <Dialog open={source !== null} onOpenChange={open => { if (!open) setSource(null); }}>
      <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-2xl" onKeyDown={event => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{source === "9router" ? "9Router connection" : "Custom gateway connection"}</DialogTitle>
          <DialogDescription>{source === "9router"
            ? "Enter your 9Router URL and API key. Then choose a model and test it with your agent."
            : "Save the connection, then choose a model and test it with your agent."}</DialogDescription>
        </DialogHeader>
        <AiProviderSetup key={source} companyId={companyId} agentId={agentId} environmentId={environmentId}
          initialProvider="gateway" initialProtocol={adapterType === "codex_local" ? "responses" : "messages"}
          gatewayPreset={source === "9router" ? { name: "9Router", baseUrl: "https://9router.amifish.com/v1" } : undefined}
          submitLabel="Save connection" onCancel={() => setSource(null)}
          onComplete={binding => { setSource(null); onComplete(binding); }} />
      </DialogContent>
    </Dialog>
  </>;
}
