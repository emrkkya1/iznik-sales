# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Critical: NativeWind v5 layout utilities break on Android

`className="flex-1"` (and possibly other flex utilities) do **not** translate to
React Native styles reliably under NativeWind v5 (`nativewind@5.0.0-preview`,
`react-native-css`). This caused layout containers to collapse to 0 height on
Android — invisible text, and the bottom nav floating to the top.

**Rule:** For critical layout containers (the root/shell layout, content
regions that must fill remaining space), use inline `style={{ flex: 1 }}`
instead of `className="flex-1"`. Cosmetic utilities (colors, spacing, borders,
text) are fine as `className`.

# Custom fonts (Plus Jakarta Sans)

- Fonts are embedded at build time via the `expo-font` config plugin in
  `app.json` (NOT loaded at runtime with `useFonts`). A prebuild is required
  after changing the font list: `npx expo prebuild` then `npx expo run android`.
- On Android, the **font family name is the filename without the extension**,
  e.g. `PlusJakartaSans_400Regular` (from `PlusJakartaSans_400Regular.ttf`).
  Do NOT use a bare family name like `PlusJakartaSans` — it won't resolve.
- The font tokens live in `src/global.css` under `@theme inline` as
  `--font-body`, `--font-medium`, `--font-heading`, `--font-heavy`, and are
  consumed as `font-body` / `font-medium` / `font-heading` / `font-heavy`
  utilities in `src/components/ui/text` and `src/components/ui/heading`.
- Use `font-heavy` (700) for the `bold` variant rather than Tailwind's
  `font-bold`, because `fontWeight` switching to a different embedded file is
  unreliable on Android.

# Styling conventions (gluestack-ui v5)

- Semantic tokens ONLY. Never `typography-*`, `neutral-*`, `gray-*`, numbered
  colors (`red-500`), or inline hex. Use `text-foreground`, `bg-primary`,
  `border-border`, `text-muted-foreground`, `text-destructive`, etc.
- Prefer component props (`size`, `variant`, `space`, `bold`) over `className`.
- Light theme only for now; dark theme is deferred (tokens defined once in
  `src/global.css` `@layer theme :root`).
- New gluestack components are copied into `src/components/ui/<name>/` (not
  installed as deps) and exported from `src/components/ui/index.ts`.

# System navigation bar

The Android system navigation bar is hidden (full-screen) via
`expo-navigation-bar`'s declarative `<NavigationBar hidden />` in
`src/app/_layout.tsx`. Do NOT add an `androidNavigationBar` block to `app.json`
or set a nav bar background color — it reintroduces a mismatched strip at the
bottom and pushes the app's bottom nav up. `react-native-safe-area-context`
insets already handle the gesture area.

# Query / mutation logging

Every React Query `queryFn` and every mutation must be wrapped with
`instrumentQuery` (queries) or call `logMutation` (mutations) from
`src/utils/logger.ts`. The `query:<name>` / `mutation:<name>` lines in
the Metro terminal are the only signal when a backend call fails — an
unwrapped query fails silently in the UI (e.g. "Hareketler Yüklenemedi"
with no logs).

- **Queries:** wrap with `instrumentQuery('<snake_case_rpc_name>', async (ctx) => { ... }, summarizeResult)`. The wrapper logs `fetch` (with `pageParam` if present), `success` (with summarized payload), and `error` (full error).
- **Mutations:** add explicit `logMutation('<name>', 'start', { ...input })`, `logMutation('<name>', 'success', { ... })`, and `logMutation('<name>', 'error', error)` in `onMutate` / `onSuccess` / `onError`.
- RPC names are snake_case to match the server.
- Treat this as a PR-blocking rule: a query without `instrumentQuery` means a future bug ships with no diagnostics.

# Verifications and tests (PR-blocking)

Every change ships only after the relevant quality gates pass. Running
them locally is mandatory before opening or merging a PR.

