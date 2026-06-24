/* =============================================================================
 * app.js — router, shared UI helpers, Home page, and tracking views.
 * Loaded last so all feature modules (Discovery, Portfolio, Report...) exist.
 * ===========================================================================*/

(function (global) {
  "use strict";

  var SD = global.StockData, T = global.Tracking, D = global.Discovery, R = global.Report;
  var appEl, modalHost, modalContent, toastHost;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------------------------------------------------------- UI helpers
  var UI = {
    toast: function (msg, kind) {
      var el = document.createElement("div");
      el.className = "toast " + (kind || "");
      el.textContent = msg;
      toastHost.appendChild(el);
      setTimeout(function () {
        el.style.transition = "opacity .3s"; el.style.opacity = "0";
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      }, 2600);
    },
    openModal: function (html) {
      modalContent.innerHTML = html;
      modalHost.classList.remove("hidden");
      modalHost.setAttribute("aria-hidden", "false");
    },
    closeModal: function () {
      modalHost.classList.add("hidden");
      modalHost.setAttribute("aria-hidden", "true");
      modalContent.innerHTML = "";
    },
    refreshNav: function () {
      var c = T.counts();
      var w = document.getElementById("nav-watch-count");
      var r = document.getElementById("nav-research-count");
      if (w) w.textContent = c.watchlist;
      if (r) r.textContent = c.research;
      setActiveNav(currentRoute().name);
    }
  };
  global.UI = UI;

  // ------------------------------------------------------------------- routing
  function currentRoute() {
    var hash = (global.location.hash || "#/home").replace(/^#\/?/, "");
    var parts = hash.split("/").filter(Boolean);
    return { name: parts[0] || "home", sub: parts[1] || "", parts: parts };
  }

  function setActiveNav(name) {
    document.querySelectorAll(".main-nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === name);
    });
  }

  function route() {
    UI.closeModal();
    var r = currentRoute();
    setActiveNav(r.name);
    appEl.scrollTop = 0;
    global.scrollTo(0, 0);

    switch (r.name) {
      case "home": renderHome(appEl); break;
      case "portfolio": global.Portfolio.render(appEl); break;
      case "discovery":
        if (r.sub === "guide") D.renderGuide(appEl);
        else D.render(appEl);
        break;
      case "watchlist": renderTracking(appEl, "watchlist"); break;
      case "research": renderTracking(appEl, "research"); break;
      default: renderHome(appEl);
    }
  }

  // ---------------------------------------------------------------------- Home
  function renderHome(container) {
    var counts = T.counts();
    var hasPortfolio = !!(global.PortfolioStore && global.PortfolioStore.analysis);
    var stocks = SD.getAll();
    var strong = stocks.filter(function (s) { return s.tier === "Strong Candidate"; }).length;

    container.innerHTML =
      '<section class="hero">' +
        '<h1>Find value. Understand your portfolio.</h1>' +
        '<p>An offline-first research workspace: analyze your holdings for performance &amp; risk, and discover ' +
          'discounted US &amp; India stocks scored on a transparent 8-point rulebook.</p>' +
      '</section>' +
      '<div class="grid grid-2 tool-cards">' +
        toolCard("📊", "Portfolio Analysis", "Upload your trading history (CSV) to see returns, XIRR, CAGR, " +
          "concentration risk, diversification and insights — with downloadable reports.",
          hasPortfolio ? "View dashboard →" : "Upload portfolio →", "#/portfolio") +
        toolCard("🔍", "Stock Discovery", "Browse " + stocks.length + " curated discounted stocks (" + strong +
          " strong candidates). Filter, score and shortlist opportunities.", "Explore stocks →", "#/discovery") +
      '</div>' +
      '<div class="grid grid-4 section-gap">' +
        homeStat(stocks.length, "Curated stocks") +
        homeStat(strong, "Strong candidates") +
        homeStat(counts.watchlist, "On your watchlist") +
        homeStat(counts.research, "In your research list") +
      '</div>' +
      '<div class="card section-gap"><h3>How it works</h3><ol style="padding-left:20px;margin:6px 0">' +
        '<li><strong>Discover</strong> — screen discounted stocks and open the detail card for the 8-point breakdown.</li>' +
        '<li><strong>Analyze</strong> — upload your portfolio CSV for performance, risk and diversification metrics.</li>' +
        '<li><strong>Connect</strong> — the Discovery tool then highlights stocks that complement your underweight sectors.</li>' +
        '<li><strong>Track &amp; report</strong> — shortlist to Watchlist/Research and export PDF/Excel reports.</li>' +
      '</ol></div>';

    container.querySelectorAll("[data-goto]").forEach(function (el) {
      el.addEventListener("click", function () { global.location.hash = el.getAttribute("data-goto"); });
    });
  }
  function toolCard(icon, title, body, cta, href) {
    return '<div class="card tool-card" data-goto="' + href + '">' +
      '<div class="tc-icon">' + icon + '</div><h3>' + esc(title) + '</h3>' +
      '<p>' + esc(body) + '</p><div class="tc-cta">' + esc(cta) + '</div></div>';
  }
  function homeStat(n, label) {
    return '<div class="stat"><div class="value">' + n + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  // ------------------------------------------------------------- Tracking view
  function renderTracking(container, kind) {
    var title = kind === "research" ? "Research List" : "Watchlist";
    var icon = kind === "research" ? "🔬" : "⭐";
    var tickers = T.getList(kind);
    var stocks = tickers.map(function (t) { return SD.getByTicker(t); }).filter(Boolean);

    var head =
      '<div class="row-between"><div><h1 class="page-title">' + icon + ' ' + title + '</h1>' +
        '<p class="page-sub">' + stocks.length + ' stock(s) marked for ' +
        (kind === "research" ? "deeper research" : "tracking") + '.</p></div>' +
        '<div class="btn-row no-print">' +
          (stocks.length ? '<button class="btn" id="t-export">⬇ Export CSV</button>' +
            '<button class="btn btn-ghost" id="t-clear">Clear list</button>' : '') +
        '</div></div>';

    if (!stocks.length) {
      container.innerHTML = head +
        '<div class="empty-state"><div class="es-icon">' + icon + '</div>' +
        'Nothing here yet. Open the <a href="#/discovery">Stock Discovery</a> tool and mark stocks as ' +
        (kind === "research" ? "Research" : "Watchlist") + '.</div>';
      return;
    }

    var rows = stocks.map(function (s) {
      return '<tr class="clickable" data-ticker="' + esc(s.ticker) + '">' +
        '<td><strong>' + esc(s.ticker) + '</strong><div class="muted">' + esc(s.name) + '</div></td>' +
        '<td><span class="chip">' + esc(s.market) + '</span></td>' +
        '<td>' + esc(s.sector) + '</td>' +
        '<td class="num">' + SD.fmtMoney(s.lastPrice, s.currency) + '</td>' +
        '<td class="num neg">-' + s.discountPct.toFixed(1) + '%</td>' +
        '<td>' + D.scoreBar(s) + ' <span class="muted">' + s.score + '/8</span></td>' +
        '<td>' + D.tierPill(s) + '</td>' +
        '<td class="no-print"><button class="btn btn-sm btn-ghost" data-remove="' + esc(s.ticker) + '">Remove</button></td>' +
        '</tr>';
    }).join("");

    container.innerHTML = head +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Stock</th><th>Market</th><th>Sector</th><th class="num">Last price</th>' +
        '<th class="num">Discount</th><th>Score</th><th>Tier</th><th class="no-print"></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    container.querySelectorAll("tr.clickable").forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest("[data-remove]")) return;
        D.openDetail(tr.getAttribute("data-ticker"));
      });
    });
    container.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        T.remove(kind, btn.getAttribute("data-remove"));
        UI.toast("Removed from " + title + ": " + btn.getAttribute("data-remove"));
        renderTracking(container, kind);
      });
    });
    var exp = container.querySelector("#t-export");
    if (exp) exp.addEventListener("click", function () { R.trackingExcel(); });
    var clr = container.querySelector("#t-clear");
    if (clr) clr.addEventListener("click", function () {
      T.clear(kind); UI.toast(title + " cleared"); renderTracking(container, kind);
    });
  }

  // ------------------------------------------------------------------ bootstrap
  function init() {
    appEl = document.getElementById("app");
    modalHost = document.getElementById("modal-host");
    modalContent = document.getElementById("modal-content");
    toastHost = document.getElementById("toast-host");

    // Modal close interactions
    modalHost.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", UI.closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") UI.closeModal();
    });

    // Brand click -> home
    var brand = document.querySelector(".brand");
    if (brand) {
      brand.addEventListener("click", function () { global.location.hash = "#/home"; });
      brand.addEventListener("keypress", function (e) { if (e.key === "Enter") global.location.hash = "#/home"; });
    }

    // Keep nav counts in sync with the tracking store.
    T.subscribe(function () { UI.refreshNav(); });
    UI.refreshNav();

    global.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
