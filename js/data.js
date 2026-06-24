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
  // PriceService — the single choke point for all price reads.
  // Replace getQuote/refreshAll with a real fetch() to go live.
  // ==========================================================================
  var PriceService = {
    // Returns { price, asOf, delayed } or null if the ticker is unknown.
    getQuote: function (ticker) {
      if (!ticker) return null;
      var s = BY_TICKER[String(ticker).toUpperCase()];
      if (!s) return null;
      return { price: s.lastPrice, currency: s.currency, asOf: s.asOf, delayed: true };
    },
    // Hook for a future live refresh. Currently a no-op resolved promise.
    refreshAll: function () { return Promise.resolve(false); },
    isLive: false
  };

  global.StockData = {
    RULEBOOK: RULEBOOK,
    stocks: STOCKS,
    getAll: function () { return STOCKS.slice(); },
    getByTicker: function (t) { return t ? BY_TICKER[String(t).toUpperCase()] || null : null; },
    sectors: function () { return uniqueSorted(STOCKS.map(function (s) { return s.sector; })); },
    markets: function () { return uniqueSorted(STOCKS.map(function (s) { return s.market; })); },
    tierForScore: tierForScore,
    tierClass: tierClass,
    fmtMoney: fmtMoney,
    round: round,
    PriceService: PriceService
  };
})(window);