## Required checks before opening a PR

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint
npm test                # unit tests (Vitest, no Docker needed)
npm run test:db         # database integration tests (local Supabase + reset)
npm run test:integration # unit + integration back to back, single command
```

Or run them all sequentially: `npm run test:all` (does everything including
typecheck and lint).

## When to write a test

- **Every RPC contract change.** If you touch `supabase/migrations/*` and
  alter a function signature, validation, authorization, or aggregation,
  update or add a case in `tests/integration/*.integration.test.ts`. The
  test must cover at least: admin happy path, staff rejection, anonymous
  rejection, and one malformed-input rejection.
- **Every React Query hook or mutation.** If you add or modify a `queryFn`
  in `src/hooks/` or a mutation in `useMutations.ts`, add a unit test in
  `tests/hooks/` covering the new branch (pagination cursor, invalidation
  keys, error mapping).
- **Every pure utility.** Anything in `src/utils/` that has more than one
  caller or non-trivial branching gets a unit test under `tests/utils/`.
  No test means future refactors will quietly break it.
- **Every Zod schema.** Schemas in `src/services/supabase/*Schema.ts` are
  the runtime contract with the database; add a `*.test.ts` next to each
  one with valid + null/missing + malformed fixtures.
- **Every screen rewrite.** Manual smoke on the Android emulator
  (`adb -s emulator-5554 …`) for the rebuilt screen at a representative
  tablet landscape resolution (e.g. 1600×2560). Unit tests cannot catch
  flex collapse, nested `FlatList` zero-height, or missing safe-area
  insets.

## Database integration tests (`npm run test:db`)

- The runner (`scripts/run-db-integration.mjs`) starts local Supabase,
  runs `supabase db reset --local` to recreate + migrate + seed the
  database, then forwards credentials to Vitest only via env vars.
- It **refuses to run** unless `API_URL` is loopback on port 54321 and
  `DB_URL` is loopback on port 54322. No remote database is ever
  touched by `test:db`.
- All integration tests share the database; `vitest.integration.config.mjs`
  forces a single fork and disables file parallelism. Use unique
  prefixed fixture names (e.g. `ITEST-DEL <timestamp>`) so each run is
  isolated from the seed data.
- Use the helpers in `tests/integration/_helpers/clients.ts` for
  admin/staff/anonymous/service-role clients. They sign in through
  local Auth using the seeded credentials
  (`admin@iznik.test / admin123`, `staff@iznik.test / staff123`).
- Sign in as `staff` or use the anon helper when the test asserts that
  the RPC rejects unauthorized callers.
- M45 (`20240101000045_financial_write_boundary.sql`) supersedes M20's
  financial fixture grants. Application roles cannot directly write
  branches, deliveries, items, payments, or audit logs. Use `serviceClient()`
  only for privileged fixture setup/cleanup; keep actual authorization and
  RPC assertions on admin/staff/anonymous clients. Production financial
  writes must use the checked SECURITY DEFINER RPCs.

## Local database troubleshooting

- `supabase db reset` boots a fresh schema; the runner uses this for
  every run, so do not `npm run db:seed` in between (it is not
  idempotent).
- If `auth.signInWithPassword` returns `502 An invalid response was
  received from the upstream server` after a reset, run
  `npx supabase stop && npx supabase start` to clear stuck GoTrue
  state. This is a CLI quirk, not an app bug.
- `supabase/seed.sql` used psql-only `\i` directives that the CLI
  cannot parse; seeding is configured via
  `supabase/config.toml` → `[db.seed].sql_paths = ["./seed-data/*.sql"]`.
  Do not reintroduce `\i` directives — they break `supabase db reset`.

## Pre-commit checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes (fix `Array<T>` → `T[]`, unused imports,
      etc.).
- [ ] `npm test` passes.
- [ ] `npm run test:db` passes against a clean local database.
- [ ] `npm run test:integration` (or `npm run test:all`) is the single
      command that exercises unit + integration tests back to back.
- [ ] Manual smoke on the Android emulator for any changed screen.
- [ ] Migrations applied: `npx supabase migration list` shows no
      pending rows.
- [ ] PR description links the user-visible behavior and the test
      that guards it.



All colors are defined as CSS custom properties in `src/global.css`, in two
layers:

1. `@layer theme :root` — raw RGB channel triples (space-separated, e.g.
   `106 71 21`). This is the single source of truth for palette values.
2. `@theme inline` — maps each token to a Tailwind utility class via
   `rgb(var(--x))` (e.g. `--color-primary: rgb(var(--primary))`), which is what
   makes `bg-primary`, `text-foreground`, etc. work. Font tokens are defined
   here too (`--font-*` → `font-*` utilities).

## Color palette (light theme)

| Token | Value | Hex | Use |
|---|---|---|---|
| `primary` | `106 71 21` | `#6A4715` | brand actions, active nav, primary buttons |
| `primary-foreground` | `255 252 247` | — | text/icons on `primary` |
| `secondary` | `0 76 110` | `#004C6E` | secondary brand (navy), secondary buttons |
| `secondary-foreground` | `255 255 255` | — | text on `secondary` |
| `background` | `255 255 255` | — | app background |
| `foreground` | `44 33 21` | — | default body text |
| `card` / `popover` | `255 255 255` | — | card/popover surfaces |
| `card-foreground` / `popover-foreground` | `44 33 21` | — | text on cards/popovers |
| `muted` | `246 240 232` | — | subtle surfaces |
| `muted-foreground` | `133 101 61` | `#85653D` | secondary text |
| `accent` | `241 233 224` | — | hover/active surfaces |
| `accent-foreground` | `106 71 21` | — | text on `accent` |
| `border` / `input` | `229 220 205` | — | borders, input borders |
| `ring` | `114 78 28` | `#724E1C` | focus rings |
| `destructive` | `196 52 40` | — | errors, destructive actions |
| `destructive-foreground` | `255 255 255` | — | text on `destructive` |
| `info` | `0 96 147` | `#006093` | informational blue |
| `info-soft` | `60 116 156` | `#3C749C` | softer blue accent |
| `info-foreground` / `info-soft-foreground` | `255 255 255` | — | text on info tokens |

## Typography tokens

Defined in `@theme inline` (see "Custom fonts" above):

| Token | Family |
|---|---|
| `font-body` | `PlusJakartaSans_400Regular` |
| `font-medium` | `PlusJakartaSans_500Medium` |
| `font-heading` | `PlusJakartaSans_600SemiBold` |
| `font-heavy` | `PlusJakartaSans_700Bold` |

## Rules for extending the theme

- **Never hardcode hex/RGB in components.** Add a new token instead.
- To add a token: define the RGB triple in `:root`, then map it in
  `@theme inline` (`--color-<name>: rgb(var(--<name>))`), then use the
  `bg-<name>` / `text-<name>` / `border-<name>` utility.
- Keep foreground tokens for any colored background (e.g. `-foreground`).
- Alpha is done with `/` syntax (`bg-primary/10`, `text-foreground/70`), not
  `opacity-*` utilities.
- Spacing: use the standard scale only (`p-4`, `gap-3`, `py-1.5`); no arbitrary
  values like `p-[13px]`.
- Radius: `rounded-xl` for cards/containers, `rounded-lg` for buttons/inputs,
  `rounded-md` for small chips. Keep it consistent.
- Dark theme: intentionally deferred. When added, only add a
  `@media (prefers-color-scheme: dark) { :root { ... } }` block — component
  code stays unchanged because everything uses semantic tokens.
