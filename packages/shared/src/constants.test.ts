import { describe, it, expect } from "vitest";

import { AGENT_ROLE_LABELS } from "./constants.js";

describe("AGENT_ROLE_LABELS", () => {
  it("labels the ceo role as Agency Director", () => {
    expect(AGENT_ROLE_LABELS.ceo).toBe("Agency Director");
  });
});
