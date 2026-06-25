# Investment Research & Portfolio Analysis Platform

A **locally-hosted, zero-dependency** web app for Indian and US stock investors.

**Live:** [soulfernweh.github.io/portfolio-analyser](https://soulfernweh.github.io/portfolio-analyser/)

---

## What it does

### Portfolio Analysis
Upload your broker's trade history (CSV) and instantly see:
- **Performance:** P&L, XIRR, CAGR — separately for active holdings and sold positions
- **52-week sparkline:** visual indicator showing where each stock sits in its yearly range
- **Risk:** concentration by stock/sector/market, diversification score
- **Insights:** over-concentration alerts, long-term vs short-term split
- **Charts:** sector donut, performance bar, capital timeline (all SVG, no libs)
- **Reports:** downloadable PDF + Excel

Works with **any broker CSV** — Zerodha, Groww, Angel One, US brokers, or custom formats.
Smart column detection figures out your file automatically (no rigid format required).

### Stock Discovery
Browse **S&P 500 + Nifty 500** stocks that are trading at meaningful discounts:
- **Curated list (41 stocks):** full 8-point quality + value scoring
- **Dynamic list (~200 stocks):** auto-scored from live prices based on discount depth
- Filter by market, sector, score, discount %
- Click any stock for a detailed breakdown
- Portfolio integration: highlights stocks that complement your underweight sectors

---

## Run it

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Or just visit the GitHub Pages deployment — no setup needed.

---

## How prices stay fresh

A GitHub Actions workflow runs **every weekday** at Indian and US market close:
- Fetches live prices for ~1000 tickers (S&P 500 + Nifty 500 + ETFs)
- Commits updated `prices.json` to the repo
- GitHub Pages auto-deploys within 1 minute

Your XIRR and gain/loss calculations use **yesterday's close** at worst.

---

## CSV format

The app **auto-detects columns** — you don't need exact header names. It handles:

| Your broker calls it... | We recognize it as... |
|---|---|
| Symbol, Ticker, Tradingsymbol, Scrip Code | **Symbol** |
| Quantity, Qty, Shares, Units | **Quantity** |
| Price, Avg Price, Trade Price, Cost, Rate | **Price** |
| Trade Date, Date, Order Date, Execution Date | **Date** |
| Exchange, Market, Exch | **Market** (optional) |
| Trade Type, Side, Buy/Sell | **Trade Type** (optional) |

If your CSV has BUY and SELL trades, they're automatically aggregated into net holdings.
Fully sold positions show **realized P&L** (not skipped).

---

## Scoring systems

### 8-point rulebook (41 curated stocks)

| # | Criterion |
|---|-----------|
| 1 | Below intrinsic value |
| 2 | ≥ 20% below 52-week high |
| 3 | Positive free cash flow |
| 4 | Healthy balance sheet |
| 5 | Revenue growth |
| 6 | Profitable |
| 7 | Reasonable valuation |
| 8 | Durable moat |

### 5-point dynamic scoring (broader universe)

| # | Criterion |
|---|-----------|
| 1 | ≥ 20% discount from 52w high |
| 2 | ≥ 30% discount (deep value) |
| 3 | ≥ 40% discount (extreme) |
| 4 | Not at rock bottom (showing recovery) |
| 5 | Decent market value (not penny stock) |

### Tiers

| Tier | Curated | Dynamic | Color |
|------|---------|---------|-------|
| Strong Candidate | 6-8 | 4-5 | Green |
| Watchlist | 4-5 | 2-3 | Amber |
| Trap | 0-3 | 0-1 | Red |

---

## Project structure

```
index.html              App shell
css/styles.css          Apple-style vibrant design
prices.json             Auto-updated daily (~800 tickers)
sample-portfolio.csv    Demo portfolio
js/
  data.js               Dataset + PriceService + dynamic discovery engine
  finance.js            XIRR (Newton-Raphson), CAGR, date parsing
  charts.js             SVG pie / bar / line (zero deps)
  tracking.js           Watchlist + Research (localStorage)
  report.js             PDF + Excel export
  discovery.js          Stock Discovery (full S&P 500 + Nifty 500)
  portfolio.js          Portfolio Analysis (smart parsing + 52w sparkline)
  app.js                Router, UI, views
scripts/
  update_prices.py      Price fetcher (yfinance, ~1100 tickers)
.github/workflows/
  update-prices.yml     Daily scheduled price refresh
```

---

## Tech choices

- **Zero dependencies** — no npm, no build, no CDN
- **Pure vanilla JS** — runs in any browser, no framework
- **SVG charts** — hand-rolled, no Chart.js / D3
- **GitHub Actions** — daily price refresh via yfinance
- **GitHub Pages** — free hosting, auto-deploy on push
- **localStorage** — watchlist/research persistence (no server)

---

## Disclaimer

Educational and informational use only. **Not** investment advice and **not**
SEBI-registered research. Prices are from a daily-refreshed dataset and may be
delayed by up to one trading day. Always do your own research and consult a
registered advisor before investing.
