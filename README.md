# India Mutual Fund AI Tracker

A static single-page web app to search Indian mutual funds, compare NAV trends, track a personal portfolio, parse folio PDFs heuristically, and generate educational AI-style guidance.

## Features

- Fund discovery with scheme-name search from mfapi master list.
- Select up to 3 schemes for side-by-side comparison.
- NAV charting with Chart.js and metric computation:
  - Latest NAV
  - Trailing 1Y return
  - Annualized volatility (from log daily returns)
- Portfolio tracker (saved in browser localStorage under `mf_portfolio_v1`):
  - Add/update/remove holdings
  - Refresh latest NAV values
  - View invested, current, and P/L totals and per holding
- PDF folio import using pdf.js (text-based PDFs):
  - Extract text from uploaded PDF
  - Heuristic matching of scheme name + nearby units
  - Merge holdings into portfolio
  - Defaults avg NAV to `10` when unknown (review required)
- AI Investment Advice panel:
  - Inputs for SIP, horizon, risk profile, emergency-fund readiness
  - Heuristic corpus projection + educational guidance points

## Data Sources

- Fund list: `https://api.mfapi.in/mf`
- Scheme details + NAV history: `https://api.mfapi.in/mf/{schemeCode}`

## Local Run

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Portfolio Usage

1. Enter **Scheme Code**, **Units Held**, and **Avg Buy NAV**.
2. Click **Add/Update** to save holding.
3. Click **Refresh Portfolio NAV** to fetch latest NAVs and recalculate value.
4. Use **Remove** per row or **Clear Portfolio** to reset all.

## PDF Import Caveats

- Works best with **text-based** folio statements (not scanned images).
- Parsing is heuristic and may miss or misread values.
- Imported units and inferred holdings should always be manually verified.
- For newly imported schemes where buy NAV is unknown, the app defaults avg NAV to `10`.

## GitHub Pages Deployment

1. Ensure this repo has the workflow in `.github/workflows/deploy-pages.yml`.
2. Push to `main` branch.
3. In GitHub repo settings, enable Pages to use **GitHub Actions** if needed.
4. Watch workflow run under **Actions**; the deployment URL is shown in job output.

## Moving to Repo `mf-tracker` (Git Commands)

If your local directory is already initialized:

```bash
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/<your-username>/mf-tracker.git
git branch -M main
git add .
git commit -m "Initial commit: India Mutual Fund AI Tracker"
git push -u origin main
```

If you need to clone and push from scratch:

```bash
git clone https://github.com/<your-username>/mf-tracker.git
cd mf-tracker
# copy files into this folder
git add .
git commit -m "Add static India Mutual Fund AI Tracker app"
git push origin main
```

## Financial Advice Disclaimer

This project provides educational and informational content only. It does not constitute investment, legal, tax, or financial advice. Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing.
