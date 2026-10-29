import type { SVGProps } from "react";

/** The SocialAgent conversation mark; color follows the surrounding theme. */
export function SocialAgentMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden={props["aria-label"] || props["aria-labelledby"] ? undefined : true} {...props}>
      <path d="M7 3h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-4l-5 3v-3H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" />
      <path d="M15 7h-4.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9" />
    </svg>
  );
}
