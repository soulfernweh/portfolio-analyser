/* =============================================================================
 * finance.js — pure numeric helpers (no dependencies)
 *   - XIRR (money-weighted return on irregular cash flows)
 *   - CAGR (time-weighted compounded annual growth)
 *   - absolute return, formatting helpers
 * ===========================================================================*/

(function (global) {
  "use strict";

  var MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

  function yearsBetween(d0, d1) {
    return (d1.getTime() - d0.getTime()) / MS_PER_YEAR;
  }

  // Net present value of a set of {amount, date} cash flows at annual rate.
  function xnpv(rate, flows, t0) {
    var sum = 0;
    for (var i = 0; i < flows.length; i++) {
      var t = yearsBetween(t0, flows[i].date);
      sum += flows[i].amount / Math.pow(1 + rate, t);
    }
    return sum;
  }

  function xnpvDeriv(rate, flows, t0) {
    var sum = 0;
    for (var i = 0; i < flows.length; i++) {
      var t = yearsBetween(t0, flows[i].date);
      if (t === 0) continue;
      sum += -t * flows[i].amount / Math.pow(1 + rate, t + 1);
    }
    return sum;
  }

  /**
   * XIRR over cash flows. Each flow: { amount: Number, date: Date }.
   * Convention: invested cash (buys) are negative, proceeds + current value
   * are positive. Returns annualized rate as a decimal (0.12 = 12%), or null.
   */
  function xirr(flows) {
    if (!flows || flows.length < 2) return null;
    // Must contain at least one negative and one positive flow.
    var hasPos = false, hasNeg = false;
    for (var i = 0; i < flows.length; i++) {
      if (flows[i].amount > 0) hasPos = true;
      if (flows[i].amount < 0) hasNeg = true;
    }
    if (!hasPos || !hasNeg) return null;

    var sorted = flows.slice().sort(function (a, b) { return a.date - b.date; });
    var t0 = sorted[0].date;
    var tLast = sorted[sorted.length - 1].date;
    // If all flows are on the same day, XIRR is undefined.
    if (tLast.getTime() === t0.getTime()) return null;

    // 1) Newton-Raphson from a sensible guess.
    var rate = 0.1;
    for (var n = 0; n < 100; n++) {
      var f = xnpv(rate, sorted, t0);
      var d = xnpvDeriv(rate, sorted, t0);
      if (!isFinite(f) || !isFinite(d) || d === 0) break;
      var next = rate - f / d;
      if (!isFinite(next)) break;
      if (next <= -0.999999) next = -0.999999; // keep (1+rate) > 0
      if (Math.abs(next - rate) < 1e-7) return clampRate(next);
      rate = next;
    }

    // 2) Bracket search: scan a wide range of rates for a sign change, then bisect.
    // Range: -99.9% to +100000% annualized (handles extreme short-term swings).
    var candidates = [-0.999, -0.99, -0.95, -0.9, -0.75, -0.5, -0.25, -0.1, -0.05,
                      0, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 50, 100, 1000];
    var prevRate = candidates[0];
    var prevVal = xnpv(prevRate, sorted, t0);
    for (var c = 1; c < candidates.length; c++) {
      var curRate = candidates[c];
      var curVal = xnpv(curRate, sorted, t0);
      if (isFinite(prevVal) && isFinite(curVal) && prevVal * curVal < 0) {
        // Sign change found between prevRate and curRate — bisect here.
        var lo = prevRate, hi = curRate, flo = prevVal;
        for (var k = 0; k < 200; k++) {
          var mid = (lo + hi) / 2;
          var fm = xnpv(mid, sorted, t0);
          if (Math.abs(fm) < 1e-7) return clampRate(mid);
          if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
        }
        return clampRate((lo + hi) / 2);
      }
      prevRate = curRate; prevVal = curVal;
    }
    return null;
  }

  // Clamp absurd rates to a sane display range (-99.99% to +9999%).
  function clampRate(r) {
    if (r == null || !isFinite(r)) return null;
    if (r < -0.9999) return -0.9999;
    if (r > 99) return 99;
    return r;
  }

  /**
   * CAGR from a single begin/end value over a span of years.
   * Returns decimal rate, or null if inputs invalid.
   */
  function cagr(beginValue, endValue, years) {
    if (!(beginValue > 0) || !(years > 0) || endValue == null) return null;
    return Math.pow(endValue / beginValue, 1 / years) - 1;
  }

  // Absolute (simple) return as a decimal.
  function absoluteReturn(cost, current) {
    if (!(cost > 0)) return null;
    return (current - cost) / cost;
  }

  // ---- formatting -----------------------------------------------------------
  function fmtPct(dec, digits) {
    if (dec == null || isNaN(dec)) return "--";
    var d = digits == null ? 2 : digits;
    return (dec * 100).toFixed(d) + "%";
  }
  function fmtSignedPct(dec, digits) {
    if (dec == null || isNaN(dec)) return "--";
    var s = dec >= 0 ? "+" : "";
    return s + fmtPct(dec, digits);
  }
  function fmtNum(n, digits) {
    if (n == null || isNaN(n)) return "--";
    var d = digits == null ? 2 : digits;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // Parse a date string from a CSV cell. Accepts YYYY-MM-DD, DD-MM-YYYY,
  // DD/MM/YYYY, MM/DD/YYYY (heuristic). Returns Date or null.
  function parseDate(str) {
    if (!str) return null;
    str = String(str).trim();
    var m;
    // ISO: 2023-04-15
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str))) {
      return mkDate(+m[1], +m[2], +m[3]);
    }
    // DD/MM/YYYY or MM/DD/YYYY or with dashes
    if ((m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(str))) {
      var a = +m[1], b = +m[2], y = +m[3];
      // If first field > 12 it must be the day -> DD/MM/YYYY.
      // Otherwise default to DD/MM/YYYY (common for Indian brokers/Zerodha).
      var day, mon;
      if (a > 12) { day = a; mon = b; }
      else if (b > 12) { mon = a; day = b; }
      else { day = a; mon = b; }
      return mkDate(y, mon, day);
    }
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  function mkDate(y, mon, day) {
    var d = new Date(y, mon - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }

  global.Finance = {
    xirr: xirr,
    xnpv: xnpv,
    cagr: cagr,
    absoluteReturn: absoluteReturn,
    yearsBetween: yearsBetween,
    fmtPct: fmtPct,
    fmtSignedPct: fmtSignedPct,
    fmtNum: fmtNum,
    parseDate: parseDate
  };
})(window);
