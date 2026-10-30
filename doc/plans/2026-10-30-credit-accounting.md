# Credit accounting implementation plan

Implement organization-scoped monthly credits for managed AI usage. Default to 1,000 credits monthly, with administrator-controlled rates of 1/0.1/5 credits per 1,000 input/cached input/output tokens. Keep provider cost accounting and spending guards independent.

- Persist administrator policy and per-organization allowance; record immutable, idempotent run charges with rates, token counts, and the applicable period. Protect company boundaries and exclude incomplete or unknown usage from finalized charges.
- Use the company accounting lock for admission and settlement, including concurrent runs, pending receipts, cancellation, month transitions, and policy changes. Retain existing budget and recovery invariants; do not fabricate zero usage.
- Provide instance-admin controls and per-organization balance/usage views using existing authorization and audit patterns. Explain rounding and distinguish purchased credits from operator cost.
- Test exact fractional pricing, settlement idempotency and retries, concurrent admission, rollover, access control, and user-visible failure states. Generate and validate database migrations and run focused checks, then the repository-wide handoff checks.

Payment, subscription purchase, and automatic top-up are not included in this first credit-accounting slice.
