import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <Icon className="size-8" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
