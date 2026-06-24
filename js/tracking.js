/* =============================================================================
 * tracking.js — Watchlist & Research lists, persisted in localStorage.
 * A stock may live in both lists at once (dual marking allowed).
 * Exposes window.Tracking with a tiny pub/sub so nav counts + views refresh.
 * ===========================================================================*/

(function (global) {
  "use strict";

  var KEY = "irpa.tracking.v1";
  var listeners = [];

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return { watchlist: [], research: [] };
      var obj = JSON.parse(raw);
      return {
        watchlist: Array.isArray(obj.watchlist) ? obj.watchlist : [],
        research: Array.isArray(obj.research) ? obj.research : []
      };
    } catch (e) {
      return { watchlist: [], research: [] };
    }
  }

  var state = load();

  function persist() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* storage may be unavailable (private mode / file://) */ }
    emit();
  }
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }

  function up(t) { return String(t || "").toUpperCase(); }
  function listFor(kind) { return kind === "research" ? "research" : "watchlist"; }

  var Tracking = {
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    getList: function (kind) { return state[listFor(kind)].slice(); },
    has: function (kind, ticker) { return state[listFor(kind)].indexOf(up(ticker)) !== -1; },
    add: function (kind, ticker) {
      var l = state[listFor(kind)]; var t = up(ticker);
      if (l.indexOf(t) === -1) { l.push(t); persist(); }
    },
    remove: function (kind, ticker) {
      var key = listFor(kind); var t = up(ticker);
      state[key] = state[key].filter(function (x) { return x !== t; });
      persist();
    },
    toggle: function (kind, ticker) {
      if (Tracking.has(kind, ticker)) { Tracking.remove(kind, ticker); return false; }
      Tracking.add(kind, ticker); return true;
    },
    counts: function () {
      return { watchlist: state.watchlist.length, research: state.research.length };
    },
    clear: function (kind) {
      if (kind) state[listFor(kind)] = [];
      else state = { watchlist: [], research: [] };
      persist();
    }
  };

  global.Tracking = Tracking;
})(window);
