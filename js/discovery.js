/* =============================================================================
 * discovery.js — Stock Discovery & Opportunity Tool
 *   - Filterable, color-coded list of the 41-stock dataset
 *   - Detail card with criterion-by-criterion 8-point breakdown
 *   - Mark stocks as Watchlist / Research
 *   - Complement highlighting when a portfolio has been analyzed
 * ===========================================================================*/

(function (global) {
  "use strict";

  var SD = global.StockData;
  var T = global.Tracking;

  // Filter state persists for the session.
  var filters = { market: "", sector: "", minScore: 0, minDiscount: 0, query: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- Portfolio context (set by portfolio.js after analysis) --------------
  function portfolioContext() {
    var store = global.PortfolioStore;
    if (!store || !store.analysis) return null;
    var a = store.analysis;
    return {
      owned: a.ownedTickers || {},               // { TICKER: true }
      underweightSectors: a.underweightSectors || {} // { Sector: true }
    };
  }

  // A stock "complements" the portfolio if user doesn't own it AND it sits in
  // a sector where the user is underweight (<10% allocation).
  function isComplement(stock, ctx) {
    if (!ctx) return false;
    if (ctx.owned[stock.ticker.toUpperCase()]) return false;
    return !!ctx.underweightSectors[stock.sector];
  }

  // ---- Filtering -----------------------------------------------------------
  function applyFilters(list) {
    var q = filters.query.trim().toLowerCase();
    return list.filter(function (s) {
      if (filters.market && s.market !== filters.market) return false;
      if (filters.sector && s.sector !== filters.sector) return false;
      if (s.score < filters.minScore) return false;
      if (s.discountPct < filters.minDiscount) return false;
      if (q && s.ticker.toLowerCase().indexOf(q) === -1 &&
              s.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortList(list, ctx) {
    return list.slice().sort(function (a, b) {
      // Complementary stocks float to the top when a portfolio is loaded.
      if (ctx) {
        var ca = isComplement(a, ctx) ? 1 : 0, cb = isComplement(b, ctx) ? 1 : 0;
        if (ca !== cb) return cb - ca;
      }
      if (b.score !== a.score) return b.score - a.score;
      return b.discountPct - a.discountPct;
    });
  }

  // ---- Small render helpers ------------------------------------------------
  function tierPill(stock) {
    return '<span class="pill pill-' + stock.tierClass + '">' + esc(stock.tier) + '</span>';
  }
  function scoreBar(stock) {
    var segs = "";
    for (var i = 0; i < 8; i++) {
      segs += '<span class="seg' + (i < stock.score ? " on-" + stock.tierClass : "") + '"></span>';
    }
    return '<span class="score-bar" title="' + stock.score + ' / 8">' + segs + '</span>';
  }
  function trackButtons(stock, sizeCls) {
    var w = T.has("watchlist", stock.ticker);
    var r = T.has("research", stock.ticker);
    var cls = "btn " + (sizeCls || "btn-sm");
    return '<button class="' + cls + (w ? " btn-primary" : "") + '" data-track="watchlist" data-ticker="' +
        esc(stock.ticker) + '">' + (w ? "\u2713 Watchlist" : "+ Watchlist") + '</button> ' +
      '<button class="' + cls + (r ? " btn-primary" : "") + '" data-track="research" data-ticker="' +
        esc(stock.ticker) + '">' + (r ? "\u2713 Research" : "+ Research") + '</button>';
  }

  // ---- List view -----------------------------------------------------------
  function render(container) {
    var ctx = portfolioContext();
    var all = SD.getAll();
    var filtered = sortList(applyFilters(all), ctx);

    var sectorOpts = ['<option value="">All sectors</option>'].concat(
      SD.sectors().map(function (s) {
        return '<option value="' + esc(s) + '"' + (filters.sector === s ? " selected" : "") + '>' + esc(s) + '</option>';
      })).join("");
    var marketOpts = ['<option value="">US &amp; India</option>'].concat(
      SD.markets().map(function (m) {
        return '<option value="' + esc(m) + '"' + (filters.market === m ? " selected" : "") + '>' + esc(m) + '</option>';
      })).join("");

    var scoreOpts = [0,1,2,3,4,5,6,7,8].map(function (n) {
      return '<option value="' + n + '"' + (filters.minScore === n ? " selected" : "") + '>' +
        (n === 0 ? "Any" : n + "+") + '</option>';
    }).join("");
    var discOpts = [0,10,20,30,40,50].map(function (n) {
      return '<option value="' + n + '"' + (filters.minDiscount === n ? " selected" : "") + '>' +
        (n === 0 ? "Any" : n + "%+") + '</option>';
    }).join("");

    var ctxBanner = "";
    if (ctx) {
      var uw = Object.keys(ctx.underweightSectors);
      ctxBanner = '<div class="alert alert-info no-print">Portfolio loaded — highlighting opportunities in your <strong>underweight sectors</strong>' +
        (uw.length ? ' (' + esc(uw.join(", ")) + ')' : '') +
        ' and hiding stocks you already own from the highlight. <a href="#/portfolio">View portfolio</a></div>';
    }

    var html =
      '<div class="row-between"><div><h1 class="page-title">Stock Discovery &amp; Opportunity</h1>' +
        '<p class="page-sub">' + filtered.length + ' of ' + all.length +
        ' curated discounted stocks (S&amp;P 500 + India Nifty) scored on an 8-point rulebook.</p></div>' +
        '<div class="btn-row no-print"><a class="btn" href="#/discovery/guide">How to use &amp; 8-point guide</a></div></div>' +
      ctxBanner +
      '<div class="filters no-print">' +
        '<label class="field">Market<select id="f-market">' + marketOpts + '</select></label>' +
        '<label class="field">Sector<select id="f-sector">' + sectorOpts + '</select></label>' +
        '<label class="field">Min score<select id="f-score">' + scoreOpts + '</select></label>' +
        '<label class="field">Min discount<select id="f-disc">' + discOpts + '</select></label>' +
        '<label class="field" style="flex:1;min-width:180px">Search<input type="search" id="f-q" placeholder="Ticker or name" value="' + esc(filters.query) + '"></label>' +
        '<button class="btn btn-ghost" id="f-reset">Reset</button>' +
      '</div>' +
      renderTable(filtered, ctx);

    container.innerHTML = html;
    wireFilters(container);
    wireTable(container);
  }

  function renderTable(list, ctx) {
    if (!list.length) {
      return '<div class="empty-state"><div class="es-icon">🔍</div>No stocks match current filters. Try adjusting criteria.</div>';
    }
    var rows = list.map(function (s) {
      var comp = isComplement(s, ctx);
      var owned = ctx && ctx.owned[s.ticker.toUpperCase()];
      var tag = comp ? ' <span class="pill pill-blue" title="In a sector you are underweight">Complements you</span>'
        : (owned ? ' <span class="chip" title="Already in your portfolio">Owned</span>' : '');
      return '<tr class="clickable' + (comp ? ' complement' : '') + '" data-ticker="' + esc(s.ticker) + '">' +
        '<td><strong>' + esc(s.ticker) + '</strong>' + tag + '<div class="muted">' + esc(s.name) + '</div></td>' +
        '<td><span class="chip">' + esc(s.market) + '</span></td>' +
        '<td>' + esc(s.sector) + '</td>' +
        '<td class="num">' + SD.fmtMoney(s.lastPrice, s.currency) + '</td>' +
        '<td class="num">' + SD.fmtMoney(s.high52w, s.currency) + '</td>' +
        '<td class="num neg">-' + s.discountPct.toFixed(1) + '%</td>' +
        '<td>' + scoreBar(s) + ' <span class="muted">' + s.score + '/8</span></td>' +
        '<td>' + tierPill(s) + '</td>' +
        '</tr>';
    }).join("");

    return '<div class="table-wrap"><table>' +
      '<thead><tr>' +
        '<th>Stock</th><th>Market</th><th>Sector</th><th class="num">Last price</th>' +
        '<th class="num">52w high</th><th class="num">Discount</th><th>Score</th><th>Tier</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function wireFilters(c) {
    function on(id, ev, fn) { var el = c.querySelector(id); if (el) el.addEventListener(ev, fn); }
    on("#f-market", "change", function (e) { filters.market = e.target.value; render(c); });
    on("#f-sector", "change", function (e) { filters.sector = e.target.value; render(c); });
    on("#f-score", "change", function (e) { filters.minScore = parseInt(e.target.value, 10) || 0; render(c); });
    on("#f-disc", "change", function (e) { filters.minDiscount = parseInt(e.target.value, 10) || 0; render(c); });
    on("#f-q", "input", function (e) {
      filters.query = e.target.value;
      // Re-render only the table to keep input focus.
      var ctx = portfolioContext();
      var wrap = c.querySelector(".table-wrap"); var empty = c.querySelector(".empty-state");
      var list = sortList(applyFilters(SD.getAll()), ctx);
      var newTable = renderTable(list, ctx);
      var holder = wrap || empty;
      if (holder) {
        var tmp = document.createElement("div"); tmp.innerHTML = newTable;
        holder.replaceWith(tmp.firstChild);
        wireTable(c);
      }
    });
    on("#f-reset", "click", function () {
      filters = { market: "", sector: "", minScore: 0, minDiscount: 0, query: "" };
      render(c);
    });
  }

  function wireTable(c) {
    c.querySelectorAll("tr.clickable").forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("[data-track]")) return; // ignore button clicks
        openDetail(tr.getAttribute("data-ticker"));
      });
    });
  }

  // ---- Detail card ---------------------------------------------------------
  function detailHtml(stock) {
    var critItems = SD.RULEBOOK.map(function (r) {
      var pass = !!stock.crit[r.key];
      return '<li><span class="ck ' + (pass ? "pass" : "fail") + '">' + (pass ? "\u2713" : "\u2715") + '</span>' +
        '<span class="ct"><strong>' + esc(r.label) + '</strong><small>' + esc(r.desc) + '</small></span></li>';
    }).join("");

    return '<div class="detail-head">' +
        '<div><div class="ticker">' + esc(stock.ticker) +
          ' <span class="chip">' + esc(stock.market) + '</span></div>' +
          '<div class="name">' + esc(stock.name) + ' &bull; ' + esc(stock.sector) + '</div></div>' +
        '<div style="text-align:right">' + tierPill(stock) +
          '<div class="muted" style="margin-top:6px">Score ' + stock.score + ' / 8</div></div>' +
      '</div>' +
      '<div class="detail-metrics">' +
        metric("Last price", SD.fmtMoney(stock.lastPrice, stock.currency)) +
        metric("52-week high", SD.fmtMoney(stock.high52w, stock.currency)) +
        metric("Discount", '<span class="neg">-' + stock.discountPct.toFixed(1) + '%</span>') +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="card"><h3>Why it\'s down</h3><p>' + esc(stock.whyDown) + '</p></div>' +
        '<div class="card"><h3>Potential catalyst</h3><p>' + esc(stock.catalyst) + '</p></div>' +
      '</div>' +
      '<h3 class="card-section-title">8-point rulebook breakdown</h3>' +
      '<ul class="criteria-list">' + critItems + '</ul>' +
      '<div class="btn-row" style="margin-top:18px" id="detail-track">' + trackButtons(stock, "") + '</div>' +
      '<p class="muted" style="margin-top:12px;font-size:12px">Reference price as of ' + esc(stock.asOf) +
        '. Educational use only — not investment advice.</p>';
  }
  function metric(label, val) {
    return '<div class="m"><div class="l">' + esc(label) + '</div><div class="v">' + val + '</div></div>';
  }

  function openDetail(ticker) {
    var stock = SD.getByTicker(ticker);
    if (!stock) return;
    global.UI.openModal(detailHtml(stock));
    // Wire the track buttons inside the modal.
    var host = document.getElementById("modal-content");
    if (host) wireTrackButtons(host, function () {
      var box = host.querySelector("#detail-track");
      if (box) box.innerHTML = trackButtons(SD.getByTicker(ticker), "");
    });
  }

  // Shared: wire any [data-track] buttons within a root, with an optional
  // refresh callback to re-render the buttons after toggling.
  function wireTrackButtons(root, refresh) {
    root.querySelectorAll("[data-track]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var kind = btn.getAttribute("data-track");
        var ticker = btn.getAttribute("data-ticker");
        var added = T.toggle(kind, ticker);
        global.UI.toast((added ? "Added to " : "Removed from ") +
          (kind === "research" ? "Research" : "Watchlist") + ": " + ticker, added ? "ok" : "");
        if (refresh) refresh();
      });
    });
  }

  global.Discovery = {
    render: render,
    openDetail: openDetail,
    detailHtml: detailHtml,
    trackButtons: trackButtons,
    wireTrackButtons: wireTrackButtons,
    scoreBar: scoreBar,
    tierPill: tierPill,
    renderGuide: renderGuide
  };

  // ---- How-to / 8-point guide ----------------------------------------------
  function renderGuide(container) {
    var rb = SD.RULEBOOK.map(function (r, i) {
      return '<li><strong>' + (i + 1) + '. ' + esc(r.label) + '</strong> — ' + esc(r.desc) + '</li>';
    }).join("");
    container.innerHTML =
      '<div class="row-between"><h1 class="page-title">How to use the Discovery Tool</h1>' +
        '<a class="btn no-print" href="#/discovery">&larr; Back to list</a></div>' +
      '<div class="help-block"><h3>The 8-point rulebook</h3>' +
        '<p>Each stock is scored against eight checks. Every check it passes earns one point, for a total score from 0 to 8.</p>' +
        '<ol style="padding-left:20px">' + rb + '</ol></div>' +
      '<div class="grid grid-3 section-gap">' +
        '<div class="card"><h3><span class="pill pill-green">Strong Candidate</span></h3><p>Score <strong>6–8</strong>. Passes most quality and value checks — worth deeper research.</p></div>' +
        '<div class="card"><h3><span class="pill pill-amber">Watchlist</span></h3><p>Score <strong>4–5</strong>. Mixed signals — interesting but keep monitoring.</p></div>' +
        '<div class="card"><h3><span class="pill pill-red">Trap</span></h3><p>Score <strong>0–3</strong>. Cheap for a reason — high risk of a value trap.</p></div>' +
      '</div>' +
      '<div class="help-block section-gap"><h3>Tips</h3><ol>' +
        '<li>Use the filters to narrow by market, sector, minimum score, or discount depth.</li>' +
        '<li>Click any row to open the detail card and see the criterion-by-criterion breakdown.</li>' +
        '<li>Mark stocks as <em>Watchlist</em> (to track) or <em>Research</em> (to dig into). A stock can be in both.</li>' +
        '<li>Upload a portfolio first — the list will then highlight stocks that complement your underweight sectors and hide ones you already own.</li>' +
      '</ol></div>' +
      '<p class="muted section-gap">A high score is a research starting point, not a buy signal. Always do your own diligence.</p>';
  }
})(window);
