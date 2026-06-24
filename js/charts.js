/* =============================================================================
 * charts.js — dependency-free SVG chart renderers.
 * Each function returns an HTML string (svg + legend) to drop into the DOM.
 *   - Charts.pie(data, opts)   data: [{label, value}]
 *   - Charts.bar(data, opts)   data: [{label, value}]  (supports +/- values)
 *   - Charts.line(data, opts)  data: [{label, value}]  (time series)
 * ===========================================================================*/

(function (global) {
  "use strict";

  var PALETTE = [
    "#667eea", "#34c759", "#ff9f0a", "#ff3b30", "#af52de",
    "#00c7be", "#ff2d55", "#5ac8fa", "#30d158", "#5856d6",
    "#ff6482", "#64d2ff", "#ffd60a", "#bf5af2", "#0a84ff"
  ];
  function color(i) { return PALETTE[i % PALETTE.length]; }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmt(n) {
    if (n == null || isNaN(n)) return "0";
    return Math.abs(n) >= 1000
      ? Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })
      : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  // ---- PIE / DONUT ----------------------------------------------------------
  function pie(data, opts) {
    opts = opts || {};
    var size = opts.size || 260;
    var r = size / 2 - 6;
    var cx = size / 2, cy = size / 2;
    var inner = opts.donut ? r * 0.58 : 0;

    var total = data.reduce(function (s, d) { return s + Math.max(0, d.value); }, 0);
    if (total <= 0) {
      return '<div class="empty-state"><div class="es-icon">📊</div>No data to chart</div>';
    }

    var angle = -Math.PI / 2; // start at 12 o'clock
    var paths = "";
    data.forEach(function (d, i) {
      var frac = Math.max(0, d.value) / total;
      if (frac <= 0) return;
      var a0 = angle, a1 = angle + frac * 2 * Math.PI;
      angle = a1;
      if (frac >= 0.9999) {
        // full circle — draw two arcs to avoid degenerate path
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color(i) + '"/>';
        if (inner) paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + inner + '" fill="var(--bg-card)"/>';
        return;
      }
      paths += arcSlice(cx, cy, r, inner, a0, a1, color(i));
    });

    var center = "";
    if (opts.donut && opts.centerLabel) {
      center = '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="var(--text)" font-size="16" font-weight="700">' +
        esc(opts.centerLabel) + '</text>';
      if (opts.centerSub) {
        center += '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" fill="var(--text-dim)" font-size="11">' +
          esc(opts.centerSub) + '</text>';
      }
    }

    var svg = '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" role="img">' +
      paths + center + '</svg>';

    var legend = '<div class="chart-legend">' + data.map(function (d, i) {
      var pct = total > 0 ? (Math.max(0, d.value) / total * 100) : 0;
      return '<span class="lg"><span class="sw" style="background:' + color(i) + '"></span>' +
        esc(d.label) + ' <strong>' + pct.toFixed(1) + '%</strong></span>';
    }).join("") + '</div>';

    return svg + legend;
  }

  function arcSlice(cx, cy, r, inner, a0, a1, fill) {
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    if (inner > 0) {
      var xi0 = cx + inner * Math.cos(a1), yi0 = cy + inner * Math.sin(a1);
      var xi1 = cx + inner * Math.cos(a0), yi1 = cy + inner * Math.sin(a0);
      return '<path d="M' + x0 + ' ' + y0 +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
        ' L' + xi0 + ' ' + yi0 +
        ' A' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + xi1 + ' ' + yi1 +
        ' Z" fill="' + fill + '"><title></title></path>';
    }
    return '<path d="M' + cx + ' ' + cy + ' L' + x0 + ' ' + y0 +
      ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
      ' Z" fill="' + fill + '"/>';
  }

  // ---- BAR (horizontal, supports negative values) --------------------------
  function bar(data, opts) {
    opts = opts || {};
    if (!data.length) {
      return '<div class="empty-state"><div class="es-icon">📊</div>No data to chart</div>';
    }
    var w = opts.width || 560;
    var rowH = opts.rowH || 30, gap = 8;
    var padL = opts.labelWidth || 130, padR = 70, padT = 8, padB = 8;
    var h = padT + padB + data.length * rowH + (data.length - 1) * gap;
    var plotW = w - padL - padR;

    var maxAbs = data.reduce(function (m, d) { return Math.max(m, Math.abs(d.value)); }, 0) || 1;
    var hasNeg = data.some(function (d) { return d.value < 0; });
    var zeroX = hasNeg ? padL + plotW / 2 : padL;
    var scale = hasNeg ? (plotW / 2) / maxAbs : plotW / maxAbs;

    var rows = data.map(function (d, i) {
      var y = padT + i * (rowH + gap);
      var len = Math.abs(d.value) * scale;
      var x = d.value >= 0 ? zeroX : zeroX - len;
      var fill = opts.colorBySign
        ? (d.value >= 0 ? "var(--green)" : "var(--red)")
        : color(i);
      var valX = d.value >= 0 ? (x + len + 6) : (x - 6);
      var anchor = d.value >= 0 ? "start" : "end";
      var valFill = opts.colorBySign ? fill : "var(--text-dim)";
      return '<text x="' + (padL - 8) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end" fill="var(--text-dim)" font-size="12">' +
          esc(trim(d.label, 18)) + '</text>' +
        '<rect x="' + x + '" y="' + y + '" width="' + Math.max(1, len) + '" height="' + rowH +
          '" rx="3" fill="' + fill + '"/>' +
        '<text x="' + valX + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="' + anchor +
          '" fill="' + valFill + '" font-size="12">' + esc(opts.valuePrefix || "") + fmt(d.value) +
          esc(opts.valueSuffix || "") + '</text>';
    }).join("");

    var axis = '<line x1="' + zeroX + '" y1="' + padT + '" x2="' + zeroX + '" y2="' + (h - padB) +
      '" stroke="var(--border)" stroke-width="1"/>';

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + axis + rows + '</svg>';
  }

  // ---- LINE (time series) ---------------------------------------------------
  function line(data, opts) {
    opts = opts || {};
    if (data.length < 2) {
      return '<div class="empty-state"><div class="es-icon">📈</div>Not enough data points to chart</div>';
    }
    var w = opts.width || 600, h = opts.height || 240;
    var padL = 56, padR = 16, padT = 16, padB = 34;
    var plotW = w - padL - padR, plotH = h - padT - padB;

    var vals = data.map(function (d) { return d.value; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (min === max) { min = min * 0.95; max = max * 1.05 || 1; }
    var range = max - min;

    function px(i) { return padL + (plotW * i / (data.length - 1)); }
    function py(v) { return padT + plotH - ((v - min) / range) * plotH; }

    // gridlines + y labels (4 bands)
    var grid = "", i;
    for (i = 0; i <= 4; i++) {
      var gv = min + range * i / 4;
      var gy = py(gv);
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy +
        '" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>' +
        '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" fill="var(--text-faint)" font-size="11">' +
        esc(opts.valuePrefix || "") + fmt(gv) + '</text>';
    }

    var dPath = "", area = "";
    data.forEach(function (d, idx) {
      var X = px(idx), Y = py(d.value);
      dPath += (idx === 0 ? "M" : "L") + X.toFixed(1) + " " + Y.toFixed(1) + " ";
    });
    area = dPath + "L" + px(data.length - 1).toFixed(1) + " " + (padT + plotH) +
      " L" + px(0).toFixed(1) + " " + (padT + plotH) + " Z";

    var dots = data.map(function (d, idx) {
      return '<circle cx="' + px(idx).toFixed(1) + '" cy="' + py(d.value).toFixed(1) +
        '" r="2.5" fill="var(--accent)"/>';
    }).join("");

    // x labels: first, middle, last
    var xls = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    var xlabels = xls.map(function (idx) {
      return '<text x="' + px(idx).toFixed(1) + '" y="' + (h - 12) +
        '" text-anchor="middle" fill="var(--text-faint)" font-size="11">' +
        esc(trim(data[idx].label, 12)) + '</text>';
    }).join("");

    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      grid +
      '<path d="' + area + '" fill="rgba(77,163,255,0.12)" stroke="none"/>' +
      '<path d="' + dPath + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
      dots + xlabels +
      '</svg>';
  }

  function trim(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  }

  global.Charts = { pie: pie, bar: bar, line: line, color: color, PALETTE: PALETTE };
})(window);
