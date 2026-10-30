import { describe, expect, it } from "vitest";
import { calculateCreditMicrounits } from "./credit-pricing.js";

describe("calculateCreditMicrounits", () => {
  const rates = { input: 1_000_000, cachedInput: 100_000, output: 5_000_000 };
  it("charges exclusive input and cache reads separately, with fractional credits retained", () => {
    expect(calculateCreditMicrounits({ inputTokens: 2_000, cachedInputTokens: 500, outputTokens: 1_000 }, rates)).toBe(7_050_000n);
  });
  it("accepts cache reads larger than exclusive input, as Codex receipts report", () => {
    expect(calculateCreditMicrounits({ inputTokens: 37_435, cachedInputTokens: 78_848, outputTokens: 898 }, rates)).toBe(49_809_800n);
  });
  it("rounds a positive fraction up to the smallest unit", () => {
    expect(calculateCreditMicrounits({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }, { input: 1, cachedInput: 0, output: 0 })).toBe(1n);
  });
  it("rejects invalid usage and rates rather than silently granting credit", () => {
    expect(() => calculateCreditMicrounits({ inputTokens: -1, cachedInputTokens: 0, outputTokens: 0 }, rates)).toThrow();
    expect(() => calculateCreditMicrounits({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }, { ...rates, output: Number.NaN })).toThrow();
  });
});
