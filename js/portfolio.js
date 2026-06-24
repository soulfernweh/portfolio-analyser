/* =============================================================================
 * portfolio.js — Portfolio Analysis Tool
 *   - CSV upload + validation (Symbol, Name, Quantity, Avg Price, Market, Date)
 *   - Holdings table with reference-price lookup + "data delayed" fallback
 *   - Performance (absolute return, XIRR, CAGR) & risk (concentration) metrics
 *   - Diversification + insights, sector/performance/value charts
 *   - Publishes analysis to PortfolioStore for the Discovery complement feature
 * ===========================================================================*/

(function (global) {
  "use strict";

  var SD = global.StockData, F = global.Finance, C = global.Charts;
  var FX_INR_PER_USD = 83; // simple constant for cross-currency aggregation

  // Shared store other modules read from.
  global.PortfolioStore = global.PortfolioStore || { analysis: null, fileName: null };

  // Only Symbol, Quantity, Price and Date are truly required.
  // Name is optional (falls back to ticker). Market is optional (defaults to India).
  // Trade Type is optional — if present, BUY/SELL trades are aggregated into net holdings.
  var REQUIRED = ["Symbol", "Quantity", "Avg Price", "Date"];
  var OPTIONAL = ["Name", "Market", "Trade Type"];

  // ---- SMART COLUMN DETECTION -----------------------------------------------
  // Two-pass approach:
  //   Pass 1: Fuzzy keyword scoring on header names (substring/token matching)
  //   Pass 2: Content-based inference (look at actual cell values to determine type)
  // This handles arbitrary column names from any broker without being fixated on
  // exact header strings.

  // Keywords that signal each field. Tokens are matched as substrings and word overlaps.
  var FIELD_KEYWORDS = {
    Symbol: {
      strong: ["symbol", "ticker", "tradingsymbol", "scrip", "scripcode", "instrument"],
      weak: ["stock", "security", "isin", "code", "script"]
    },
    Name: {
      strong: ["company name", "company", "security name", "stock name", "scrip name"],
      weak: ["name", "description", "security", "title"]
    },
    Quantity: {
      strong: ["quantity", "qty", "shares", "units", "net qty", "holding qty", "trade qty", "filled qty"],
      weak: ["vol", "lots", "amount", "no of shares", "number"]
    },
    "Avg Price": {
      strong: ["avg price", "average price", "buy price", "buy avg", "trade price",
               "execution price", "cost price", "avg cost", "average cost", "deal price",
               "net rate", "executed price", "fill price", "executed avg"],
      weak: ["price", "rate", "cost", "value", "avg", "ltp", "close", "last"]
    },
    Market: {
      strong: ["exchange", "market", "exch"],
      weak: ["segment", "board", "platform"]
    },
    Date: {
      strong: ["trade date", "buy date", "purchase date", "order date", "txn date",
               "transaction date", "execution date", "deal date", "settlement date",
               "fill date", "created date"],
      weak: ["date", "time", "timestamp", "datetime", "execution time", "executed at",
              "created at", "traded on", "order execution"]
    },
    "Trade Type": {
      strong: ["trade type", "transaction type", "txn type", "buy/sell", "buy / sell",
               "order side", "trade side"],
      weak: ["type", "side", "action", "direction", "bs"]
    }
  };

  // Score how well a header matches a field's keywords (fuzzy, not exact).
  function scoreHeader(header, fieldName) {
    var h = header.toLowerCase().replace(/[_\-\.]+/g, " ").replace(/\s+/g, " ").trim();
    var kw = FIELD_KEYWORDS[fieldName];
    if (!kw) return 0;
    var score = 0;

    // Exact match with a strong keyword = highest score
    var i, j;
    for (i = 0; i < kw.strong.length; i++) {
      if (h === kw.strong[i]) return 100;
      // Header contains the keyword as a substring
      if (h.indexOf(kw.strong[i]) !== -1) score = Math.max(score, 80);
      // Token overlap: split keyword into words, see how many appear in the header
      var tokens = kw.strong[i].split(/\s+/);
      var hTokens = h.split(/\s+/);
      var overlap = 0;
      for (j = 0; j < tokens.length; j++) {
        for (var k = 0; k < hTokens.length; k++) {
          // Only allow substring matching for tokens >= 3 chars to avoid false positives
          var ht = hTokens[k], kt = tokens[j];
          if (ht === kt) { overlap++; break; }
          if (ht.length >= 3 && kt.length >= 3 && (ht.indexOf(kt) !== -1 || kt.indexOf(ht) !== -1)) {
            overlap++; break;
          }
        }
      }
      if (overlap > 0) score = Math.max(score, 35 + overlap * 20);
    }
    for (i = 0; i < kw.weak.length; i++) {
      if (h === kw.weak[i]) score = Math.max(score, 60);
      if (h.indexOf(kw.weak[i]) !== -1) score = Math.max(score, 30);
    }
    return score;
  }

  // Content-based inference: sample data rows and score how likely a column is each type.
  var CONTENT_PATTERNS = {
    Symbol: function (vals) {
      var matches = vals.filter(function (v) {
        v = String(v).trim();
        // Tickers: all-caps, 1-20 chars, start with a letter, may have numbers/&/./- 
        // Must NOT look like a number, date, or buy/sell keyword
        return /^[A-Z][A-Z0-9&\.\-]{0,19}$/.test(v) && v.length >= 2 && v.length <= 20 &&
               !/^\d+$/.test(v) && !/^(BUY|SELL|B|S)$/.test(v);
      });
      return matches.length / Math.max(vals.length, 1);
    },
    Name: function (vals) {
      var matches = vals.filter(function (v) {
        v = String(v).trim();
        return v.length > 3 && /[a-zA-Z]/.test(v) && !/^\d+[\.,]?\d*$/.test(v) &&
               (/\s/.test(v) || v.length > 10);
      });
      return matches.length / Math.max(vals.length, 1);
    },
    Quantity: function (vals) {
      // Quantity: positive integers (whole numbers), typically smaller than prices
      var matches = vals.filter(function (v) {
        var n = String(v).trim().replace(/[,\s]/g, "");
        if (!/^\d+$/.test(n)) return false;
        var num = Number(n);
        return num > 0 && num === Math.round(num) && num < 100000;
      });
      return matches.length / Math.max(vals.length, 1);
    },
    "Avg Price": function (vals) {
      // Price: positive numbers, can have decimals, typically larger values
      var matches = vals.filter(function (v) {
        var n = String(v).trim().replace(/[,\s\u20B9$]/g, "");
        if (!/^\d+\.?\d*$/.test(n)) return false;
        return Number(n) > 0;
      });
      // Slight boost if values have decimals (more price-like)
      var hasDecimals = vals.filter(function (v) {
        return /\.\d/.test(String(v).trim());
      }).length;
      var base = matches.length / Math.max(vals.length, 1);
      return hasDecimals > 0 ? base + 0.05 : base;
    },
    Market: function (vals) {
      var matches = vals.filter(function (v) {
        v = String(v).trim().toLowerCase();
        return /^(nse|bse|nyse|nasdaq|amex|nfo|cds|mcx|india|us|eq|cm|fo)$/.test(v);
      });
      return matches.length / Math.max(vals.length, 1);
    },
    Date: function (vals) {
      var matches = vals.filter(function (v) {
        v = String(v).trim();
        return /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(v) ||
               /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(v) ||
               /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(v);
      });
      return matches.length / Math.max(vals.length, 1);
    },
    "Trade Type": function (vals) {
      var matches = vals.filter(function (v) {
        v = String(v).trim().toLowerCase();
        return /^(buy|sell|b|s|long|short)$/.test(v);
      });
      return matches.length / Math.max(vals.length, 1);
    }
  };

  function mapColumns(headerRow, dataRows) {
    var norm = headerRow.map(function (h) { return String(h).trim(); });
    var allFields = REQUIRED.concat(OPTIONAL);
    var map = {};
    var used = {}; // track which column indices are already claimed

    // Pass 1: Score every header against every field using fuzzy keyword matching.
    var headerScores = {};
    allFields.forEach(function (field) {
      headerScores[field] = [];
      norm.forEach(function (h, idx) {
        var s = scoreHeader(h, field);
        if (s > 0) headerScores[field].push({ idx: idx, score: s });
      });
      headerScores[field].sort(function (a, b) { return b.score - a.score; });
    });

    // Pass 2: Sample up to 10 data rows for content-based inference.
    var sampleSize = Math.min(dataRows ? dataRows.length : 0, 10);
    var samples = {};
    if (sampleSize > 0) {
      for (var col = 0; col < norm.length; col++) {
        samples[col] = [];
        for (var row = 0; row < sampleSize; row++) {
          var cell = dataRows[row] && dataRows[row][col] != null ? dataRows[row][col] : "";
          samples[col].push(cell);
        }
      }
    }

    // Assign columns greedily: highest confidence first.
    // Priority ordering for tie-breaking when header scores are equal:
    // Date > Symbol > Quantity > Avg Price > Market > Trade Type > Name
    var PRIORITY = { "Date": 7, "Symbol": 6, "Quantity": 5, "Avg Price": 4, "Market": 3, "Trade Type": 2, "Name": 1 };
    var fieldsByConfidence = allFields.slice().sort(function (a, b) {
      var bestA = headerScores[a].length ? headerScores[a][0].score : 0;
      var bestB = headerScores[b].length ? headerScores[b][0].score : 0;
      if (bestA !== bestB) return bestB - bestA;
      return (PRIORITY[b] || 0) - (PRIORITY[a] || 0);
    });

    fieldsByConfidence.forEach(function (field) {
      var candidates = headerScores[field].filter(function (c) { return !used[c.idx]; });

      if (candidates.length > 0 && candidates[0].score >= 30) {
        // If there's a near-tie, use content inference as tiebreaker.
        if (candidates.length > 1 && candidates[0].score - candidates[1].score < 20 &&
            CONTENT_PATTERNS[field] && sampleSize > 0) {
          candidates.forEach(function (c) {
            c.contentScore = CONTENT_PATTERNS[field](samples[c.idx] || []);
          });
          candidates.sort(function (a, b) {
            var diff = b.score - a.score;
            if (Math.abs(diff) < 15) return b.contentScore - a.contentScore;
            return diff;
          });
        }
        map[field] = candidates[0].idx;
        used[candidates[0].idx] = true;
        return;
      }

      // Pass 2 fallback: pure content-based detection for unmapped fields.
      if (CONTENT_PATTERNS[field] && sampleSize > 0) {
        var bestIdx = -1, bestScore = 0.4; // threshold: at least 40% of samples must match
        for (var ci = 0; ci < norm.length; ci++) {
          if (used[ci]) continue;
          var cs = CONTENT_PATTERNS[field](samples[ci] || []);
          if (cs > bestScore) { bestScore = cs; bestIdx = ci; }
        }
        if (bestIdx !== -1) {
          map[field] = bestIdx;
          used[bestIdx] = true;
        }
      }
    });

    // Special disambiguation: if Quantity and Avg Price both need content inference
    // on purely numeric columns, use median value heuristic (higher median = Price).
    if (map["Avg Price"] != null && map["Quantity"] == null && sampleSize > 0) {
      // Avg Price was assigned; look for a remaining integer column for Quantity
      var priceIdx = map["Avg Price"];
      var priceMedian = medianNumeric(samples[priceIdx] || []);
      var bestQtyIdx = -1, bestQtyScore = 0;
      for (var qi = 0; qi < norm.length; qi++) {
        if (used[qi]) continue;
        var qs = CONTENT_PATTERNS["Quantity"](samples[qi] || []);
        if (qs >= 0.4) {
          var qMed = medianNumeric(samples[qi] || []);
          // If this column has smaller median than Price, it's likely Quantity
          if (qMed < priceMedian || bestQtyIdx === -1) {
            bestQtyIdx = qi; bestQtyScore = qs;
          }
        }
      }
      if (bestQtyIdx !== -1) {
        // Check if we should swap: if the "Quantity" column has larger median than "Price" column,
        // swap their assignments
        var qMed2 = medianNumeric(samples[bestQtyIdx] || []);
        if (qMed2 > priceMedian && priceMedian > 0) {
          // Swap: current Price assignment is actually Quantity
          map["Quantity"] = priceIdx;
          map["Avg Price"] = bestQtyIdx;
          used[bestQtyIdx] = true;
        } else {
          map["Quantity"] = bestQtyIdx;
          used[bestQtyIdx] = true;
        }
      }
    }
    // Reverse check: if Quantity assigned but not Price
    if (map["Quantity"] != null && map["Avg Price"] == null && sampleSize > 0) {
      var qtyIdx = map["Quantity"];
      var qtyMed = medianNumeric(samples[qtyIdx] || []);
      var bestPriceIdx = -1;
      for (var pi = 0; pi < norm.length; pi++) {
        if (used[pi]) continue;
        var ps = CONTENT_PATTERNS["Avg Price"](samples[pi] || []);
        if (ps >= 0.4) {
          var pMed = medianNumeric(samples[pi] || []);
          if (pMed > qtyMed || bestPriceIdx === -1) { bestPriceIdx = pi; }
        }
      }
      if (bestPriceIdx !== -1) {
        map["Avg Price"] = bestPriceIdx;
        used[bestPriceIdx] = true;
      }
    }

    var missing = REQUIRED.filter(function (req) { return map[req] == null; });
    return { map: map, missing: missing };
  }

  function medianNumeric(vals) {
    var nums = vals.map(function (v) {
      return Number(String(v).trim().replace(/[,\s\u20B9$]/g, ""));
    }).filter(function (n) { return !isNaN(n) && n > 0; }).sort(function (a, b) { return a - b; });
    if (!nums.length) return 0;
    var mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- CSV parsing (RFC-4180-ish: quotes, escaped quotes, commas) ----------
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, ""); // strip BOM
    var rows = [], row = [], field = "", inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\r") { /* ignore */ }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else { field += ch; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    // drop fully-empty rows
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  function normalizeMarket(raw) {
    var v = String(raw || "").trim().toLowerCase();
    if (/nse|bse|india|^in$|inr|nifty/.test(v)) return "India";
    if (/nyse|nasdaq|^us$|usa|s&p|amex/.test(v)) return "US";
    if (v === "india") return "India";
    if (v === "us") return "US";
    return v ? (v[0].toUpperCase() + v.slice(1)) : "Unknown";
  }
  function currencyForMarket(market) { return market === "India" ? "INR" : "USD"; }

  function toNumber(raw) {
    if (raw == null) return NaN;
    var s = String(raw).replace(/[,\s\u20B9$]/g, "");
    if (s === "") return NaN;
    return Number(s);
  }

  function convert(value, fromCur, baseCur) {
    if (fromCur === baseCur) return value;
    if (fromCur === "INR" && baseCur === "USD") return value / FX_INR_PER_USD;
    if (fromCur === "USD" && baseCur === "INR") return value * FX_INR_PER_USD;
    return value;
  }

  // ---- Core analysis -------------------------------------------------------
  function analyze(rows) {
    if (!rows.length) {
      return { error: "File is empty. Please upload a valid trading history file." };
    }
    var header = rows[0];
    var dataRows = rows.slice(1);
    var mc = mapColumns(header, dataRows);
    if (mc.missing.length) {
      return { error: "Invalid file format. Required columns: " + REQUIRED.join(", ") +
        " (missing: " + mc.missing.join(", ") + ")." };
    }
    var map = mc.map;
    if (!dataRows.length) {
      return { error: "File is empty. Please upload a valid trading history file." };
    }

    // Detect if this is a trade-log (has Trade Type column with BUY/SELL entries).
    var hasTradeType = map["Trade Type"] != null;
    var hasNameCol = map["Name"] != null;
    var hasMarketCol = map["Market"] != null;

    var trades = [], warnings = [];
    dataRows.forEach(function (r, i) {
      var rowNo = i + 2; // 1-based, +1 for header
      var symbol = String(r[map.Symbol] || "").trim().toUpperCase();
      // Strip any suffix like -EQ, -BE (NSE series suffixes)
      symbol = symbol.replace(/[-](EQ|BE|BL|BZ|SM|ST|GS)$/i, "");

      var name = hasNameCol ? String(r[map.Name] || "").trim() : "";
      var qty = toNumber(r[map.Quantity]);
      var price = toNumber(r[map["Avg Price"]]);
      var market = hasMarketCol ? normalizeMarket(r[map.Market]) : "India";
      var dateStr = String(r[map.Date] || "").trim();
      var date = F.parseDate(dateStr);

      // Determine trade type (BUY or SELL)
      var tradeType = "BUY";
      if (hasTradeType) {
        var tt = String(r[map["Trade Type"]] || "").trim().toLowerCase();
        if (/sell|s|short/.test(tt)) tradeType = "SELL";
        else if (/buy|b|long/.test(tt)) tradeType = "BUY";
      }

      if (!symbol) { warnings.push("Row " + rowNo + ": missing Symbol — skipped."); return; }
      if (isNaN(qty) || qty <= 0) { warnings.push("Row " + rowNo + " (" + symbol + "): invalid Quantity — skipped."); return; }
      if (isNaN(price) || price <= 0) { warnings.push("Row " + rowNo + " (" + symbol + "): invalid Price — skipped."); return; }
      if (!date) { warnings.push("Row " + rowNo + " (" + symbol + "): unrecognized Date '" + esc(dateStr) + "' — using today."); date = new Date(); }

      trades.push({
        symbol: symbol, name: name, qty: qty, price: price,
        market: market, date: date, tradeType: tradeType
      });
    });

    if (!trades.length) {
      return { error: "No valid trades/holdings found. Check that Quantity and Price columns are numeric.", warnings: warnings };
    }

    // Aggregate trades into net holdings.
    // If it's a trade log with BUY/SELL, compute weighted average buy price and net quantity.
    // If it's a simple holdings file (no Trade Type column), each row is already a holding.
    var holdingsMap = {}; // symbol -> { qty, totalCost, earliestDate, name, market, trades[] }
    trades.forEach(function (t) {
      if (!holdingsMap[t.symbol]) {
        holdingsMap[t.symbol] = {
          symbol: t.symbol, name: t.name, market: t.market,
          qty: 0, totalCost: 0, earliestDate: t.date,
          trades: []
        };
      }
      var h = holdingsMap[t.symbol];
      if (t.name && !h.name) h.name = t.name;
      if (t.date < h.earliestDate) h.earliestDate = t.date;
      h.trades.push(t);

      if (!hasTradeType || t.tradeType === "BUY") {
        // BUY: add to position
        h.totalCost += t.qty * t.price;
        h.qty += t.qty;
      } else {
        // SELL: reduce position (FIFO-ish — just reduce qty, keep avg cost intact)
        h.qty -= t.qty;
        // Adjust cost proportionally
        if (h.qty > 0 && (h.qty + t.qty) > 0) {
          h.totalCost = h.totalCost * (h.qty / (h.qty + t.qty));
        } else if (h.qty <= 0) {
          h.totalCost = 0;
        }
      }
    });

    // Convert aggregated positions to holdings array (only keep positive positions).
    var holdings = [];
    Object.keys(holdingsMap).forEach(function (sym) {
      var h = holdingsMap[sym];
      if (h.qty <= 0) {
        if (h.qty < 0) warnings.push(sym + ": net position is negative (more sells than buys) — skipped.");
        return; // fully sold or short — skip
      }

      var avgPrice = h.totalCost / h.qty;
      var symbol = h.symbol;
      var market = h.market;
      var currency = currencyForMarket(market);
      var ref = SD.getByTicker(symbol);
      var quote = SD.PriceService.getQuote(symbol);
      var currentPrice, delayed, noQuote = false;
      if (quote) {
        currentPrice = quote.price; delayed = quote.delayed; currency = quote.currency || currency;
      } else {
        currentPrice = avgPrice; delayed = true; noQuote = true;
      }
      var sector = ref ? ref.sector : "Other";
      var name = h.name || (ref ? ref.name : symbol);

      var invested = h.qty * avgPrice;
      var currentValue = h.qty * currentPrice;
      holdings.push({
        symbol: symbol, name: name, market: market, sector: sector,
        currency: currency, qty: h.qty, avgPrice: avgPrice, currentPrice: currentPrice,
        invested: invested, currentValue: currentValue,
        gain: currentValue - invested,
        gainPct: invested > 0 ? (currentValue - invested) / invested : 0,
        date: h.earliestDate, delayed: delayed, noQuote: noQuote,
        asOf: quote ? quote.asOf : null
      });
    });

    if (!holdings.length) {
      return { error: "No net positive holdings found. All positions may have been sold.", warnings: warnings };
    }

    // Base currency = most common holding currency (avoids odd conversions for
    // single-market portfolios; mixed portfolios get converted + flagged).
    var curCount = {};
    holdings.forEach(function (h) { curCount[h.currency] = (curCount[h.currency] || 0) + 1; });
    var baseCurrency = Object.keys(curCount).sort(function (a, b) { return curCount[b] - curCount[a]; })[0];
    var mixedCurrency = Object.keys(curCount).length > 1;

    holdings.forEach(function (h) {
      h.investedBase = convert(h.invested, h.currency, baseCurrency);
      h.currentValueBase = convert(h.currentValue, h.currency, baseCurrency);
      h.gainBase = h.currentValueBase - h.investedBase;
    });

    var totalInvested = sum(holdings, "investedBase");
    var totalCurrent = sum(holdings, "currentValueBase");
    var totalGain = totalCurrent - totalInvested;
    var absReturn = totalInvested > 0 ? totalGain / totalInvested : null;

    // XIRR: each buy is a negative flow at its date; current value is positive today.
    var now = new Date();
    var flows = holdings.map(function (h) { return { amount: -h.investedBase, date: h.date }; });
    flows.push({ amount: totalCurrent, date: now });
    var xirr = F.xirr(flows);

    // CAGR from earliest purchase to today.
    var earliest = holdings.reduce(function (d, h) { return h.date < d ? h.date : d; }, holdings[0].date);
    var years = F.yearsBetween(earliest, now);
    var cagr = years > 0 ? F.cagr(totalInvested, totalCurrent, years) : null;

    // ---- Concentrations ----
    var byStock = groupConc(holdings, totalCurrent, function (h) { return h.symbol; }, function (h) { return h.name; });
    var bySector = groupConc(holdings, totalCurrent, function (h) { return h.sector; });
    var byMarket = groupConc(holdings, totalCurrent, function (h) { return h.market; });

    // Diversification: Herfindahl-Hirschman Index on stock weights (0..1).
    var hhi = byStock.reduce(function (s, g) { return s + Math.pow(g.pct / 100, 2); }, 0);
    var effectiveStocks = hhi > 0 ? 1 / hhi : 0; // "effective number of holdings"
    var divScore = Math.max(0, Math.min(100, Math.round((1 - hhi) * 100)));

    // Underweight sectors (<10%) feed the Discovery complement feature.
    var underweightSectors = {};
    SD.sectors().forEach(function (sec) {
      var g = bySector.filter(function (x) { return x.key === sec; })[0];
      if (!g || g.pct < 10) underweightSectors[sec] = true;
    });
    var ownedTickers = {};
    holdings.forEach(function (h) { ownedTickers[h.symbol] = true; });

    // Long-term (held > 1 year) vs short-term.
    var lt = { count: 0, value: 0 }, st = { count: 0, value: 0 };
    holdings.forEach(function (h) {
      var held = F.yearsBetween(h.date, now);
      if (held >= 1) { lt.count++; lt.value += h.currentValueBase; }
      else { st.count++; st.value += h.currentValueBase; }
    });

    // ---- Insights ----
    var insights = buildInsights(byStock, bySector, divScore, effectiveStocks, lt, st, totalCurrent, holdings);

    // ---- Value-over-time series (cost basis deployed -> current value) ----
    var timeline = buildTimeline(holdings, totalCurrent, now);

    var analysis = {
      holdings: holdings, warnings: warnings,
      baseCurrency: baseCurrency, mixedCurrency: mixedCurrency, fxRate: FX_INR_PER_USD,
      totalInvested: totalInvested, totalCurrent: totalCurrent, totalGain: totalGain,
      absReturn: absReturn, xirr: xirr, cagr: cagr, years: years, earliest: earliest,
      byStock: byStock, bySector: bySector, byMarket: byMarket,
      hhi: hhi, effectiveStocks: effectiveStocks, divScore: divScore,
      underweightSectors: underweightSectors, ownedTickers: ownedTickers,
      longTerm: lt, shortTerm: st, insights: insights, timeline: timeline,
      generatedAt: now
    };
    return analysis;
  }

  function sum(arr, key) { return arr.reduce(function (s, x) { return s + (x[key] || 0); }, 0); }

  function groupConc(holdings, total, keyFn, labelFn) {
    var groups = {};
    holdings.forEach(function (h) {
      var k = keyFn(h);
      if (!groups[k]) groups[k] = { key: k, label: labelFn ? labelFn(h) : k, value: 0 };
      groups[k].value += h.currentValueBase;
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.pct = total > 0 ? (g.value / total) * 100 : 0;
      return g;
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function buildTimeline(holdings, totalCurrent, now) {
    var sorted = holdings.slice().sort(function (a, b) { return a.date - b.date; });
    var cum = 0, pts = [];
    sorted.forEach(function (h) {
      cum += h.investedBase;
      pts.push({ label: fmtDate(h.date), value: round2(cum) });
    });
    pts.push({ label: fmtDate(now) + " (now)", value: round2(totalCurrent) });
    return pts;
  }

  function buildInsights(byStock, bySector, divScore, effStocks, lt, st, total, holdings) {
    var out = [];
    byStock.forEach(function (g) {
      if (g.pct > 20) out.push({ sev: "high", icon: "⚠️",
        text: "Over-concentration: <strong>" + esc(g.key) + "</strong> is " + g.pct.toFixed(1) +
          "% of your portfolio (above the 20% single-stock guideline)." });
    });
    bySector.forEach(function (g) {
      if (g.pct > 40) out.push({ sev: "high", icon: "⚠️",
        text: "Sector imbalance: <strong>" + esc(g.key) + "</strong> is " + g.pct.toFixed(1) +
          "% of your portfolio (above the 40% sector guideline)." });
    });
    if (divScore >= 70) out.push({ sev: "low", icon: "✅",
      text: "Well diversified — effective holdings ≈ " + effStocks.toFixed(1) +
        " (diversification score " + divScore + "/100)." });
    else if (divScore < 45) out.push({ sev: "med", icon: "🟠",
      text: "Limited diversification — effective holdings ≈ " + effStocks.toFixed(1) +
        " (score " + divScore + "/100). Consider spreading across more names/sectors." });

    var ltPct = total > 0 ? (lt.value / total * 100) : 0;
    out.push({ sev: "low", icon: "🕒",
      text: "Holding horizon: " + lt.count + " long-term (>1yr, " + ltPct.toFixed(0) + "% of value) and " +
        st.count + " short-term (≤1yr)." });

    var noQuote = holdings.filter(function (h) { return h.noQuote; });
    if (noQuote.length) out.push({ sev: "med", icon: "ℹ️",
      text: noQuote.length + " holding(s) not in the reference dataset — shown at cost basis with a <em>data delayed</em> flag: " +
        esc(noQuote.map(function (h) { return h.symbol; }).join(", ")) + "." });
    return out;
  }

  // ---- Rendering -----------------------------------------------------------
  function render(container) {
    var analysis = global.PortfolioStore.analysis;
    if (!analysis) { renderUpload(container); return; }
    renderDashboard(container, analysis);
  }

  function renderUpload(container, errorHtml) {
    container.innerHTML =
      '<h1 class="page-title">Portfolio Analysis</h1>' +
      '<p class="page-sub">Upload your trading history (CSV) to analyze performance, risk and diversification. ' +
        'Everything runs locally in your browser — nothing is uploaded anywhere.</p>' +
      (errorHtml || "") +
      '<div class="dropzone" id="dropzone">' +
        '<div style="font-size:34px">📂</div>' +
        '<p><strong>Drop your CSV here</strong> or click to browse</p>' +
        '<p class="muted">Required columns: Symbol, Quantity, Price, Date<br>Optional: Name, Market/Exchange, Trade Type (BUY/SELL)</p>' +
        '<input type="file" id="file-input" accept=".csv,text/csv" style="display:none">' +
      '</div>' +
      '<div class="grid grid-2 section-gap">' +
        '<div class="card"><h3>Supported CSV formats</h3>' +
          '<p class="muted">Works with trade books, contract notes, and holdings exports. Zerodha, Groww, and broker-style aliases supported.</p>' +
          '<div class="table-wrap"><table><thead><tr><th>Symbol</th><th>Trade Date</th><th>Exchange</th><th>Trade Type</th><th>Quantity</th><th>Price</th></tr></thead>' +
          '<tbody><tr><td>INFY</td><td>2023-02-10</td><td>NSE</td><td>buy</td><td>50</td><td>1320</td></tr>' +
          '<tr><td>INFY</td><td>2024-01-15</td><td>NSE</td><td>buy</td><td>30</td><td>1480</td></tr>' +
          '<tr><td>AAPL</td><td>2022-11-05</td><td>NASDAQ</td><td>buy</td><td>10</td><td>150</td></tr></tbody></table></div>' +
          '<p class="muted" style="margin-top:8px">BUY/SELL trades are automatically aggregated into net holdings with weighted average prices.</p></div>' +
        '<div class="card"><h3>No file handy?</h3><p>Load a bundled sample portfolio (mix of US + India holdings) to see the full dashboard.</p>' +
          '<div class="btn-row"><button class="btn btn-primary" id="load-sample">Load sample portfolio</button></div></div>' +
      '</div>';

    var input = container.querySelector("#file-input");
    var dz = container.querySelector("#dropzone");
    dz.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { if (input.files[0]) handleFile(input.files[0], container); });
    ["dragenter", "dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); });
    });
    dz.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) handleFile(f, container);
    });
    var sampleBtn = container.querySelector("#load-sample");
    if (sampleBtn) sampleBtn.addEventListener("click", function () { loadSample(container); });
  }

  function handleFile(file, container) {
    var reader = new FileReader();
    reader.onload = function () { ingest(String(reader.result), file.name, container); };
    reader.onerror = function () {
      renderUpload(container, '<div class="alert alert-error">Could not read the file. Please try again.</div>');
    };
    reader.readAsText(file);
  }

  function ingest(text, fileName, container) {
    var rows = parseCSV(text);
    var analysis = analyze(rows);
    if (analysis.error) {
      var warnHtml = (analysis.warnings && analysis.warnings.length)
        ? '<div class="alert alert-warn">' + analysis.warnings.map(esc).join("<br>") + '</div>' : "";
      renderUpload(container, '<div class="alert alert-error">' + esc(analysis.error) + '</div>' + warnHtml);
      return;
    }
    global.PortfolioStore.analysis = analysis;
    global.PortfolioStore.fileName = fileName || "portfolio.csv";
    if (global.UI) global.UI.refreshNav();
    renderDashboard(container, analysis);
    if (global.UI) global.UI.toast("Portfolio analyzed: " + analysis.holdings.length + " holdings", "ok");
  }

  function loadSample(container) {
    // Try to fetch the bundled file; fall back to an inline sample for file://.
    fetch("sample-portfolio.csv").then(function (r) {
      if (!r.ok) throw new Error("no file");
      return r.text();
    }).then(function (txt) { ingest(txt, "sample-portfolio.csv", container); })
      .catch(function () { ingest(INLINE_SAMPLE, "sample-portfolio.csv", container); });
  }

  var INLINE_SAMPLE =
    "Symbol,Name,Quantity,Avg Price,Market,Date\n" +
    "INFY,Infosys,80,1320,NSE,2022-06-15\n" +
    "HDFCBANK,HDFC Bank,40,1550,NSE,2023-01-20\n" +
    "TATAMOTORS,Tata Motors,120,480,NSE,2022-09-05\n" +
    "TITAN,Titan Company,15,2600,NSE,2023-03-11\n" +
    "RELIANCE,Reliance Industries,30,2400,NSE,2021-12-01\n" +
    "NKE,Nike,25,140,NYSE,2022-04-18\n" +
    "PYPL,PayPal,20,190,NASDAQ,2021-11-30\n" +
    "INTC,Intel,40,52,NASDAQ,2022-08-22\n";

  function renderDashboard(container, a) {
    var base = a.baseCurrency;
    var money = function (v) { return SD.fmtMoney(v, base); };
    var sign = function (v) { return (v >= 0 ? "pos" : "neg"); };

    var fxNote = a.mixedCurrency
      ? '<div class="alert alert-info no-print">Holdings span multiple currencies. Totals and allocations are shown in <strong>' +
        base + '</strong>, converting at ₹' + a.fxRate + ' per $1.</div>' : "";

    var statCards =
      '<div class="grid grid-4">' +
        stat("Invested", money(a.totalInvested)) +
        stat("Current value", money(a.totalCurrent)) +
        stat("Total gain/loss", '<span class="' + sign(a.totalGain) + '">' + money(a.totalGain) + '</span>',
          F.fmtSignedPct(a.absReturn)) +
        stat("Holdings", String(a.holdings.length), a.bySector.length + " sectors · " + a.byMarket.length + " market(s)") +
      '</div>' +
      '<div class="grid grid-4 section-gap">' +
        stat("Absolute return", F.fmtSignedPct(a.absReturn)) +
        stat("XIRR (annualized)", a.xirr == null ? "--" : F.fmtSignedPct(a.xirr)) +
        stat("CAGR", a.cagr == null ? "--" : F.fmtSignedPct(a.cagr), a.years > 0 ? "over " + a.years.toFixed(1) + " yrs" : "") +
        stat("Diversification", a.divScore + "/100", "~" + a.effectiveStocks.toFixed(1) + " effective holdings") +
      '</div>';

    var insightsHtml = a.insights.length
      ? '<ul class="insight-list">' + a.insights.map(function (ins) {
          return '<li class="sev-' + ins.sev + '"><span class="ic">' + ins.icon + '</span><span>' + ins.text + '</span></li>';
        }).join("") + '</ul>'
      : '<p class="muted">No notable risk flags. Portfolio looks balanced.</p>';

    var perfData = a.byStock.map(function (g) {
      var h = a.holdings.filter(function (x) { return x.symbol === g.key; })[0];
      return { label: g.key, value: round2(h ? h.gainBase : 0) };
    });

    var html =
      '<div class="row-between"><div><h1 class="page-title">Portfolio Analysis</h1>' +
        '<p class="page-sub">' + esc(global.PortfolioStore.fileName || "") + ' · analyzed ' +
        fmtDateTime(a.generatedAt) + '</p></div>' +
        '<div class="btn-row no-print">' +
          '<button class="btn" id="btn-report-pdf">⬇ PDF report</button>' +
          '<button class="btn" id="btn-report-xls">⬇ Excel (CSV)</button>' +
          '<button class="btn btn-ghost" id="btn-reupload">Upload different file</button>' +
        '</div></div>' +
      fxNote +
      (a.warnings && a.warnings.length
        ? '<div class="alert alert-warn no-print"><strong>' + a.warnings.length + ' row warning(s):</strong><br>' +
          a.warnings.map(esc).join("<br>") + '</div>' : "") +
      statCards +
      '<h2 class="card-section-title">Insights</h2>' + insightsHtml +
      '<div class="grid grid-2 section-gap">' +
        '<div class="card"><h3>Sector allocation</h3>' +
          C.pie(a.bySector.map(function (g) { return { label: g.key, value: g.value }; }), { donut: true, centerLabel: a.bySector.length + "", centerSub: "sectors" }) +
        '</div>' +
        '<div class="card"><h3>Performance by holding (' + base + ')</h3>' +
          C.bar(perfData, { colorBySign: true, valuePrefix: base === "INR" ? "₹" : "$" }) +
        '</div>' +
      '</div>' +
      '<div class="card section-gap"><h3>Capital deployed → current value (' + base + ')</h3>' +
        '<p class="muted" style="margin-top:-4px">Cumulative cost basis at each purchase date, ending at today\'s market value. ' +
          '(Historical daily prices aren\'t bundled offline.)</p>' +
        C.line(a.timeline, { valuePrefix: base === "INR" ? "₹" : "$" }) +
      '</div>' +
      renderConcentrationTables(a) +
      renderHoldingsTable(a) +
      '<div class="card section-gap no-print"><h3>Find complementary opportunities</h3>' +
        '<p>Based on your sector allocation, the Discovery tool can highlight discounted stocks in sectors where you are underweight (and hide ones you already own).</p>' +
        '<a class="btn btn-primary" href="#/discovery">Open Stock Discovery →</a></div>';

    container.innerHTML = html;
    wireDashboard(container);
  }

  function renderConcentrationTables(a) {
    function tbl(title, groups, isStock) {
      var rows = groups.map(function (g) {
        var flag = "";
        if (isStock && g.pct > 20) flag = ' <span class="pill pill-red">>20%</span>';
        if (!isStock && g.pct > 40) flag = ' <span class="pill pill-red">>40%</span>';
        return '<tr><td>' + esc(g.label || g.key) + flag + '</td>' +
          '<td class="num">' + SD.fmtMoney(g.value, a.baseCurrency) + '</td>' +
          '<td class="num">' + g.pct.toFixed(1) + '%</td></tr>';
      }).join("");
      return '<div class="card"><h3>' + title + '</h3><div class="table-wrap"><table>' +
        '<thead><tr><th>' + (isStock ? "Stock" : title.replace("By ", "")) + '</th><th class="num">Value</th><th class="num">Weight</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
    }
    return '<h2 class="card-section-title">Concentration &amp; risk exposure</h2>' +
      '<div class="grid grid-3">' +
        tbl("By stock", a.byStock, true) +
        tbl("By sector", a.bySector, false) +
        tbl("By market", a.byMarket, false) +
      '</div>';
  }

  function renderHoldingsTable(a) {
    var rows = a.holdings.map(function (h) {
      var delayBadge = h.delayed ? ' <span class="chip" title="Reference / delayed price' +
        (h.asOf ? " as of " + h.asOf : "") + '">⏱ delayed</span>' : '';
      return '<tr>' +
        '<td><strong>' + esc(h.symbol) + '</strong><div class="muted">' + esc(h.name) + '</div></td>' +
        '<td><span class="chip">' + esc(h.market) + '</span></td>' +
        '<td>' + esc(h.sector) + '</td>' +
        '<td class="num">' + F.fmtNum(h.qty, h.qty % 1 ? 2 : 0) + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.avgPrice, h.currency) + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.currentPrice, h.currency) + delayBadge + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.invested, h.currency) + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.currentValue, h.currency) + '</td>' +
        '<td class="num ' + (h.gain >= 0 ? "pos" : "neg") + '">' + SD.fmtMoney(h.gain, h.currency) +
          '<div class="muted">' + F.fmtSignedPct(h.gainPct) + '</div></td>' +
        '</tr>';
    }).join("");
    return '<h2 class="card-section-title">Holdings</h2><div class="table-wrap"><table>' +
      '<thead><tr><th>Stock</th><th>Market</th><th>Sector</th><th class="num">Qty</th>' +
      '<th class="num">Avg price</th><th class="num">Cur price</th><th class="num">Invested</th>' +
      '<th class="num">Cur value</th><th class="num">Gain/Loss</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function wireDashboard(container) {
    var reup = container.querySelector("#btn-reupload");
    if (reup) reup.addEventListener("click", function () {
      global.PortfolioStore.analysis = null;
      if (global.UI) global.UI.refreshNav();
      renderUpload(container);
    });
    var pdf = container.querySelector("#btn-report-pdf");
    if (pdf) pdf.addEventListener("click", function () { global.Report.portfolioPDF(global.PortfolioStore.analysis); });
    var xls = container.querySelector("#btn-report-xls");
    if (xls) xls.addEventListener("click", function () { global.Report.portfolioExcel(global.PortfolioStore.analysis); });
  }

  // ---- small utils ----
  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtDateTime(d) { return fmtDate(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  global.Portfolio = {
    render: render,
    analyze: analyze,
    parseCSV: parseCSV,
    mapColumns: mapColumns,
    INLINE_SAMPLE: INLINE_SAMPLE
  };
})(window);
