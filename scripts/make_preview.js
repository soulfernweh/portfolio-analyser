/* Generates a self-contained static snapshot (preview.html) of the portfolio
 * dashboard rendered from "Stocks Transactions.csv", with prices.json + CSS
 * inlined. Open it directly in any browser — no server needed. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");

// --- DOM shim (enough for the render code to build innerHTML) ---
function makeEl(tag) {
  return {
    tagName: tag || "div", _html: "", style: {},
    classList: { _s: {}, add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){return false;} },
    _attrs: {}, setAttribute: function(){}, getAttribute: function(){return null;},
    set innerHTML(v){ this._html = String(v); }, get innerHTML(){ return this._html; },
    textContent: "", addEventListener: function(){}, appendChild: function(){}, removeChild: function(){},
    querySelector: function(){ return makeEl(); }, querySelectorAll: function(){ return []; },
    click: function(){}, files: [], value: "", firstChild: { nextSibling: null }, insertBefore: function(){}
  };
}
global.document = {
  readyState: "complete",
  getElementById: function(){ return makeEl(); },
  querySelector: function(){ return makeEl(); },
  querySelectorAll: function(){ return []; },
  createElement: function(t){ return makeEl(t); },
  addEventListener: function(){}, body: makeEl()
};
var store = {};
global.window = {
  location: { hash: "#/portfolio" }, addEventListener: function(){}, scrollTo: function(){},
  localStorage: { getItem: function(k){ return store[k]!=null?store[k]:null; }, setItem: function(k,v){ store[k]=String(v); }, removeItem: function(k){ delete store[k]; } }
};
global.localStorage = global.window.localStorage;
global.Blob = function(){}; global.URL = { createObjectURL: function(){ return "blob:x"; }, revokeObjectURL: function(){} };

// --- fetch shim: serve local prices.json ---
var pricesJson = fs.readFileSync(path.join(ROOT, "prices.json"), "utf8");
global.fetch = function(url){
  if (String(url).indexOf("prices.json") !== -1) {
    return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve(JSON.parse(pricesJson)); } });
  }
  return Promise.reject(new Error("no network in snapshot generator"));
};

["data","finance","charts","tracking","report","discovery","portfolio","app"].forEach(function(m){ require(path.join(ROOT, "js", m + ".js")); });
var W = global.window;

var csv = fs.readFileSync(path.join(ROOT, "Stocks Transactions.csv"), "utf8");

W.StockData.PriceService.refreshAll().then(function(){
  var analysis = W.Portfolio.analyze(W.Portfolio.parseCSV(csv));
  if (analysis.error) { console.error("Analyze error:", analysis.error); process.exit(1); }
  W.PortfolioStore.analysis = analysis;
  W.PortfolioStore.fileName = "Stocks Transactions.csv";

  var app = makeEl();
  W.Portfolio.render(app);
  var body = app._html;

  var css = fs.readFileSync(path.join(ROOT, "css", "styles.css"), "utf8");
  var meta = W.StockData.PriceService.getMeta() || {};

  var html =
    "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>Portfolio Snapshot — Stocks Transactions.csv</title>" +
    "<style>\n" + css + "\n</style></head><body>" +
    "<div class=\"disclaimer-bar\">\u26A0 Static snapshot generated " + new Date().toISOString().split("T")[0] +
      " from prices.json (updated " + (meta.updatedAt || "?") + "). Buttons/sorting are inactive in this snapshot. " +
      "For the interactive app, run it locally or use GitHub Pages.</div>" +
    "<main class=\"app-main\">" + body + "</main>" +
    "</body></html>";

  fs.writeFileSync(path.join(ROOT, "preview.html"), html);
  console.log("Wrote preview.html (" + (html.length/1024).toFixed(0) + " KB)");
  console.log("Invested:", Math.round(analysis.totalInvested).toLocaleString("en-IN"),
              "| Current:", Math.round(analysis.totalCurrent).toLocaleString("en-IN"),
              "| XIRR:", (analysis.xirr*100).toFixed(2)+"%");
}).catch(function(e){ console.error("FATAL:", e.message, e.stack); process.exit(1); });
