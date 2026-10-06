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
var BUILD = "wall-14";

var STOCKS = [
  ["NVDA", 128.4], ["AAPL", 189.15], ["MSFT", 418.55], ["AMZN", 186.2],
  ["GOOGL", 168.42], ["META", 582.1], ["TSLA", 248.75], ["AMD", 164.3],
  ["AVGO", 172.9], ["MU", 94.6], ["ARM", 142.2], ["SPY", 571.4],
  ["QQQ", 488.15], ["NFLX", 712.4], ["INTC", 23.4], ["BA", 156.8],
  ["CAT", 388.2], ["ORCL", 172.5], ["COST", 886.4], ["WMT", 80.15],
  ["JPM", 218.4], ["UNH", 542.3], ["XOM", 112.8], ["CVX", 152.6],
  ["HD", 392.1], ["PG", 168.9], ["JNJ", 158.4], ["V", 286.5],
  ["MA", 498.2], ["DIS", 98.7], ["CRM", 278.4], ["ADBE", 462.1],
  ["NKE", 78.4], ["SBUX", 96.2], ["KO", 68.5], ["PEP", 168.3]
];

var COINS = [
  ["DOGE", 0.18], ["SHIB", 0.000012], ["PEPE", 0.0000085], ["BONK", 0.000018],
  ["WIF", 0.85], ["FLOKI", 0.00012], ["BRETT", 0.08], ["POPCAT", 0.35],
  ["MOG", 0.0000012], ["MEW", 0.0045], ["BOME", 0.006], ["NEIRO", 0.0008],
  ["PNUT", 0.18], ["GOAT", 0.12], ["FARTCOIN", 0.45], ["MOODENG", 0.12],
  ["PENGU", 0.015], ["TURBO", 0.004], ["PONKE", 0.15], ["MICHI", 0.08],
  ["GIGA", 0.02], ["FWOG", 0.08], ["CHILLGUY", 0.04]
];

var BILL_ASPECT = 2;
var frame = 0;
var clock = 0;
var userPaused = false;
var hidden = document.hidden;
var started = false;
var raf = 0;
var lastTs = 0;
var W = 1;
var H = 1;
var hits = [];
var candles = [];
var quotes = [];
var coins = [];
var bills = [];
var billTarget = 16;
var stockFlash = 0;
var stockSwapAt = 2;
var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var alerts = [];
var nextAlert = 0.35;

var billFront = new Image();
var billBack = new Image();
billFront.onload = onBillImage;
billBack.onload = onBillImage;
billFront.src = "bill-front.jpg";
billBack.src = "bill-back.jpg";

var wingFrames = [new Image(), new Image(), new Image()];
var boomFrames = [new Image(), new Image(), new Image(), new Image()];

function loadFrames(list, prefix) {
  var i;
  for (i = 0; i < list.length; i++) {
    list[i].onload = onBillImage;
    list[i].src = prefix + i + ".png";
  }
}

loadFrames(wingFrames, "wings-");
loadFrames(boomFrames, "boom-");

function onBillImage() {
  if (started && (userPaused || hidden)) draw(frame);
}

function hash(n) {
  var x = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function unit(a, b) {
  return hash(Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 17, 0x85ebca6b));
}

function fmt(v) {
  var a = Math.abs(v);
  if (!(a > 0)) return "0.00";
  if (a >= 1000) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  return v.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
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

function imageReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0);
}

function shuffle(list) {
  var a = list.slice();
  var i, j, t;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
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
  ctx.imageSmoothingEnabled = true;
}

function pushCandle(arr, anchor) {
  var prev = arr.length ? arr[arr.length - 1].c : anchor;
  var scale = Math.abs(prev) > 0 ? Math.abs(prev) : Math.abs(anchor);
  if (!(scale > 0)) scale = 1;
  var shock = (Math.random() - 0.48) * scale * 0.007;
  if (Math.random() > 0.9) shock *= 2.1;
  var limit = scale * 0.012;
  if (shock > limit) shock = limit;
  if (shock < -limit) shock = -limit;
  var o = prev;
  var c = o + shock;
  var floor = scale * 1e-6;
  if (c < floor) c = floor;
  if (Math.random() > 0.93) c = Math.max(floor, o + (Math.random() - 0.5) * scale * 0.0004);
  var body = Math.abs(c - o);
  var cap = scale * 0.008;
  var upW = Math.min(cap, body * (0.35 + Math.random() * 1.1) + scale * 0.00035);
  var dnW = Math.min(cap, body * (0.3 + Math.random() * 1.0) + scale * 0.0003);
  var hi = Math.max(o, c) + upW;
  var lo = Math.min(o, c) - dnW;
  if (lo < floor) lo = floor;
  if (hi < c) hi = c;
  arr.push({
    o: o,
    c: c,
    h: hi,
    l: lo,
    v: 0.15 + Math.random() * 0.85
  });
  if (arr.length > 80) arr.shift();
  return c;
}

