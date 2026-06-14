# Budget App

A personal budget-tracking single-page app built with Vite, React, TypeScript, Tailwind CSS, and Google Sheets as the database. It reads and writes the `Expense` tab from your spreadsheet, computes summaries client-side, and supports dark mode, filtering, charts, and mobile layouts.

## Screenshots

_Add screenshots here after running the app locally._

## Google Cloud setup

1. Go to https://console.cloud.google.com and create a project.
2. Go to **APIs & Services** → **Library** → enable **Google Sheets API**.
3. Go to **APIs & Services** → **OAuth consent screen** → choose **External**, add yourself as a test user, and add the scope `https://www.googleapis.com/auth/spreadsheets`.
4. Go to **APIs & Services** → **Credentials** → **Create OAuth client ID** → **Web application** → add Authorized JavaScript origin `http://localhost:5173` (add your production origin later) → copy the Client ID.
5. Copy `.env.example` to `.env.local` and paste the client ID:

```bash
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
```

## Sheet preparation

- Easiest: upload `Budget_USA.xlsx` to Google Drive, open it as Google Sheets, then copy the URL or spreadsheet ID into the app.
- Or create a new Google Sheet with a tab named `Expense` and header row:

```text
Date | Expense | Description | Category | Payment Method | Reimbursement
```

The app ignores any extra pivot/helper columns and computes summaries in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173, sign in with Google, then paste your Sheet URL/ID.

## Build and preview

```bash
npm run build
npm run preview
```

## Deploy to Azure

See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions covering Azure Static Web Apps (recommended), Azure App Service Linux, and Azure App Service Windows.
