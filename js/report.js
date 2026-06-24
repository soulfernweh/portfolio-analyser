/* =============================================================================
 * report.js — downloadable reports, no dependencies.
 *   - portfolioPDF(analysis): opens a print-ready window -> "Save as PDF"
 *   - portfolioExcel(analysis): downloads a multi-section CSV (opens in Excel)
 *   - trackingExcel(): exports watchlist + research lists to CSV
 * ===========================================================================*/

(function (global) {
  "use strict";

  var SD = global.StockData, F = global.Finance, C = global.Charts;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function money(v, cur) { return SD.fmtMoney(v, cur); }

  // ---- CSV helpers ---------------------------------------------------------
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csvRow(arr) { return arr.map(csvCell).join(",") + "\r\n"; }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/csv") + ";charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  // ---- Excel (CSV) for portfolio -------------------------------------------
  function portfolioExcel(a) {
    if (!a) return;
    var cur = a.baseCurrency;
    var out = "";
    out += csvRow(["Investment Research & Portfolio Analysis Platform — Portfolio Report"]);
    out += csvRow(["Generated", a.generatedAt.toString()]);
    out += csvRow(["Base currency", cur + (a.mixedCurrency ? " (mixed; FX " + a.fxRate + " INR/USD)" : "")]);
    out += csvRow([]);

    out += csvRow(["SUMMARY METRICS"]);
    out += csvRow(["Total invested", a.totalInvested.toFixed(2)]);
    out += csvRow(["Current value", a.totalCurrent.toFixed(2)]);
    out += csvRow(["Total gain/loss", a.totalGain.toFixed(2)]);
    out += csvRow(["Absolute return %", a.absReturn == null ? "" : (a.absReturn * 100).toFixed(2)]);
    out += csvRow(["XIRR %", a.xirr == null ? "" : (a.xirr * 100).toFixed(2)]);
    out += csvRow(["CAGR %", a.cagr == null ? "" : (a.cagr * 100).toFixed(2)]);
    out += csvRow(["Diversification score", a.divScore + "/100"]);
    out += csvRow(["Effective holdings", a.effectiveStocks.toFixed(2)]);
    out += csvRow([]);

    out += csvRow(["HOLDINGS"]);
    out += csvRow(["Symbol", "Name", "Market", "Sector", "Currency", "Qty", "Avg Price",
      "Current Price", "Invested", "Current Value", "Gain/Loss", "Gain %", "Buy Date", "Price Status"]);
    a.holdings.forEach(function (h) {
      out += csvRow([h.symbol, h.name, h.market, h.sector, h.currency, h.qty, h.avgPrice.toFixed(2),
        h.currentPrice.toFixed(2), h.invested.toFixed(2), h.currentValue.toFixed(2),
        h.gain.toFixed(2), (h.gainPct * 100).toFixed(2), fmtDate(h.date),
        h.noQuote ? "Delayed (cost basis)" : (h.delayed ? "Delayed (reference)" : "Live")]);
    });
    out += csvRow([]);

    out += csvRow(["CONCENTRATION BY SECTOR"]);
    out += csvRow(["Sector", "Value (" + cur + ")", "Weight %"]);
    a.bySector.forEach(function (g) { out += csvRow([g.key, g.value.toFixed(2), g.pct.toFixed(2)]); });
    out += csvRow([]);

    out += csvRow(["CONCENTRATION BY STOCK"]);
    out += csvRow(["Stock", "Value (" + cur + ")", "Weight %"]);
    a.byStock.forEach(function (g) { out += csvRow([g.key, g.value.toFixed(2), g.pct.toFixed(2)]); });
    out += csvRow([]);

    out += csvRow(["INSIGHTS"]);
    a.insights.forEach(function (i) { out += csvRow([stripTags(i.text)]); });

    download("portfolio-report-" + stamp() + ".csv", out, "text/csv");
    if (global.UI) global.UI.toast("Excel (CSV) report downloaded", "ok");
  }

  // ---- PDF via print window ------------------------------------------------
  function portfolioPDF(a) {
    if (!a) return;
    var cur = a.baseCurrency;
    var sign = function (v) { return v >= 0 ? "pos" : "neg"; };

    var holdingRows = a.holdings.map(function (h) {
      return "<tr><td><b>" + esc(h.symbol) + "</b><br><span class='dim'>" + esc(h.name) + "</span></td>" +
        "<td>" + esc(h.market) + "</td><td>" + esc(h.sector) + "</td>" +
        "<td class='num'>" + F.fmtNum(h.qty, h.qty % 1 ? 2 : 0) + "</td>" +
        "<td class='num'>" + money(h.avgPrice, h.currency) + "</td>" +
        "<td class='num'>" + money(h.currentPrice, h.currency) + (h.delayed ? " *" : "") + "</td>" +
        "<td class='num'>" + money(h.invested, h.currency) + "</td>" +
        "<td class='num'>" + money(h.currentValue, h.currency) + "</td>" +
        "<td class='num " + sign(h.gain) + "'>" + money(h.gain, h.currency) + " (" + F.fmtSignedPct(h.gainPct) + ")</td></tr>";
    }).join("");

    var sectorRows = a.bySector.map(function (g) {
      return "<tr><td>" + esc(g.key) + "</td><td class='num'>" + money(g.value, cur) + "</td><td class='num'>" + g.pct.toFixed(1) + "%</td></tr>";
    }).join("");
    var stockRows = a.byStock.map(function (g) {
      return "<tr><td>" + esc(g.key) + "</td><td class='num'>" + money(g.value, cur) + "</td><td class='num'>" + g.pct.toFixed(1) + "%</td></tr>";
    }).join("");
    var insightItems = a.insights.map(function (i) { return "<li>" + i.text + "</li>"; }).join("");

    var pie = C.pie(a.bySector.map(function (g) { return { label: g.key, value: g.value }; }), { donut: true });
    var bar = C.bar(a.byStock.map(function (g) {
      var h = a.holdings.filter(function (x) { return x.symbol === g.key; })[0];
      return { label: g.key, value: Math.round((h ? h.gainBase : 0) * 100) / 100 };
    }), { colorBySign: true, valuePrefix: cur === "INR" ? "\u20B9" : "$" });

    var doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Portfolio Report</title>" +
      "<style>" + printCSS() + "</style></head><body>" +
      "<div class='rpt'>" +
        "<h1>Portfolio Analysis Report</h1>" +
        "<p class='dim'>Generated " + esc(a.generatedAt.toString()) + " &middot; Base currency " + esc(cur) +
          (a.mixedCurrency ? " (mixed, FX " + a.fxRate + " INR/USD)" : "") + "</p>" +
        "<div class='sebi'>SEBI Disclaimer: Educational purposes only — not SEBI-registered investment advice. Consult a registered advisor.</div>" +
        "<div class='cards'>" +
          card("Invested", money(a.totalInvested, cur)) +
          card("Current value", money(a.totalCurrent, cur)) +
          card("Gain/Loss", "<span class='" + sign(a.totalGain) + "'>" + money(a.totalGain, cur) + "</span>") +
          card("Absolute return", F.fmtSignedPct(a.absReturn)) +
          card("XIRR", a.xirr == null ? "--" : F.fmtSignedPct(a.xirr)) +
          card("CAGR", a.cagr == null ? "--" : F.fmtSignedPct(a.cagr)) +
          card("Diversification", a.divScore + "/100") +
          card("Holdings", String(a.holdings.length)) +
        "</div>" +
        "<h2>Insights</h2><ul class='ins'>" + insightItems + "</ul>" +
        "<div class='charts'>" +
          "<div class='chartbox'><h3>Sector allocation</h3>" + pie + "</div>" +
          "<div class='chartbox'><h3>Performance by holding (" + esc(cur) + ")</h3>" + bar + "</div>" +
        "</div>" +
        "<h2>Holdings</h2><table><thead><tr><th>Stock</th><th>Market</th><th>Sector</th><th class='num'>Qty</th>" +
          "<th class='num'>Avg</th><th class='num'>Cur</th><th class='num'>Invested</th><th class='num'>Value</th><th class='num'>Gain/Loss</th></tr></thead>" +
          "<tbody>" + holdingRows + "</tbody></table>" +
        "<p class='dim'>* delayed / reference price (live market data not connected in offline mode).</p>" +
        "<div class='two'>" +
          "<div><h2>By sector</h2><table><thead><tr><th>Sector</th><th class='num'>Value</th><th class='num'>Weight</th></tr></thead><tbody>" + sectorRows + "</tbody></table></div>" +
          "<div><h2>By stock</h2><table><thead><tr><th>Stock</th><th class='num'>Value</th><th class='num'>Weight</th></tr></thead><tbody>" + stockRows + "</tbody></table></div>" +
        "</div>" +
        "<p class='foot'>This report is for educational and informational purposes only and does not constitute investment advice. " +
          "Prices are from a bundled reference dataset and may be delayed.</p>" +
      "</div>" +
      "<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>" +
      "</body></html>";

    var w = global.open("", "_blank");
    if (!w) {
      if (global.UI) global.UI.toast("Popup blocked — allow popups to download the PDF", "err");
      return;
    }
    w.document.open(); w.document.write(doc); w.document.close();
    if (global.UI) global.UI.toast("Opening print dialog — choose 'Save as PDF'", "ok");
  }

  function card(label, value) {
    return "<div class='c'><div class='cl'>" + esc(label) + "</div><div class='cv'>" + value + "</div></div>";
  }

  function printCSS() {
    return "*{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:24px;}" +
      ".rpt{max-width:900px;margin:0 auto;} h1{margin:0 0 4px;font-size:24px;} h2{font-size:17px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px;}" +
      "h3{font-size:13px;margin:0 0 6px;} .dim{color:#777;font-size:12px;}" +
      ".sebi{background:#fff7e6;border:1px solid #f0c36d;color:#8a6d3b;padding:8px 12px;border-radius:6px;font-size:12px;margin:12px 0;}" +
      ".cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0;}" +
      ".c{border:1px solid #e0e0e0;border-radius:8px;padding:10px;} .cl{font-size:11px;color:#777;text-transform:uppercase;} .cv{font-size:18px;font-weight:700;margin-top:2px;}" +
      ".ins{margin:0;padding-left:18px;font-size:13px;} .ins li{margin:4px 0;}" +
      ".charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0;} .chartbox{border:1px solid #e8e8e8;border-radius:8px;padding:12px;}" +
      "table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;} th,td{border-bottom:1px solid #e6e6e6;padding:6px 8px;text-align:left;} th{background:#f4f6f8;}" +
      ".num{text-align:right;} .pos{color:#1a7f3c;} .neg{color:#c0392b;} .two{display:grid;grid-template-columns:1fr 1fr;gap:16px;}" +
      ".foot{margin-top:22px;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:10px;}" +
      ".chart-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:11px;color:#555;} .chart-legend .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle;}" +
      "svg.chart{width:100%;height:auto;} .empty-state{font-size:12px;color:#999;}" +
      "@media print{body{padding:0;} .chartbox,table,.two>div{page-break-inside:avoid;}}";
  }

  // ---- Tracking export -----------------------------------------------------
  function trackingExcel() {
    var T = global.Tracking;
    var out = "";
    out += csvRow(["Tracking Export", new Date().toString()]);
    [["WATCHLIST", "watchlist"], ["RESEARCH", "research"]].forEach(function (pair) {
      out += csvRow([]); out += csvRow([pair[0]]);
      out += csvRow(["Ticker", "Name", "Market", "Sector", "Last Price", "52w High", "Discount %", "Score", "Tier"]);
      T.getList(pair[1]).forEach(function (tk) {
        var s = SD.getByTicker(tk);
        if (s) out += csvRow([s.ticker, s.name, s.market, s.sector, s.lastPrice, s.high52w, s.discountPct, s.score + "/8", s.tier]);
        else out += csvRow([tk]);
      });
    });
    download("tracking-export-" + stamp() + ".csv", out, "text/csv");
    if (global.UI) global.UI.toast("Tracking lists exported", "ok");
  }

  function stripTags(s) { return String(s).replace(/<[^>]+>/g, ""); }
  function fmtDate(d) {
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  global.Report = {
    portfolioPDF: portfolioPDF,
    portfolioExcel: portfolioExcel,
    trackingExcel: trackingExcel
  };
})(window);
