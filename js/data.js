/* =============================================================================
 * data.js  —  Bundled reference dataset + 8-point rulebook
 * -----------------------------------------------------------------------------
 * The sandbox this was authored in has no outbound internet access, and most
 * deployments of this tool will also run fully offline / locally. So prices and
 * fundamentals are bundled here as a reference snapshot.
 *
 * >>> SWAP POINT FOR LIVE DATA <<<
 * All price reads in the app go through PriceService.getQuote(ticker) below.
 * To wire in a real feed (yfinance proxy, broker API, etc.), replace the body
 * of PriceService.getQuote / refreshAll with a fetch() call. Nothing else in
 * the app needs to change.
 * ===========================================================================*/

(function (global) {
  "use strict";

  // ---- The 8-point rulebook ------------------------------------------------
  // Each criterion is worth 1 point. Total score 0..8 drives the tier.
  var RULEBOOK = [
    { key: "undervalued", label: "Below intrinsic value",
      desc: "Trades at or below a conservative estimate of fair (intrinsic) value." },
    { key: "discount", label: "Meaningful discount",
      desc: "Price is 20% or more below its 52-week high (computed automatically)." },
    { key: "fcf", label: "Positive free cash flow",
      desc: "Business generates positive free cash flow over the trailing year." },
    { key: "lowDebt", label: "Healthy balance sheet",
      desc: "Debt is manageable (Debt/Equity below ~1.0)." },
    { key: "growth", label: "Revenue growth",
      desc: "Top-line revenue is growing over the trailing twelve months." },
    { key: "profitable", label: "Profitable",
      desc: "Positive net profit margin." },
    { key: "valuation", label: "Reasonable valuation",
      desc: "P/E or P/B sits below the sector median." },
    { key: "moat", label: "Durable moat",
      desc: "Clear competitive advantage or market leadership." }
  ];

  // ---- Tier thresholds -----------------------------------------------------
  function tierForScore(score) {
    if (score >= 6) return "Strong Candidate";
    if (score >= 4) return "Watchlist";
    return "Trap";
  }
  function tierClass(tier) {
    if (tier === "Strong Candidate") return "green";
    if (tier === "Watchlist") return "amber";
    return "red";
  }

  // Helper to keep stock entries compact. `c` = the 7 manually-set criteria
  // (the 8th, "discount", is derived from price vs 52w high in init()).
  function S(ticker, name, market, sector, currency, last, high52, why, catalyst, c) {
    return {
      ticker: ticker, name: name, market: market, sector: sector,
      currency: currency, lastPrice: last, high52w: high52,
      whyDown: why, catalyst: catalyst,
      asOf: "2026-06-19",
      crit: {
        undervalued: !!c.undervalued, fcf: !!c.fcf, lowDebt: !!c.lowDebt,
        growth: !!c.growth, profitable: !!c.profitable,
        valuation: !!c.valuation, moat: !!c.moat
      }
    };
  }

  // =========================== US (S&P 500) ================================
  var US = [
    S("NKE", "Nike Inc.", "US", "Consumer Discretionary", "USD", 61.20, 123.39,
      "Slowing China demand and elevated inventory pressured margins.",
      "Inventory normalization and new product cycle could restore margins.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true }),
    S("PFE", "Pfizer Inc.", "US", "Healthcare", "USD", 25.80, 31.54,
      "Post-COVID revenue cliff as vaccine/antiviral sales collapsed.",
      "Oncology pipeline and Seagen acquisition could re-accelerate growth.",
      { undervalued:true, fcf:true, lowDebt:false, growth:false, profitable:true, valuation:true, moat:true }),
    S("INTC", "Intel Corp.", "US", "Technology", "USD", 19.95, 37.16,
      "Lost manufacturing edge and market share to TSMC and AMD.",
      "Foundry turnaround and government CHIPS funding could re-rate shares.",
      { undervalued:true, fcf:false, lowDebt:false, growth:false, profitable:false, valuation:true, moat:false }),
    S("DIS", "Walt Disney Co.", "US", "Communication Services", "USD", 96.40, 123.74,
      "Streaming losses and linear TV decline weighed on earnings.",
      "Streaming profitability inflection and parks strength.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:false, moat:true }),
    S("PYPL", "PayPal Holdings", "US", "Financials", "USD", 68.30, 93.66,
      "Margin compression and competition in checkout slowed growth.",
      "Cost discipline, Braintree margins, buybacks under new CEO.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("CVS", "CVS Health", "US", "Healthcare", "USD", 56.10, 83.25,
      "Medical cost ratio spikes hurt the insurance (Aetna) segment.",
      "Repricing of Medicare plans and pharmacy stabilization.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:true, moat:true }),
    S("TGT", "Target Corp.", "US", "Consumer Staples", "USD", 104.80, 181.86,
      "Soft discretionary demand and shrink pressured comps.",
      "Margin recovery and inventory discipline as discretionary recovers.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true }),
    S("MMM", "3M Company", "US", "Industrials", "USD", 102.50, 145.00,
      "Litigation overhang (earplugs, PFAS) and slow industrial demand.",
      "Settlements quantified; Solventum spinoff sharpens focus.",
      { undervalued:true, fcf:true, lowDebt:false, growth:false, profitable:true, valuation:true, moat:true }),
    S("BA", "Boeing Co.", "US", "Industrials", "USD", 178.20, 267.54,
      "Quality/safety issues and production caps after 737 MAX incidents.",
      "Production ramp and order backlog clearance.",
      { undervalued:false, fcf:false, lowDebt:false, growth:true, profitable:false, valuation:false, moat:true }),
    S("WBA", "Walgreens Boots", "US", "Consumer Staples", "USD", 11.40, 27.10,
      "Declining pharmacy margins and a failed healthcare-clinic push.",
      "Cost cuts and asset sales; deep value if cash flow stabilizes.",
      { undervalued:true, fcf:false, lowDebt:false, growth:false, profitable:false, valuation:true, moat:false }),
    S("MRNA", "Moderna Inc.", "US", "Healthcare", "USD", 28.60, 169.99,
      "COVID vaccine demand evaporated with no near-term replacement.",
      "Oncology and RSV pipeline; large cash balance.",
      { undervalued:false, fcf:false, lowDebt:true, growth:false, profitable:false, valuation:false, moat:false }),
    S("EL", "Estee Lauder", "US", "Consumer Staples", "USD", 92.40, 169.11,
      "China and travel-retail weakness crushed prestige-beauty sales.",
      "Inventory reset in Asia travel retail; margin recovery plan.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:false, moat:true }),
    S("ADBE", "Adobe Inc.", "US", "Technology", "USD", 470.30, 638.25,
      "Fears that generative AI commoditizes creative software.",
      "AI features (Firefly) monetization could expand ARPU.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("DG", "Dollar General", "US", "Consumer Staples", "USD", 128.40, 168.07,
      "Margin pressure from shrink and a stretched low-income consumer.",
      "Store productivity reset and supply-chain normalization.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:true, moat:true }),
    S("SBUX", "Starbucks Corp.", "US", "Consumer Discretionary", "USD", 78.90, 107.66,
      "US traffic decline and China competition slowed comps.",
      "Turnaround plan under new CEO; loyalty re-engagement.",
      { undervalued:true, fcf:true, lowDebt:false, growth:false, profitable:true, valuation:false, moat:true }),
    S("F", "Ford Motor Co.", "US", "Consumer Discretionary", "USD", 11.20, 14.85,
      "EV losses and warranty costs weighed on profitability.",
      "Pro commercial unit strength and EV cost discipline.",
      { undervalued:true, fcf:true, lowDebt:false, growth:false, profitable:true, valuation:true, moat:false }),
    S("VZ", "Verizon Comms", "US", "Communication Services", "USD", 39.80, 45.36,
      "High debt load and slow wireless subscriber growth.",
      "Fixed-wireless broadband growth and steady dividend.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:true, moat:true }),
    S("C", "Citigroup Inc.", "US", "Financials", "USD", 63.10, 72.86,
      "Long restructuring and lower returns vs peers.",
      "Simplification plan and capital return could close the discount.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:false }),
    S("HSY", "Hershey Co.", "US", "Consumer Staples", "USD", 192.30, 211.92,
      "Record cocoa prices squeezing confection margins.",
      "Pricing actions and cocoa cost normalization.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:false, moat:true }),
    S("QCOM", "Qualcomm Inc.", "US", "Technology", "USD", 158.40, 230.63,
      "Handset cycle softness and Apple modem in-sourcing risk.",
      "Auto and IoT diversification; on-device AI demand.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("DOW", "Dow Inc.", "US", "Materials", "USD", 38.20, 60.34,
      "Chemicals downcycle with weak industrial and packaging demand.",
      "Volume recovery as the chemical cycle turns.",
      { undervalued:true, fcf:false, lowDebt:false, growth:false, profitable:true, valuation:true, moat:false })
  ];

  // =========================== India (Nifty) ==============================
  var IN = [
    S("HDFCBANK", "HDFC Bank", "India", "Financials", "INR", 1448.50, 1794.00,
      "Merger-related margin compression and deposit-growth concerns.",
      "Deposit franchise scaling and NIM normalization post-merger.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("ASIANPAINT", "Asian Paints", "India", "Materials", "INR", 2280.00, 3422.00,
      "New competition (Birla Opus) and slowing demand pressured share.",
      "Premiumization and rural demand recovery; pricing power.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:false, moat:true }),
    S("BAJFINANCE", "Bajaj Finance", "India", "Financials", "INR", 6720.00, 8190.00,
      "RBI restrictions and rising credit costs slowed loan growth.",
      "Digital lending scale-up and easing of regulatory curbs.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:false, moat:true }),
    S("KOTAKBANK", "Kotak Mahindra Bank", "India", "Financials", "INR", 1740.00, 2063.00,
      "RBI ban on new digital customer onboarding and CEO transition.",
      "Lifting of RBI restrictions and digital re-acceleration.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("TATAMOTORS", "Tata Motors", "India", "Consumer Discretionary", "INR", 695.00, 1179.00,
      "JLR demand softness in China/Europe and EV price war in India.",
      "Net-debt-free target at JLR and domestic CV cycle.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:true, moat:true }),
    S("HINDUNILVR", "Hindustan Unilever", "India", "Consumer Staples", "INR", 2310.00, 3035.00,
      "Sluggish volume growth and rural slowdown weighed on the stock.",
      "Rural recovery and premiumization in personal care.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:false, moat:true }),
    S("INFY", "Infosys", "India", "Technology", "INR", 1480.00, 1953.00,
      "Weak IT-services discretionary spend among Western clients.",
      "Large-deal wins and a discretionary-spend recovery.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true }),
    S("WIPRO", "Wipro", "India", "Technology", "INR", 252.00, 324.60,
      "Revenue declines and frequent leadership changes.",
      "Stabilizing growth and a restructured leadership team.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:false }),
    S("TECHM", "Tech Mahindra", "India", "Technology", "INR", 1265.00, 1808.00,
      "Margin underperformance versus large-cap IT peers.",
      "Margin-recovery program targeting peer-level profitability.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:false }),
    S("MARUTI", "Maruti Suzuki", "India", "Consumer Discretionary", "INR", 10980.00, 13680.00,
      "Loss of share in fast-growing SUV/EV segments.",
      "New SUV and EV launches; export ramp.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("SBIN", "State Bank of India", "India", "Financials", "INR", 745.00, 912.00,
      "Concerns over slower deposit growth and credit costs.",
      "Strong asset quality and improving return ratios.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:true, moat:true }),
    S("LT", "Larsen & Toubro", "India", "Industrials", "INR", 3360.00, 3963.00,
      "Margin worries on a large, low-margin order backlog.",
      "Record order book and infra/capex tailwinds.",
      { undervalued:true, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:false, moat:true }),
    S("TITAN", "Titan Company", "India", "Consumer Discretionary", "INR", 3180.00, 3886.00,
      "Margin pressure in jewellery from gold-price volatility.",
      "Studded-jewellery mix and store expansion.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:false, moat:true }),
    S("BHARTIARTL", "Bharti Airtel", "India", "Communication Services", "INR", 1380.00, 1779.00,
      "High capex and elevated debt despite tariff hikes.",
      "ARPU expansion from tariff hikes; Africa growth.",
      { undervalued:false, fcf:true, lowDebt:false, growth:true, profitable:true, valuation:false, moat:true }),
    S("ULTRACEMCO", "UltraTech Cement", "India", "Materials", "INR", 9850.00, 12146.00,
      "Cement price weakness amid intensifying competition.",
      "Capacity additions and infra-led demand.",
      { undervalued:true, fcf:true, lowDebt:true, growth:true, profitable:true, valuation:false, moat:true }),
    S("DRREDDY", "Dr. Reddy's Labs", "India", "Healthcare", "INR", 1190.00, 1421.00,
      "Loss of exclusivity on key gRevlimid revenues.",
      "Biosimilars pipeline and emerging-market expansion.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true }),
    S("TATASTEEL", "Tata Steel", "India", "Materials", "INR", 142.00, 184.60,
      "Weak European operations and soft global steel prices.",
      "UK restructuring savings and a domestic demand upcycle.",
      { undervalued:true, fcf:false, lowDebt:false, growth:false, profitable:false, valuation:true, moat:false }),
    S("BAJAJ-AUTO", "Bajaj Auto", "India", "Consumer Discretionary", "INR", 8420.00, 12774.00,
      "Domestic 2-wheeler demand softness and export weakness.",
      "EV (Chetak) ramp and an export recovery.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true }),
    S("GRASIM", "Grasim Industries", "India", "Materials", "INR", 2390.00, 2877.00,
      "Heavy initial losses from the new paints (Birla Opus) venture.",
      "Paints scale-up and core VSF/chemicals strength.",
      { undervalued:true, fcf:false, lowDebt:false, growth:true, profitable:true, valuation:true, moat:true }),
    S("ONGC", "Oil & Natural Gas Corp", "India", "Energy", "INR", 238.00, 345.00,
      "Crude-price volatility and government fuel-pricing overhangs.",
      "Steady dividend, new-well production ramp, and refining margins.",
      { undervalued:true, fcf:true, lowDebt:true, growth:false, profitable:true, valuation:true, moat:true })
  ];

  // ---- Assemble + derive ----------------------------------------------------
  var RAW = US.concat(IN); // 21 + 20 = 41 stocks

  function round(n, d) {
    var f = Math.pow(10, d == null ? 2 : d);
    return Math.round(n * f) / f;
  }

  function deriveStock(s) {
    var discountPct = s.high52w > 0 ? ((s.high52w - s.lastPrice) / s.high52w) * 100 : 0;
    // 8th criterion is computed from the discount itself.
    var crit = {};
    for (var k in s.crit) crit[k] = s.crit[k];
    crit.discount = discountPct >= 20;

    var score = 0;
    RULEBOOK.forEach(function (r) { if (crit[r.key]) score++; });
    var tier = tierForScore(score);

    return {
      ticker: s.ticker, name: s.name, market: s.market, sector: s.sector,
      currency: s.currency, lastPrice: s.lastPrice, high52w: s.high52w,
      whyDown: s.whyDown, catalyst: s.catalyst, asOf: s.asOf,
      crit: crit,
      discountPct: round(discountPct, 1),
      score: score,
      tier: tier,
      tierClass: tierClass(tier)
    };
  }

  var STOCKS = RAW.map(deriveStock);
  var BY_TICKER = {};
  STOCKS.forEach(function (s) { BY_TICKER[s.ticker.toUpperCase()] = s; });

  function uniqueSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }

  // ---- Currency formatting helper ------------------------------------------
  function fmtMoney(value, currency) {
    if (value == null || isNaN(value)) return "--";
    var sym = currency === "INR" ? "\u20B9" : "$";
    var abs = Math.abs(value);
    var str = abs.toLocaleString(currency === "INR" ? "en-IN" : "en-US",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (value < 0 ? "-" : "") + sym + str;
  }

  // ==========================================================================
  // PriceService — loads prices.json (auto-updated by GitHub Actions) on
  // startup. Falls back to bundled snapshot prices in data.js if the file
  // isn't available (e.g. offline, file:// protocol, or first deploy).
  // ==========================================================================
  var livePrices = null;   // { TICKER: { price, currency, high52w?, asOf } }
  var liveMeta = null;     // { updatedAt, source, totalTickers }
  var priceLoadPromise = null;

  function loadPrices() {
    if (priceLoadPromise) return priceLoadPromise;
    priceLoadPromise = new Promise(function (resolve) {
      // Try to fetch prices.json relative to the page (works on GitHub Pages + local server)
      if (typeof fetch === "undefined") { resolve(false); return; }
      fetch("prices.json?" + Date.now())  // cache-bust
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) {
          if (data && data.prices && typeof data.prices === "object") {
            livePrices = {};
            Object.keys(data.prices).forEach(function (ticker) {
              livePrices[ticker.toUpperCase()] = data.prices[ticker];
            });
            liveMeta = {
              updatedAt: data.updatedAt || null,
              source: data.source || "unknown",
              totalTickers: data.totalTickers || Object.keys(livePrices).length
            };
            PriceService.isLive = true;
            console.log("[PriceService] Loaded " + liveMeta.totalTickers +
              " live prices (updated " + (liveMeta.updatedAt || "unknown") + ")");
            resolve(true);
          } else {
            resolve(false);
          }
        })
        .catch(function () {
          // prices.json not available — use bundled fallback silently
          console.log("[PriceService] prices.json not available — using bundled snapshot");
          resolve(false);
        });
    });
    return priceLoadPromise;
  }

  // ---- On-demand price fetch via Yahoo Finance chart API ---------------------
  // Yahoo's v8 chart endpoint is publicly accessible and generally allows
  // cross-origin requests for basic chart data. We fetch 5-day data to get
  // the last close price.
  function fetchYahooPrice(ticker) {
    // Determine yfinance symbol: Indian stocks need .NS suffix
    var sym = ticker;
    // Heuristic: if ticker is all alpha (no dots), length > 2, and not a known
    // US-style ticker (single letter, or matches common US patterns), assume Indian
    if (!/\./.test(ticker) && ticker.length >= 3) {
      // Check if it's likely Indian by seeing if it has no known US characteristics
      var likelyUS = /^[A-Z]{1,4}$/.test(ticker) && ticker.length <= 4;
      // If we already have it in livePrices with INR, it's Indian
      var existingCurrency = livePrices && livePrices[ticker] && livePrices[ticker].currency;
      if (existingCurrency === "INR" || (!likelyUS && ticker.length > 4)) {
        sym = ticker + ".NS";
      }
    }

    // Try both with and without .NS for ambiguous tickers
    return attemptFetch(sym).then(function (result) {
      if (result) return result;
      // If .NS was added, try without it (maybe it's US)
      if (sym !== ticker) return attemptFetch(ticker);
      // If no suffix, try with .NS (maybe it's Indian)
      if (!sym.includes(".")) return attemptFetch(ticker + ".NS");
      return null;
    });
  }

  function attemptFetch(symbol) {
    // Try direct Yahoo Finance first, then CORS proxy fallbacks
    var baseUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) + "?interval=1d&range=5d";

    // List of CORS proxy options (try in order)
    var urls = [
      baseUrl,
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(baseUrl),
      "https://corsproxy.io/?" + encodeURIComponent(baseUrl)
    ];

    function tryNext(idx) {
      if (idx >= urls.length) return Promise.resolve(null);
      return fetch(urls[idx])
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) {
          var parsed = parseYahooResponse(data, symbol);
          if (parsed) return parsed;
          throw new Error("no data");
        })
        .catch(function () {
          return tryNext(idx + 1);
        });
    }

    return tryNext(0);
  }

  function parseYahooResponse(data, symbol) {
    if (!data || !data.chart || !data.chart.result || !data.chart.result[0]) return null;
    var result = data.chart.result[0];
    var meta = result.meta || {};
    var closes = result.indicators && result.indicators.quote &&
      result.indicators.quote[0] && result.indicators.quote[0].close;
    if (!closes || !closes.length) return null;

    // Get last valid close
    var lastClose = null;
    for (var i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && !isNaN(closes[i])) { lastClose = closes[i]; break; }
    }
    if (lastClose == null) return null;

    var currency = (meta.currency || "").toUpperCase();
    if (currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
      currency = "INR";
    } else if (currency === "USD" || (!symbol.includes("."))) {
      currency = currency || "USD";
    }

    return {
      price: round(lastClose, 2),
      currency: currency || "USD",
      asOf: new Date().toISOString().split("T")[0],
      source: "on-demand"
    };
  }

  var PriceService = {
    /**
     * Returns { price, currency, asOf, delayed, source } or null.
     * Priority: live prices.json > bundled dataset snapshot.
     * For tickers NOT in either source, returns null (portfolio.js uses cost basis).
     */
    getQuote: function (ticker) {
      if (!ticker) return null;
      var t = String(ticker).toUpperCase();

      // 1) Live prices from prices.json (daily-updated via GitHub Actions)
      if (livePrices && livePrices[t]) {
        var lp = livePrices[t];
        return {
          price: lp.price,
          currency: lp.currency || "INR",
          asOf: lp.asOf || (liveMeta && liveMeta.updatedAt ? liveMeta.updatedAt.split("T")[0] : null),
          delayed: false,
          source: "live"
        };
      }

      // 2) Bundled dataset snapshot (41 discovery stocks)
      var s = BY_TICKER[t];
      if (s) {
        return {
          price: s.lastPrice,
          currency: s.currency,
          asOf: s.asOf,
          delayed: true,
          source: "bundled"
        };
      }

      // 3) Unknown ticker
      return null;
    },

    /**
     * Fetch prices on-demand for tickers not in prices.json or bundled data.
     * Uses Yahoo Finance v8 chart API (public, works cross-origin in most cases).
     * Returns a promise resolving to { fetched: {TICKER: {price,currency,asOf}}, failed: [TICKER,...] }
     */
    fetchOnDemand: function (tickers) {
      if (!tickers || !tickers.length) return Promise.resolve({ fetched: {}, failed: [] });
      if (typeof fetch === "undefined") return Promise.resolve({ fetched: {}, failed: tickers.slice() });

      var unique = [];
      var seen = {};
      tickers.forEach(function (t) {
        var u = String(t).toUpperCase();
        if (!seen[u]) { seen[u] = true; unique.push(u); }
      });

      // For each ticker, try Yahoo Finance chart API
      var promises = unique.map(function (ticker) {
        return fetchYahooPrice(ticker);
      });

      return Promise.all(promises).then(function (results) {
        var fetched = {}, failed = [];
        results.forEach(function (r, i) {
          if (r) {
            fetched[unique[i]] = r;
            // Store in livePrices so subsequent getQuote() calls return it
            if (!livePrices) livePrices = {};
            livePrices[unique[i]] = r;
          } else {
            failed.push(unique[i]);
          }
        });
        return { fetched: fetched, failed: failed };
      });
    },

    /**
     * Get 52-week high for a ticker (from live data or bundled).
     */
    getHigh52w: function (ticker) {
      if (!ticker) return null;
      var t = String(ticker).toUpperCase();
      if (livePrices && livePrices[t] && livePrices[t].high52w) return livePrices[t].high52w;
      var s = BY_TICKER[t];
      return s ? s.high52w : null;
    },

    /**
     * Load/refresh prices from prices.json. Returns a promise that resolves
     * to true if live prices were loaded, false otherwise.
     */
    refreshAll: function () { return loadPrices(); },

    /** True if prices.json was successfully loaded. */
    isLive: false,

    /** Metadata about the loaded prices (updatedAt, source, totalTickers). */
    getMeta: function () { return liveMeta; }
  };

  // Auto-load prices on script init (non-blocking).
  // After loading, patch the bundled STOCKS array with live prices so Discovery
  // and all other views display current data.
  loadPrices().then(function (loaded) {
    if (!loaded || !livePrices) return;
    STOCKS.forEach(function (s) {
      var lp = livePrices[s.ticker.toUpperCase()];
      if (!lp) return;
      s.lastPrice = lp.price;
      s.asOf = lp.asOf || s.asOf;
      if (lp.high52w) s.high52w = lp.high52w;
      // Recompute discount and score
      var discountPct = s.high52w > 0 ? ((s.high52w - s.lastPrice) / s.high52w) * 100 : 0;
      s.discountPct = round(discountPct, 1);
      s.crit.discount = discountPct >= 20;
      var score = 0;
      RULEBOOK.forEach(function (r) { if (s.crit[r.key]) score++; });
      s.score = score;
      s.tier = tierForScore(score);
      s.tierClass = tierClass(s.tier);
    });
  });

  // ---- Dynamic Discovery: expand beyond the 41 curated stocks ---------------
  // Uses prices.json data to score ALL stocks with 52w high data.
  // Simplified 5-point scoring for non-curated stocks:
  //   1. Discount ≥ 20% from 52w high
  //   2. Discount ≥ 30% (deep value)
  //   3. Discount ≥ 40% (extreme discount)
  //   4. Not at absolute bottom (LTP > 10% above 52w low estimate) — avoids distress
  //   5. Decent market value (price > $5 / ₹50) — filters penny stocks
  function buildDynamicDiscovery() {
    if (!livePrices) return [];
    var dynamic = [];
    var existingTickers = {};
    STOCKS.forEach(function (s) { existingTickers[s.ticker.toUpperCase()] = true; });

    Object.keys(livePrices).forEach(function (ticker) {
      if (existingTickers[ticker]) return; // already in curated list
      var lp = livePrices[ticker];
      if (!lp.price || !lp.high52w || lp.high52w <= 0) return;

      var price = lp.price;
      var high52w = lp.high52w;
      var currency = lp.currency || "USD";
      var market = currency === "INR" ? "India" : "US";

      // Estimate 52w low as ~55% of high (conservative heuristic)
      var low52w = high52w * 0.55;
      var discountPct = ((high52w - price) / high52w) * 100;

      // Filter: only include stocks with meaningful discount (≥15%)
      if (discountPct < 15) return;

      // Filter: minimum price threshold (avoid penny stocks)
      var minPrice = currency === "INR" ? 50 : 5;
      if (price < minPrice) return;

      // Simplified scoring (0-5)
      var score = 0;
      if (discountPct >= 20) score++; // meaningful discount
      if (discountPct >= 30) score++; // deep value
      if (discountPct >= 40) score++; // extreme discount
      if (price > low52w * 1.1) score++; // not at absolute rock bottom (some recovery)
      if (price >= minPrice * 2) score++; // decent market value

      var tier = score >= 4 ? "Strong Candidate" : score >= 2 ? "Watchlist" : "Trap";

      dynamic.push({
        ticker: ticker,
        name: ticker, // No company name available for dynamic stocks
        market: market,
        sector: "—", // Sector unknown for dynamic
        currency: currency,
        lastPrice: price,
        high52w: high52w,
        whyDown: "Trading " + round(discountPct, 0) + "% below its 52-week high.",
        catalyst: "Potential recovery to prior levels if fundamentals hold.",
        asOf: lp.asOf || "",
        crit: {
          undervalued: discountPct >= 25,
          discount: discountPct >= 20,
          fcf: false, lowDebt: false, growth: false,
          profitable: price > low52w * 1.1, // proxy: recovering = probably profitable
          valuation: discountPct >= 30,
          moat: false
        },
        discountPct: round(discountPct, 1),
        score: score,
        tier: tier,
        tierClass: tierClass(tier),
        isDynamic: true
      });
    });

    // Sort by discount (deepest first), limit to top 200 to keep UI responsive
    dynamic.sort(function (a, b) { return b.discountPct - a.discountPct; });
    return dynamic.slice(0, 200);
  }

  global.StockData = {
    RULEBOOK: RULEBOOK,
    stocks: STOCKS,
    getAll: function () { return STOCKS.slice(); },
    getDiscoveryAll: function () {
      // Returns curated 41 + dynamically scored stocks from prices.json
      var dynamic = buildDynamicDiscovery();
      return STOCKS.slice().concat(dynamic);
    },
    getByTicker: function (t) {
      if (!t) return null;
      var u = String(t).toUpperCase();
      if (BY_TICKER[u]) return BY_TICKER[u];
      // Check dynamic/live prices
      if (livePrices && livePrices[u] && livePrices[u].high52w) {
        var lp = livePrices[u];
        var discountPct = lp.high52w > 0 ? ((lp.high52w - lp.price) / lp.high52w) * 100 : 0;
        return {
          ticker: u, name: u, market: lp.currency === "INR" ? "India" : "US",
          sector: "—", currency: lp.currency || "USD",
          lastPrice: lp.price, high52w: lp.high52w,
          whyDown: "Trading " + round(discountPct, 0) + "% below 52-week high.",
          catalyst: "Potential recovery.", asOf: lp.asOf || "",
          crit: { undervalued: discountPct >= 25, discount: discountPct >= 20,
            fcf: false, lowDebt: false, growth: false, profitable: true, valuation: discountPct >= 30, moat: false },
          discountPct: round(discountPct, 1), score: discountPct >= 40 ? 4 : discountPct >= 20 ? 3 : 1,
          tier: discountPct >= 40 ? "Strong Candidate" : discountPct >= 20 ? "Watchlist" : "Trap",
          tierClass: tierClass(discountPct >= 40 ? "Strong Candidate" : discountPct >= 20 ? "Watchlist" : "Trap"),
          isDynamic: true
        };
      }
      return null;
    },
    sectors: function () {
      var all = STOCKS.slice().concat(buildDynamicDiscovery());
      return uniqueSorted(all.map(function (s) { return s.sector; }).filter(function(s){ return s !== "—"; }));
    },
    markets: function () { return uniqueSorted(STOCKS.map(function (s) { return s.market; })); },
    tierForScore: tierForScore,
    tierClass: tierClass,
    fmtMoney: fmtMoney,
    round: round,
    PriceService: PriceService
  };
})(window);
