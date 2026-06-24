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

  var REQUIRED = ["Symbol", "Name", "Quantity", "Avg Price", "Market", "Date"];
  var ALIASES = {
    Symbol: ["symbol", "ticker", "tradingsymbol", "trading symbol", "instrument", "scrip", "scrip code"],
    Name: ["name", "company", "company name", "stock", "security", "security name"],
    Quantity: ["quantity", "qty", "qty.", "shares", "units", "holding qty", "net qty"],
    "Avg Price": ["avg price", "average price", "avg. price", "avgprice", "avg cost", "average cost",
                   "buy price", "buy avg", "buy average", "cost", "price", "avg buy price"],
    Market: ["market", "exchange", "segment", "exch"],
    Date: ["date", "buy date", "purchase date", "trade date", "date added", "order date", "txn date"]
  };

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

  function mapColumns(headerRow) {
    var norm = headerRow.map(function (h) { return String(h).trim().toLowerCase(); });
    var map = {}, missing = [];
    REQUIRED.forEach(function (req) {
      var idx = -1;
      var aliases = ALIASES[req];
      for (var a = 0; a < aliases.length && idx === -1; a++) {
        idx = norm.indexOf(aliases[a]);
      }
      if (idx === -1) missing.push(req); else map[req] = idx;
    });
    return { map: map, missing: missing };
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
    var mc = mapColumns(header);
    if (mc.missing.length) {
      return { error: "Invalid file format. Required columns: " + REQUIRED.join(", ") +
        " (missing: " + mc.missing.join(", ") + ")." };
    }
    var map = mc.map;
    var dataRows = rows.slice(1);
    if (!dataRows.length) {
      return { error: "File is empty. Please upload a valid trading history file." };
    }

    var holdings = [], warnings = [];
    dataRows.forEach(function (r, i) {
      var rowNo = i + 2; // 1-based, +1 for header
      var symbol = String(r[map.Symbol] || "").trim().toUpperCase();
      var name = String(r[map.Name] || "").trim();
      var qty = toNumber(r[map.Quantity]);
      var avg = toNumber(r[map["Avg Price"]]);
      var market = normalizeMarket(r[map.Market]);
      var dateStr = String(r[map.Date] || "").trim();
      var date = F.parseDate(dateStr);

      if (!symbol) { warnings.push("Row " + rowNo + ": missing Symbol — skipped."); return; }
      if (!(qty > 0)) { warnings.push("Row " + rowNo + " (" + symbol + "): invalid Quantity — skipped."); return; }
      if (!(avg > 0)) { warnings.push("Row " + rowNo + " (" + symbol + "): invalid Avg Price — skipped."); return; }
      if (!date) { warnings.push("Row " + rowNo + " (" + symbol + "): unrecognized Date '" + esc(dateStr) + "' — using today."); date = new Date(); }

      var currency = currencyForMarket(market);
      var ref = SD.getByTicker(symbol);
      var quote = SD.PriceService.getQuote(symbol);
      var currentPrice, delayed, noQuote = false;
      if (quote) {
        currentPrice = quote.price; delayed = quote.delayed; currency = quote.currency || currency;
      } else {
        currentPrice = avg; delayed = true; noQuote = true; // last-known fallback = cost basis
      }
      var sector = ref ? ref.sector : "Other";

      var invested = qty * avg;
      var currentValue = qty * currentPrice;
      holdings.push({
        symbol: symbol, name: name || (ref ? ref.name : symbol), market: market, sector: sector,
        currency: currency, qty: qty, avgPrice: avg, currentPrice: currentPrice,
        invested: invested, currentValue: currentValue,
        gain: currentValue - invested,
        gainPct: invested > 0 ? (currentValue - invested) / invested : 0,
        date: date, delayed: delayed, noQuote: noQuote,
        asOf: quote ? quote.asOf : null
      });
    });

    if (!holdings.length) {
      return { error: "No valid holdings found. Check that Quantity and Avg Price are numeric.", warnings: warnings };
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
        '<p class="muted">Required columns: ' + REQUIRED.join(", ") + '</p>' +
        '<input type="file" id="file-input" accept=".csv,text/csv" style="display:none">' +
      '</div>' +
      '<div class="grid grid-2 section-gap">' +
        '<div class="card"><h3>Expected CSV format</h3>' +
          '<p class="muted">Header names are flexible (Zerodha-style aliases supported). Example:</p>' +
          '<div class="table-wrap"><table><thead><tr><th>Symbol</th><th>Name</th><th>Quantity</th><th>Avg Price</th><th>Market</th><th>Date</th></tr></thead>' +
          '<tbody><tr><td>INFY</td><td>Infosys</td><td>50</td><td>1320</td><td>NSE</td><td>2023-02-10</td></tr>' +
          '<tr><td>AAPL</td><td>Apple</td><td>10</td><td>150</td><td>NASDAQ</td><td>2022-11-05</td></tr></tbody></table></div></div>' +
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
