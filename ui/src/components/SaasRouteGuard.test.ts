import { describe, expect, it } from "vitest";
import { isSaasHiddenPath } from "./SaasRouteGuard";

describe("isSaasHiddenPath", () => {
  it("matches hidden board pages with or without a company prefix", () => {
    for (const path of ["/U2BD32/routines", "/routines/abc", "/U2BD32/costs", "/U2BD32/org", "/U2BD32/activity/commentary", "/U2BD32/goals/1", "/status"]) {
      expect(isSaasHiddenPath(path), path).toBe(true);
    }
  });

  it("leaves the agency workflow alone", () => {
    for (const path of ["/U2BD32/dashboard", "/U2BD32/issues", "/U2BD32/projects", "/U2BD32/agency", "/U2BD32/content", "/U2BD32/activity", "/U2BD32/agents/udin", "/U2BD32/apps", "/U2BD32/company/settings"]) {
      expect(isSaasHiddenPath(path), path).toBe(false);
    }
  });
});
