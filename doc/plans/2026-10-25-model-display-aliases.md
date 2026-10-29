# Model display aliases

**Goal:** Show the owner's aliases `Sol → Bruno` and `Luna → Yuna` throughout normal SocialAgent model displays while preserving execution IDs.

**Design:** One UI-only formatter owns alias matching on family-name boundaries, plus a stable opaque code for unknown models and duplicate aliases. Known aliases are Bruno/Yuna; other model names use `SocialAgent Model <code>`. No database or provider contract changes. Selecting an alias always sends the exact original model ID. Provider branding remains independent.

## Work

- [x] Add shared display helper and boundary/default/stability regression coverage.
- [x] Mask searchable/native model pickers, selected/detected/manual option labels and tooltips; preserve catalog ordering and raw option values.
- [x] Mask agent roster/details, chat composer and bulk previews; support alias/code search and duplicate-label selection.
- [x] Mask report/finance/profile/quota/status/decision/transcript display metadata.
- [ ] Verify issue-property selectors and legacy consumers.
- [ ] Run focused tests, UI typecheck/build, token gates, and a read-only browser journey.

## Boundaries

This is display masking, not encryption or access control. Technical owner configuration inputs, API/network payloads, serialized configuration and raw transcript/debug views retain original IDs so integrations can be configured and diagnosed. The nice transcript view masks model metadata; arbitrary provider-generated prose or historical task content is not rewritten.

## Review focus

- Bruno/Yuna must not become literal IDs submitted to providers.
- Multiple Sol/Luna versions must be distinguishable using stable opaque option codes.
- Existing model ordering, automatic/default and custom-model entry still work.
- Model names cannot reappear through picker title/aria labels or secondary text.
- Cost and report aggregation keys retain real IDs; aliasing changes labels only.
