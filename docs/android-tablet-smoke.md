# Android tablet smoke — PR #29

Tested 2026-10-20 against PR head `424b5d5`.

## Environment and safety

- AVD `New_Device`, `emulator-5554`, Android API 36, x86_64, 2560×1600 landscape.
- Rebuilt debug native app with `npx expo run:android --no-bundler`; Metro served the current checkout, explicitly configured for local Supabase. No production services or transactions used.
- Local Supabase at host `127.0.0.1:54321`; seeded staff/admin accounts. Dedicated `SMOKE-TABLET-*` branch and 24 products, with opening balance 100 and unit price 10.
- A loopback-only proxy forwarded local Supabase calls and deliberately destroyed selected responses **after** receiving HTTP 200 from PostgreSQL/PostgREST. The app still used the ordinary RPC/client recovery paths, not injected pending-operation records.
- Native directory metadata remains version 1.0.2/code 2 despite app config 1.1.3/code 8. This is current-JS/current-dependency debug smoke, not release-APK or physical-device validation.

## Results

| Check | Observed result |
| --- | --- |
| Staff grid | Four-column grid renders, scrolls between product rows, and keeps the bottom navigation/actions visible. Quantity 3 at price 10 is reflected as total 30 on review. |
| Delivery save | Ordinary save succeeds and shows transaction balance 130 (opening 100 + sale 30). |
| Edit prefill | Staff history → edit loads delivered 3/returned 0 for the selected delivery. Changing returned to 1 survives navigating to history and back; review total becomes 20. Ordinary update succeeds, showing balance 120. |
| Lost delivery acknowledgement | A second delivery (sale 10) commits, but the proxy drops its HTTP 200. The UI offers explicit recovery. Force-stopping and restarting the app preserves that recovery action. |
| Recovery/draft isolation | After restart, a new draft selecting product 02 is entered. Recovering the previous product-01 sale shows “Önceki Kayıt Doğrulandı” and balance 130. “Taslağa Dön” retains product 02, quantity 1, without treating the recovered sale as that draft. |
| Lost payment acknowledgement | Admin collection of 7 commits, but its HTTP 200 is dropped. The sheet shows the unknown-outcome explanation and recovery action. Closing/reopening the sheet resets the amount field but retains the pending operation. |
| Changed payment blocked | Submitting amount 9 before resolving the earlier amount-7 payment is rejected with `PendingFinancialOperationError`; the ledger does not change. |
| Payment recovery | Explicit recovery closes the sheet and refreshes the branch balance to 123. Exact before/after snapshots of deliveries, payments, receipt journal and balance are unchanged by recovery. |
| Admin movements | Movement tab renders the header/KPIs and three ledger rows, scrolls within the virtualized viewport, and retains bottom navigation without the global error fallback. |

Final dedicated-fixture totals: **2 deliveries, 1 payment, 4 operation receipts, balance 123** (`100 + 20 + 10 - 7`). The first delivery was edited, not duplicated. The changed amount-9 payment was not created.

## Observations and limits

- No entries in Android's crash log buffer during this emulator run.
- Leaving the login activity with Android Back produced a development warning: `ExpoNavigationBar.setStyle` rejected because the current activity was unavailable. It did not prevent relaunch/login or the tested workflows. This smoke does not establish its production impact or resolve the lifecycle issue.
- Expected injected network/blocked-operation errors appear in Metro/LogBox; they are not native crashes.
- No benchmark, release build, physical-tablet comparison, ANR investigation, or production migration deployment was performed. Error/loading matrices and edit replay concurrency retain their automated regression coverage; not every failure branch was repeated manually.
- Temporary screenshots and local proxy/fixture/verification scripts are under `/tmp/opencode/iznik-*`; local fixtures remain available for inspection and are disposable on the next database reset. Emulator app-state backup is retained privately; the running test session is local-only.
