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

  // Get FX rate dynamically from PriceService (falls back to 83 if unavailable)
  function getFxRate() {
    return SD.PriceService.getFxRate ? SD.PriceService.getFxRate() : 83;
  }

  // Shared store other modules read from.
  global.PortfolioStore = global.PortfolioStore || { analysis: null, fileName: null };

  // Only Symbol, Quantity, Price and Date are truly required.
  // Name is optional (falls back to ticker). Market is optional (defaults to India).
  // Trade Type is optional — if present, BUY/SELL trades are aggregated into net holdings.
  var REQUIRED = ["Symbol", "Quantity", "Avg Price", "Date"];
  var OPTIONAL = ["Name", "Market", "Trade Type"];

  // ---- Ticker alias map (SAFE renames only) ----------------------------------
  // ONLY pure 1:1 renames where the ticker changed but it's the SAME security
  // at the SAME unit price. We deliberately do NOT alias:
  //   - ETF variants (UTINEXT50 ≈ ₹65 vs JUNIORBEES ≈ ₹750 — different NAVs!)
  //   - Mergers needing share-ratio conversion (HDFC → HDFCBANK at ~1.68x)
  // Those are fetched with their own tickers instead, to avoid skewing values.
  var TICKER_ALIASES = {
    "ZOMATO": "ETERNAL"          // Zomato renamed to Eternal (2025), 1:1 same price
  };

  // Tickers that need a merger share-ratio adjustment (oldQty * ratio = newQty).
  // Applied during aggregation so quantity and value stay correct.
  var MERGER_RATIOS = {
    // HDFC merged into HDFCBANK (Jul 2023): 42 HDFCBANK shares per 25 HDFC
    "HDFC": { newTicker: "HDFCBANK", ratio: 42 / 25, priceRatio: 25 / 42 }
  };

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

  // ---- ISIN detection + rename merging --------------------------------------
  // Indian ISINs encode the security type in characters 8-9 (0-indexed 7-8):
  // "01" = equity shares. Debt instruments (debentures, bonds, commercial paper)
  // use 07/08/09 and trade at ~₹1,00,000/unit, which badly skews an equity
  // portfolio. ETFs/mutual funds use an "INF" prefix and are never flagged here.
  function isNonEquityIsin(isin) {
    if (!isin) return false;
    return /^INE.{4}(0[7-9])/.test(isin);
  }

  // Detects an ISIN column (by header name or 12-char content pattern) and uses
  // it to unify holdings whose ticker symbol changed over time but whose ISIN
  // (the security's permanent identifier) stayed the same.
  function detectIsinColumn(header, dataRows) {
    // 1) Header explicitly named "isin".
    for (var i = 0; i < header.length; i++) {
      if (/isin/i.test(String(header[i]))) return i;
    }
    // 2) Content pattern: 2 letters + 9 alphanumerics + 1 check digit (e.g. INE758T01015).
    var sample = Math.min(dataRows.length, 10);
    if (!sample) return -1;
    for (var c = 0; c < header.length; c++) {
      var hits = 0;
      for (var r = 0; r < sample; r++) {
        var v = dataRows[r] && dataRows[r][c] != null ? String(dataRows[r][c]).trim().toUpperCase() : "";
        if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v)) hits++;
      }
      if (hits >= Math.ceil(sample * 0.6)) return c;
    }
    return -1;
  }

  // When one ISIN maps to several ticker symbols (a rename), pick a single
  // canonical symbol — preferring one that has a live price, then the most
  // recently traded — and rewrite every trade for that ISIN to use it. This
  // keeps the position whole (correct quantity) and priced.
  function canonicalizeByIsin(trades, warnings) {
    var byIsin = {};
    trades.forEach(function (t) {
      if (!t.isin) return;
      if (!byIsin[t.isin]) byIsin[t.isin] = {};
      var g = byIsin[t.isin];
      if (!g[t.symbol]) {
        g[t.symbol] = { symbol: t.symbol, latest: t.date, priced: !!SD.PriceService.getQuote(t.symbol) };
      } else if (t.date > g[t.symbol].latest) {
        g[t.symbol].latest = t.date;
      }
    });
    var canon = {}; // isin -> chosen symbol
    Object.keys(byIsin).forEach(function (isin) {
      var syms = Object.keys(byIsin[isin]).map(function (k) { return byIsin[isin][k]; });
      if (syms.length < 2) return; // no rename — nothing to merge
      syms.sort(function (a, b) {
        if (a.priced !== b.priced) return a.priced ? -1 : 1; // priced symbol wins
        return b.latest - a.latest;                          // else most recent
      });
      canon[isin] = syms[0].symbol;
    });
    trades.forEach(function (t) {
      if (t.isin && canon[t.isin] && t.symbol !== canon[t.isin]) {
        t.symbol = canon[t.isin];
      }
    });
    // Note which renames were merged, for transparency.
    Object.keys(canon).forEach(function (isin) {
      var others = Object.keys(byIsin[isin]).filter(function (s) { return s !== canon[isin]; });
      if (others.length && warnings) {
        warnings.push("Merged renamed ticker(s) " + others.join(", ") + " into " +
          canon[isin] + " (same ISIN " + isin + ").");
      }
    });
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
    var fxRate = getFxRate();
    if (fromCur === "INR" && baseCur === "USD") return value / fxRate;
    if (fromCur === "USD" && baseCur === "INR") return value * fxRate;
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

    // Detect an ISIN column. Used to merge holdings whose ticker was renamed
    // (same ISIN, new symbol) — e.g. SILVERETF -> SILVERBETA, UTINEXT50 -> NEXT50BETA.
    var isinCol = detectIsinColumn(header, dataRows);

    var trades = [], warnings = [];
    dataRows.forEach(function (r, i) {
      var rowNo = i + 2; // 1-based, +1 for header
      var symbol = String(r[map.Symbol] || "").trim().toUpperCase();
      // Strip any suffix like -EQ, -BE (NSE series suffixes)
      symbol = symbol.replace(/[-](EQ|BE|BL|BZ|SM|ST|GS)$/i, "");
      // Apply ticker aliases (pure 1:1 renames only)
      symbol = TICKER_ALIASES[symbol] || symbol;

      var isin = isinCol >= 0 ? String(r[isinCol] || "").trim().toUpperCase() : "";
      var name = hasNameCol ? String(r[map.Name] || "").trim() : "";
      var qty = toNumber(r[map.Quantity]);
      var price = toNumber(r[map["Avg Price"]]);
      var market = hasMarketCol ? normalizeMarket(r[map.Market]) : "India";
      var dateStr = String(r[map.Date] || "").trim();
      var date = F.parseDate(dateStr);

      // Flag non-equity instruments (bonds, debentures, commercial paper) by
      // their ISIN security-type code. They are INCLUDED in the portfolio for a
      // complete view and priced at current market value where a quote exists;
      // we only tag them so they can be grouped under a "Bonds / Debt" sector.
      var isBond = isNonEquityIsin(isin);

      // Apply merger share-ratio conversion (e.g. HDFC → HDFCBANK at ~1.68x).
      // Scale quantity up by ratio, price down inversely, so cost basis is preserved.
      if (MERGER_RATIOS[symbol] && !isNaN(qty) && !isNaN(price)) {
        var mr = MERGER_RATIOS[symbol];
        qty = qty * mr.ratio;
        price = price * mr.priceRatio;
        symbol = mr.newTicker;
      }
      // Note: non-equity instruments (SGBs, bonds) are NO LONGER skipped — they
      // are included in the total portfolio at cost basis if no live price exists.

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
        market: market, date: date, tradeType: tradeType, isin: isin, isBond: isBond
      });
    });

    if (!trades.length) {
      return { error: "No valid trades/holdings found. Check that Quantity and Price columns are numeric.", warnings: warnings };
    }

    // Merge renamed tickers via ISIN before aggregation.
    canonicalizeByIsin(trades, warnings);

    // Aggregate trades into net holdings.
    // If it's a trade log with BUY/SELL, compute weighted average buy price and net quantity.
    // If it's a simple holdings file (no Trade Type column), each row is already a holding.
    var holdingsMap = {}; // symbol -> { qty, totalCost, earliestDate, name, market, trades[] }
    trades.forEach(function (t) {
      if (!holdingsMap[t.symbol]) {
        holdingsMap[t.symbol] = {
          symbol: t.symbol, name: t.name, market: t.market,
          qty: 0, totalCost: 0, earliestDate: t.date,
          totalBought: 0, totalBoughtCost: 0,
          totalSold: 0, totalSellProceeds: 0,
          latestSellDate: null,  // Track the most recent sell date
          sellTrades: [],        // Track individual sell trades for accurate XIRR
          isBond: t.isBond,      // non-equity (bond / debenture / CP) flag
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
        h.totalBought += t.qty;
        h.totalBoughtCost += t.qty * t.price;
      } else {
        // SELL: reduce position, track realized proceeds
        h.qty -= t.qty;
        h.totalSold += t.qty;
        h.totalSellProceeds += t.qty * t.price;
        // Track this sell trade for accurate XIRR
        h.sellTrades.push({ qty: t.qty, price: t.price, date: t.date });
        // Track latest sell date
        if (!h.latestSellDate || t.date > h.latestSellDate) {
          h.latestSellDate = t.date;
        }
        // Adjust cost proportionally
        if (h.qty > 0 && (h.qty + t.qty) > 0) {
          h.totalCost = h.totalCost * (h.qty / (h.qty + t.qty));
        } else if (h.qty <= 0) {
          h.totalCost = 0;
        }
      }
    });

    // Convert aggregated positions to holdings array.
    // Include fully-sold positions (qty <= 0) with realized P&L.
    var holdings = [];
    var soldPositions = [];
    Object.keys(holdingsMap).forEach(function (sym) {
      var h = holdingsMap[sym];
      var symbol = h.symbol;
      var market = h.market;
      var currency = currencyForMarket(market);
      var ref = SD.getByTicker(symbol);
      var sector = h.isBond ? "Bonds / Debt" : (ref ? ref.sector : "Other");
      var name = h.name || (ref ? ref.name : symbol);

      if (h.qty <= 0) {
        // Fully sold (or over-sold) position — show realized P&L
        var avgBuyPrice = h.totalBought > 0 ? h.totalBoughtCost / h.totalBought : 0;
        var avgSellPrice = h.totalSold > 0 ? h.totalSellProceeds / h.totalSold : 0;
        var realizedGain = h.totalSellProceeds - h.totalBoughtCost;
        var realizedPct = h.totalBoughtCost > 0 ? realizedGain / h.totalBoughtCost : 0;

        soldPositions.push({
          symbol: symbol, name: name, market: market, sector: sector,
          currency: currency, qty: 0, avgPrice: avgBuyPrice,
          currentPrice: avgSellPrice,
          invested: h.totalBoughtCost, currentValue: h.totalSellProceeds,
          gain: realizedGain, gainPct: realizedPct,
          date: h.earliestDate, delayed: false, noQuote: false,
          asOf: null, status: "sold", isBond: !!h.isBond,
          qtyBought: h.totalBought, qtySold: h.totalSold,
          sellDate: h.latestSellDate || h.earliestDate,  // Actual sell date for XIRR
          sellTrades: h.sellTrades || [],                // Individual sell trades for accurate XIRR
          trades: h.trades || [],                        // All trades for the per-stock detail view
          xirr: perStockXirr(h.trades || [], null)       // Per-stock realized XIRR
        });
        return;
      }

      var avgPrice = h.totalCost / h.qty;
      var quote = SD.PriceService.getQuote(symbol);
      var currentPrice, delayed, noQuote = false;
      if (quote) {
        currentPrice = quote.price; delayed = quote.delayed; currency = quote.currency || currency;
      } else {
        currentPrice = avgPrice; delayed = true; noQuote = true;
      }

      var invested = h.qty * avgPrice;
      var currentValue = h.qty * currentPrice;
      holdings.push({
        symbol: symbol, name: name, market: market, sector: sector,
        currency: currency, qty: h.qty, avgPrice: avgPrice, currentPrice: currentPrice,
        invested: invested, currentValue: currentValue,
        gain: currentValue - invested,
        gainPct: invested > 0 ? (currentValue - invested) / invested : 0,
        date: h.earliestDate, delayed: delayed, noQuote: noQuote,
        asOf: quote ? quote.asOf : null, status: "active", isBond: !!h.isBond,
        qtyBought: h.totalBought, qtySold: h.totalSold,
        realizedGain: h.totalSellProceeds - (h.totalSold * avgPrice),
        trades: h.trades || [],                              // All trades for the per-stock detail view
        xirr: perStockXirr(h.trades || [], currentValue)     // Per-stock money-weighted return
      });
    });

    if (!holdings.length && !soldPositions.length) {
      return { error: "No holdings or trades found in the file.", warnings: warnings };
    }

    // Base currency = most common holding currency (avoids odd conversions for
    // single-market portfolios; mixed portfolios get converted + flagged).
    var curCount = {};
    holdings.forEach(function (h) { curCount[h.currency] = (curCount[h.currency] || 0) + 1; });
    soldPositions.forEach(function (h) { curCount[h.currency] = (curCount[h.currency] || 0) + 1; });
    var baseCurrency = Object.keys(curCount).sort(function (a, b) { return curCount[b] - curCount[a]; })[0] || "INR";
    var mixedCurrency = Object.keys(curCount).length > 1;

    holdings.forEach(function (h) {
      h.investedBase = convert(h.invested, h.currency, baseCurrency);
      h.currentValueBase = convert(h.currentValue, h.currency, baseCurrency);
      h.gainBase = h.currentValueBase - h.investedBase;
    });
    soldPositions.forEach(function (h) {
      h.investedBase = convert(h.invested, h.currency, baseCurrency);
      h.currentValueBase = convert(h.currentValue, h.currency, baseCurrency);
      h.gainBase = h.currentValueBase - h.investedBase;
    });

    var totalInvested = sum(holdings, "investedBase");
    var totalCurrent = sum(holdings, "currentValueBase");
    var totalGain = totalCurrent - totalInvested;
    var absReturn = totalInvested > 0 ? totalGain / totalInvested : null;

    // XIRR: use actual trade-level cash flows for accuracy.
    // Each BUY = negative cash flow (money going out)
    // Each SELL = positive cash flow (money coming in)
    // Current portfolio value = positive cash flow today
    var now = new Date();
    var flows = [];

    if (hasTradeType) {
      // Trade log with BUY/SELL — use actual trade flows
      Object.keys(holdingsMap).forEach(function (sym) {
        var h = holdingsMap[sym];
        var currency = currencyForMarket(h.market);
        h.trades.forEach(function (t) {
          var amount = convert(t.qty * t.price, currency, baseCurrency);
          if (t.tradeType === "BUY") {
            flows.push({ amount: -amount, date: t.date }); // buy = money out
          } else {
            flows.push({ amount: amount, date: t.date });  // sell = money in
          }
        });
      });
    } else {
      // Simple holdings file (no trade type) — each row is a buy
      holdings.forEach(function (h) {
        flows.push({ amount: -h.investedBase, date: h.date });
      });
    }

    // Add current value of active holdings as a final positive flow
    if (totalCurrent > 0) {
      flows.push({ amount: totalCurrent, date: now });
    }

    // XIRR needs at least one negative and one positive flow
    var hasNeg = flows.some(function (f) { return f.amount < 0; });
    var hasPos = flows.some(function (f) { return f.amount > 0; });
    var xirr = (flows.length >= 2 && hasNeg && hasPos) ? F.xirr(flows) : null;

    // Fallback: if trade-level XIRR fails, use a simple 2-flow approximation
    // (total invested at the earliest date, total current value today).
    if (xirr == null && totalInvested > 0 && totalCurrent > 0) {
      var earliestBuy = holdings.concat(soldPositions).reduce(function (d, h) {
        return h.date < d ? h.date : d;
      }, (holdings[0] || soldPositions[0]).date);
      if (earliestBuy.getTime() < now.getTime()) {
        xirr = F.xirr([
          { amount: -totalInvested, date: earliestBuy },
          { amount: totalCurrent, date: now }
        ]);
      }
    }

    // CAGR from earliest purchase to today.
    var allPositions = holdings.concat(soldPositions);
    var earliest = allPositions.length > 0
      ? allPositions.reduce(function (d, h) { return h.date < d ? h.date : d; }, allPositions[0].date)
      : now;
    var years = F.yearsBetween(earliest, now);
    var totalRealizedGain = soldPositions.reduce(function (s, h) { return s + h.gainBase; }, 0);
    var cagr = years > 0 && totalInvested > 0 ? F.cagr(totalInvested, totalCurrent + totalRealizedGain, years) : null;

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

    // ---- Benchmark comparison (money-weighted, same cash flows into each index) ----
    var benchmarks = computeBenchmarks(holdingsMap, hasTradeType, baseCurrency, now);
    // Primary benchmark (for the headline verdict): prefer Nifty 50, else first.
    var benchmark = null;
    if (benchmarks && benchmarks.length) {
      benchmark = benchmarks.filter(function (b) { return b.key === "NIFTY50"; })[0] || benchmarks[0];
    }

    var analysis = {
      holdings: holdings, soldPositions: soldPositions, warnings: warnings,
      baseCurrency: baseCurrency, mixedCurrency: mixedCurrency, fxRate: getFxRate(),
      totalInvested: totalInvested, totalCurrent: totalCurrent, totalGain: totalGain,
      totalRealizedGain: totalRealizedGain,
      absReturn: absReturn, xirr: xirr, cagr: cagr, years: years, earliest: earliest,
      byStock: byStock, bySector: bySector, byMarket: byMarket,
      hhi: hhi, effectiveStocks: effectiveStocks, divScore: divScore,
      underweightSectors: underweightSectors, ownedTickers: ownedTickers,
      longTerm: lt, shortTerm: st, insights: insights, timeline: timeline,
      benchmark: benchmark, benchmarks: benchmarks,
      generatedAt: now
    };
    return analysis;
  }

  function sum(arr, key) { return arr.reduce(function (s, x) { return s + (x[key] || 0); }, 0); }

  // Per-stock money-weighted return (XIRR) from that stock's own trades.
  // currentValueNative = remaining position value today (native currency); pass
  // null/0 for fully-sold positions. Buys are cash out (-), sells cash in (+).
  function perStockXirr(trades, currentValueNative) {
    var flows = trades.map(function (t) {
      var amt = t.qty * t.price;
      return { amount: t.tradeType === "SELL" ? amt : -amt, date: t.date };
    });
    if (currentValueNative != null && currentValueNative > 0) {
      flows.push({ amount: currentValueNative, date: new Date() });
    }
    return flows.length >= 2 ? F.xirr(flows) : null;
  }

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
      pts.push({ label: fmtDateShort(h.date), value: round2(cum) });
    });
    pts.push({ label: fmtDateShort(now) + " (now)", value: round2(totalCurrent) });
    return pts;
  }

  // ---- Benchmark comparison --------------------------------------------------
  // Simulates investing the SAME cash flows (buys/sells) into the matching index
  // (Nifty 50 for India holdings, S&P 500 for US), then computes the index's
  // money-weighted return (XIRR) and terminal value for an apples-to-apples
  // comparison. The growth multiple is unitless so currency conversion isn't
  // needed for the ratio.
  function indexCloseAt(series, date) {
    if (!series || !series.length) return null;
    var t = date.getTime();
    var chosen = series[0];
    for (var i = 0; i < series.length; i++) {
      var pt = series[i];
      var ptt = new Date(pt.d).getTime();
      if (ptt <= t) chosen = pt;
      else break;
    }
    return chosen ? chosen.c : null;
  }

  // Conversion factor to translate a return earned in `indexCur` back into
  // `baseCur`, given the trade date — using the historical INR-per-USD series.
  // Returns 1 when currencies match or no FX data is available.
  function fxConvFactor(indexCur, baseCur, fxSeries, date) {
    if (indexCur === baseCur || !fxSeries || !fxSeries.length) return 1;
    var fxToday = fxSeries[fxSeries.length - 1].c;
    var fxThen = indexCloseAt(fxSeries, date); // INR per USD at the trade date
    if (!fxThen || !fxToday) return 1;
    // fxSeries is denominated as INR per 1 USD.
    if (indexCur === "USD" && baseCur === "INR") return fxToday / fxThen;
    if (indexCur === "INR" && baseCur === "USD") return fxThen / fxToday;
    return 1; // unsupported currency pair — leave unadjusted
  }

  // Mirror ALL of the portfolio's cash flows (buys/sells, converted to base
  // currency) into ONE index series and return its money-weighted XIRR — i.e.
  // "what if I'd invested the exact same amounts on the same dates into this
  // index instead?". For a cross-currency index (e.g. S&P 500 for an INR
  // investor) the growth is also adjusted by the USD/INR move over the holding
  // period, so the comparison is honest in the base currency.
  function computeIndexXirr(holdingsMap, hasTradeType, baseCurrency, series, now, indexCur, fxSeries) {
    if (!series || !series.length) return null;
    var latest = series[series.length - 1].c;
    if (!latest) return null;
    var flows = [], terminal = 0, totalBuys = 0, matched = false;
    var fxAdjusted = (indexCur && indexCur !== baseCurrency && fxSeries && fxSeries.length);

    Object.keys(holdingsMap).forEach(function (sym) {
      var h = holdingsMap[sym];
      h.trades.forEach(function (t) {
        var amountBase = convert(t.qty * t.price, currencyForMarket(h.market), baseCurrency);
        var closeAt = indexCloseAt(series, t.date);
        if (!closeAt) return;
        var growth = (latest / closeAt) * fxConvFactor(indexCur, baseCurrency, fxSeries, t.date);
        matched = true;
        if (!hasTradeType || t.tradeType === "BUY") {
          flows.push({ amount: -amountBase, date: t.date });
          terminal += amountBase * growth;
          totalBuys += amountBase;
        } else {
          flows.push({ amount: amountBase, date: t.date });
          terminal -= amountBase * growth;
        }
      });
    });

    if (!matched || totalBuys <= 0) return null;
    if (terminal > 0) flows.push({ amount: terminal, date: now });
    return {
      xirr: F.xirr(flows),
      terminalValue: round2(terminal),
      invested: round2(totalBuys),
      fxAdjusted: !!fxAdjusted
    };
  }

  // Built-in display labels + preferred ordering for known indices. Any index
  // present in prices.json's `benchmarks` is shown; unknown keys fall back to
  // their raw name. The updater (scripts/update_prices.py) also stamps a label.
  var BENCH_LABELS = {
    NIFTY50: "Nifty 50",
    NIFTYNEXT50: "Nifty Next 50",
    NIFTYMIDCAP150: "Nifty Midcap 150",
    NIFTYSMALLCAP250: "Nifty Smallcap 250",
    SP500: "S&P 500"
  };
  var BENCH_ORDER = ["NIFTY50", "NIFTYNEXT50", "NIFTYMIDCAP150", "NIFTYSMALLCAP250", "SP500"];

  // Compute the XIRR your exact cash-flow schedule would have earned in EACH
  // available index. Returns an array (one entry per index) for side-by-side
  // comparison, ordered with the broad-market indices first.
  function computeBenchmarks(holdingsMap, hasTradeType, baseCurrency, now) {
    var all = SD.PriceService.getBenchmarks ? SD.PriceService.getBenchmarks() : null;
    if (!all) {
      // Legacy fallback: only the two original series via getBenchmark.
      all = {};
      var n = SD.PriceService.getBenchmark ? SD.PriceService.getBenchmark("NIFTY50") : null;
      var s = SD.PriceService.getBenchmark ? SD.PriceService.getBenchmark("SP500") : null;
      if (n) all.NIFTY50 = n;
      if (s) all.SP500 = s;
    }
    var keys = Object.keys(all);
    if (!keys.length) return null;

    var fxSeries = SD.PriceService.getFxSeries ? SD.PriceService.getFxSeries() : null;

    var results = [];
    keys.forEach(function (name) {
      var bench = all[name];
      if (!bench || !bench.series || !bench.series.length) return;
      var r = computeIndexXirr(holdingsMap, hasTradeType, baseCurrency, bench.series, now,
        bench.currency, fxSeries);
      if (!r || r.xirr == null) return;
      results.push({
        key: name,
        label: bench.label || BENCH_LABELS[name] || name,
        xirr: r.xirr,
        terminalValue: r.terminalValue,
        invested: r.invested,
        fxAdjusted: r.fxAdjusted
      });
    });
    if (!results.length) return null;

    results.sort(function (a, b) {
      var ia = BENCH_ORDER.indexOf(a.key); if (ia < 0) ia = 99;
      var ib = BENCH_ORDER.indexOf(b.key); if (ib < 0) ib = 99;
      return ia - ib;
    });
    return results;
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
    // Wait for prices.json to load before analyzing (ensures XIRR uses fresh prices).
    var priceReady = SD.PriceService.refreshAll ? SD.PriceService.refreshAll() : Promise.resolve(false);
    priceReady.then(function () {
      var rows = parseCSV(text);
      var analysis = analyze(rows);
      if (analysis.error) {
        var warnHtml = (analysis.warnings && analysis.warnings.length)
          ? '<div class="alert alert-warn">' + analysis.warnings.map(esc).join("<br>") + '</div>' : "";
        renderUpload(container, '<div class="alert alert-error">' + esc(analysis.error) + '</div>' + warnHtml);
        return;
      }

      // Check for holdings with no price data (noQuote = true means using cost basis)
      var unknownTickers = analysis.holdings
        .filter(function (h) { return h.noQuote; })
        .map(function (h) { return h.symbol; });

      if (unknownTickers.length > 0 && SD.PriceService.fetchOnDemand) {
        // Show loading state with the initial analysis
        global.PortfolioStore.analysis = analysis;
        global.PortfolioStore.fileName = fileName || "portfolio.csv";
        renderDashboard(container, analysis);

        // Show fetching notification
        var banner = document.createElement("div");
        banner.className = "alert alert-info";
        banner.id = "fetch-banner";
        banner.innerHTML = '<strong>⏳ Fetching live prices</strong> for ' + unknownTickers.length +
          ' stock(s) not in our database: ' + esc(unknownTickers.join(", ")) +
          '<br><span class="muted">This may take a few seconds...</span>';
        container.insertBefore(banner, container.firstChild.nextSibling);

        // Fetch on-demand prices
        SD.PriceService.fetchOnDemand(unknownTickers).then(function (result) {
          var fetchedCount = Object.keys(result.fetched).length;
          var failedList = result.failed;

          // Remove the loading banner
          var existingBanner = container.querySelector("#fetch-banner");
          if (existingBanner) existingBanner.remove();

          if (fetchedCount > 0) {
            // Re-analyze with the newly fetched prices
            var newAnalysis = analyze(rows);
            if (!newAnalysis.error) {
              analysis = newAnalysis;
              global.PortfolioStore.analysis = analysis;
              renderDashboard(container, analysis);
              if (global.UI) global.UI.toast("Fetched live prices for " + fetchedCount + " additional stock(s)", "ok");
            }
          }

          if (failedList.length > 0) {
            // Show which stocks couldn't be priced
            var failBanner = document.createElement("div");
            failBanner.className = "alert alert-warn";
            failBanner.innerHTML = '<strong>' + failedList.length + ' stock(s) could not be priced live:</strong> ' +
              esc(failedList.join(", ")) +
              '<br><span class="muted">These are shown at cost basis (Avg Price = Cur Price), so gain/loss shows as 0%.</span>' +
              '<br><br><strong>To fix:</strong> Run the price updater with these tickers added — ' +
              '<a href="https://github.com/soulfernweh/portfolio-analyser/actions/workflows/update-prices.yml" target="_blank">' +
              'Go to Actions → Update Stock Prices → Run workflow</a> and paste this into "extra_tickers":<br>' +
              '<code class="inline" style="word-break:break-all;display:block;margin-top:6px;padding:8px">' +
              esc(failedList.map(function(t) { return t + ".NS"; }).join(",")) + '</code>' +
              '<br><span class="muted">After the workflow runs (~3 min), refresh this page and re-upload. ' +
              'The prices will be pre-loaded.</span>';
            var dashHead = container.querySelector(".row-between");
            if (dashHead && dashHead.nextSibling) {
              container.insertBefore(failBanner, dashHead.nextSibling);
            } else {
              container.insertBefore(failBanner, container.firstChild);
            }
          }
        });
      } else {
        // All prices available — render directly
        global.PortfolioStore.analysis = analysis;
        global.PortfolioStore.fileName = fileName || "portfolio.csv";
        if (global.UI) global.UI.refreshNav();
        renderDashboard(container, analysis);
        var liveNote = SD.PriceService.isLive ? " (live prices loaded)" : " (using bundled prices)";
        if (global.UI) global.UI.toast("Portfolio analyzed: " + analysis.holdings.length + " holdings" + liveNote, "ok");
      }
    });
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

    // ---- Headline verdict + key metrics (XIRR-led) ----
    var unrealizedGain = a.totalGain;
    var realizedGain = a.totalRealizedGain || 0;

    // Top gainer / loser among active holdings
    var sortedByGain = a.holdings.slice().sort(function (x, y) { return y.gainPct - x.gainPct; });
    var topGainer = sortedByGain[0];
    var topLoser = sortedByGain[sortedByGain.length - 1];

    // Concentration headline: % in top 3 holdings
    var top3Pct = a.byStock.slice(0, 3).reduce(function (s, g) { return s + g.pct; }, 0);
    var largest = a.byStock[0];

    var verdictHtml = renderVerdict(a, base, top3Pct, largest);

    var statCards =
      '<div class="grid grid-4">' +
        stat("Current value", money(a.totalCurrent), "invested " + money(a.totalInvested)) +
        stat("XIRR (annualized)", coloredPct(a.xirr),
          a.years > 0 ? "over " + a.years.toFixed(1) + " yrs" : "money-weighted") +
        stat("Unrealized P&L", '<span class="' + sign(unrealizedGain) + '">' + money(unrealizedGain) + '</span>',
          F.fmtSignedPct(a.absReturn) + " · on holdings") +
        stat("Realized P&L", '<span class="' + sign(realizedGain) + '">' + (realizedGain ? money(realizedGain) : "—") + '</span>',
          a.soldPositions.length ? "booked on " + a.soldPositions.length + " exits" : "no exits yet") +
      '</div>';

    // Benchmark comparison row
    var benchHtml = "";
    if (a.benchmarks && a.benchmarks.length && a.xirr != null) {
      // One row per index: index XIRR + your edge (your XIRR − index XIRR).
      var benchRows = a.benchmarks.map(function (b) {
        var edge = (b.xirr != null) ? (a.xirr - b.xirr) : null;
        var edgeCell = edge == null ? '<span class="muted">--</span>'
          : '<span class="' + (edge >= 0 ? "pos" : "neg") + '">' +
              (edge >= 0 ? "+" : "") + (edge * 100).toFixed(1) + ' pts</span>';
        var verdictPill = edge == null ? ''
          : (edge >= 0 ? '<span class="pill pill-green">Beating</span>'
                       : '<span class="pill pill-red">Trailing</span>');
        var fxChip = b.fxAdjusted ? ' <span class="chip" title="Converted to ₹ using historical USD/INR rates">₹-adjusted</span>' : '';
        return '<tr><td><strong>' + esc(b.label) + '</strong>' + fxChip + '</td>' +
          '<td class="num">' + coloredPct(b.xirr) + '</td>' +
          '<td class="num">' + edgeCell + '</td>' +
          '<td>' + verdictPill + '</td></tr>';
      }).join("");

      benchHtml =
        '<div class="card section-gap"><h3 style="margin:0 0 4px">Benchmark comparison</h3>' +
        '<p class="muted" style="margin:4px 0 12px;font-size:12px">Money-weighted return (XIRR) if you had invested the ' +
          'same amounts on the same dates into each index instead. Your portfolio XIRR is ' +
          '<strong>' + coloredPct(a.xirr) + '</strong>.</p>' +
        '<div class="table-wrap"><table>' +
          '<thead><tr><th>Index</th><th class="num">Index XIRR</th>' +
            '<th class="num">Your edge</th><th>vs you</th></tr></thead>' +
          '<tbody>' +
            '<tr style="background:var(--bg-card-2)"><td><strong>Your portfolio</strong></td>' +
              '<td class="num">' + coloredPct(a.xirr) + '</td>' +
              '<td class="num muted">—</td><td></td></tr>' +
            benchRows +
          '</tbody></table></div>' +
        '<p class="muted" style="font-size:11px;margin-top:8px">Index returns are price-based. ' +
          'Cross-currency indices (e.g. S&amp;P 500) are converted to ₹ using historical USD/INR rates when available. ' +
          'Sub-index series may use a tracking ETF as a proxy.</p>' +
        '</div>';
    }

    // Quick callouts: top gainer / loser
    var calloutHtml = "";
    if (topGainer && topLoser && a.holdings.length > 1) {
      calloutHtml =
        '<div class="grid grid-2 section-gap">' +
          calloutCard("📈 Top gainer", topGainer, base) +
          calloutCard("📉 Top loser", topLoser, base) +
        '</div>';
    }

    var insightsHtml = a.insights.length
      ? '<ul class="insight-list">' + a.insights.map(function (ins) {
          return '<li class="sev-' + ins.sev + '"><span class="ic">' + ins.icon + '</span><span>' + ins.text + '</span></li>';
        }).join("") + '</ul>'
      : '<p class="muted">No notable risk flags. Portfolio looks balanced.</p>';

    var perfData = a.holdings.map(function (h) {
      return { label: h.symbol, invested: round2(h.investedBase), current: round2(h.currentValueBase), net: round2(h.gainBase) };
    }).sort(function (a, b) { return b.current - a.current; });
    // Limit to top 20 by current value for readability
    var perfDataTop = perfData.slice(0, 20);

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
        ? '<div class="alert alert-warn no-print"><strong>' + a.warnings.length + ' note(s):</strong><br>' +
          a.warnings.map(esc).join("<br>") + '</div>' : "") +
      verdictHtml +
      statCards +
      benchHtml +
      calloutHtml +
      '<h2 class="card-section-title">Performance breakdown</h2>' +
      '<div class="grid ' + (a.soldPositions.length ? 'grid-2' : 'grid-1') + '">' +
        renderSegmentCard("Active Holdings", computeSegmentStats(a.holdings, a, "active"), base) +
        (a.soldPositions.length ? renderSegmentCard("Redeemed / Sold", computeSegmentStats(a.soldPositions, a, "sold"), base) : '') +
      '</div>' +
      '<h2 class="card-section-title">Insights</h2>' + insightsHtml +
      '<div class="grid grid-2 section-gap">' +
        '<div class="card"><h3>Sector allocation</h3>' +
          C.pie(a.bySector.map(function (g) { return { label: g.key, value: g.value }; }), { donut: true, centerLabel: a.bySector.length + "", centerSub: "sectors" }) +
        '</div>' +
        '<div class="card"><h3>Holdings comparison (' + base + ')' +
          (perfData.length > 20 ? ' <span class="muted" style="font-weight:400;font-size:13px">top 20 of ' + perfData.length + '</span>' : '') + '</h3>' +
          '<p class="muted" style="margin:0 0 8px;font-size:12px">Invested (grey) vs Current value (colored) per stock</p>' +
          renderPerfComparison(perfDataTop, base) +
        '</div>' +
      '</div>' +
      '<div class="card section-gap"><h3>Capital deployed → current value (' + base + ')</h3>' +
        '<p class="muted" style="margin-top:-4px">Cumulative cost basis at each purchase date, ending at today\'s market value.</p>' +
        C.line(a.timeline, { valuePrefix: base === "INR" ? "\u20B9" : "$" }) +
      '</div>' +
      renderConcentrationTables(a) +
      renderHoldingsTable(a) +
      '<p class="muted no-print" style="font-size:12px;margin-top:18px">Note: returns are <strong>price-based only</strong> and exclude dividends, ' +
        'bonuses and buybacks — actual total return may be higher. Prices may be delayed up to one trading day.</p>' +
      '<div class="card section-gap no-print"><h3>Find complementary opportunities</h3>' +
        '<p>Based on your sector allocation, the Discovery tool can highlight discounted stocks in sectors where you are underweight (and hide ones you already own).</p>' +
        '<a class="btn btn-primary" href="#/discovery">Open Stock Discovery →</a></div>';

    container.innerHTML = html;
    wireDashboard(container);
  }

  // ---- Headline verdict card -------------------------------------------------
  function renderVerdict(a, base, top3Pct, largest) {
    var money = function (v) { return SD.fmtMoney(v, base); };
    var gainClass = a.totalGain >= 0 ? "pos" : "neg";
    var gainWord = a.totalGain >= 0 ? "up" : "down";
    var xirrTxt = a.xirr != null ? F.fmtSignedPct(a.xirr) + " XIRR" : "";

    // Concentration descriptor
    var concWord = top3Pct > 60 ? "highly concentrated" : top3Pct > 40 ? "moderately concentrated" : "well diversified";
    var concClass = top3Pct > 60 ? "neg" : top3Pct > 40 ? "" : "pos";

    // Benchmark verdict snippet
    var benchTxt = "";
    if (a.benchmark && a.benchmark.xirr != null && a.xirr != null) {
      var diff = a.xirr - a.benchmark.xirr;
      benchTxt = diff >= 0
        ? ' and <span class="pos">beating ' + esc(a.benchmark.label) + '</span>'
        : ' but <span class="neg">trailing ' + esc(a.benchmark.label) + '</span>';
    }

    return '<div class="verdict-card no-print">' +
      '<div class="verdict-icon">' + (a.totalGain >= 0 ? "📊" : "📉") + '</div>' +
      '<div class="verdict-text">' +
        'Your portfolio is worth <strong>' + money(a.totalCurrent) + '</strong>, ' +
        '<span class="' + gainClass + '">' + gainWord + ' ' + money(Math.abs(a.totalGain)) + ' (' + F.fmtSignedPct(a.absReturn) + ')</span>' +
        (xirrTxt ? ' at <strong>' + xirrTxt + '</strong>' : '') + benchTxt + '. ' +
        'It is <span class="' + concClass + '">' + concWord + '</span>' +
        (largest ? ' — ' + esc(largest.key) + ' is your largest position at ' + largest.pct.toFixed(0) + '%' : '') + '.' +
      '</div></div>';
  }

  function coloredPct(dec) {
    if (dec == null || isNaN(dec)) return '<span class="muted">--</span>';
    return '<span class="' + (dec >= 0 ? "pos" : "neg") + '">' + F.fmtSignedPct(dec) + '</span>';
  }

  function benchMetric(label, valueHtml) {
    return '<div class="m"><div class="l">' + esc(label) + '</div><div class="v">' + valueHtml + '</div></div>';
  }

  function calloutCard(title, h, base) {
    var sign = h.gain >= 0 ? "pos" : "neg";
    return '<div class="card callout"><div class="callout-title">' + title + '</div>' +
      '<div class="callout-body"><div><strong>' + esc(h.symbol) + '</strong> <span class="muted">' + esc(h.name) + '</span></div>' +
      '<div class="callout-figures"><span class="' + sign + '" style="font-size:20px;font-weight:700">' + F.fmtSignedPct(h.gainPct) + '</span>' +
      '<span class="muted">' + SD.fmtMoney(h.gain, h.currency) + '</span></div></div></div>';
  }

  function renderConcentrationTables(a) {
    function tbl(title, groups, isStock) {
      var rows = groups.map(function (g) {
        var flag = "";
        if (!isStock && g.pct > 40) flag = ' <span class="pill pill-red">>40%</span>';
        return '<tr><td>' + esc(g.label || g.key) + flag + '</td>' +
          '<td class="num">' + SD.fmtMoney(g.value, a.baseCurrency) + '</td>' +
          '<td class="num">' + g.pct.toFixed(1) + '%</td></tr>';
      }).join("");
      return '<div class="card"><h3>' + title + '</h3><div class="table-wrap"><table>' +
        '<thead><tr><th>' + title.replace("By ", "") + '</th><th class="num">Value</th><th class="num">Weight</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
    }
    return '<details class="section-collapse" open><summary><h2 class="card-section-title">Concentration &amp; risk exposure</h2></summary>' +
      '<div class="grid grid-2">' +
        tbl("By sector", a.bySector, false) +
        tbl("By market", a.byMarket, false) +
      '</div></details>';
  }

  function renderHoldingsTable(a) {
    var now = new Date();
    var rows = a.holdings.map(function (h) {
      var delayBadge = h.delayed ? ' <span class="chip" title="Reference / delayed price' +
        (h.asOf ? " as of " + h.asOf : "") + '">⏱ delayed</span>' : '';
      // 52-week range — use REAL low if available, else estimate (flagged)
      var high52w = SD.PriceService.getHigh52w ? SD.PriceService.getHigh52w(h.symbol) : null;
      var realLow = SD.PriceService.getLow52w ? SD.PriceService.getLow52w(h.symbol) : null;
      var low52w = realLow || (high52w ? high52w * 0.6 : null);
      var sparkline = (high52w && h.currentPrice)
        ? render52wSparkline(h.currentPrice, high52w, low52w, !realLow)
        : '<span class="muted">--</span>';
      // Holding period
      var yrs = F.yearsBetween(h.date, now);
      var heldTxt = yrs >= 1 ? yrs.toFixed(1) + "y" : Math.round(yrs * 12) + "m";
      var term = yrs >= 1 ? "LT" : "ST";
      var xirrCell = h.xirr != null
        ? '<span class="' + (h.xirr >= 0 ? "pos" : "neg") + '">' + F.fmtSignedPct(h.xirr) + '</span>'
        : '<span class="muted">--</span>';

      return '<tr class="clickable" data-value="' + h.currentValueBase + '" data-gain="' + h.gainBase +
        '" data-gainpct="' + h.gainPct + '" data-xirr="' + (h.xirr == null ? -999 : h.xirr) +
        '" data-qty="' + h.qty + '" data-sym="' + esc(h.symbol) +
        '" data-search="' + esc((h.symbol + " " + h.name).toLowerCase()) + '" title="Click for transactions &amp; analysis">' +
        '<td><strong>' + esc(h.symbol) + '</strong> <span class="chip" title="' + term + ' · held ' + heldTxt + '">' + heldTxt + '</span>' +
          '<div class="muted">' + esc(h.name) + '</div></td>' +
        '<td class="num">' + F.fmtNum(h.qty, h.qty % 1 ? 2 : 0) + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.avgPrice, h.currency) + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.currentPrice, h.currency) + delayBadge + '</td>' +
        '<td class="num">' + SD.fmtMoney(h.currentValueBase, a.baseCurrency) + '</td>' +
        '<td class="num ' + (h.gain >= 0 ? "pos" : "neg") + '">' + SD.fmtMoney(h.gain, h.currency) + '</td>' +
        '<td class="num ' + (h.gainPct >= 0 ? "pos" : "neg") + '">' + F.fmtSignedPct(h.gainPct) + '</td>' +
        '<td class="num">' + xirrCell + '</td>' +
        '<td>' + sparkline + '</td>' +
        '</tr>';
    }).join("");

    // Sold positions section
    var soldRows = "";
    if (a.soldPositions && a.soldPositions.length > 0) {
      soldRows = a.soldPositions.map(function (h) {
        var sx = h.xirr != null
          ? '<span class="' + (h.xirr >= 0 ? "pos" : "neg") + '">' + F.fmtSignedPct(h.xirr) + '</span>'
          : '<span class="muted">--</span>';
        return '<tr class="clickable" style="opacity:0.85" data-sym="' + esc(h.symbol) +
            '" data-search="' + esc((h.symbol + " " + h.name).toLowerCase()) + '" title="Click for transactions &amp; analysis">' +
          '<td><strong>' + esc(h.symbol) + '</strong> <span class="pill pill-grey">Sold</span>' +
            '<div class="muted">' + esc(h.name) + '</div></td>' +
          '<td class="num muted">' + h.qtyBought + ' → ' + h.qtySold + '</td>' +
          '<td class="num">' + SD.fmtMoney(h.avgPrice, h.currency) + '</td>' +
          '<td class="num">' + SD.fmtMoney(h.currentPrice, h.currency) +
            ' <span class="muted">(avg sell)</span></td>' +
          '<td class="num ' + (h.gain >= 0 ? "pos" : "neg") + '">' + SD.fmtMoney(h.gain, h.currency) +
            '<div class="muted">' + F.fmtSignedPct(h.gainPct) + ' realized</div></td>' +
          '<td class="num">' + sx + '</td>' +
          '</tr>';
      }).join("");
    }

    var soldSection = soldRows
      ? '<details class="section-collapse"><summary><h2 class="card-section-title">Sold / Redeemed Positions <span class="chip">' + a.soldPositions.length + '</span></h2></summary><div class="table-wrap"><table>' +
        '<thead><tr><th>Stock</th><th class="num">Bought → Sold</th>' +
        '<th class="num">Avg buy</th><th class="num">Avg sell</th>' +
        '<th class="num">Realized P&amp;L</th><th class="num">XIRR</th></tr></thead>' +
        '<tbody>' + soldRows + '</tbody></table></div></details>'
      : '';

    return '<details class="section-collapse" open><summary><h2 class="card-section-title">Active Holdings <span class="chip">' + a.holdings.length + '</span></h2></summary>' +
      '<div class="holdings-toolbar no-print">' +
        '<input type="search" id="holdings-search" placeholder="🔍 Search holdings — try &quot;bees&quot; or &quot;*bees&quot;" autocomplete="off">' +
        '<span class="muted" id="holdings-count" style="font-size:12px"></span>' +
      '</div>' +
      '<div class="table-wrap"><table class="sortable-table" id="holdings-table">' +
      '<thead><tr><th class="sortable" data-sort="sym">Stock</th>' +
      '<th class="num sortable" data-sort="qty">Qty</th>' +
      '<th class="num">Avg price</th><th class="num">Cur price</th>' +
      '<th class="num sortable" data-sort="value">Value</th>' +
      '<th class="num sortable" data-sort="gain">P&amp;L</th>' +
      '<th class="num sortable" data-sort="gainpct">% Chg</th>' +
      '<th class="num sortable" data-sort="xirr">XIRR</th>' +
      '<th>52-week range</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted" style="font-size:11px;margin-top:6px">Tip: search by name/ticker, click a column header (Qty, Value, P&amp;L, % Chg, XIRR) to sort, ' +
        'or click any row to see all its transactions &amp; analysis. Badge shows holding period (LT &gt; 1yr).</p>' +
      '</details>' + soldSection;
  }

  // ---- Horizontal performance comparison (invested vs current per holding) ---
  function renderPerfComparison(data, base) {
    if (!data.length) return '<div class="empty-state">No holdings</div>';
    var sym = base === "INR" ? "\u20B9" : "$";
    var maxVal = data.reduce(function (m, d) { return Math.max(m, d.invested, d.current); }, 0) || 1;

    // Layout: each stock = one row with label, two stacked bars, net value
    var rowH = 30, padL = 90, padR = 96, padT = 6, padB = 6;
    var w = 560, barH = 9, barGap = 3;
    var h = padT + padB + data.length * rowH;
    var plotW = w - padL - padR;
    var scale = plotW / maxVal;

    function fmtK(v) {
      var a = Math.abs(v);
      if (a >= 1e7) return (v / 1e7).toFixed(2) + "Cr";
      if (a >= 1e5) return (v / 1e5).toFixed(2) + "L";
      if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
      return v.toFixed(0);
    }

    var rows = data.map(function (d, i) {
      var y = padT + i * rowH;
      var midY = y + rowH / 2;
      var investedW = Math.max(2, d.invested * scale);
      var currentW = Math.max(2, d.current * scale);
      var curColor = d.net >= 0 ? "var(--green)" : "var(--red)";
      var netSign = d.net >= 0 ? "+" : "-";

      return '<text x="' + (padL - 10) + '" y="' + (midY + 4) + '" text-anchor="end" fill="var(--text)" font-size="12" font-weight="600">' + esc(d.label) + '</text>' +
        // invested bar (top)
        '<rect x="' + padL + '" y="' + (midY - barH - barGap / 2) + '" width="' + investedW + '" height="' + barH + '" rx="2" fill="#c7ccd4"/>' +
        // current bar (bottom)
        '<rect x="' + padL + '" y="' + (midY + barGap / 2) + '" width="' + currentW + '" height="' + barH + '" rx="2" fill="' + curColor + '"/>' +
        // net value label on right
        '<text x="' + (w - padR + 8) + '" y="' + (midY + 4) + '" fill="' + curColor + '" font-size="11" font-weight="700">' +
          netSign + sym + fmtK(Math.abs(d.net)) + '</text>';
    }).join("");

    var legend = '<div class="chart-legend" style="margin-top:10px">' +
      '<span class="lg"><span class="sw" style="background:#c7ccd4"></span>Invested</span>' +
      '<span class="lg"><span class="sw" style="background:var(--green)"></span>Current (gain)</span>' +
      '<span class="lg"><span class="sw" style="background:var(--red)"></span>Current (loss)</span></div>';

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" preserveAspectRatio="xMinYMin meet" style="width:100%;height:auto">' +
      rows + '</svg>' + legend;
  }

  // ---- Segment stats (Active / Sold) ----------------------------------------
  function computeSegmentStats(positions, a, type) {
    if (!positions.length) return null;
    var totalInvested = positions.reduce(function (s, h) { return s + (h.investedBase || 0); }, 0);
    var totalCurrent = positions.reduce(function (s, h) { return s + (h.currentValueBase || 0); }, 0);
    var totalGain = totalCurrent - totalInvested;
    var absReturn = totalInvested > 0 ? totalGain / totalInvested : null;

    // XIRR for this segment
    var now = new Date();
    var flows = [];
    if (type === "active") {
      positions.forEach(function (h) { flows.push({ amount: -h.investedBase, date: h.date }); });
      if (totalCurrent > 0) flows.push({ amount: totalCurrent, date: now });
    } else {
      // For sold positions, use actual buy and sell dates for accurate XIRR
      positions.forEach(function (h) {
        // Buy flow at earliest date
        flows.push({ amount: -h.investedBase, date: h.date });
        
        // Sell flows: use individual sell trades if available, otherwise use sellDate
        if (h.sellTrades && h.sellTrades.length > 0) {
          // Use actual sell trade dates for precise XIRR
          h.sellTrades.forEach(function (st) {
            var sellAmount = convert(st.qty * st.price, h.currency, a.baseCurrency);
            flows.push({ amount: sellAmount, date: st.date });
          });
        } else {
          // Fallback: use sellDate if available, otherwise earliest date
          var sellDate = h.sellDate || h.date;
          flows.push({ amount: h.currentValueBase, date: sellDate });
        }
      });
    }
    var xirr = flows.length >= 2 ? F.xirr(flows) : null;

    // CAGR - use sell date for sold positions
    var earliest = positions.reduce(function (d, h) { return h.date < d ? h.date : d; }, positions[0].date);
    var latest = type === "sold" 
      ? positions.reduce(function (d, h) { 
          var sd = h.sellDate || h.date;
          return sd > d ? sd : d; 
        }, positions[0].sellDate || positions[0].date)
      : now;
    var years = F.yearsBetween(earliest, latest);
    var cagr = years > 0 && totalInvested > 0 ? F.cagr(totalInvested, totalCurrent, years) : null;

    return {
      count: positions.length, totalInvested: totalInvested,
      totalCurrent: totalCurrent, totalGain: totalGain,
      absReturn: absReturn, xirr: xirr, cagr: cagr, years: years
    };
  }

  function renderSegmentCard(title, stats, base) {
    if (!stats) return '';
    var money = function (v) { return SD.fmtMoney(v, base); };
    var sign = function (v) { return v >= 0 ? "pos" : "neg"; };
    return '<div class="card"><h3>' + esc(title) + ' <span class="chip">' + stats.count + '</span></h3>' +
      '<div class="grid grid-3" style="gap:10px;margin-top:12px">' +
        '<div class="m"><div class="l">P&L</div><div class="v ' + sign(stats.totalGain) + '">' + money(stats.totalGain) + '</div></div>' +
        '<div class="m"><div class="l">Return</div><div class="v ' + sign(stats.absReturn || 0) + '">' + F.fmtSignedPct(stats.absReturn) + '</div></div>' +
        '<div class="m"><div class="l">XIRR</div><div class="v">' + (stats.xirr != null ? F.fmtSignedPct(stats.xirr) : '--') + '</div></div>' +
      '</div>' +
      '<div class="grid grid-3" style="gap:10px;margin-top:8px">' +
        '<div class="m"><div class="l">Invested</div><div class="v">' + money(stats.totalInvested) + '</div></div>' +
        '<div class="m"><div class="l">' + (title.indexOf("Sold") >= 0 ? "Proceeds" : "Cur value") + '</div><div class="v">' + money(stats.totalCurrent) + '</div></div>' +
        '<div class="m"><div class="l">CAGR</div><div class="v">' + (stats.cagr != null ? F.fmtSignedPct(stats.cagr) : '--') +
          (stats.years > 0 ? '<br><span class="muted" style="font-size:11px">' + stats.years.toFixed(1) + ' yrs</span>' : '') + '</div></div>' +
      '</div></div>';
  }

  // ---- 52-week range sparkline -----------------------------------------------
  function render52wSparkline(currentPrice, high52w, low52w, estimated) {
    if (!high52w || !low52w || high52w <= low52w) return '<span class="muted">--</span>';
    var range = high52w - low52w;
    var position = Math.max(0, Math.min(1, (currentPrice - low52w) / range));
    var pct = (position * 100).toFixed(0);
    var w = 80, h = 18, barY = 9, barH = 4, dotR = 5;
    var dotX = 4 + position * (w - 8);
    var dotColor = position < 0.3 ? 'var(--green)' : position > 0.7 ? 'var(--red)' : 'var(--amber)';
    
    // Build tooltip text
    var tooltipText = estimated 
      ? '52w low is estimated (~60% of high). Actual low may differ. Position: ' + pct + '% of range.'
      : 'Current price at ' + pct + '% of 52-week range (Low: ' + Math.round(low52w) + ', High: ' + Math.round(high52w) + ')';
    
    // Estimated indicator: show a dashed bar and "est" badge instead of just asterisk
    var barStyle = estimated 
      ? 'stroke="var(--border)" stroke-width="2" stroke-dasharray="4,2" fill="none"'
      : 'fill="var(--border)"';
    
    var lowDisplay = estimated
      ? '<span class="muted" style="font-size:11px;min-width:36px;text-align:right;opacity:0.7" title="Estimated: ~60% of 52w high">' + 
          '~' + Math.round(low52w) + '</span>'
      : '<span class="muted" style="font-size:11px;min-width:36px;text-align:right">' + Math.round(low52w) + '</span>';
    
    var estBadge = estimated 
      ? '<span class="chip chip-est" title="52w low is estimated, not actual data">est</span>' 
      : '';
    
    return '<div class="sparkline-52w" style="display:flex;align-items:center;gap:6px" title="' + esc(tooltipText) + '">' +
      lowDisplay +
      '<svg width="' + w + '" height="' + h + '" style="flex:none">' +
        '<rect x="4" y="' + (barY - barH/2) + '" width="' + (w-8) + '" height="' + barH + '" rx="2" ' + barStyle + '/>' +
        '<circle cx="' + dotX.toFixed(1) + '" cy="' + barY + '" r="' + dotR + '" fill="' + dotColor + '"/>' +
      '</svg>' +
      '<span class="muted" style="font-size:11px;min-width:36px">' + Math.round(high52w) + '</span>' +
      '<span class="chip" style="font-size:10px">' + pct + '%</span>' +
      estBadge +
    '</div>';
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

    // Sortable holdings table
    var table = container.querySelector("#holdings-table");
    if (table) wireSortableTable(table);

    // Live search across active holdings (supports "bees", "*bees", "bees*").
    var search = container.querySelector("#holdings-search");
    if (search) {
      search.addEventListener("input", function () { filterHoldings(container, search.value); });
      filterHoldings(container, "");
    }

    // Click any holding/sold row -> open per-stock transactions & analysis.
    container.querySelectorAll("tr.clickable[data-sym]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        openStockDetail(tr.getAttribute("data-sym"));
      });
    });
  }

  // Filter the active-holdings table rows by a free-text query. Asterisks are
  // treated as "match anywhere" wildcards, so "*bees", "bees*" and "bees" all
  // surface every holding whose ticker or name contains "bees".
  function filterHoldings(container, query) {
    var q = String(query || "").replace(/\*/g, "").trim().toLowerCase();
    var table = container.querySelector("#holdings-table");
    if (!table) return;
    var rows = table.querySelectorAll("tbody tr");
    var shown = 0;
    rows.forEach(function (tr) {
      var hay = (tr.getAttribute("data-search") || "").toLowerCase();
      var match = !q || hay.indexOf(q) !== -1;
      tr.style.display = match ? "" : "none";
      if (match) shown++;
    });
    var counter = container.querySelector("#holdings-count");
    if (counter) {
      counter.textContent = q ? (shown + " match" + (shown === 1 ? "" : "es")) : "";
    }
  }

  // Open a modal with the full transaction history + analysis for one stock.
  function openStockDetail(sym) {
    var a = global.PortfolioStore && global.PortfolioStore.analysis;
    if (!a || !sym) return;
    var h = null, isSold = false, i;
    for (i = 0; i < a.holdings.length; i++) {
      if (a.holdings[i].symbol === sym) { h = a.holdings[i]; break; }
    }
    if (!h) {
      for (i = 0; i < a.soldPositions.length; i++) {
        if (a.soldPositions[i].symbol === sym) { h = a.soldPositions[i]; isSold = true; break; }
      }
    }
    if (!h || !global.UI) return;
    global.UI.openModal(stockDetailHtml(h, a, isSold));
  }

  // Build the per-stock detail card: headline metrics + transaction ledger.
  function stockDetailHtml(h, a, isSold) {
    var now = new Date();
    var endDate = isSold ? (h.sellDate || now) : now;
    var yrs = F.yearsBetween(h.date, endDate);
    var heldTxt = yrs >= 1 ? yrs.toFixed(1) + " years" : Math.max(0, Math.round(yrs * 12)) + " months";
    var cagr = F.cagr(h.invested, h.currentValue, yrs);
    var sign = function (v) { return v >= 0 ? "pos" : "neg"; };
    var pctCell = function (v) { return v == null ? '<span class="muted">--</span>' :
      '<span class="' + sign(v) + '">' + F.fmtSignedPct(v) + '</span>'; };
    var nQty = function (q) { return F.fmtNum(q, q % 1 ? 2 : 0); };

    // Metric blocks
    var metrics =
      metric("Invested", SD.fmtMoney(h.invested, h.currency)) +
      metric(isSold ? "Proceeds" : "Current value", SD.fmtMoney(h.currentValue, h.currency)) +
      metric(isSold ? "Realized P&L" : "P&L",
        '<span class="' + sign(h.gain) + '">' + SD.fmtMoney(h.gain, h.currency) + '</span>') +
      metric("% Change", pctCell(h.gainPct)) +
      metric("XIRR", pctCell(h.xirr)) +
      metric("CAGR", pctCell(cagr)) +
      metric("Holding period", heldTxt) +
      metric(isSold ? "Qty bought → sold" : "Quantity held",
        isSold ? (nQty(h.qtyBought) + " → " + nQty(h.qtySold)) : nQty(h.qty)) +
      metric(isSold ? "Avg buy / sell" : "Avg buy / current",
        SD.fmtMoney(h.avgPrice, h.currency) + " / " + SD.fmtMoney(h.currentPrice, h.currency));

    // Transaction ledger (sorted oldest first)
    var txs = (h.trades || []).slice().sort(function (x, y) { return x.date - y.date; });
    var txRows = txs.map(function (t) {
      var isBuy = t.tradeType !== "SELL";
      var val = t.qty * t.price;
      return '<tr>' +
        '<td>' + fmtDate(t.date) + '</td>' +
        '<td><span class="pill ' + (isBuy ? "pill-green" : "pill-red") + '">' + (isBuy ? "BUY" : "SELL") + '</span></td>' +
        '<td class="num">' + nQty(t.qty) + '</td>' +
        '<td class="num">' + SD.fmtMoney(t.price, h.currency) + '</td>' +
        '<td class="num">' + SD.fmtMoney(val, h.currency) + '</td>' +
        '</tr>';
    }).join("");

    var buys = txs.filter(function (t) { return t.tradeType !== "SELL"; }).length;
    var sells = txs.length - buys;

    var bondChip = h.isBond ? ' <span class="pill pill-amber">Bond / Debt</span>' : '';
    var soldChip = isSold ? ' <span class="pill pill-grey">Fully sold</span>' : '';
    var delayChip = h.noQuote ? ' <span class="chip" title="No live quote — shown at cost basis">⏱ at cost</span>' : '';

    return '<div class="detail-head">' +
        '<div><div class="ticker">' + esc(h.symbol) + bondChip + soldChip + '</div>' +
          '<div class="name">' + esc(h.name) + '</div>' +
          '<div class="muted" style="font-size:12px;margin-top:4px">' + esc(h.sector || "") +
            ' · ' + esc(h.market || "") + ' · ' + esc(h.currency) + delayChip + '</div></div>' +
      '</div>' +
      '<div class="detail-metrics">' + metrics + '</div>' +
      '<h3 style="margin:18px 0 8px">Transactions <span class="chip">' + txs.length + '</span> ' +
        '<span class="muted" style="font-weight:400;font-size:12px">' + buys + ' buy' + (buys === 1 ? "" : "s") +
        (sells ? " · " + sells + " sell" + (sells === 1 ? "" : "s") : "") + '</span></h3>' +
      '<div class="table-wrap" style="max-height:320px;overflow-y:auto"><table>' +
        '<thead><tr><th>Date</th><th>Type</th><th class="num">Qty</th>' +
        '<th class="num">Price</th><th class="num">Value</th></tr></thead>' +
        '<tbody>' + (txRows || '<tr><td colspan="5" class="muted">No transactions</td></tr>') + '</tbody>' +
      '</table></div>' +
      '<p class="muted" style="font-size:11px;margin-top:10px">XIRR is money-weighted across the actual trade dates' +
        (isSold ? '' : ' plus today\'s market value') + '. Returns are price-based and exclude dividends.</p>';
  }

  function metric(label, valueHtml) {
    return '<div class="m"><div class="l">' + esc(label) + '</div><div class="v">' + valueHtml + '</div></div>';
  }

  // Generic DOM-based table sorter: click a .sortable header to sort rows by its
  // data-sort key (read from data-<key> attributes on each row).
  function wireSortableTable(table) {
    var headers = table.querySelectorAll("th.sortable");
    var sortState = { key: null, dir: 1 };
    headers.forEach(function (th) {
      th.style.cursor = "pointer";
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (sortState.key === key) sortState.dir = -sortState.dir;
        else { sortState.key = key; sortState.dir = -1; } // default desc for new column
        var tbody = table.querySelector("tbody");
        var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
        rows.sort(function (ra, rb) {
          var va = ra.getAttribute("data-" + key);
          var vb = rb.getAttribute("data-" + key);
          var na = parseFloat(va), nb = parseFloat(vb);
          if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortState.dir;
          return String(va).localeCompare(String(vb)) * sortState.dir;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
        // Update header indicators
        headers.forEach(function (h) { h.classList.remove("sort-asc", "sort-desc"); });
        th.classList.add(sortState.dir > 0 ? "sort-asc" : "sort-desc");
      });
    });
  }

  // ---- small utils ----
  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtDateShort(d) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
  }
  function fmtDateTime(d) { return fmtDate(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  global.Portfolio = {
    render: render,
    analyze: analyze,
    parseCSV: parseCSV,
    mapColumns: mapColumns,
    INLINE_SAMPLE: INLINE_SAMPLE
  };
})(window);
