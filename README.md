# Investment Research & Portfolio Analysis Platform

A **locally-hosted, zero-dependency** web app with two integrated tools:

1. **Portfolio Analysis** — upload your trading history (CSV) to see performance
   (absolute return, XIRR, CAGR), concentration risk, diversification, insights,
   charts, and downloadable PDF / Excel reports.
2. **Stock Discovery** — browse 41 curated *discounted* US & India stocks scored
   on a transparent **8-point rulebook**, filter them, open detail cards, and
   shortlist to your **Watchlist** / **Research** lists.

Everything runs in your browser. No build step, no `npm install`, no external
services — all data and logic are bundled locally.

---

## Run it

You only need a static file server. Pick any one:

```bash
# Python 3 (preinstalled on most systems)
python3 -m http.server 8000
```

```bash
# Node.js (if you have it)
npx --yes serve -l 8000 .
```

Then open <http://localhost:8000> in your browser.

> You can also just open `index.html` directly (`file://`). The bundled sample
> portfolio still works via an inline fallback, though a local server is
> recommended so the `sample-portfolio.csv` file loads normally.

---

## Try it in 30 seconds

1. Open **Stock Discovery** and explore the list. Click a row for the 8-point
   breakdown. Mark a couple of stocks as **Watchlist** / **Research**.
2. Open **Portfolio Analysis** and click **Load sample portfolio** (or upload
   `sample-portfolio.csv`).
3. Review returns, concentration tables, insights and charts. Click
   **⬇ PDF report** or **⬇ Excel (CSV)**.
4. Go back to **Stock Discovery** — opportunities in sectors where you're
   *underweight* are now highlighted, and stocks you already own are flagged.

---

## CSV format

Required columns (header names are flexible — common Zerodha-style aliases like
`Tradingsymbol`, `Qty`, `Avg. Cost`, `Exchange` are recognized):

| Column     | Example     | Notes                                       |
|------------|-------------|---------------------------------------------|
| Symbol     | `INFY`      | Ticker                                      |
| Name       | `Infosys`   | Company name                                |
| Quantity   | `80`        | Numeric, > 0                                |
| Avg Price  | `1320`      | Average buy price, numeric                  |
| Market     | `NSE`       | `NSE`/`BSE` → India, `NYSE`/`NASDAQ` → US   |
| Date       | `2022-06-15`| `YYYY-MM-DD` or `DD/MM/YYYY`                |

Rows with invalid quantity/price are skipped with a warning; mixed US+India
portfolios are aggregated into a single base currency (₹83/$1) for totals.

---

## The 8-point rulebook

Each stock earns 1 point per check it passes (score 0–8):

1. **Below intrinsic value** · 2. **Meaningful discount** (≥20% off 52-week high)
· 3. **Positive free cash flow** · 4. **Healthy balance sheet** · 5. **Revenue
growth** · 6. **Profitable** · 7. **Reasonable valuation** · 8. **Durable moat**

| Tier              | Score | Color |
|-------------------|-------|-------|
| Strong Candidate  | 6–8   | 🟢    |
| Watchlist         | 4–5   | 🟠    |
| Trap              | 0–3   | 🔴    |

---

## Using live prices (optional)

The sandbox/offline build ships a **reference price snapshot**. To plug in a live
feed, edit **one place** — `PriceService.getQuote(ticker)` (and `refreshAll`) in
[`js/data.js`](js/data.js). Replace the lookup with a `fetch()` to your data
source (e.g. a small local proxy around yfinance, or a broker API). Nothing else
in the app needs to change; holdings without a live quote automatically fall back
to the last-known price with a **"delayed"** indicator.

---

## Project structure

```
index.html              App shell (nav, disclaimer, modal/toast hosts)
css/styles.css          Dark theme + print styles
sample-portfolio.csv    Demo holdings (US + India)
js/
  data.js               Bundled dataset + 8-point rulebook + PriceService (swap point)
  finance.js            XIRR, CAGR, returns, date parsing
  charts.js             Dependency-free SVG pie / bar / line
  tracking.js           Watchlist + Research (localStorage)
  report.js             PDF (print) + Excel/CSV export
  discovery.js          Stock Discovery tool + detail card + guide
  portfolio.js          Portfolio Analysis tool
  app.js                Router, UI helpers, Home + tracking views
```

---

## Disclaimer

Educational and informational use only. **Not** investment advice and **not**
SEBI-registered research. Prices are from a bundled reference dataset and may be
delayed or out of date. Always do your own research and consult a registered
advisor before investing.
