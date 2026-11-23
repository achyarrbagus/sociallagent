import { Badge } from "@/components/ui/badge";
import { CONTENT_STATUS_LABELS, type ContentStatusValue } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

const TONE: Record<ContentStatusValue, string> = {
  idea: "bg-[var(--sa-accent-soft)] text-[var(--sa-ink)]",
  in_production: "bg-[var(--sa-blue)] text-[var(--sa-ink)]",
  awaiting_owner: "bg-[var(--sa-yellow)] text-[var(--sa-ink)]",
  changes_requested: "bg-[var(--sa-coral)] text-[var(--sa-ink)]",
  approved: "bg-[var(--sa-teal)] text-white",
  rejected: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ContentStatusValue }) {
  return <Badge className={cn("border border-border", TONE[status])}>{CONTENT_STATUS_LABELS[status]}</Badge>;
}
