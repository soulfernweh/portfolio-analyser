# Requirements & Specifications Document

## Investment Research & Portfolio Analysis Platform

**Version:** 2.0  
**Last Updated:** June 2026  
**Status:** Live on GitHub Pages

---

## 1. Application Overview

**Application Name:** Investment Research & Portfolio Analysis Platform

**Description:** A locally-hosted, zero-dependency web application providing two integrated tools:
1. **Portfolio Analysis Tool** — evaluate holdings performance, risk, and diversification from any broker's CSV export
2. **Stock Discovery & Opportunity Tool** — identify discounted investment opportunities across S&P 500 and Nifty 500 universes

**Architecture:** Pure client-side (HTML/CSS/vanilla JS). No build step, no npm, no server required. Runs on GitHub Pages or any static file server. Price data refreshed daily via GitHub Actions.

---

## 2. Users & Usage Scenarios

**Target Users:**
- Individual investors managing their own portfolios
- Retail traders using brokers like Zerodha, Groww, Angel One, or US brokers
- Investment enthusiasts seeking research-backed stock opportunities

**Core Usage Scenarios:**
- Upload trading history to analyze portfolio performance (active + sold positions)
- Discover discounted stocks across the full S&P 500 and Nifty 500 universe
- View 52-week position analysis to identify entry points
- Receive personalized stock suggestions complementing existing holdings
- Generate downloadable reports for portfolio review

---

## 3. Page Structure & Functional Description

### 3.1 Page Hierarchy

```
Home Page
├── Portfolio Analysis Tool
│   ├── Upload & Parse (smart column detection)
│   ├── Analysis Dashboard
│   │   ├── Overall Stats (P&L, XIRR, CAGR, Diversification)
│   │   ├── Performance Breakdown (Active vs Redeemed)
│   │   ├── Active Holdings Table (with 52-week sparkline)
│   │   ├── Sold/Redeemed Positions Table (realized P&L)
│   │   ├── Concentration & Risk Exposure
│   │   ├── Insights & Alerts
│   │   └── Charts (Sector pie, Performance bar, Timeline)
│   └── Report Generation (PDF + Excel)
├── Stock Discovery & Opportunity Tool
│   ├── Stock List View (full S&P 500 + Nifty 500)
│   ├── Stock Detail Card
│   └── How to Use Guide
└── User Tracking
    ├── Watchlist
    └── Research List
```

### 3.2 Functional Description by Page

#### 3.2.1 Home Page
- Display application name with gradient branding
- Provide navigation to Portfolio Analysis Tool and Stock Discovery Tool
- Show key stats: total curated stocks, strong candidates, watchlist/research counts
- Show SEBI disclaimer prominently
- Include footer with additional disclaimer on all pages

#### 3.2.2 Portfolio Analysis Tool

**Upload & Parse (Smart Column Detection):**
- Allow users to upload trading history files in CSV format
- **Two-pass intelligent column detection:**
  - Pass 1: Fuzzy keyword scoring on header names (substring/token matching, not exact)
  - Pass 2: Content-based inference (samples actual cell data to determine column type)
- Handles ANY broker format: Zerodha trade book, Groww export, US broker formats, custom CSVs
- Handles trade logs with BUY/SELL aggregation (computes net positions + weighted avg price)
- Required columns (auto-detected): Symbol, Quantity, Price, Date
- Optional columns (auto-detected): Name, Market/Exchange, Trade Type
- Strips NSE series suffixes (-EQ, -BE, etc.)
- Shows clear errors for truly unrecognizable files

**Analysis Dashboard — Overall Stats:**
- Total invested, current value, total gain/loss
- Absolute return, XIRR (annualized), CAGR
- Diversification score (HHI-based)
- Active holdings count + sold positions count

**Performance Breakdown (Active vs Redeemed):**
- Separate P&L / Return / XIRR / CAGR / Invested / Current Value stats for:
  - Active Holdings (unrealized gains)
  - Sold/Redeemed Positions (realized gains)

**Active Holdings Table:**
- Symbol, name, quantity, avg buy price, current price
- Gain/loss (absolute + percentage)
- **52-week range sparkline:** visual indicator showing where LTP sits between 52w low and high
  - Formula: `(LTP - 52w_low) / (52w_high - 52w_low)`
  - Color coding: Green (near low = good entry), Amber (mid), Red (near high)
- "Delayed" badge for stocks using reference/fallback prices

**Sold/Redeemed Positions Table:**
- Symbol, qty bought → qty sold, avg buy price, avg sell price
- Realized P&L (absolute + percentage)
- No longer skipped or treated as warnings

**Concentration & Risk Exposure:**
- Concentration by stock (flags > 20%)
- Concentration by sector (flags > 40%)
- Concentration by market (geography)

**Insights & Alerts:**
- Over-concentration alerts (single stock > 20%, sector > 40%)
- Diversification scoring with recommendations
- Long-term vs short-term holdings breakdown
- Delayed-price flags for stocks without live data

**Charts (SVG, dependency-free):**
- Donut chart: sector allocation
- Bar chart: performance by holding (color-coded positive/negative)
- Line chart: capital deployed → current value timeline

