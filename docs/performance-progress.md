# Tablet performance implementation progress

Branch: `perf/tablet-responsiveness`. Changes are not yet committed or released.

## Implemented in the first batch

- **F1:** virtualized staff product grid; per-product draft subscriptions and stable actions. Regression tests verify an edit rerenders only its product, including when the parent subscribes to the entire draft.
- **F2:** branch movement history now owns one virtualized viewport; branch identity/KPIs/tabs are its header, not an enclosing ScrollView. Loading/error states preserve the header.
- **F3:** bounded lazy reuse of date/time formatters; one clock read for edit eligibility; reuse the currency formatter in geography rows. Timezone/midnight/cutoff tests preserved.
- **Q8:** pagination waits for active fetches and uses `cancelRefetch: false`, including duplicate events before a render. A real InfiniteQueryObserver regression test verifies request coalescing.
- **C4:** explicit target-bound prefill readiness, old-draft isolation on entering edit, atomic prefill publication, stale-target protection, and loading/error/cancel UI. Repeated mounts/refetches cannot overwrite a dirty prefilled draft. Deleted payments are excluded from prefill.
- **R1, partial:** query correlation IDs, monotonic elapsed times, cancellation classification, and a capped 100-event metadata-only in-memory diagnostic buffer. Diagnostic summaries cannot fail a successful query. Mutation metadata events are not falsely correlated by name. Remote crash/ANR reporting, durable reporting, native build/device context, and release symbol upload remain outstanding.

The unit runner now includes the existing `tests/store` suite, which was previously excluded.

## Second batch: financial write boundary (C1)

- Added M45; previous migrations remain unchanged. Application roles can read authorized rows and use checked RPCs, but cannot directly insert/update/delete branches, deliveries, items, payments, or audit logs. Removed permissive financial write policies as defense in depth.
- Revoked application access to balance recalculation and internal financial snapshot/edit/audit helpers. Authorized SECURITY DEFINER wrappers still execute them as their owner.
- Balance reads now require an active authenticated profile and a nonnull branch ID.
- Migrated privileged financial fixture setup/cleanup to real service-role clients; ordinary RPC/read/authorization assertions still use admin/staff/anonymous sessions. Explicit service-role reference-table grants accommodate fresh Supabase defaults rather than relying on automatic exposure.
- Added an integration matrix covering direct insert/update/delete denial for admin/staff/anonymous callers, unchanged ledger/balance/audit snapshots, internal-helper denial, positive admin/staff RPC workflows, malformed-input rollback, and inactive-user rejection.
- No production migration deployment or API response/signature change. C2/C3 transaction identity and receipt work remains the next batch; D1/D2 is still blocked on it.
- Verification: `npm run test:all` passed (typecheck, lint, 485 unit tests and 178 clean-local integration tests). A local PostgreSQL ACL check also confirmed no insert/update/delete/truncate privilege on the five protected tables for either anon or authenticated.

## Third batch: operation identities and transaction receipts (C2/C3)

- Added M46 with actor/canonical-input-bound immutable acknowledgements. Creation, edit, and manual-payment v2 RPCs return transaction results without follow-up reads; edit replay returns the saved result without reapplying an old edit. Legacy UUID-returning RPCs remain available. Pre-migration deliveries without a transaction receipt require reconciliation rather than a fabricated balance snapshot.
- Persist operation identity and input before sending a request. Duplicate concurrent taps coalesce; unresolved operations survive remount/restart and block normal submissions, including identical input, until explicit recovery. Actor changes cannot acknowledge another user's result. Confirmed rejection, committed-but-unconfirmed responses, and unknown outcomes have separate handling.
- Added explicit recovery controls for deliveries/edits and manual payments. Recovering an older delivery preserves the current draft. Receipt balances are labeled as transaction snapshots, not live balances.
- Added unit/contract/schema and clean-local integration regression coverage for concurrent retries, payload/actor conflicts, lost responses, storage failure, account changes, later edits/payments, and legacy replay. `npm run test:all` passed: typecheck, lint, 514 unit tests and 185 clean-local integration tests. This caught and fixed ambiguous legacy overload dispatch and preserved existing validation messages. Native recovery UI smoke remains pending; not yet release-ready.

## Verification

- Typecheck, lint, and unit tests run locally; final counts are reported in the session.
- Android emulator smoke at 2560×1600: branch table opens; branch hub movement tab displays its header/rows and scrolls without the global error fallback. No financial writes performed.
- Staff grid/edit-prefill native smoke is still pending: emulator is currently signed in as admin. Use a dedicated staff test session; do not create production transactions to test this.
- No production database access/deployment, dependency changes, release APK build, physical-device profiling, or measured speedup claims. M45/M46 have only been applied to the disposable local test database.
- Clean-local database integration tests remain mandatory after financial SQL changes and before a PR.

## Remaining approved scope

- R4: safe boundary recovery (preserve unresolved operation identity first).
- Q1/Q2/Q3: one auth coordinator, transport-safe restoration, generation checks, identity-boundary cache/draft cleanup.
- Q4: root-owned AppState/NetInfo → Query/Auth lifecycle coordination.
- Q5: cancellable read contracts and deadlines; unknown-outcome handling for writes.
- Q6: bounded history retention with deliberate navigation/cursor semantics.
- Q7: shared query keys and complete/deduplicated invalidation rules.
- C2/C3: implementation and automated quality gates complete in batch 3; native recovery smoke remains required before release.
- D1/D2: balance deltas and settlement optimization **after C1/C2/C3**, preserving locks/audit/atomicity and reconciliation.
- X1: resolved-range granularity and bounded chart/export work.
- D3/D4: filtered aggregation and evidence-backed date indexes with representative local query plans.
- Complete R1 production incident reporting after the user chooses an external service/configuration.

## Next batch

Continue auth/query lifecycle work. Transaction invariants now pass automated tests; balance-delta optimization still requires its own regression coverage. Complete staff/recovery native smoke and choose the production crash-reporting service before release.
