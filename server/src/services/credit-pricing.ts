/**
 * Rates are microcredits per 1,000 tokens; the result rounds up to one microcredit.
 * Usage follows the exclusive-input contract: inputTokens excludes cache reads,
 * which cachedInputTokens counts separately.
 */
export function calculateCreditMicrounits(usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }, rates: { input: number; cachedInput: number; output: number }): bigint {
  if (![...Object.values(usage), ...Object.values(rates)].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Token counts and credit rates must be non-negative safe integers");
  }
  const numerator = BigInt(usage.inputTokens) * BigInt(rates.input)
    + BigInt(usage.cachedInputTokens) * BigInt(rates.cachedInput)
    + BigInt(usage.outputTokens) * BigInt(rates.output);
  return (numerator + 999n) / 1000n;
}