**Report Generation:**
- PDF report (via browser print dialog → Save as PDF)
- Excel/CSV export with all metrics, holdings, and insights
- Tracking list export

#### 3.2.3 Stock Discovery & Opportunity Tool

**Stock List View:**
- Displays stocks from the **full S&P 500 + Nifty 500 universe** (not just 41)
- Two tiers of stocks:
  - **Curated (41 stocks):** Full 8-point rulebook scoring with qualitative analysis
  - **Dynamic (from prices.json):** Simplified 5-point scoring based on discount metrics
- For each stock shows: Ticker, Name, Last price, 52-week high, Discount %, Score, Tier, Sector
- **Filtering options:** Market (US/India), Sector, Min score, Min discount %, Text search
- **Color-coded tiers:**
  - Green: Strong Candidate (curated ≥ 6/8 or dynamic ≥ 4/5)
  - Amber: Watchlist (curated 4-5/8 or dynamic 2-3/5)
  - Red: Trap (curated ≤ 3/8 or dynamic ≤ 1/5)
- **Portfolio complement highlighting:** when portfolio is uploaded, highlights stocks in underweight sectors

**Dynamic Discovery Scoring (5-point for non-curated stocks):**
1. Discount ≥ 20% from 52-week high
2. Discount ≥ 30% (deep value)
3. Discount ≥ 40% (extreme discount)
4. Not at absolute bottom (LTP > 10% above estimated 52w low)
5. Decent market value (price > ₹50 / $5, filters penny stocks)

**Curated Stock Scoring (8-point rulebook):**
1. Below intrinsic value
2. Meaningful discount (≥ 20% off 52-week high)
3. Positive free cash flow
4. Healthy balance sheet (D/E < 1.0)
5. Revenue growth
6. Profitable (positive net margin)
7. Reasonable valuation (P/E below sector median)
8. Durable moat (competitive advantage)

**Stock Detail Card:**
- Full metrics in expanded view
- Criterion-by-criterion scoring breakdown
- "Why it's down" + potential catalyst
- Watchlist / Research marking buttons

**How to Use Guide:**
- Explains both scoring systems (8-point curated + 5-point dynamic)
- Tier interpretation guide
- Tips for using filters and portfolio integration

#### 3.2.4 User Tracking

**Watchlist:** Stocks marked for tracking with key metrics
**Research List:** Stocks marked for deeper investigation
- A stock can be in both lists simultaneously
- Persisted in localStorage (no server)
- Exportable to CSV

---

## 4. Data Architecture

### 4.1 Price Data Pipeline

```
GitHub Actions (Mon-Fri, 2x daily)
  → scripts/update_prices.py (yfinance)
  → Fetches ~1100 tickers (S&P 500 + Nifty 500 + ETFs + extras)
  → Writes prices.json (committed to repo)
  → GitHub Pages auto-deploys

Browser loads prices.json on page load
  → PriceService.getQuote(ticker) returns live price
  → Falls back to bundled snapshot if unavailable
  → On-demand fetch via CORS proxy for unknown tickers
```

### 4.2 Price Sources (Priority Order)

