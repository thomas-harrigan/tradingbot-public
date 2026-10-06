"use strict";

var canvas = document.getElementById("screen");
var ctx = canvas.getContext("2d", { alpha: false });
var pauseBtn = document.getElementById("pause");
var printer = document.getElementById("printer");

var UP = "#2ebd85";
var DOWN = "#f6465d";
var BG = "#0b0e11";
var PANEL = "#161a1e";
var LINE = "#2b3139";
var TEXT = "#eaecef";
var MUTED = "#848e9c";
var BUILD = "wall-9";

var SEEDS = [
  ["NVDA", 128.4], ["AAPL", 189.15], ["MSFT", 418.55], ["AMZN", 186.2],
  ["GOOGL", 168.42], ["META", 582.1], ["TSLA", 248.75], ["AMD", 164.3],
  ["AVGO", 172.9], ["MU", 94.6], ["ARM", 142.2], ["SPY", 571.4],
  ["QQQ", 488.15], ["NFLX", 712.4], ["INTC", 23.4], ["BA", 156.8],
  ["CAT", 388.2], ["ORCL", 172.5], ["COST", 886.4], ["WMT", 80.15]
];

var frame = 0;
var userPaused = false;
var hidden = document.hidden;
var raf = 0;
var W = 1;
var H = 1;
var hits = [];
var candles = [];
var bills = [];
var modalKick = 0;
var quotes = SEEDS.map(function (row, i) {
  return { sym: row[0], px: row[1], open: row[1], i: i };
});
var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hash(n) {
  var x = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function unit(a, b) {
  return hash(Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 17, 0x85ebca6b));
}

function fmt(v) {
  return v.toFixed(v >= 1000 ? 1 : 2);
}

function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
}

