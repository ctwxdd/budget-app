# Deploying to Azure

The Budget App is a **pure client-side SPA** (no backend) that talks directly to the Google Sheets API from the browser. All you need to host is the built `dist/` folder.

There are three supported targets, ordered by recommendation:

1. **Azure Static Web Apps** — easiest, free, built-in SPA routing & global CDN
2. **Azure App Service (Linux)** — if you already have an App Service plan
3. **Azure App Service (Windows)** — uses the bundled `web.config` for IIS

> ⚠️ **Important** — Vite bakes `VITE_*` environment variables into the bundle at **build time**. Set `VITE_GOOGLE_CLIENT_ID` **before** running `npm run build`, not in the Azure portal.

---

## 0. Prerequisites

- Node.js 20+ (matches the App Service Linux runtime)
- An Azure subscription
- Google OAuth Client ID (see `README.md` → "Google Cloud setup")
- The Azure CLI (`az`) installed and signed in:
  ```bash
  az login
  ```

---

## 1. Update the Google OAuth Client

Before deploying, add your production URL to the **Authorized JavaScript origins** for your OAuth Client:

1. https://console.cloud.google.com → APIs & Services → Credentials → your Web client
2. Under **Authorized JavaScript origins**, add e.g.:
   - `https://<your-app>.azurestaticapps.net`
   - or `https://<your-app>.azurewebsites.net`
3. Save. Changes propagate in a few minutes.

---

## 2. Build the production bundle

```bash
# from the repo root
cd budget-app

# make sure .env.local has the production Client ID, then:
npm install
npm run build
```

Output: `dist/` — a static bundle (`index.html`, `assets/*.js`, `assets/*.css`, favicon PNGs, `web.config`, `staticwebapp.config.json`).

---

## Option A — Azure Static Web Apps (recommended)

Static Web Apps automatically picks up `public/staticwebapp.config.json` for SPA routing.

### Quick deploy (one-off, no GitHub)

```bash
# install the SWA CLI once
npm install -g @azure/static-web-apps-cli

# create a Static Web App resource (Free tier)
az staticwebapp create \
  --name budget-app \
  --resource-group <your-rg> \
  --location westus2 \
  --sku Free

# get the deployment token
TOKEN=$(az staticwebapp secrets list --name budget-app --query "properties.apiKey" -o tsv)

# deploy the prebuilt dist/
swa deploy ./dist --deployment-token $TOKEN --env production
```

The app is live at `https://<random>.azurestaticapps.net` (rename the default host via the Azure portal if you like).

### GitHub Actions deploy

```bash
az staticwebapp create \
  --name budget-app \
  --resource-group <your-rg> \
  --source https://github.com/<you>/<repo> \
  --branch main \
  --app-location "budget-app" \
  --output-location "dist" \
  --login-with-github
```

Azure adds a workflow at `.github/workflows/azure-static-web-apps-*.yml`. Add a repository secret `VITE_GOOGLE_CLIENT_ID`, then edit the build step:

```yaml
- name: Build And Deploy
  uses: Azure/static-web-apps-deploy@v1
  env:
    VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_XXX }}
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    action: "upload"
    app_location: "budget-app"
    output_location: "dist"
```

---

## Option B — Azure App Service (Linux)

App Service Linux ships with **PM2**, which can serve a static SPA directly. No `server.js` needed.

```bash
# 1. Create the plan + web app (Free tier)
az appservice plan create -g <your-rg> -n budget-plan --sku F1 --is-linux
az webapp create -g <your-rg> -p budget-plan -n budget-app --runtime "NODE:20-lts"

# 2. Tell App Service to serve the bundle as a SPA
az webapp config set -g <your-rg> -n budget-app \
  --startup-file "pm2 serve /home/site/wwwroot 8080 --no-daemon --spa"

# 3. Zip the dist/ contents (NOT the dist/ folder itself) and deploy
cd dist
zip -r ../app.zip .
cd ..
az webapp deploy -g <your-rg> -n budget-app --src-path app.zip --type zip
```

The app is live at `https://budget-app.azurewebsites.net`.

> `pm2 serve ... --spa` does SPA fallback (every unknown path → `index.html`) without needing `web.config`.

---

## Option C — Azure App Service (Windows / IIS)

The `public/web.config` we ship handles SPA routing for IIS automatically.

```bash
# 1. Create plan + web app
az appservice plan create -g <your-rg> -n budget-plan --sku F1
az webapp create -g <your-rg> -p budget-plan -n budget-app

# 2. Zip dist/ contents and deploy
cd dist
Compress-Archive -Path * -DestinationPath ..\app.zip
cd ..
az webapp deploy -g <your-rg> -n budget-app --src-path app.zip --type zip
```

IIS serves `index.html` from the wwwroot and uses the URL rewrite rule in `web.config` for client-side routes.

---

## 3. Smoke-test

1. Open the deployed URL — you should see the login screen.
2. Sign in with the Google account that's listed as a test user on the OAuth consent screen.
3. Paste your Google Sheet ID/URL and verify the Expense table loads.
4. Hard-refresh a deep link (e.g. `/giftcards`) to confirm SPA routing falls back to `index.html`.

---

## 4. Updating

After any code change:

```bash
npm run build
# then re-run the deploy command for your chosen option
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `redirect_uri_mismatch` on login | Add the deployed origin to **Authorized JavaScript origins** in Google Cloud. |
| `Sign-in popup blocked` | The browser blocked the popup — click the icon in the URL bar and allow popups. |
| Deep links return 404 | Make sure `web.config` / `staticwebapp.config.json` made it into `dist/`. They live under `public/` and Vite copies them automatically. |
| Bundle missing OAuth client ID | Rebuild with `VITE_GOOGLE_CLIENT_ID=... npm run build` — Vite inlines it at build time. |
| Slow first paint | The bundle is ~800 KB / ~240 KB gzipped — this is normal for a Recharts + TanStack Query app. Static Web Apps + global CDN gives the best perceived load time. |