1. **prices.json** (daily-updated, ~800 tickers) → `delayed: false, source: "live"`
2. **Bundled data.js snapshot** (41 curated stocks) → `delayed: true, source: "bundled"`
3. **On-demand Yahoo Finance** (via CORS proxy) → `source: "on-demand"`
4. **Cost basis fallback** (user's avg price) → shown with warning

### 4.3 Supported Ticker Coverage

| Source | Count | Examples |
|--------|-------|---------|
| S&P 500 | ~500 | AAPL, MSFT, NVDA, AMZN, GOOGL, META |
| Nifty 500 | ~300 | RELIANCE, TCS, INFY, HDFCBANK, SBIN |
| Indian ETFs | ~30 | GOLDBEES, NIFTYBEES, LIQUIDBEES |
| Additional | ~80 | ZOMATO, BHEL, NCC, MAZDOCK, etc. |

### 4.4 GitHub Actions Schedule

- **11:05 UTC** (Mon-Fri) — after Indian market close (3:30 PM IST)
- **21:05 UTC** (Mon-Fri) — after US market close (4:00 PM ET)
- **Manual trigger** — via workflow_dispatch with optional EXTRA_TICKERS

---

## 5. Business Rules & Logic

### 5.1 Portfolio Analysis Logic
- Smart column detection: fuzzy header matching + content inference
- BUY/SELL trade aggregation: weighted average buy price, net quantity
- Sold positions tracked with realized P&L (not skipped)
- XIRR uses actual trade-level cash flows (each buy = negative, each sell = positive)
- Multi-currency support (INR + USD, converts at ₹83/$1 for aggregation)
- 52-week range position: `(LTP - low) / (high - low)` shown as sparkline

### 5.2 Concentration & Risk Rules
- Single stock > 20% of portfolio → high severity alert
- Single sector > 40% of portfolio → high severity alert
- Diversification score based on HHI (Herfindahl-Hirschman Index)
- Effective holdings = 1 / HHI

### 5.3 Discovery Scoring & Tier Logic
- **Curated stocks (8-point):** Strong ≥ 6, Watchlist 4-5, Trap ≤ 3
- **Dynamic stocks (5-point):** Strong ≥ 4, Watchlist 2-3, Trap ≤ 1
- Penny stocks filtered (< ₹50 / $5)
- Minimum 15% discount to appear in discovery
- Dynamic list capped at top 200 by discount depth

### 5.4 Portfolio-Discovery Integration
- Underweight sectors (< 10% allocation) identified
- Discovery highlights stocks in those sectors
- Owned stocks flagged (not duplicated as suggestions)

---

## 6. Technical Architecture

### 6.1 File Structure

```
index.html                 App shell
css/styles.css             Apple-style vibrant design
prices.json                Auto-updated daily (GitHub Actions)
sample-portfolio.csv       Demo portfolio
js/
  data.js                  Dataset + PriceService + dynamic discovery
  finance.js               XIRR, CAGR, returns, date parsing
  charts.js                SVG pie / bar / line charts
  tracking.js              Watchlist + Research (localStorage)
  report.js                PDF (print) + Excel/CSV export
  discovery.js             Stock Discovery tool
  portfolio.js             Portfolio Analysis tool (smart parsing)
  app.js                   Router, UI helpers, views
scripts/
  update_prices.py         GitHub Actions price fetcher (yfinance)
.github/workflows/
  update-prices.yml        Scheduled price update workflow
test/
  smoke.js                 30-point integration test suite
```

### 6.2 Design System

- **Theme:** Light, Apple-inspired vibrant design
- **Colors:** Accent gradient (purple → blue), vibrant green/amber/red for signals
- **Typography:** SF Pro / system font stack, -apple-system
- **Components:** Frosted glass header, rounded cards, pill buttons, SVG sparklines
- **Responsive:** Grid-based layout, collapses to single column on mobile

### 6.3 Dependencies

**None.** Zero npm packages, zero CDN calls, zero build step.
- Runs with `python3 -m http.server` or any static server
- GitHub Pages deployment (automatic)

---

## 7. Exceptions & Edge Cases

| Scenario | Handling |
|----------|----------|
| CSV with unknown column names | Smart inference from cell content (dates, tickers, numbers) |
| CSV with BUY/SELL trades | Aggregated into net holdings with weighted avg price |
| Fully sold position (net qty ≤ 0) | Shown in "Sold Positions" table with realized P&L |
| Net negative position (more sells than buys) | Treated as sold position, shown with realized gain |
| Stock not in prices.json | On-demand fetch attempted via CORS proxy; fallback to cost basis |
| 52-week data unavailable | Sparkline shows "--" |
| Multiple currencies in portfolio | Auto-detected; totals converted to dominant currency (₹83/$1) |
| Empty CSV / header-only file | Clear error message |
| Penny stocks in discovery | Filtered out (< ₹50 / $5) |
| GitHub Actions workflow fails | App falls back gracefully to bundled snapshot prices |

---

## 8. Acceptance Criteria

1. ✅ User uploads any broker CSV → system auto-detects columns and parses correctly
2. ✅ Dashboard shows separate P&L / XIRR / CAGR for active holdings AND sold positions
3. ✅ Active holdings table shows 52-week range sparkline with position indicator
4. ✅ Sold positions shown with realized P&L (not skipped with warnings)
5. ✅ XIRR calculated using actual trade cash flows (buys + sells + current value)
6. ✅ Stock Discovery shows stocks from full S&P 500 + Nifty 500 universe
7. ✅ Discovery highlights stocks complementing user's underweight sectors
8. ✅ Prices auto-refresh daily via GitHub Actions (~800 tickers)
9. ✅ PDF and Excel reports downloadable
10. ✅ Works fully offline with bundled data (degraded but functional)

---

## 9. Out of Scope for This Release

- User registration and login system
- Saving portfolio data across sessions (beyond localStorage)
- Real-time streaming prices / WebSocket feeds
- Historical price charts for individual stocks
- Backtesting or simulation features
- Integration with live broker APIs (Zerodha Kite, etc.)
- Fundamental data beyond what's in the curated 41 (P/E, debt ratios, etc.)
- Multi-currency conversion with live FX rates
- Mobile native applications (iOS/Android)
- Advanced portfolio optimization (Markowitz, etc.)
- Tax calculation (STCG/LTCG) or reporting
- Social features / sharing

---

## 10. Future Enhancements (Roadmap)

- [ ] Live FX rate integration for accurate multi-currency P&L
- [ ] Fundamental data pipeline (P/E, debt, margins) for broader scoring
- [ ] Sector classification for all dynamic stocks (using industry databases)
- [ ] Historical NAV/price chart within stock detail cards
- [ ] Portfolio comparison (upload multiple CSVs)
- [ ] STCG/LTCG tax estimation (India-specific)
- [ ] Broker API integration (read-only) for automatic portfolio sync
- [ ] PWA support for offline-first mobile experience