function freshCandles(px, n) {
  var arr = [];
  var i, p = px;
  for (i = 0; i < n; i++) p = pushCandle(arr, p);
  return { arr: arr, px: p };
}

function nudgeLast(arr, openPx) {
  if (!arr.length) return openPx;
  var last = arr[arr.length - 1];
  var scale = Math.abs(openPx) > 0 ? Math.abs(openPx) : Math.abs(last.c);
  last.c += (Math.random() - 0.5) * scale * 0.00045;
  var floor = scale * 1e-6;
  if (last.c < floor) last.c = floor;
  if (last.c > last.h) last.h = last.c;
  if (last.c < last.l) last.l = last.c;
  return last.c;
}

// pool is the only ticker source. A stock chart passes STOCKS. A shitcoin chart passes COINS.
function assignSymbol(target, pool, avoid) {
  var pick = null;
  var i;
  for (i = 0; i < 64; i++) {
    var tryPick = pool[Math.floor(Math.random() * pool.length)];
    if (!avoid || !avoid[tryPick[0]]) {
      pick = tryPick;
      break;
    }
  }
  if (!pick) {
    for (i = 0; i < pool.length; i++) {
      if (!avoid || !avoid[pool[i][0]]) {
        pick = pool[i];
        break;
      }
    }
  }
  if (!pick) pick = pool[Math.floor(Math.random() * pool.length)];
  var px = pick[1] * (0.88 + Math.random() * 0.24);
  target.sym = pick[0];
  target.open = px;
  target.px = px;
  return px;
}

function quoteAvoid() {
  var m = {};
  var i;
  for (i = 0; i < quotes.length; i++) m[quotes[i].sym] = 1;
  return m;
}

function coinAvoid() {
  var m = {};
  var i;
  for (i = 0; i < coins.length; i++) m[coins[i].sym] = 1;
  return m;
}

function swapStockChart() {
  var q = quotes[0];
  assignSymbol(q, STOCKS, quoteAvoid());
  var seeded = freshCandles(q.open, 56);
  candles = seeded.arr;
  q.px = seeded.px;
  q.tick = 0;
  stockFlash = 10;
  stockSwapAt = clock + 1.5 + Math.random() * 3.5;
}

function swapListRow(i) {
  var q = quotes[i];
  assignSymbol(q, STOCKS, quoteAvoid());
  q.swapAt = clock + 6 + Math.random() * 10;
}

function swapCoin(c) {
  assignSymbol(c, COINS, coinAvoid());
  var seeded = freshCandles(c.open, 32);
  c.candles = seeded.arr;
  c.px = seeded.px;
  c.tick = 0;
  c.flash = 10;
  c.swapAt = clock + 1.5 + Math.random() * 3.5;
}

function initMarkets() {
  var bag = shuffle(STOCKS);
  var i;
  quotes = [];
  for (i = 0; i < 14; i++) {
    var px = bag[i][1] * (0.94 + Math.random() * 0.12);
    quotes.push({
      sym: bag[i][0],
      px: px,
      open: px,
      swapAt: 6 + Math.random() * 10,
      tick: Math.floor(Math.random() * 10)
    });
  }
  var seeded = freshCandles(quotes[0].open, 56);
  candles = seeded.arr;
  quotes[0].px = seeded.px;
  stockFlash = 0;
  stockSwapAt = 1.5 + Math.random() * 3.5;

  var cbag = shuffle(COINS);
  coins = [];
  for (i = 0; i < 3; i++) {
    var cpx = cbag[i][1] * (0.94 + Math.random() * 0.12);
    var cs = freshCandles(cpx, 32);
    coins.push({
      sym: cbag[i][0],
      open: cpx,
      px: cs.px,
      candles: cs.arr,
      flash: 0,
      swapAt: 1.5 + Math.random() * 3.5,
      tick: Math.floor(Math.random() * 10)
    });
  }
}

