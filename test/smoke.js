/* Lightweight DOM shim to exercise render/router code paths under node.
 * innerHTML is stored (not parsed), so post-render querySelectorAll returns [];
 * the goal is to catch runtime errors in the HTML-building + wiring code. */
"use strict";

function makeEl(tag) {
  return {
    tagName: tag || "div",
    _html: "",
    style: {},
    classList: {
      _s: {},
      add: function (c) { this._s[c] = 1; },
      remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on === undefined) on = !this._s[c]; if (on) this._s[c] = 1; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    textContent: "",
    addEventListener: function () {},
    appendChild: function () {},
    removeChild: function () {},
    replaceWith: function () {},
    querySelector: function () { return makeEl(); },
    querySelectorAll: function () { return []; },
    click: function () {},
    scrollTop: 0,
    firstChild: makeStubChild(),
    files: [],
    value: ""
  };
}
function makeStubChild() { return { }; }

var elements = {};
["app", "modal-host", "modal-content", "toast-host", "nav-watch-count", "nav-research-count", "main-nav"]
  .forEach(function (id) { elements[id] = makeEl(); });

global.document = {
  readyState: "complete",
  getElementById: function (id) { return elements[id] || (elements[id] = makeEl()); },
  querySelector: function () { return makeEl(); },
  querySelectorAll: function () { return []; },
  createElement: function (t) { return makeEl(t); },
  addEventListener: function () {},
  body: makeEl()
};

var store = {};
global.window = {
  location: { hash: "#/home" },
  addEventListener: function () {},
  scrollTo: function () {},
  open: function () { return { document: { open: function () {}, write: function () {}, close: function () {} } }; },
  localStorage: {
    getItem: function (k) { return store[k] != null ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  }
};
global.localStorage = global.window.localStorage;
global.Blob = function () {};
global.URL = { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} };

// Load modules in index.html order.
["data", "finance", "charts", "tracking", "report", "discovery", "portfolio", "app"]
  .forEach(function (m) { require("../js/" + m + ".js"); });

var W = global.window;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } }

console.log("Globals present:");
["StockData", "Finance", "Charts", "Tracking", "Report", "Discovery", "Portfolio", "UI", "PortfolioStore"]
  .forEach(function (g) { ok(g, !!W[g]); });

var app = elements["app"];
function setRoute(h) { W.location.hash = h; }

console.log("\nRender every route without throwing:");
function tryRender(name, fn) {
  try { fn(); ok(name + " (html " + app._html.length + " chars)", app._html.length > 50); }
  catch (e) { fail++; console.log("  ✗ " + name + " threw: " + e.message + "\n" + (e.stack || "")); }
}
tryRender("home", function () { setRoute("#/home"); W.UI.refreshNav(); require_route("home"); });

function require_route(/*name*/) {}

// Directly call renders (router internals are private; call module renders).
tryRender("discovery.render", function () { W.Discovery.render(app); });
tryRender("discovery.renderGuide", function () { W.Discovery.renderGuide(app); });
tryRender("portfolio.render(upload)", function () { W.PortfolioStore.analysis = null; W.Portfolio.render(app); });

console.log("\nPortfolio analysis + dashboard:");
var rows = W.Portfolio.parseCSV(W.Portfolio.INLINE_SAMPLE);
var analysis = W.Portfolio.analyze(rows);
ok("analysis produced", analysis && !analysis.error);
W.PortfolioStore.analysis = analysis;
tryRender("portfolio.render(dashboard)", function () { W.Portfolio.render(app); });
ok("dashboard has charts (svg)", app._html.indexOf("<svg") !== -1);
ok("dashboard has XIRR label", app._html.indexOf("XIRR") !== -1);
ok("dashboard has concentration", app._html.indexOf("Concentration") !== -1);

console.log("\nDiscovery complement highlighting (portfolio loaded):");
tryRender("discovery.render(with portfolio)", function () { W.Discovery.render(app); });
ok("shows complement or owned tag", app._html.indexOf("Complements you") !== -1 || app._html.indexOf("Owned") !== -1);

console.log("\nDetail card:");
var s = W.StockData.getByTicker("PYPL");
var detail = W.Discovery.detailHtml(s);
ok("detail has 8 criteria items", (detail.match(/criteria-list/g) || []).length >= 1 && (detail.match(/class="ck /g) || []).length === 8);
ok("detail shows tier", detail.indexOf(s.tier) !== -1);

console.log("\nTracking store:");
W.Tracking.add("watchlist", "INFY");
W.Tracking.add("research", "INFY");
W.Tracking.add("watchlist", "NKE");
ok("watchlist has 2", W.Tracking.getList("watchlist").length === 2);
ok("research has 1", W.Tracking.getList("research").length === 1);
ok("dual marking (INFY in both)", W.Tracking.has("watchlist", "INFY") && W.Tracking.has("research", "INFY"));
ok("counts", W.Tracking.counts().watchlist === 2 && W.Tracking.counts().research === 1);
W.Tracking.remove("watchlist", "NKE");
ok("remove works", W.Tracking.getList("watchlist").length === 1);

console.log("\nReports (no throw):");
function tryCall(name, fn) { try { fn(); ok(name, true); } catch (e) { fail++; console.log("  ✗ " + name + " threw: " + e.message); } }
tryCall("portfolioExcel", function () { W.Report.portfolioExcel(analysis); });
tryCall("portfolioPDF", function () { W.Report.portfolioPDF(analysis); });
tryCall("trackingExcel", function () { W.Report.trackingExcel(); });

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
