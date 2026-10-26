import { describe, expect, it } from "vitest";
import {
  SUCCESSFUL_RUN_HANDOFF_ESCALATED_ACTION,
  SUCCESSFUL_RUN_HANDOFF_EXHAUSTED_NOTICE_BODY,
  SUCCESSFUL_RUN_HANDOFF_REQUIRED_ACTION,
  SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY,
  SUCCESSFUL_RUN_HANDOFF_RESOLVED_ACTION,
  isSuccessfulRunHandoffComment,
  isSuccessfulRunHandoffEscalationComment,
  successfulRunHandoffActivityTone,
} from "./successful-run-handoff";

describe("successful run handoff UI helpers", () => {
  it("matches both required and escalated production comments", () => {
    expect(isSuccessfulRunHandoffComment(SUCCESSFUL_RUN_HANDOFF_REQUIRED_NOTICE_BODY)).toBe(true);
    expect(isSuccessfulRunHandoffComment("## This issue still needs a next step\n\n- Source run: abc")).toBe(true);
    expect(isSuccessfulRunHandoffComment("## Successful run missing issue disposition\n\n- Source run: abc")).toBe(true);
    expect(isSuccessfulRunHandoffComment(SUCCESSFUL_RUN_HANDOFF_EXHAUSTED_NOTICE_BODY)).toBe(true);
    expect(
      isSuccessfulRunHandoffComment(
        "SocialAgent exhausted the bounded successful-run handoff correction for this issue, but it still has no clear next-step disposition.",
      ),
    ).toBe(true);
    expect(
      isSuccessfulRunHandoffEscalationComment(
        "SocialAgent exhausted the bounded successful-run handoff correction for this issue, but it still has no clear next-step disposition.",
      ),
    ).toBe(true);
    expect(isSuccessfulRunHandoffComment("Ordinary issue comment")).toBe(false);
  });

  it.each(["Paperclip", "SocialAgent"])("recognizes saved %s notices without treating ordinary comments as handoffs", (brand) => {
    const required = `${brand} needs a disposition before this issue can continue.`;
    const exhausted = `${brand} could not resolve this issue's missing disposition automatically. The source assignment is unchanged and a board decision is required.`;
    const bounded = `${brand} exhausted the bounded successful-run handoff correction for this issue, but it still has no clear next-step disposition.`;
    expect(isSuccessfulRunHandoffComment(`  ${required}  `)).toBe(true);
    expect(isSuccessfulRunHandoffEscalationComment(required)).toBe(false);
    for (const notice of [exhausted, bounded]) {
      expect(isSuccessfulRunHandoffComment(notice)).toBe(true);
      expect(isSuccessfulRunHandoffEscalationComment(notice)).toBe(true);
    }
    expect(isSuccessfulRunHandoffComment(`Someone quoted: ${required}`)).toBe(false);
  });

  it("returns shared tones for required, escalated, and neutral activity", () => {
    expect(successfulRunHandoffActivityTone(SUCCESSFUL_RUN_HANDOFF_REQUIRED_ACTION).className).toContain("amber");
    expect(successfulRunHandoffActivityTone(SUCCESSFUL_RUN_HANDOFF_ESCALATED_ACTION).className).toContain("red");
    expect(successfulRunHandoffActivityTone(SUCCESSFUL_RUN_HANDOFF_RESOLVED_ACTION).className).toContain("border");
  });
});
