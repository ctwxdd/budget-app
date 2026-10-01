# Code Map

Chamomile Pocket is a Vite/React/TypeScript budget app. Google Sheets stores expenses, cards, giftcards, and card benefits; the browser handles presentation and summaries.

## Main flow

`src/main.tsx` → `src/App.tsx` → page/component → React Query hook in `src/hooks/` → authenticated Sheets adapter in `src/lib/sheets.ts`.

Shared date, expense, return, tag, giftcard, and benefit calculations live in `src/lib/`. `src/lib/auth.tsx` supplies the OAuth token used by the Sheets adapter.

## Route by task

| Area | First paths |
| --- | --- |
| Routes and app shell | `src/App.tsx`, `src/components/layout/AppLayout.tsx` |
| Expenses | `src/pages/ExpensesPage.tsx`, `src/components/expenses/`, `src/hooks/useExpenses.ts` |
| Overview and analytics | `src/pages/OverviewPage.tsx`, `src/pages/AnalyticsPage.tsx`, `src/lib/format.ts`, `src/lib/expenseFilters.ts` |
| Cards | `src/pages/Cards.tsx`, `src/hooks/useCards.ts` |
| Giftcards | `src/pages/Giftcards.tsx`, `src/hooks/useGiftcards.ts`, `src/lib/giftcards.ts` |
| Benefit tracker | `src/pages/BenefitTrackerPage.tsx`, `src/hooks/useCardBenefits.ts`, `src/hooks/useBenefitCredits.ts`, `src/lib/cardBenefits.ts`, `src/components/benefits/` |
| Sign-in and setup | `src/pages/LoginPage.tsx`, `src/pages/SetupPage.tsx`, `src/lib/auth.tsx` |
| Settings and preferences | `src/pages/SettingsPage.tsx`, `src/hooks/useTheme.ts`, `src/hooks/useLanguage.ts` |
| Shared controls | `src/components/ui/` |
| Sheets schema/API and row writes | `src/lib/sheets.ts`, relevant hook and parser |
| Hosting and release steps | `DEPLOY.md`, `.github/` |

## Focused unit tests

| Behavior | Test |
| --- | --- |
| Date normalization and ranges | `tests/unit/dates.test.cjs` |
| Sheets row/API helpers | `tests/unit/sheets.test.cjs` |
| Expense filters | `tests/unit/expenseFilters.test.cjs` |
| Return matching and totals | `tests/unit/returns.test.cjs` |
| Benefit usage and credits | `tests/unit/cardBenefits.test.cjs` |

Run the suite with `npm run test:unit`. It compiles supported pure modules via `tsconfig.unit.json` and executes tests with Node's built-in runner. UI and Google OAuth/Sheets integration have no automated browser tests.

## Navigation rule

This is a router, not a source inventory. Follow [AGENTS.md](AGENTS.md) for read scope, data contracts, and verification. Update this map only when ownership, entry paths, focused-test locations, or cross-module dependencies change. Avoid function/class inventories and details recoverable from filenames or search.