function step(dt) {
  clock += dt;
  var i;
  if (stockFlash > 0) stockFlash -= 1;
  for (i = 1; i < quotes.length; i++) {
    var q = quotes[i];
    q.px += (Math.random() - 0.5) * q.open * 0.0011;
    if (q.px < q.open * 0.72) q.px = q.open * 0.72;
    if (q.px > q.open * 1.28) q.px = q.open * 1.28;
    if (clock >= q.swapAt) swapListRow(i);
  }
  if (clock >= stockSwapAt) swapStockChart();
  else {
    quotes[0].tick += 1;
    if (quotes[0].tick % 10 === 0) quotes[0].px = pushCandle(candles, quotes[0].px);
    else quotes[0].px = nudgeLast(candles, quotes[0].open);
  }
  for (i = 0; i < coins.length; i++) stepCoin(coins[i]);
  stepBills(dt);
  stepAlerts(dt);
}

function stepCoin(c) {
  if (c.flash > 0) c.flash -= 1;
  if (clock >= c.swapAt) {
    swapCoin(c);
    return;
  }
  c.tick += 1;
  if (c.tick % 10 === 0) c.px = pushCandle(c.candles, c.px);
  else c.px = nudgeLast(c.candles, c.open);
}

function resolveBill(b) {
  b.phase = 0;
  b.wing = 0;
  b.scale = 1;
  b.alpha = 1;
  if (Math.random() < 0.5) {
    b.state = "win";
    b.launched = 0;
    return;
  }
  b.state = "lose";
  b.boom = 1;
}

function placeBill(b, scatter) {
  var sp = 80 + Math.random() * 110;
  var ang = Math.random() * Math.PI * 2;
  b.vx = Math.cos(ang) * sp;
  b.vy = Math.sin(ang) * sp * 0.55;
  if (Math.abs(b.vx) < 55) b.vx = b.vx < 0 ? -75 : 75;
  if (scatter) {
    var spanX = Math.max(20, W - b.w);
    var spanY = Math.max(20, H - b.h);
    b.x = b.w * 0.5 + Math.random() * spanX;
    b.y = b.h * 0.5 + Math.random() * spanY;
    return;
  }
  var edge = Math.floor(Math.random() * 4);
  if (edge === 0) {
    b.x = b.w * 0.5 + 6;
    b.y = b.h + Math.random() * Math.max(10, H - b.h * 2);
    b.vx = Math.abs(b.vx);
  } else if (edge === 1) {
    b.x = W - b.w * 0.5 - 6;
    b.y = b.h + Math.random() * Math.max(10, H - b.h * 2);
    b.vx = -Math.abs(b.vx);
  } else if (edge === 2) {
    b.x = b.w + Math.random() * Math.max(10, W - b.w * 2);
    b.y = b.h * 0.5 + 6;
    b.vy = Math.abs(b.vy);
  } else {
    b.x = b.w + Math.random() * Math.max(10, W - b.w * 2);
    b.y = H - b.h * 0.5 - 6;
    b.vy = -Math.abs(b.vy);
  }
}

function makeBill(scatter) {
  var w = W < 760 ? 96 + Math.random() * 22 : 132 + Math.random() * 36;
  var b = {
    state: "float",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tumble: Math.random() * Math.PI * 2,
    tumbleV: (1.05 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1),
    w: w,
    h: w / BILL_ASPECT,
    life: 3 + Math.random() * 3,
    age: 0,
    wing: 0,
    phase: 0,
    scale: 1,
    alpha: 1,
    boom: 0,
    launched: 0,
    dead: false
  };
  placeBill(b, scatter);
  return b;
}

function initBills() {
  billTarget = W < 760 ? 7 : 16;
  bills = [];
  var i;
  for (i = 0; i < billTarget; i++) bills.push(makeBill(true));
}

// Edge wrap is float-only. A win leaves through the top. A loss does not return.
function wrapFloat(b) {
  var mx = b.w * 0.5 + 30;
  var my = b.h * 0.5 + 30;
  if (b.x < -mx) {
    b.x = W + mx;
    if (b.vx > 0) b.vx = -b.vx;
  } else if (b.x > W + mx) {
    b.x = -mx;
    if (b.vx < 0) b.vx = -b.vx;
  }
  if (b.y < -my) {
    b.y = H + my;
    if (b.vy > 0) b.vy = -b.vy;
  } else if (b.y > H + my) {
    b.y = -my;
    if (b.vy < 0) b.vy = -b.vy;
  }
}

