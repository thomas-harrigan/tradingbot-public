"use strict";

var canvas = document.getElementById("screen");
var ctx = canvas.getContext("2d", { alpha: false });
var pauseBtn = document.getElementById("pause");

var COLORS = ["#39ff88", "#ff3b6a", "#3ee0ff", "#ff3df0", "#ffe14a", "#9b5cff"];
var WORDS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "MU", "ARM", "SMCI", "PLTR", "COIN", "SPY", "QQQ", "NFLX", "INTC", "BA", "CAT", "ORCL", "CRM", "ADBE", "NOW", "SNOW", "PANW", "CRWD", "DELL", "ASML", "TSM", "QCOM", "AMAT", "COST", "WMT", "HD", "DE", "GE", "HON", "ANET", "SHOP"];
var SCALES = [0.42, 1.17, 3.84, 8.6, 18.25, 47.5, 88.4, 126.8, 188.2, 247.15, 412, 891.4, 1420, 2406, 6840, 12850];
var FOCUS = "NVDA";
var BUILD = "wall-7";
var TOASTS = [
  ["Still live?", "The lights are still on.", "Stay"],
  ["Sync lost", "Nothing was connected.", "Retry"],
  ["Accept lights", "There is nothing to accept.", "Accept"],
  ["On top", "This box is covering the panel.", "Close"],
  ["Are you sure?", "Both buttons do the same thing.", "Yes"],
  ["Session", "There is no session.", "Continue"]
];
var BANNERS = [
  "Click anywhere to continue",
  "Click the other button",
  "This banner does not go away",
  "Accept to keep watching lights"
];

var frame = 0;
var userPaused = false;
var hidden = document.hidden;
var raf = 0;
var W = 1;
var H = 1;
var hits = [];
var candles = [];
var bars = [];
var barNow = [];
var logLines = [];
var modalHideUntil = 0;
var toastIx = 0;
var bannerIx = 0;
var bookFlash = 0;
var bills = [];
var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hash(n) {
  var x = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function unit(a, b) {
  return hash(Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 17, 0x85ebca6b));
}

function money(id, salt, f) {
  var scale = SCALES[Math.abs(id + salt * 3) % SCALES.length];
  var slam = unit(id + salt * 11, f);
  var mult = 0.82 + unit(id * 5 + salt, f + 9) * 0.36;
  if (slam > 0.93) mult = 4 + unit(id, f + salt) * 8;
  else if (slam < 0.06) mult = 0.04 + unit(id + 2, f) * 0.08;
  return scale * mult;
}

function fmt(v) {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
}

function label(str, x, y, size, fill, align) {
  ctx.font = "600 " + size + "px ui-monospace, monospace";
  ctx.fillStyle = fill;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}

function hit(x, y, w, h, fn) {
  hits.push({ x: x, y: y, w: w, h: h, fn: fn });
}

