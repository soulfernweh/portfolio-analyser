/* =============================================================================
 * finance.test.js — Unit tests for finance.js
 *   - XIRR (various edge cases: gains, losses, multibaggers, short-term)
 *   - CAGR calculation
 *   - Date parsing
 *   - Return calculations
 * ===========================================================================*/
"use strict";

// Minimal DOM shim for loading finance.js
global.window = global.window || {};
require("../js/finance.js");

var F = global.window.Finance;
var pass = 0, fail = 0;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u2713 " + name);
  } else {
    fail++;
    console.log("  \u2717 " + name + (detail ? " — " + detail : ""));
  }
}

function approxEq(a, b, tolerance) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= (tolerance || 0.001);
}

function d(str) {
  // Parse YYYY-MM-DD to Date
  var parts = str.split("-");
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

console.log("=== Finance.js Unit Tests ===\n");

// ============================================================================
// XIRR Tests
// ============================================================================
console.log("XIRR Calculations:");

// Test 1: Simple investment with gain
(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },  // invest 10k
    { amount: 12000, date: d("2024-01-01") }    // get back 12k after 1 year
  ];
  var xirr = F.xirr(flows);
  // 20% return over 1 year = 20% XIRR
  ok("Simple 20% gain over 1 year", approxEq(xirr, 0.20, 0.01), "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 2: Simple investment with loss
(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },
    { amount: 8000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  // -20% return over 1 year
  ok("Simple 20% loss over 1 year", approxEq(xirr, -0.20, 0.01), "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 3: Multibagger (5x return)
(function () {
  var flows = [
    { amount: -10000, date: d("2020-01-01") },
    { amount: 50000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  // 5x in 4 years ~ 50% CAGR
  ok("Multibagger 5x in 4 years", xirr > 0.45 && xirr < 0.55, "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 4: Heavy loss (80% down)
(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },
    { amount: 2000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  ok("Heavy 80% loss", approxEq(xirr, -0.80, 0.01), "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 5: Short-term gain (3 months, 10% gain)
(function () {
  var flows = [
    { amount: -10000, date: d("2024-01-01") },
    { amount: 11000, date: d("2024-04-01") }
  ];
  var xirr = F.xirr(flows);
  // 10% in ~0.25 years should be ~46% annualized
  ok("Short-term 10% gain in 3 months", xirr > 0.40 && xirr < 0.55, "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 6: Multiple investments (DCA pattern)
(function () {
  var flows = [
    { amount: -5000, date: d("2023-01-01") },
    { amount: -5000, date: d("2023-07-01") },
    { amount: 12000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  // Gained 2k on 10k invested with DCA
  ok("DCA with 20% total gain", xirr > 0.15 && xirr < 0.35, "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 7: Buy and sell trades
(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },  // buy
    { amount: 5000, date: d("2023-06-01") },    // partial sell
    { amount: 7000, date: d("2024-01-01") }     // final sell
  ];
  var xirr = F.xirr(flows);
  // 12k return on 10k investment with early partial exit
  ok("Buy then partial sell pattern", xirr > 0.15 && xirr < 0.35, "got " + (xirr * 100).toFixed(2) + "%");
})();

// Test 8: Same-day flows should return null (undefined XIRR)
(function () {
  var flows = [
    { amount: -10000, date: d("2024-01-01") },
    { amount: 11000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  ok("Same-day flows returns null", xirr === null);
})();

// Test 9: Only negative flows should return null
(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },
    { amount: -5000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  ok("Only negative flows returns null", xirr === null);
})();

// Test 10: Only positive flows should return null
(function () {
  var flows = [
    { amount: 10000, date: d("2023-01-01") },
    { amount: 5000, date: d("2024-01-01") }
  ];
  var xirr = F.xirr(flows);
  ok("Only positive flows returns null", xirr === null);
})();

// Test 11: Empty/single flow should return null
(function () {
  ok("Empty flows returns null", F.xirr([]) === null);
  ok("Single flow returns null", F.xirr([{ amount: -10000, date: d("2023-01-01") }]) === null);
})();

// Test 12: Extreme short-term gain (1 week, 5% gain)
(function () {
  var flows = [
    { amount: -10000, date: d("2024-01-01") },
    { amount: 10500, date: d("2024-01-08") }
  ];
  var xirr = F.xirr(flows);
  // 5% in 1 week annualizes to very high rate
  ok("Extreme short-term gain annualizes high", xirr > 5, "got " + (xirr * 100).toFixed(2) + "%");
})();

// ============================================================================
// CAGR Tests
// ============================================================================
console.log("\nCAGR Calculations:");

// Test 1: Simple doubling in 5 years
(function () {
  var cagr = F.cagr(10000, 20000, 5);
  // Rule of 72: doubling in 5 years ~ 14.4% CAGR
  ok("Double in 5 years ~ 14.9% CAGR", approxEq(cagr, 0.1487, 0.01), "got " + (cagr * 100).toFixed(2) + "%");
})();

// Test 2: 50% loss in 3 years
(function () {
  var cagr = F.cagr(10000, 5000, 3);
  // 50% loss over 3 years
  ok("50% loss in 3 years", cagr < 0 && cagr > -0.30, "got " + (cagr * 100).toFixed(2) + "%");
})();

// Test 3: 10x in 10 years
(function () {
  var cagr = F.cagr(10000, 100000, 10);
  // 10x in 10 years ~ 25.9% CAGR
  ok("10x in 10 years ~ 26% CAGR", approxEq(cagr, 0.259, 0.01), "got " + (cagr * 100).toFixed(2) + "%");
})();

// Test 4: No change
(function () {
  var cagr = F.cagr(10000, 10000, 5);
  ok("No change = 0% CAGR", approxEq(cagr, 0, 0.001), "got " + (cagr * 100).toFixed(2) + "%");
})();

// Test 5: Invalid inputs
(function () {
  ok("Zero begin value returns null", F.cagr(0, 10000, 5) === null);
  ok("Negative begin value returns null", F.cagr(-1000, 10000, 5) === null);
  ok("Zero years returns null", F.cagr(10000, 20000, 0) === null);
  ok("Negative years returns null", F.cagr(10000, 20000, -1) === null);
})();

// ============================================================================
// Absolute Return Tests
// ============================================================================
console.log("\nAbsolute Return Calculations:");

(function () {
  ok("50% gain", approxEq(F.absoluteReturn(10000, 15000), 0.50, 0.001));
  ok("50% loss", approxEq(F.absoluteReturn(10000, 5000), -0.50, 0.001));
  ok("100% gain (double)", approxEq(F.absoluteReturn(10000, 20000), 1.00, 0.001));
  ok("Break even", approxEq(F.absoluteReturn(10000, 10000), 0, 0.001));
  ok("Zero cost returns null", F.absoluteReturn(0, 10000) === null);
})();

// ============================================================================
// Date Parsing Tests
// ============================================================================
console.log("\nDate Parsing:");

(function () {
  var d1 = F.parseDate("2024-06-15");
  ok("ISO format YYYY-MM-DD", d1 && d1.getFullYear() === 2024 && d1.getMonth() === 5 && d1.getDate() === 15);
  
  var d2 = F.parseDate("15/06/2024");
  ok("DD/MM/YYYY format", d2 && d2.getFullYear() === 2024 && d2.getMonth() === 5 && d2.getDate() === 15);
  
  var d3 = F.parseDate("15-06-2024");
  ok("DD-MM-YYYY format", d3 && d3.getFullYear() === 2024 && d3.getMonth() === 5 && d3.getDate() === 15);
  
  // Day > 12 means it must be DD/MM/YYYY
  var d4 = F.parseDate("25/12/2024");
  ok("Unambiguous DD/MM/YYYY (day > 12)", d4 && d4.getDate() === 25 && d4.getMonth() === 11);
  
  ok("Empty string returns null", F.parseDate("") === null);
  ok("Invalid date returns null", F.parseDate("not-a-date") === null);
  ok("Null input returns null", F.parseDate(null) === null);
})();

// ============================================================================
// Years Between Tests
// ============================================================================
console.log("\nYears Between:");

(function () {
  var y1 = F.yearsBetween(d("2023-01-01"), d("2024-01-01"));
  ok("Exactly 1 year", approxEq(y1, 1.0, 0.01), "got " + y1.toFixed(3));
  
  var y2 = F.yearsBetween(d("2020-01-01"), d("2025-01-01"));
  ok("Exactly 5 years", approxEq(y2, 5.0, 0.02), "got " + y2.toFixed(3));
  
  var y3 = F.yearsBetween(d("2024-01-01"), d("2024-07-01"));
  ok("6 months ~ 0.5 years", approxEq(y3, 0.5, 0.02), "got " + y3.toFixed(3));
  
  var y4 = F.yearsBetween(d("2024-01-01"), d("2024-01-01"));
  ok("Same day = 0 years", y4 === 0);
})();

// ============================================================================
// Formatting Tests
// ============================================================================
console.log("\nFormatting:");

(function () {
  ok("fmtPct positive", F.fmtPct(0.2567) === "25.67%");
  ok("fmtPct negative", F.fmtPct(-0.15) === "-15.00%");
  ok("fmtPct null returns --", F.fmtPct(null) === "--");
  ok("fmtPct NaN returns --", F.fmtPct(NaN) === "--");
  
  ok("fmtSignedPct positive adds +", F.fmtSignedPct(0.25) === "+25.00%");
  ok("fmtSignedPct negative", F.fmtSignedPct(-0.10) === "-10.00%");
  ok("fmtSignedPct zero adds +", F.fmtSignedPct(0) === "+0.00%");
  
  ok("fmtNum with decimals", F.fmtNum(1234.567, 2) === "1,234.57");
  ok("fmtNum null returns --", F.fmtNum(null) === "--");
})();

// ============================================================================
// XNPV Tests (used internally by XIRR)
// ============================================================================
console.log("\nXNPV (internal):");

(function () {
  var flows = [
    { amount: -10000, date: d("2023-01-01") },
    { amount: 11000, date: d("2024-01-01") }
  ];
  var t0 = d("2023-01-01");
  
  // At 10% rate, NPV should be close to 0 for 10% return
  var npv10 = F.xnpv(0.10, flows, t0);
  ok("XNPV at exact return rate ~ 0", Math.abs(npv10) < 100, "got " + npv10.toFixed(2));
  
  // At 0% rate, NPV = sum of cash flows = 1000
  var npv0 = F.xnpv(0, flows, t0);
  ok("XNPV at 0% = sum of flows", approxEq(npv0, 1000, 1), "got " + npv0.toFixed(2));
})();

// ============================================================================
// Summary
// ============================================================================
console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