function stepFloat(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.tumble += b.tumbleV * dt;
  wrapFloat(b);
  b.age += dt;
  if (b.age < 0.4) return;
  var p = 1 - Math.exp(-dt / b.life);
  if (Math.random() < p) resolveBill(b);
}

function stepWin(b, dt) {
  b.phase += dt;
  b.wing = b.phase >= 0.5 ? 1 : b.phase / 0.5;
  b.tumble += b.tumbleV * dt * 0.45;
  if (b.phase < 0.5) {
    b.x += b.vx * dt * 0.2;
    b.y -= 18 * dt;
  } else {
    if (!b.launched) {
      b.launched = 1;
      b.vy = -(280 + Math.random() * 160);
      b.vx *= 0.25;
    }
    b.vy -= 220 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  if (b.y < -b.h - 24 || b.phase > 6) b.dead = true;
}

function stepLose(b, dt) {
  b.phase += dt;
  b.scale = 1;
  b.alpha = b.phase >= 0.12 ? 0 : 1 - b.phase / 0.12;
  if (b.phase > 1.05) b.dead = true;
}

function stepBills(dt) {
  var i, b, next = [];
  for (i = 0; i < bills.length; i++) {
    b = bills[i];
    if (b.state === "float") stepFloat(b, dt);
    else if (b.state === "win") stepWin(b, dt);
    else stepLose(b, dt);
    if (!b.dead) next.push(b);
  }
  bills = next;
  while (bills.length < billTarget) bills.push(makeBill(false));
}

function printerBox() {
  var gw = 600;
  var gh = 777;
  var maxH = W < 760 ? 230 : Math.min(460, H * 0.58);
  var maxW = W < 760 ? W * 0.72 : W * 0.48;
  var h = maxH;
  var w = h * (gw / gh);
  if (w > maxW) {
    w = maxW;
    h = w * (gh / gw);
  }
  return { x: W - 4 - w, y: H - 4 - h, w: w, h: h };
}

function noteBox() {
  return { x: 12, y: H - 78 - 14, w: Math.min(280, Math.max(40, W - 24)), h: 78 };
}

function splitCoins(strip, n) {
  var gap = 6;
  var y = strip.y + strip.labelH;
  var h = Math.max(16, strip.h - strip.labelH);
  var w = (strip.w - gap * (n - 1)) / n;
  var out = [];
  var i;
  for (i = 0; i < n; i++) {
    out.push({
      x: strip.x + i * (w + gap),
      y: y,
      w: Math.max(8, w),
      h: h
    });
  }
  return out;
}

function layout() {
  var pad = 10;
  var gap = 8;
  var compact = W < 760;
  var coinN = compact ? 2 : 3;
  var print = printerBox();
  var note = noteBox();
  var tape = { x: pad, y: pad, w: Math.max(40, W - pad * 2), h: 28 };
  var head = { x: pad, y: tape.y + tape.h + gap, w: tape.w, h: 52 };
  var top = head.y + head.h + gap;
  var stripH = compact ? 108 : 132;
  var labelH = 16;
  var strip;
  var list, chart, book;

  if (compact) {
    var floor = Math.min(H - pad, print.y - 6);
    if (floor - top < 150) floor = top + 150;
    strip = {
      x: pad,
      y: floor - stripH,
      w: Math.max(40, W - pad * 2),
      h: stripH,
      labelH: labelH
    };
    if (strip.y < top + 70) {
      strip.h = Math.max(72, floor - top - 78);
      strip.y = floor - strip.h;
    }
    var roomC = Math.max(40, strip.y - gap - top);
    var chartH = Math.max(64, Math.floor((roomC - gap) * 0.62));
    var listH = Math.max(0, roomC - chartH - gap);
    chart = { x: pad, y: top, w: tape.w, h: chartH };
    list = { x: pad, y: top + chartH + gap, w: tape.w, h: listH };
    book = null;
    return {
      compact: true,
      tape: tape,
      head: head,
      list: list,
      chart: chart,
      book: book,
      strip: strip,
      coins: splitCoins(strip, coinN)
    };
  }

  var listW = Math.min(220, Math.max(112, Math.floor(W * 0.18)));
  var bookW = Math.min(230, Math.max(112, Math.floor(W * 0.18)));
  var midX = pad + listW + gap;
  var midW = Math.max(60, W - pad * 2 - listW - bookW - gap * 2);
  var stripBottom = Math.min(H - pad, note.y - 8);
  var underW = Math.min(midX + midW, print.x - 6) - midX;
  var underChart = underW / coinN >= 112;
  var stripX = underChart ? midX : pad;
  var stripR = underChart ? Math.min(midX + midW, print.x - 6) : Math.min(W - pad, print.x - 6);
  if (stripR < stripX + 80) stripR = stripX + 80;
  strip = {
    x: stripX,
    y: stripBottom - stripH,
    w: stripR - stripX,
    h: stripH,
    labelH: labelH
  };
  var colBottom = underChart ? strip.y - gap : strip.y - gap;
  var room = colBottom - top;
  if (room < 150) {
    var cut = Math.min(strip.h - 76, 150 - room);
    if (cut > 0) {
      strip.h -= cut;
      strip.y += cut;
      room = strip.y - gap - top;
    }
  }
  if (room < 80) room = 80;
  var listBottom = underChart ? note.y - 8 : strip.y - gap;
  list = { x: pad, y: top, w: listW, h: Math.max(24, listBottom - top) };
  chart = { x: midX, y: top, w: midW, h: Math.max(64, strip.y - gap - top) };
  var bookX = midX + midW + gap;
  var bookBottom = print.y - 6;
  if (!underChart) bookBottom = Math.min(bookBottom, strip.y - gap);
  if (bookBottom < top + 36) bookBottom = top + 36;
  book = { x: bookX, y: top, w: bookW, h: bookBottom - top };
  return {
    compact: false,
    tape: tape,
    head: head,
    list: list,
    chart: chart,
    book: book,
    strip: strip,
    coins: splitCoins(strip, coinN)
  };
}

function panel(r) {
  if (!r || r.w < 2 || r.h < 2) return;
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
  ctx.rect(r.x, r.y, Math.max(0, r.w - 108), r.h);
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
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x + 24, r.y, Math.max(0, r.w - 32), r.h);
  ctx.clip();
  text(q.sym, r.x + 28, r.y + r.h / 2, 18, TEXT, "left");
  var symW = ctx.measureText(q.sym).width;
  var pxLabel = fmt(q.px);
  var pxX = r.x + 28 + symW + 14;
  text(pxLabel, pxX, r.y + r.h / 2, 22, up ? UP : DOWN, "left");
  var pxW = ctx.measureText(pxLabel).width;
  text((up ? "+" : "") + ch.toFixed(2) + "%", pxX + pxW + 14, r.y + r.h / 2, 14, up ? UP : DOWN, "left");
  ctx.restore();
}

