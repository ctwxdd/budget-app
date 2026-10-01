# Agent Guide

Start with [CODEMAP.md](CODEMAP.md), choose the owning lane, then read only its entry files, direct dependencies, and relevant unit test.

## Design constraints

- Keep the startup bundle lean. Keep heavy pages, charts, and rarely opened dialogs out of app/layout static imports; use route-level or interaction-triggered lazy loading.
- Do not idle-preload expensive routes, especially Analytics/Recharts on mobile. Preload only on likely navigation intent, such as pointer or focus on its control.
- After changes to layout, routing, imports, charts, or global dialogs, run `npm run build` and compare the emitted `dist/assets/index-*.js` gzip size. Explain or fix unexpected startup bundle growth.

## Task routing

| Work | Start with |
| --- | --- |
| App routes, sign-in, or spreadsheet setup | `src/main.tsx`, `src/App.tsx`, `src/lib/auth.tsx`, affected `src/pages/` file |
| Expense reads/writes, filters, or batch edits | `src/hooks/useExpenses.ts`, `src/lib/sheets.ts`, `src/lib/parse.ts`, `src/lib/expenseFilters.ts`, then `src/components/expenses/` |
| Cards | `src/hooks/useCards.ts`, `src/lib/sheets.ts`, `src/pages/Cards.tsx` |
| Giftcards or giftcard returns | `src/hooks/useGiftcards.ts`, `src/lib/giftcards.ts`, `src/lib/returns.ts`, `src/pages/Giftcards.tsx`; include `src/components/expenses/ExpenseDialog.tsx` for returns |
| Card benefits and credits | `src/pages/BenefitTrackerPage.tsx`, `src/hooks/useCardBenefits.ts`, `src/hooks/useBenefitCredits.ts`, `src/lib/cardBenefits.ts`, `src/components/benefits/BenefitDialog.tsx` |
| Totals, dates, tags, or analytics | `src/lib/format.ts`, `src/lib/dates.ts`, `src/lib/tags.ts`, affected page or component |
| Theme, language, or settings | `src/pages/SettingsPage.tsx`, `src/hooks/useTheme.ts`, `src/hooks/useLanguage.ts`, `src/lib/defaults.ts` |
| Shared UI | `src/components/ui/` and affected caller |
| Azure hosting or deployment | [DEPLOY.md](DEPLOY.md), then relevant `.github/` workflow |

## Durable data rules

- Google Sheets is the data source of truth. Route Sheets API calls through `src/lib/sheets.ts`; keep query state, cache invalidation, and optimistic updates in existing hooks.
- Treat sheet ranges, column meanings, and `rowIndex` conversion as data contracts. Expense column G is reserved and tags belong in H. Follow the exact ranges in the existing card and benefit writers; preserve columns and formulas they do not own.
- Never test mutations against the user's real budget sheet; use a disposable copy. Keep money, date, row parsing, returns, and card/giftcard benefit calculations compatible with existing sheet values.
- Before changing shared behavior, search all callers and trace the UI → hook → helper/API path. Prefer the current owner over duplicate state or downstream guards.

## Keep context small

1. Use this guide and CODEMAP to route the task before opening broad files.
2. Search symbols/callers with `rg`; read only the relevant implementation and tests. Expand scope only when the call path requires it.
3. Skip `node_modules/`, `dist/`, `.tmp-test/`, and `app.zip` unless the task explicitly concerns them.
4. Update these docs only when ownership, entry paths, validation commands, or a durable cross-module rule changes. Keep investigation notes out of the router.

## Verification

- `npm run build` runs TypeScript checking and the Vite production build. Run it for code changes.
- `npm run test:unit` compiles the pure TypeScript modules listed in `tsconfig.unit.json` and runs the CommonJS tests in `tests/unit/` with Node's built-in test runner. Extend the smallest relevant test for non-trivial money/date, parsing, row mapping, filtering, returns, or benefit logic; do not add a test framework.
- For UI changes, smoke the affected route at desktop and mobile widths. For OAuth or Sheets reads/writes, use a disposable spreadsheet and verify the affected flow; check refresh when cache behavior changes.
- For changes covered by the startup-bundle rule above, compare gzip size before and after the build. A successful build is not behavioral coverage; report the checks actually run and any manual-only coverage.