function fit() {
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeCandle(prevClose, f, i) {
  var roll = unit(f + i, 11);
  var delta = (unit(f, i + 2) - 0.5) * 0.07;
  if (roll > 0.9) delta = (unit(f, i + 4) - 0.5) * 0.32;
  var open = prevClose;
  var close = Math.max(0.08, Math.min(0.94, open + delta));
  if (roll > 0.78 && roll <= 0.9) close = open + (unit(f, i) - 0.5) * 0.012;
  var wick = roll > 0.66 ? 0.05 + unit(f, i + 6) * 0.16 : 0.008 + unit(f, i + 7) * 0.03;
  return {
    o: open,
    h: Math.min(0.98, Math.max(open, close) + wick),
    l: Math.max(0.02, Math.min(open, close) - wick * unit(f, i + 8)),
    c: close
  };
}

function seed() {
  if (!candles.length) {
    var v = 0.55;
    var i;
    for (i = 0; i < 48; i++) {
      var c = makeCandle(v, i * 3, i);
      candles.push(c);
      v = c.c;
    }
  }
  if (!bars.length) {
    var b;
    for (b = 0; b < 12; b++) {
      bars.push(0.08 + hash(b + 20) * 0.9);
      barNow.push(bars[b]);
    }
  }
  if (!logLines.length) {
    logLines.push("NVDA  " + fmt(188.2));
    logLines.push("AAPL  " + fmt(226.4));
    logLines.push("SPY  " + fmt(572));
  }
}

function step(f) {
  seed();
  var last = candles[candles.length - 1];
  if (f % 7 === 0) {
    candles.push(makeCandle(last.c, f, candles.length));
    if (candles.length > 90) candles.shift();
  } else {
    var live = last.c + (unit(f, 2) - 0.5) * 0.01;
    last.c = Math.max(last.l, Math.min(last.h, live));
  }
  if (f % 20 === 0) {
    var k;
    for (k = 0; k < bars.length; k++) {
      var roll = unit(f, k + 3);
      bars[k] = roll < 0.18 ? 0.04 : (roll > 0.82 ? 0.92 + unit(f, k) * 0.08 : 0.15 + roll * 0.7);
    }
    bookFlash = f % 8;
    logLines.push(WORDS[f % WORDS.length] + "  " + fmt(money(f, 4, f >> 3)));
    if (logLines.length > 40) logLines.shift();
  }
  var j;
  for (j = 0; j < barNow.length; j++) barNow[j] += (bars[j] - barNow[j]) * 0.18;
}

function layout() {
  var pad = 8;
  var gap = 8;
  var compact = W < 800;
  var ticker = { x: pad, y: pad, w: W - pad * 2, h: 28 };
  var pills = { x: pad, y: ticker.y + ticker.h + 6, w: W - pad * 2, h: 30 };
  var bannerH = compact ? 32 : 36;
  var logH = compact ? 64 : 78;
  var banner = { x: pad, y: H - pad - bannerH, w: W - pad * 2, h: bannerH };
  var log = { x: pad, y: banner.y - 6 - logH, w: W - pad * 2, h: logH };
  var top = pills.y + pills.h + gap;
  var bottom = log.y - gap;
  var avail = Math.max(120, bottom - top);

  if (compact) {
    var weights = [2.2, 3.2, 2.4, 2.2, 2.4];
    var sum = 2.2 + 3.2 + 2.4 + 2.2 + 2.4;
    var gaps = gap * 4;
    var usable = Math.max(100, avail - gaps);
    var yy = top;
    var hs = [];
    var i;
    for (i = 0; i < weights.length; i++) hs.push(Math.floor(usable * weights[i] / sum));
    function take(h) {
      var r = { x: pad, y: yy, w: W - pad * 2, h: h };
      yy += h + gap;
      return r;
    }
    return {
      compact: true,
      ticker: ticker,
      pills: pills,
      price: take(hs[0]),
      chart: take(hs[1]),
      bubbles: take(hs[2]),
      gauges: take(hs[3]),
      ipad: take(hs[4]),
      book: null,
      bars: null,
      log: log,
      banner: banner
    };
  }

  var topH = Math.floor(avail * 0.4);
  var midH = Math.floor(avail * 0.28);
  var botH = avail - topH - midH - gap * 2;
  var col = Math.floor((W - pad * 2 - gap * 2) / 3);
  var midY = top + topH + gap;
  var botY = midY + midH + gap;
  return {
    compact: false,
    ticker: ticker,
    pills: pills,
    price: { x: pad, y: top, w: col, h: topH },
    chart: { x: pad + col + gap, y: top, w: col, h: topH },
    gauges: { x: pad + (col + gap) * 2, y: top, w: W - pad - (pad + (col + gap) * 2), h: topH },
    bubbles: { x: pad, y: midY, w: W - pad * 2, h: midH },
    book: { x: pad, y: botY, w: col, h: botH },
    bars: { x: pad + col + gap, y: botY, w: col, h: botH },
    ipad: { x: pad + (col + gap) * 2, y: botY, w: W - pad - (pad + (col + gap) * 2), h: botH },
    log: log,
    banner: banner
  };
}

function panel(x, y, w, h, title, f, id) {
  rounded(x, y, w, h, 8);
  ctx.fillStyle = "#0c1220";
  ctx.fill();
  var flash = ((f + id * 13) % 50) < 5;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = flash ? "#ff3df0" : "#1d4638";
  ctx.stroke();
  ctx.fillStyle = "#10182c";
  ctx.fillRect(x + 1, y + 1, w - 2, 24);
  var on = ((f + id * 5) % 18) < 9;
  ctx.fillStyle = on ? COLORS[id % COLORS.length] : "#173028";
  ctx.beginPath();
  ctx.arc(x + 14, y + 13, on ? 4.5 : 3.2, 0, Math.PI * 2);
  ctx.fill();
  label(title, x + 24, y + 13, 12, "#e7fff4", "left");
  var px = fmt(money(id, 0, f >> 3));
  label(px, x + w - 10, y + 13, 12, on ? "#39ff88" : "#9dffc4", "right");
  return { x: x + 10, y: y + 32, w: Math.max(8, w - 20), h: Math.max(8, h - 42) };
}

function drawTicker(r, f) {
  rounded(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = "#080d18";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  var chunk = "";
  var i;
  for (i = 0; i < WORDS.length; i++) chunk += "   " + WORDS[i] + " " + fmt(money(i, 1, f >> 3));
  chunk += "   ";
  ctx.font = "600 13px ui-monospace, monospace";
  var tw = ctx.measureText(chunk).width || 1;
  var offset = -((f * 1.6) % tw);
  var c = ((f % 40) < 8) ? "#ffe14a" : "#8dffe0";
  ctx.fillStyle = c;
  ctx.textBaseline = "middle";
  var x;
  for (x = offset; x < r.w + tw; x += tw) ctx.fillText(chunk, r.x + 72 + x, r.y + r.h / 2);
  ctx.restore();
  var pill = ((f >> 4) % 2 === 0) ? "NO BROKER" : "LIGHTS ONLY";
  var pw = 118;
  rounded(r.x + r.w - pw - 6, r.y + 4, pw, r.h - 8, 4);
  ctx.fillStyle = (f % 24 < 4) ? "#ff3b6a" : "#102033";
  ctx.fill();
  label(pill, r.x + r.w - 12, r.y + r.h / 2, 11, "#f4fff8", "right");
}

function drawPills(r, f) {
  var n = r.w < 720 ? 6 : 12;
  var slot = r.w / n;
  var i;
  for (i = 0; i < n; i++) {
    var on = ((f + i * 7) % (12 + (i % 5))) < 6;
    var cx = r.x + slot * i + 12;
    ctx.fillStyle = on ? COLORS[i % COLORS.length] : "#1a2433";
    ctx.beginPath();
    ctx.arc(cx, r.y + r.h / 2, on ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    label(WORDS[i], cx + 10, r.y + r.h / 2, 11, on ? "#f3fff8" : "#7d8b86", "left");
  }
}

function drawPrice(r, f) {
  var box = panel(r.x, r.y, r.w, r.h, FOCUS, f, 1);
  var last = candles[candles.length - 1];
  var prev = candles[candles.length - 2] || last;
  var up = last.c >= prev.c;
  var px = (188.2 * (0.62 + last.c * 0.7)).toFixed(2);
  label(px, box.x, box.y + Math.min(22, box.h * 0.28), Math.min(42, Math.max(22, box.w / 6)), up ? "#39ff88" : "#ff3b6a", "left");
  label(up ? "UP" : "DOWN", box.x + box.w - 4, box.y + 16, 12, up ? "#39ff88" : "#ff3b6a", "right");
  var sparkTop = box.y + 36;
  var sparkBot = box.y + box.h - 22;
  var spark = { x: box.x, y: sparkTop, w: box.w, h: Math.max(12, sparkBot - sparkTop) };
  ctx.save();
  ctx.beginPath();
  ctx.rect(spark.x, spark.y, spark.w, spark.h);
  ctx.clip();
  ctx.strokeStyle = up ? "#39ff88" : "#ff3df0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  var n = Math.min(candles.length, 30);
  var start = candles.length - n;
  var i;
  for (i = 0; i < n; i++) {
    var x = spark.x + (i / Math.max(1, n - 1)) * spark.w;
    var y = spark.y + (1 - candles[start + i].c) * spark.h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  if (box.h > 70) {
    var stats = ["AAPL", "MSFT", "AMD"];
    var sw = box.w / 3;
    for (i = 0; i < 3; i++) {
      var on = ((f + i * 9) % 16) < 8;
      label(stats[i] + " " + fmt(money(i + 3, 2, f >> 4)), box.x + sw * i, box.y + box.h - 8, 11, on ? COLORS[i] : "#89a096", "left");
    }
  }
}

function drawChart(r, f) {
  var box = panel(r.x, r.y, r.w, r.h, "TSLA", f, 2);
  var n = Math.max(8, Math.min(candles.length, Math.floor(box.w / 9)));
  var start = candles.length - n;
  var cw = box.w / n;
  var i;
  for (i = 0; i < n; i++) {
    var c = candles[start + i];
    var up = c.c >= c.o;
    var x = box.x + i * cw + cw * 0.5;
    ctx.strokeStyle = up ? "#39ff88" : "#ff3b6a";
    if (i % 9 === 0) ctx.strokeStyle = up ? "#ffe14a" : "#3ee0ff";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, box.y + (1 - c.h) * box.h);
    ctx.lineTo(x, box.y + (1 - c.l) * box.h);
    ctx.stroke();
    var top = box.y + (1 - Math.max(c.o, c.c)) * box.h;
    var bh = Math.max(2, Math.abs(c.c - c.o) * box.h);
    ctx.fillRect(x - Math.max(2, cw * 0.28), top, Math.max(3, cw * 0.56), bh);
  }
  var sweep = box.x + ((f * 2) % box.w);
  ctx.strokeStyle = "rgba(62,224,255,0.85)";
  ctx.beginPath();
  ctx.moveTo(sweep, box.y);
  ctx.lineTo(sweep, box.y + box.h);
  ctx.stroke();
}

function drawBubbles(r, f) {
  var box = panel(r.x, r.y, r.w, r.h, "AMD", f, 3);
  var n = 22;
  var pts = [];
  var i;
  for (i = 0; i < n; i++) {
    var bx = 0.08 + hash(i * 3 + 2) * 0.84;
    var by = 0.12 + hash(i * 5 + 1) * 0.76;
    var x = box.x + bx * box.w + Math.sin(f * 0.03 + i) * 12;
    var y = box.y + by * box.h + Math.cos(f * 0.025 + i * 1.3) * 8;
    pts.push([x, y, 3 + hash(i + 11) * 7]);
  }
  ctx.lineWidth = 1;
  for (i = 0; i < n; i++) {
    var a = pts[i];
    var b = pts[(i * 5 + 3) % n];
    if (((f + i) % 20) <= 3) continue;
    ctx.strokeStyle = COLORS[(i + Math.floor(f / 12)) % COLORS.length];
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < n; i++) {
    if (((f + i * 4) % 14) <= 2) continue;
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], pts[i][2], 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGauges(r, f) {
  var box = panel(r.x, r.y, r.w, r.h, "AVGO", f, 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  var n = 3;
  var gw = box.w / n;
  var i;
  for (i = 0; i < n; i++) {
    var cx = box.x + gw * i + gw / 2;
    var cy = box.y + Math.min(box.h * 0.42, 70);
    var rad = Math.max(16, Math.min(gw * 0.34, box.h * 0.28));
    ctx.strokeStyle = "#183228";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    var ang = Math.PI + (f * (0.04 + i * 0.02) + i);
    ctx.strokeStyle = COLORS[i];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (rad - 2), cy + Math.sin(ang) * (rad - 2));
    ctx.stroke();
    label(WORDS[i + 4], cx, cy + rad + 12, 11, "#d7fff0", "center");
  }
  var meterY = box.y + box.h - 18;
  var mw = box.w / bars.length;
  for (i = 0; i < bars.length; i++) {
    var h = Math.max(2, barNow[i] * Math.min(36, box.h * 0.22));
    ctx.fillStyle = (i % 2) ? "#ff3df0" : "#39ff88";
    if (((f + i) % 30) < 3) ctx.fillStyle = "#ffe14a";
    ctx.fillRect(box.x + i * mw + 2, meterY - h, Math.max(2, mw - 4), h);
  }
  ctx.restore();
}

function drawBook(r, f) {
  if (!r) return;
  var box = panel(r.x, r.y, r.w, r.h, "META", f, 5);
  var rows = Math.max(3, Math.floor(box.h / 18));
  var rh = box.h / rows;
  var i;
  ctx.font = "600 12px ui-monospace, monospace";
  for (i = 0; i < rows; i++) {
    var hot = bookFlash === (i % 8) && (f % 24) < 10;
    ctx.fillStyle = hot ? (i % 2 ? "rgba(255,59,106,0.9)" : "rgba(57,255,136,0.85)") : "rgba(255,255,255,0.03)";
    ctx.fillRect(box.x, box.y + i * rh, box.w, rh - 2);
    ctx.fillStyle = hot ? "#081018" : (i % 2 ? "#ff8aa3" : "#9dffc4");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(WORDS[(i * 3) % WORDS.length], box.x + 4, box.y + i * rh + rh / 2);
    ctx.textAlign = "right";
    ctx.fillText(fmt(money(i + 6, 2, (f >> 4) + i)), box.x + box.w - 4, box.y + i * rh + rh / 2);
  }
}

function drawBars(r, f) {
  if (!r) return;
  var box = panel(r.x, r.y, r.w, r.h, "AMZN", f, 6);
  var n = Math.min(barNow.length, 10);
  var bw = box.w / n;
  var i;
  for (i = 0; i < n; i++) {
    var h = Math.max(4, barNow[i] * box.h);
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(box.x + i * bw + 3, box.y + box.h - h, Math.max(3, bw - 6), h);
  }
}

function drawIpad(r, f) {
  rounded(r.x, r.y, r.w, r.h, 16);
  ctx.fillStyle = "#171b22";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ((f % 36) < 4) ? "#ff3df0" : "#3a4252";
  ctx.stroke();
  var on = (f % 16) < 8;
  ctx.fillStyle = on ? "#ff3b6a" : "#2c3340";
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, r.y + 12, 3, 0, Math.PI * 2);
  ctx.fill();
  var screen = { x: r.x + 12, y: r.y + 22, w: r.w - 24, h: r.h - 34 };
  rounded(screen.x, screen.y, screen.w, screen.h, 8);
  ctx.fillStyle = "#070b14";
  ctx.fill();
  label("QQQ  " + fmt(money(15, 1, f >> 3)), screen.x + 8, screen.y + 12, 11, "#9dffe4", "left");
  var dots = 8;
  var i;
  for (i = 0; i < dots; i++) {
    var lit = ((f + i * 3) % 10) < 5;
    ctx.fillStyle = lit ? COLORS[i % COLORS.length] : "#1b2830";
    ctx.beginPath();
    ctx.arc(screen.x + 16 + i * 16, screen.y + 28, lit ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  var plot = { x: screen.x + 8, y: screen.y + 40, w: screen.w - 16, h: Math.max(20, screen.h - 52) };
  ctx.strokeStyle = "#3ee0ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  var n = Math.min(24, candles.length);
  var start = candles.length - n;
  for (i = 0; i < n; i++) {
    var x = plot.x + (i / Math.max(1, n - 1)) * plot.w;
    var y = plot.y + (1 - candles[start + i].c) * plot.h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawLog(r, f) {
  rounded(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = "#070b14";
  ctx.fill();
  ctx.strokeStyle = "#1d4638";
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  var line = 16;
  var scroll = (f % 18) * (line / 18);
  var rows = Math.ceil(r.h / line) + 2;
  var i;
  for (i = 0; i < rows; i++) {
    var idx = logLines.length - 1 - i;
    if (idx < 0) break;
    var y = r.y + 6 + i * line - scroll;
    label(logLines[idx], r.x + 10, y + 8, 12, COLORS[idx % COLORS.length], "left");
  }
  ctx.restore();
}

function drawBanner(r, f) {
  var flash = (f % 20) < 6;
  rounded(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = flash ? "#ff3b6a" : "#241018";
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffe14a" : "#ff3df0";
  ctx.stroke();
  label(BANNERS[bannerIx % BANNERS.length], r.x + 12, r.y + r.h / 2, 13, "#fff6f8", "left");
  var bw = 88;
  var bx = r.x + r.w - bw - 8;
  var by = r.y + 6;
  rounded(bx, by, bw, r.h - 12, 4);
  ctx.fillStyle = "#ffe14a";
  ctx.fill();
  label("Continue", bx + bw / 2, r.y + r.h / 2, 12, "#1a1008", "center");
  hit(r.x, r.y, r.w, r.h, function () {
    bannerIx = (bannerIx + 1) % BANNERS.length;
  });
}

function drawToast(f) {
  var msg = TOASTS[toastIx % TOASTS.length];
  var w = Math.min(340, W - 24);
  var h = 64;
  var x = W - w - 12;
  var y = 78;
  var flash = (f % 16) < 4;
  rounded(x, y, w, h, 8);
  ctx.fillStyle = flash ? "#3a1020" : "#140c18";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash ? "#ffe14a" : "#ff3df0";
  ctx.stroke();
  label(msg[0], x + 12, y + 18, 14, "#ffe14a", "left");
  label(msg[1], x + 12, y + 40, 12, "#ffd0dc", "left");
  rounded(x + w - 78, y + 18, 64, 28, 4);
  ctx.fillStyle = "#ff3b6a";
  ctx.fill();
  label(msg[2], x + w - 46, y + 32, 12, "#1a0810", "center");
  hit(x + w - 78, y + 18, 64, 28, function () {
    toastIx = (toastIx + 1) % TOASTS.length;
  });
  hit(x + w - 28, y + 4, 22, 18, function () {
    toastIx = (toastIx + 1) % TOASTS.length;
  });
  label("x", x + w - 16, y + 13, 12, "#ffd0dc", "center");
}

function drawModal(f) {
  var show = f > modalHideUntil && (Math.floor(f / 220) % 2 === 0) && (f % 220) < 100;
  if (!show) return;
  var w = Math.min(360, W - 40);
  var h = 150;
  var x = (W - w) / 2;
  var y = H * 0.42;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, H);
  var flash = (f % 10) < 3;
  rounded(x, y, w, h, 10);
  ctx.fillStyle = "#120814";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = flash ? "#ffe14a" : "#ff3b6a";
  ctx.stroke();
  label("Still there?", x + 16, y + 28, 18, "#ffe14a", "left");
  label("Close does not close. " + WORDS[f % WORDS.length] + " " + fmt(money(f, 3, f >> 2)), x + 16, y + 58, 12, "#ffd5e0", "left");
  var bw = (w - 48) / 2;
  rounded(x + 16, y + 88, bw, 36, 6);
  ctx.fillStyle = "#39ff88";
  ctx.fill();
  label("Close", x + 16 + bw / 2, y + 106, 14, "#062014", "center");
  rounded(x + 32 + bw, y + 88, bw, 36, 6);
  ctx.fillStyle = "#ff3df0";
  ctx.fill();
  label("Also close", x + 32 + bw + bw / 2, y + 106, 14, "#1a0814", "center");
  function nope() { modalHideUntil = frame + 28; }
  hit(x + 16, y + 88, bw, 36, nope);
  hit(x + 32 + bw, y + 88, bw, 36, nope);
}

function drawBill(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.fillStyle = b.tone === 0 ? "#39ff88" : (b.tone === 1 ? "#b6ff4a" : "#ffe14a");
  ctx.strokeStyle = "#062014";
  ctx.lineWidth = 1.5;
  rounded(-b.w / 2, -b.h / 2, b.w, b.h, 3);
  ctx.fill();
  ctx.stroke();
  label("$", 0, 1, Math.max(9, b.h * 0.7), "#062014", "center");
  ctx.restore();
}

function drawMoney(f, anchor) {
  var pw = 168;
  var ph = 72;
  var x = W - pw - 14;
  var y = anchor.y - ph - 8;
  var i;
  if ((f % 3) === 0 && bills.length < 80) {
    var burst = (f % 15 === 0) ? 4 : 1;
    for (i = 0; i < burst; i++) {
      var ang = unit(f + i, 6) * Math.PI * 2;
      var speed = 3.5 + unit(f + i, 8) * 9;
      bills.push({
        x: x + 36,
        y: y + 16,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1.5,
        rot: unit(f, i) * 6,
        spin: (unit(f + i, 4) - 0.5) * 0.4,
        w: 22 + unit(f + i, 2) * 26,
        h: 12 + unit(f + i, 3) * 10,
        tone: (f + i) % 3
      });
    }
  }
  for (i = 0; i < bills.length; i++) {
    var b = bills[i];
    b.x += b.vx;
    b.y += b.vy;
    b.vy += 0.03;
    b.rot += b.spin;
    if (b.x < 12 || b.x > W - 12) b.vx *= -1;
    if (b.y < 12 || b.y > H - 12) b.vy *= -0.9;
    b.x = Math.max(10, Math.min(W - 10, b.x));
    b.y = Math.max(10, Math.min(H - 10, b.y));
    if (unit(i, f >> 5) > 0.96) {
      b.vx = (unit(i, f) - 0.5) * 14;
      b.vy = (unit(i + 3, f) - 0.5) * 12;
    }
    drawBill(b);
  }
  var shake = (f % 3) - 1;
  ctx.save();
  ctx.translate(shake, (f % 2));
  rounded(x, y, pw, ph, 10);
  ctx.fillStyle = "#10141c";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = (f % 4 === 0) ? "#39ff88" : "#ffe14a";
  ctx.stroke();
  ctx.fillStyle = "#39ff88";
  ctx.fillRect(x + 14, y + 12, 90, 8 + (f % 3));
  ctx.fillStyle = "#062014";
  ctx.fillRect(x + 18, y + 14, 68, 3);
  label("BRR" + (f % 2 ? "R" : "RR"), x + 16, y + 46, 18 + (f % 5), "#ffe14a", "left");
  label("PRINTER", x + 96, y + 28, 11, "#ff3b6a", "left");
  ctx.restore();
}

function draw(f) {
  hits = [];
  seed();
  var L = layout();
  ctx.fillStyle = "#070b12";
  ctx.fillRect(0, 0, W, H);
  drawTicker(L.ticker, f);
  drawPills(L.pills, f);
  drawPrice(L.price, f);
  drawChart(L.chart, f);
  drawBubbles(L.bubbles, f);
  drawGauges(L.gauges, f);
  drawBook(L.book, f);
  drawBars(L.bars, f);
  drawIpad(L.ipad, f);
  drawLog(L.log, f);
  drawBanner(L.banner, f);
  drawMoney(f, L.banner);
  if (!L.compact) {
    drawToast(f);
    drawModal(f);
  } else {
    drawModal(f);
  }
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (userPaused || hidden) return;
  frame += 1;
  step(frame);
  draw(frame);
}

function setPaused(next) {
  userPaused = next;
  pauseBtn.textContent = userPaused ? "Play" : "Pause";
  pauseBtn.classList.toggle("is-paused", userPaused);
}

pauseBtn.addEventListener("click", function (event) {
  event.stopPropagation();
  setPaused(!userPaused);
});

document.addEventListener("keydown", function (event) {
  if (event.key === "p" || event.key === "P" || event.key === "Escape") setPaused(!userPaused);
});

canvas.addEventListener("pointerdown", function (event) {
  var rect = canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  var i;
  for (i = hits.length - 1; i >= 0; i--) {
    var h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
      h.fn();
      draw(frame);
      return;
    }
  }
  bannerIx = (bannerIx + 1) % BANNERS.length;
  draw(frame);
});

document.addEventListener("visibilitychange", function () {
  hidden = document.hidden;
});

window.addEventListener("resize", function () {
  fit();
  draw(frame);
});

fit();
seed();
if (reduceMotion) setPaused(true);
draw(frame);
loop();
