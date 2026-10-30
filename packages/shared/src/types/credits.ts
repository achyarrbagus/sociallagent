/** Customer credit amounts are shown in credits; rates are credits per 1,000 tokens. */
export interface CreditSettings { allowance: number; input: number; cachedInput: number; output: number }
/** Amounts are decimal strings of millionths of a credit to preserve precision. */
export interface CreditBalance {
  enabled: boolean;
  allowanceMicrounits: string;
  spentMicrounits: string;
  remainingMicrounits: string;
  periodStart: string;
  periodEnd: string;
  rates: { input: number; cachedInput: number; output: number };
  history: Array<{ amountMicrounits: string; occurredAt: string }>;
}