function text(str, x, y, size, fill, align) {
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

function pushCandle(px, i, shockScale) {
  var prev = candles.length ? candles[candles.length - 1].c : px;
  var shock = (unit(i, 21) - 0.48) * px * shockScale;
  if (unit(i, 22) > 0.9) shock *= 2.2;
  shock = Math.max(-px * 0.008, Math.min(px * 0.008, shock));
  var o = prev;
  var c = o + shock;
  if (unit(i, 27) > 0.93) c = o + (unit(i, 28) - 0.5) * px * 0.0005;
  var body = Math.abs(c - o);
  var cap = px * 0.006;
  var upW = Math.min(cap, body * (0.4 + unit(i, 23) * (unit(i, 24) > 0.82 ? 2.4 : 0.8)) + px * 0.0004);
  var dnW = Math.min(cap, body * (0.35 + unit(i, 25) * (unit(i, 26) > 0.86 ? 2.2 : 0.7)) + px * 0.0003);
  candles.push({
    o: o,
    c: c,
    h: Math.max(o, c) + upW,
    l: Math.max(0.01, Math.min(o, c) - dnW),
    v: 0.2 + unit(i, 29) * 0.8
  });
  if (candles.length > 80) candles.shift();
  return c;
}

function seed() {
  if (candles.length) return;
  var px = quotes[0].open;
  var i;
  for (i = 0; i < 60; i++) px = pushCandle(quotes[0].open, i, 0.007);
  quotes[0].px = candles[candles.length - 1].c;
}

function step(f) {
  seed();
  var i;
  for (i = 0; i < quotes.length; i++) {
    var q = quotes[i];
    q.px += (unit(f, i + 4) - 0.5) * q.open * 0.0011;
  }
  if (f % 10 === 0) {
    quotes[0].px = pushCandle(quotes[0].px, f, 0.004);
  } else {
    var last = candles[candles.length - 1];
    var drift = (unit(f, 2) - 0.5) * quotes[0].open * 0.00035;
    last.c += drift;
    last.h = Math.max(last.h, last.c);
    last.l = Math.min(last.l, last.c);
    quotes[0].px = last.c;
  }
  if (modalKick > 0) modalKick -= 1;
}

function layout() {
  var pad = 10;
  var gap = 8;
  var tape = { x: pad, y: pad, w: W - pad * 2, h: 28 };
  var head = { x: pad, y: tape.y + tape.h + gap, w: W - pad * 2, h: 52 };
  var top = head.y + head.h + gap;
  var printerH = W < 760 ? 92 : 130;
  var bottom = H - pad;
  if (W < 760) {
    var chartH = Math.max(160, Math.floor((bottom - top - printerH) * 0.62));
    return {
      compact: true,
      tape: tape,
      head: head,
      chart: { x: pad, y: top, w: W - pad * 2, h: chartH },
      list: { x: pad, y: top + chartH + gap, w: W - pad * 2, h: Math.max(40, bottom - printerH - (top + chartH + gap)) },
      book: null
    };
  }
  var listW = Math.min(230, Math.floor(W * 0.2));
  var bookW = Math.min(250, Math.floor(W * 0.2));
  var midW = W - pad * 2 - listW - bookW - gap * 2;
  return {
    compact: false,
    tape: tape,
    head: head,
    list: { x: pad, y: top, w: listW, h: bottom - top },
    chart: { x: pad + listW + gap, y: top, w: midW, h: bottom - top },
    book: { x: pad + listW + gap + midW + gap, y: top, w: bookW, h: bottom - top - printerH }
  };
}

function panel(r) {
  rounded(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE;
  ctx.stroke();
}

function drawTape(r, f) {
  panel(r);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w - 108, r.h);
  ctx.clip();
  var chunk = "";
  var i;
  for (i = 0; i < quotes.length; i++) {
    var q = quotes[i];
    var ch = (q.px - q.open) / q.open * 100;
    chunk += "   " + q.sym + " " + fmt(q.px) + " " + (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%";
  }
  chunk += "   ";
  ctx.font = "600 12px ui-monospace, monospace";
  var tw = ctx.measureText(chunk).width || 1;
  var offset = -((f * 0.7) % tw);
  ctx.fillStyle = TEXT;
  ctx.textBaseline = "middle";
  var x;
  for (x = offset; x < r.w + tw; x += tw) ctx.fillText(chunk, r.x + 8 + x, r.y + r.h / 2);
  ctx.restore();
  text("NO BROKER", r.x + r.w - 10, r.y + r.h / 2, 11, MUTED, "right");
}

function drawHead(r) {
  panel(r);
  var q = quotes[0];
  var ch = (q.px - q.open) / q.open * 100;
  var up = ch >= 0;
  var dot = (frame % 40) < 24;
  ctx.fillStyle = dot ? UP : "#1c3d30";
  ctx.beginPath();
  ctx.arc(r.x + 16, r.y + r.h / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  text(q.sym, r.x + 28, r.y + r.h / 2, 18, TEXT, "left");
  text(fmt(q.px), r.x + 96, r.y + r.h / 2, 22, up ? UP : DOWN, "left");
  text((up ? "+" : "") + ch.toFixed(2) + "%", r.x + 230, r.y + r.h / 2, 14, up ? UP : DOWN, "left");
}

function drawList(r) {
  if (!r || r.h < 20) return;
  panel(r);
  var rowH = 22;
  var n = Math.max(1, Math.floor((r.h - 12) / rowH));
  var i;
  for (i = 0; i < n && i < quotes.length; i++) {
    var q = quotes[i];
    var y = r.y + 8 + i * rowH + rowH / 2;
    var ch = (q.px - q.open) / q.open * 100;
    var up = ch >= 0;
    if (i === 0) {
      ctx.fillStyle = "rgba(46,189,133,0.12)";
      ctx.fillRect(r.x + 4, y - rowH / 2 + 1, r.w - 8, rowH - 2);
    }
    text(q.sym, r.x + 10, y, 12, TEXT, "left");
    text(fmt(q.px), r.x + r.w - 62, y, 12, up ? UP : DOWN, "right");
    text((up ? "+" : "") + ch.toFixed(2), r.x + r.w - 8, y, 11, up ? UP : DOWN, "right");
  }
}

function drawChart(r) {
  panel(r);
  var plot = {
    x: r.x + 10,
    y: r.y + 12,
    w: Math.max(20, r.w - 74),
    h: Math.max(20, r.h - 24)
  };
  var volH = Math.min(42, plot.h * 0.2);
  var ch = plot.h - volH - 8;
  var visN = Math.max(12, Math.min(candles.length, Math.floor(plot.w / 7)));
  var vis = candles.slice(candles.length - visN);
  var lo = vis[0].l;
  var hi = vis[0].h;
  var i;
  for (i = 0; i < vis.length; i++) {
    lo = Math.min(lo, vis[i].l);
    hi = Math.max(hi, vis[i].h);
  }
  var span = Math.max(quotes[0].open * 0.004, hi - lo);
  lo -= span * 0.12;
  hi += span * 0.12;
  span = hi - lo;
  function yOf(p) {
    return plot.y + (1 - (p - lo) / span) * ch;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = MUTED;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (i = 0; i < 4; i++) {
    var p = lo + span * (i + 0.5) / 4;
    var y = yOf(p);
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillText(fmt(p), plot.x + plot.w + 6, y);
  }
  var cw = plot.w / vis.length;
  var maxV = 0.01;
  for (i = 0; i < vis.length; i++) maxV = Math.max(maxV, vis[i].v);
  for (i = 0; i < vis.length; i++) {
    var c = vis[i];
    var up = c.c >= c.o;
    var x = plot.x + i * cw + cw * 0.5;
    ctx.strokeStyle = up ? UP : DOWN;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, yOf(c.h));
    ctx.lineTo(x, yOf(c.l));
    ctx.stroke();
    var top = yOf(Math.max(c.o, c.c));
    var bh = Math.max(1, Math.abs(yOf(c.o) - yOf(c.c)));
    ctx.fillRect(x - Math.max(1.5, cw * 0.32), top, Math.max(3, cw * 0.64), bh);
    var vh = Math.max(1, (c.v / maxV) * volH);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x - Math.max(1.5, cw * 0.32), plot.y + plot.h - vh, Math.max(3, cw * 0.64), vh);
    ctx.globalAlpha = 1;
  }
  var last = vis[vis.length - 1];
  var ly = yOf(last.c);
  ctx.strokeStyle = last.c >= last.o ? UP : DOWN;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(plot.x, ly);
  ctx.lineTo(plot.x + plot.w, ly);
  ctx.stroke();
  ctx.setLineDash([]);
  var tag = fmt(last.c);
  var tw = ctx.measureText(tag).width + 10;
  rounded(plot.x + plot.w + 4, ly - 8, tw, 16, 3);
  ctx.fillStyle = last.c >= last.o ? UP : DOWN;
  ctx.fill();
  text(tag, plot.x + plot.w + 8, ly, 11, "#08110c", "left");
}

function drawBook(r) {
  if (!r || r.h < 36) return;
  panel(r);
  text("Book", r.x + 10, r.y + 14, 12, MUTED, "left");
  var mid = quotes[0].px;
  var rows = Math.max(4, Math.floor((r.h - 28) / 18));
  var half = Math.floor(rows / 2);
  var rh = (r.h - 28) / rows;
  var i;
  for (i = 0; i < rows; i++) {
    var ask = i < half;
    var level = ask ? (half - i) : (i - half + 1);
    var px = mid + (ask ? 1 : -1) * level * Math.max(0.01, mid * 0.00035);
    var size = 100 + Math.floor(unit(i + 3, frame >> 4) * 18) * 100;
    var y = r.y + 26 + i * rh;
    ctx.fillStyle = ask ? "rgba(246,70,93,0.14)" : "rgba(46,189,133,0.14)";
    ctx.fillRect(r.x + 6, y, (r.w - 12) * (0.25 + (size % 900) / 1200), rh - 2);
    text(fmt(px), r.x + 10, y + rh / 2 - 1, 12, ask ? DOWN : UP, "left");
    text(String(size), r.x + r.w - 10, y + rh / 2 - 1, 12, TEXT, "right");
  }
}

function drawNote() {
  var w = Math.min(280, W - 24);
  var h = 78;
  var x = 12 + (modalKick ? Math.sin(modalKick) * 6 : 0);
  var y = H - h - 14;
  rounded(x, y, w, h, 8);
  ctx.fillStyle = "#1c1418";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5a3040";
  ctx.stroke();
  text("Still there?", x + 12, y + 20, 14, "#ffe14a", "left");
  text("Close does not close.", x + 12, y + 42, 12, "#ffd5e0", "left");
  rounded(x + w - 78, y + 40, 64, 26, 4);
  ctx.fillStyle = UP;
  ctx.fill();
  text("Close", x + w - 46, y + 53, 12, "#062014", "center");
  hit(x + w - 78, y + 40, 64, 26, function () { modalKick = 10; });
}

function drawBill(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  rounded(-b.w / 2, -b.h / 2, b.w, b.h, 4);
  ctx.fillStyle = "#178a45";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d9ffe8";
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.strokeRect(-b.w / 2 + 4, -b.h / 2 + 3, b.w - 8, b.h - 6);
  text("$", 0, 1, Math.max(12, b.h * 0.72), "#f3fff7", "center");
  ctx.restore();
}

function ensureBills() {
  if (bills.length) return;
  var i;
  for (i = 0; i < 36; i++) {
    var vx = (unit(i, 3) - 0.4) * 6.5;
    if (Math.abs(vx) < 1.8) vx = vx < 0 ? -2.4 : 2.4;
    bills.push({
      x: 16 + unit(i, 1) * Math.max(20, W - 32),
      y: 16 + unit(i, 2) * Math.max(20, H - 32),
      vx: vx,
      vy: (unit(i, 4) - 0.5) * 4.5,
      rot: unit(i, 5) * 6.2,
      spin: (unit(i, 6) - 0.5) * 0.08,
      w: 42 + unit(i, 7) * 36,
      h: 20 + unit(i, 8) * 12
    });
  }
}

function drawMoney() {
  ensureBills();
  var i;
  for (i = 0; i < bills.length; i++) {
    var b = bills[i];
    b.x += b.vx;
    b.y += b.vy;
    b.rot += b.spin;
    if (b.x < -50) b.x = W + 30;
    if (b.x > W + 50) b.x = -30;
    if (b.y < -30) b.y = H + 20;
    if (b.y > H + 30) b.y = -20;
    drawBill(b);
  }
}

function draw(f) {
  hits = [];
  seed();
  ensureBills();
  var L = layout();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  drawTape(L.tape, f);
  drawHead(L.head);
  drawList(L.list);
  drawChart(L.chart);
  drawBook(L.book);
  drawNote();
  drawMoney();
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
  if (printer) printer.style.visibility = userPaused ? "hidden" : "visible";
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
