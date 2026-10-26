import type { SVGProps } from "react";
import { cn } from "../lib/utils";

export function AnimatedPaperclipIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("paperclip-thinking-icon", className)}
      aria-hidden="true"
      {...props}
    >
      <path
        className="paperclip-thinking-icon-path"
        d="M7 3h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-4l-5 3v-3H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z M15 7h-4.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full-page loading state: the centered, animated SocialAgent conversation mark. */
export function PaperclipLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <AnimatedPaperclipIcon className="h-24 w-24 text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