function drawList(r) {
  if (!r || r.h < 20) return;
  panel(r);
  var rowH = 22;
  var n = Math.max(1, Math.floor((r.h - 12) / rowH));
  var i;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
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
  ctx.restore();
}

function paintCandles(plot, series, refPx, withAxis) {
  if (!series || series.length < 2 || plot.w < 8 || plot.h < 12) return;
  var volH = withAxis ? Math.min(42, plot.h * 0.2) : Math.min(18, plot.h * 0.22);
  var vGap = withAxis ? 8 : 4;
  var ch = plot.h - volH - vGap;
  if (ch < 10) {
    volH = 0;
    vGap = 0;
    ch = plot.h;
  }
  var col = withAxis ? 7 : 4.5;
  var visN = Math.max(8, Math.min(series.length, Math.floor(plot.w / col)));
  var vis = series.slice(series.length - visN);
  var lo = vis[0].l;
  var hi = vis[0].h;
  var i;
  for (i = 1; i < vis.length; i++) {
    if (vis[i].l < lo) lo = vis[i].l;
    if (vis[i].h > hi) hi = vis[i].h;
  }
  var span = hi - lo;
  var minSpan = Math.abs(refPx) * (withAxis ? 0.004 : 0.006);
  if (!(minSpan > 0)) minSpan = 0.01;
  if (!(span > minSpan)) {
    var mid = (hi + lo) / 2;
    if (!(mid > 0)) mid = Math.abs(refPx) || 1;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
    span = hi - lo;
  }
  var padP = span * 0.12;
  lo -= padP;
  hi += padP;
  span = hi - lo;
  if (!(span > 0)) return;
  function yOf(p) {
    return plot.y + (1 - (p - lo) / span) * ch;
  }
  if (withAxis) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = MUTED;
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
  }
  var cw = plot.w / vis.length;
  var maxV = 0.01;
  for (i = 0; i < vis.length; i++) if (vis[i].v > maxV) maxV = vis[i].v;
  var bodyW = Math.max(withAxis ? 3 : 2, cw * 0.62);
  var half = bodyW / 2;
  for (i = 0; i < vis.length; i++) {
    var cdl = vis[i];
    var up = cdl.c >= cdl.o;
    var x = plot.x + i * cw + cw * 0.5;
    ctx.strokeStyle = up ? UP : DOWN;
    ctx.fillStyle = up ? UP : DOWN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(cdl.h));
    ctx.lineTo(x, yOf(cdl.l));
    ctx.stroke();
    var top = yOf(Math.max(cdl.o, cdl.c));
    var bh = Math.max(1, Math.abs(yOf(cdl.o) - yOf(cdl.c)));
    ctx.fillRect(x - half, top, bodyW, bh);
    if (volH > 0) {
      var vh = Math.max(1, (cdl.v / maxV) * volH);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - half, plot.y + plot.h - vh, bodyW, vh);
      ctx.globalAlpha = 1;
    }
  }
  if (!withAxis) return;
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
  ctx.font = "600 11px ui-monospace, monospace";
  var tw = ctx.measureText(tag).width + 10;
  rounded(plot.x + plot.w + 4, ly - 8, tw, 16, 3);
  ctx.fillStyle = last.c >= last.o ? UP : DOWN;
  ctx.fill();
  text(tag, plot.x + plot.w + 8, ly, 11, "#08110c", "left");
}

