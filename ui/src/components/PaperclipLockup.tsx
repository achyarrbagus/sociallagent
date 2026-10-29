import type { SVGProps } from "react";

interface PaperclipLockupProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  decorative?: boolean;
  title?: string;
}

/** SocialAgent mark and wordmark. The existing export keeps consumers compatible. */
export function PaperclipLockup({
  decorative = false,
  title = "SocialAgent",
  className,
  ...rest
}: PaperclipLockupProps) {
  return (
    <svg
      {...rest}
      className={className}
      viewBox="0 0 146 24"
      fill="currentColor"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-4l-5 3v-3H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" />
        <path d="M15 7h-4.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9" />
      </g>
      <text x="30" y="17" className="socialagent-wordmark">SocialAgent</text>
    </svg>
  );
}