function drawFlash(r, flash) {
  if (!r || flash <= 0 || r.w < 2 || r.h < 2) return;
  var t = flash / 10;
  ctx.save();
  rounded(r.x, r.y, r.w, r.h, 8);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255," + (0.58 * t) + ")";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (flash >= 10) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(r.x, r.y + r.h * 0.46, r.w, 3);
  }
  ctx.restore();
}

function drawChart(r) {
  if (!r || r.h < 20) return;
  panel(r);
  ctx.save();
  rounded(r.x, r.y, r.w, r.h, 8);
  ctx.clip();
  paintCandles({
    x: r.x + 10,
    y: r.y + 12,
    w: Math.max(20, r.w - 78),
    h: Math.max(20, r.h - 24)
  }, candles, quotes[0].open, true);
  ctx.restore();
  drawFlash(r, stockFlash);
}

function pairSize(sym, label, maxW) {
  var size = 12;
  while (size > 8) {
    ctx.font = "600 " + size + "px ui-monospace, monospace";
    if (ctx.measureText(sym).width + ctx.measureText(label).width + 12 <= maxW) break;
    size -= 1;
  }
  return size;
}

function drawCoinPanel(r, c) {
  if (!r || r.w < 16 || r.h < 16) return;
  panel(r);
  var up = c.px >= c.open;
  var label = fmt(c.px);
  var size = pairSize(c.sym, label, r.w - 16);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x + 4, r.y + 2, Math.max(0, r.w - 8), 20);
  ctx.clip();
  text(c.sym, r.x + 8, r.y + 12, size, TEXT, "left");
  text(label, r.x + r.w - 8, r.y + 12, size, up ? UP : DOWN, "right");
  ctx.restore();
  paintCandles({
    x: r.x + 6,
    y: r.y + 24,
    w: Math.max(8, r.w - 12),
    h: Math.max(8, r.h - 30)
  }, c.candles, c.open, false);
  drawFlash(r, c.flash);
}

function drawCoinStrip(L) {
  if (!L.strip || !L.coins) return;
  text("Shitcoins", L.strip.x + 2, L.strip.y + 8, 12, MUTED, "left");
  var n = Math.min(L.coins.length, coins.length);
  var i;
  for (i = 0; i < n; i++) drawCoinPanel(L.coins[i], coins[i]);
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
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
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
  ctx.restore();
}

function trackText(str, cx, y, size) {
  ctx.font = "700 " + size + "px Georgia, 'Times New Roman', 'Liberation Serif', Times, serif";
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  var letters = str.split("");
  var gap = size * 0.14;
  var widths = [];
  var total = 0;
  var i;
  for (i = 0; i < letters.length; i++) {
    widths[i] = ctx.measureText(letters[i]).width;
    total += widths[i];
  }
  if (letters.length > 1) total += gap * (letters.length - 1);
  var x = cx - total / 2;
  for (i = 0; i < letters.length; i++) {
    ctx.fillText(letters[i], x, y);
    x += widths[i] + gap;
  }
  return total;
}

function drawAd() {
  var n = noteBox();
  var x = n.x;
  var y = n.y;
  var w = n.w;
  var h = n.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#f3efe4";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  if (w > 24 && h > 16) {
    ctx.strokeRect(x + 3.5, y + 3.5, Math.max(0, w - 7), Math.max(0, h - 7));
  }
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "middle";
  var nameSize = w < 200 ? 6 : 7;
  trackText("THE WALL STREET JOURNAL", x + w / 2, y + 13, nameSize);
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 19.5);
  ctx.lineTo(x + w - 8, y + 19.5);
  ctx.moveTo(x + 8, y + 21.5);
  ctx.lineTo(x + w - 8, y + 21.5);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = "italic 700 12px Georgia, 'Times New Roman', 'Liberation Serif', Times, serif";
  ctx.fillText("Landlord", x + 10, y + 33);
  ctx.font = "400 10px Georgia, 'Times New Roman', 'Liberation Serif', Times, serif";
  ctx.fillText("Has an apartment. Will not show it.", x + 10, y + 48);
  ctx.fillText("Will not name the street or the rent.", x + 10, y + 61);
  ctx.restore();
}

function drawWingGif(b) {
  if (b.wing <= 0.02) return;
  var cycle = [0, 1, 2, 1];
  var img = wingFrames[cycle[Math.floor(b.phase * 6) % 4]];
  if (!imageReady(img)) return;
  var ww = b.w * 2.85 * b.wing;
  var wh = ww * (img.naturalHeight / img.naturalWidth);
  var smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -ww / 2, -wh / 2, ww, wh);
  ctx.imageSmoothingEnabled = smooth;
}

function drawBoom(b) {
  var ready = [];
  var i;
  for (i = 0; i < boomFrames.length; i++) {
    if (imageReady(boomFrames[i])) ready.push(boomFrames[i]);
  }
  if (!ready.length) return;
  var idx = Math.min(ready.length - 1, Math.floor(b.phase / 0.22));
  var img = ready[idx];
  var size = b.w * 3.15;
  var alpha = b.phase > 0.82 ? Math.max(0, 1 - (b.phase - 0.82) / 0.23) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, b.x - size / 2, b.y - size / 2, size, size);
  ctx.restore();
}

function billFace(b) {
  return Math.cos(b.tumble) < 0 ? billBack : billFront;
}

function drawOneBill(b) {
  if (b.state === "lose") drawBoom(b);
  if (b.state === "lose" && b.alpha <= 0.02) return;
  var img = billFace(b);
  if (!imageReady(img)) return;
  var sx = Math.abs(Math.cos(b.tumble));
  if (sx < 0.04) sx = 0.04;
  ctx.save();
  ctx.translate(b.x + 3, b.y + 5);
  ctx.scale(sx * b.scale, b.scale);
  ctx.globalAlpha = b.alpha * 0.28;
  ctx.fillStyle = "#000";
  rounded(-b.w / 2, -b.h / 2, b.w, b.h, 3);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(sx * b.scale, b.scale);
  ctx.globalAlpha = b.alpha;
  if (b.wing > 0) drawWingGif(b);
  ctx.drawImage(img, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

function drawMoney() {
  var i;
  for (i = 0; i < bills.length; i++) drawOneBill(bills[i]);
}

function boxesOverlap(a, b, pad) {
  var p = pad || 0;
  return a.x < b.x + b.w + p && a.x + a.w + p > b.x && a.y < b.y + b.h + p && a.y + a.h + p > b.y;
}

function commas(n) {
  var s = String(n);
  var out = "";
  var i;
  for (i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s.charAt(i);
  }
  return out;
}

function makeAlertText() {
  var stock = Math.random() < 0.62;
  var pool = stock ? STOCKS : COINS;
  var pick = pool[Math.floor(Math.random() * pool.length)];
  var roll = Math.random();
  if (roll < 0.22) {
    var pct = 1 + Math.random() * 48;
    var up = Math.random() < 0.5;
    return {
      k: "TRADE ALERT",
      a: pick[0] + "  " + (up ? "+" : "-") + pct.toFixed(1) + "%",
      b: "In the last second",
      tone: up ? "up" : "down"
    };
  }
  if (roll < 0.36) {
    return { k: "TRADE ALERT", a: pick[0] + " halt", b: "Still printing", tone: "down" };
  }
  if (roll < 0.5) {
    return { k: "TRADE ALERT", a: "Stop hit  " + pick[0], b: "The stop was a rumor", tone: "down" };
  }
  var side = Math.random() < 0.5 ? "BUY" : "SELL";
  var qty = stock
    ? [10, 40, 100, 400, 1000, 2500][Math.floor(Math.random() * 6)]
    : [100000, 250000, 1000000, 5000000][Math.floor(Math.random() * 4)];
  var px = pick[1] * (0.9 + Math.random() * 0.2);
  var status = ["FILLED", "WORKING", "PARTIAL", "CANCELED", "REJECTED"][Math.floor(Math.random() * 5)];
  return {
    k: "TRADE ALERT",
    a: side + "  " + commas(qty) + "  " + pick[0],
    b: "@ " + fmt(px) + "   " + status,
    tone: side === "BUY" ? "up" : "down"
  };
}

function placeAlert(w, h) {
  var print = printerBox();
  var note = noteBox();
  var i, x, y, box;
  for (i = 0; i < 24; i++) {
    x = 8 + Math.random() * Math.max(8, W - w - 16);
    y = 42 + Math.random() * Math.max(8, H * 0.72 - h);
    box = { x: x, y: y, w: w, h: h };
    if (boxesOverlap(box, print, 6)) continue;
    if (boxesOverlap(box, note, 6)) continue;
    if (x < 84 && y < 40) continue;
    return box;
  }
  return { x: 16, y: 46, w: w, h: h };
}

function spawnAlert() {
  var copy = makeAlertText();
  var w = Math.min(248, Math.max(160, W - 24));
  var h = 54;
  var at = placeAlert(w, h);
  alerts.push({
    k: copy.k,
    a: copy.a,
    b: copy.b,
    tone: copy.tone,
    x: at.x,
    y: at.y,
    w: w,
    h: h,
    age: 0,
    life: 2
  });
  if (alerts.length > 4) alerts = alerts.slice(alerts.length - 4);
}

function stepAlerts(dt) {
  nextAlert -= dt;
  if (nextAlert <= 0) {
    spawnAlert();
    nextAlert = 0.55 + Math.random() * 1.25;
  }
  var next = [];
  var i;
  for (i = 0; i < alerts.length; i++) {
    alerts[i].age += dt;
    if (alerts[i].age < alerts[i].life) next.push(alerts[i]);
  }
  alerts = next;
}

function fitLine(str, size, maxW) {
  ctx.font = "600 " + size + "px ui-monospace, monospace";
  while (size > 8 && ctx.measureText(str).width > maxW) {
    size -= 1;
    ctx.font = "600 " + size + "px ui-monospace, monospace";
  }
  return size;
}

function drawAlerts() {
  var i, a, fade;
  for (i = 0; i < alerts.length; i++) {
    a = alerts[i];
    a.x = Math.max(8, Math.min(a.x, W - a.w - 8));
    a.y = Math.max(40, Math.min(a.y, H - a.h - 8));
    fade = a.age < 0.08 ? a.age / 0.08 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
    rounded(a.x, a.y, a.w, a.h, 6);
    ctx.fillStyle = "#12161c";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = a.tone === "up" ? UP : DOWN;
    ctx.stroke();
    ctx.fillStyle = a.tone === "up" ? UP : DOWN;
    ctx.fillRect(a.x, a.y, 3, a.h);
    var maxW = a.w - 22;
    text(a.k, a.x + 12, a.y + 13, fitLine(a.k, 10, maxW), MUTED, "left");
    text(a.a, a.x + 12, a.y + 29, fitLine(a.a, 13, maxW), TEXT, "left");
    text(a.b, a.x + 12, a.y + 44, fitLine(a.b, 11, maxW), a.tone === "up" ? UP : DOWN, "left");
    ctx.restore();
  }
}

function draw(f) {
  hits = [];
  var L = layout();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  drawTape(L.tape, f);
  drawHead(L.head);
  drawList(L.list);
  drawChart(L.chart);
  drawCoinStrip(L);
  drawBook(L.book);
  drawAd();
  drawMoney();
  drawAlerts();
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (userPaused || hidden) {
    lastTs = 0;
    return;
  }
  if (!ts) ts = performance.now();
  if (!lastTs) lastTs = ts;
  var dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt < 0) dt = 0;
  if (dt > 0.1) dt = 0.1;
  frame += 1;
  step(dt);
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
initMarkets();
initBills();
if (reduceMotion) setPaused(true);
started = true;
draw(frame);
loop();
