"use strict";

var canvas = document.getElementById("screen");
var ctx = canvas.getContext("2d", { alpha: false });
var pauseBtn = document.getElementById("pause");

var COLORS = ["#39ff88", "#ff3b6a", "#3ee0ff", "#ff3df0", "#ffe14a", "#9b5cff", "#ff7a18"];
var RGB = COLORS.map(hexToRgb);
var WORDS = ["LIVE", "SCAN", "NODE", "ARB", "SYNC", "PULSE", "FEED", "BLOOM", "LINK", "FLOW", "HFT", "MAP", "EXEC", "PING", "DRIFT", "BURST"];
var KINDS = ["candles", "bubbles", "bars", "gauges", "radar", "book", "scribble", "meters"];

var frame = 0;
var userPaused = false;
var hidden = document.hidden;
var raf = 0;
var W = 1;
var H = 1;
var alerts = [];
var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeLedLayer() {
  var c = document.createElement("canvas");
  return { canvas: c, ctx: c.getContext("2d", { alpha: false }), img: null };
}

var ledMain = makeLedLayer();
var ledInset = makeLedLayer();

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

function hash(n) {
  var x = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function unit(a, b) {
  return hash(Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 17, 0x85ebca6b));
}

function color(i) {
  return COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];
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

function rounded(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
}

function drawLeds(layer, x, y, w, h, f) {
  var cell = 5;
  var cols = Math.max(1, Math.ceil(w / cell));
  var rows = Math.max(1, Math.ceil(h / cell));
  if (layer.canvas.width !== cols || layer.canvas.height !== rows) {
    layer.canvas.width = cols;
    layer.canvas.height = rows;
    layer.img = layer.ctx.createImageData(cols, rows);
  }
  var img = layer.img;
  var data = img.data;
  var p = 0;
  for (var yy = 0; yy < rows; yy++) {
    for (var xx = 0; xx < cols; xx++) {
      var period = 2 + ((xx * 3 + yy * 5) & 7);
      var on = ((f + xx * 2 + yy * 3) % period) < (period >> 1) + 1;
      if (!on) {
        data[p] = 5;
        data[p + 1] = 7;
        data[p + 2] = 14;
      } else {
        var rgb = RGB[(xx + yy * 3 + (f >> 2)) % RGB.length];
        data[p] = rgb[0];
        data[p + 1] = rgb[1];
        data[p + 2] = rgb[2];
      }
      data[p + 3] = 255;
      p += 4;
    }
  }
  layer.ctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.canvas, x, y, w, h);
}

function drawTicker(x, y, w, h, dir, f) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x, y, w, h);
  ctx.font = "bold 13px ui-monospace, monospace";
  var chunk = "   SCAN   NODE   PULSE   ARB   LINK   FLOW   BLOOM   EXEC   PING   DRIFT   ";
  var tw = ctx.measureText(chunk).width || 1;
  var offset = (dir * f * 7) % tw;
  if (offset > 0) offset -= tw;
  ctx.fillStyle = color(f + dir);
  ctx.textBaseline = "middle";
  for (var px = offset; px < w + tw; px += tw) {
    ctx.fillText(chunk, x + px, y + h * 0.55);
  }
  ctx.restore();
}

function drawButtons(x, y, w, f) {
  var labels = ["SCAN", "EXEC", "SYNC", "PULSE", "ARB", "LINK", "NODE", "FLOW"];
  var gap = 6;
  var bw = Math.max(36, Math.min(92, (w - gap * labels.length) / labels.length));
  for (var i = 0; i < labels.length; i++) {
    var pulse = 1 + 0.12 * Math.sin(f * 0.45 + i);
    var bx = x + i * (bw + gap);
    var hot = ((f + i * 3) % 5) === 0;
    ctx.save();
    ctx.translate(bx + bw / 2, y + 13);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = hot ? color(i + f) : "rgba(8,12,22,0.78)";
    ctx.strokeStyle = color(i + (f >> 1));
    ctx.lineWidth = 1.5;
    rounded(-bw / 2, -12, bw, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hot ? "#061018" : "#eafff6";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labels[i], 0, 1);
    ctx.restore();
  }
}

function chrome(x, y, w, h, id, f) {
  var flash = unit(id, f >> 0) > 0.78;
  ctx.fillStyle = flash ? color(id + f) : "rgba(6,10,18,0.62)";
  ctx.globalAlpha = flash ? 0.55 : 1;
  rounded(x, y, w, h, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color(id + (f >> 1));
  ctx.stroke();
  var dotOn = ((f + id) % 2) === 0;
  ctx.fillStyle = dotOn ? color(id + f) : "#102018";
  ctx.beginPath();
  ctx.arc(x + 11, y + 12, dotOn ? 4.5 : 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d9fff0";
  ctx.fillText(WORDS[id % WORDS.length], x + 20, y + 12);
  ctx.textAlign = "right";
  ctx.fillStyle = color(id + f);
  var digits = Math.floor(unit(id, f) * 100000);
  ctx.fillText(String(digits).padStart(5, "0"), x + w - 8, y + 12);
  ctx.textAlign = "left";
  return { x: x + 6, y: y + 24, w: Math.max(4, w - 12), h: Math.max(4, h - 30) };
}

function drawCandles(box, id, f) {
  var n = Math.max(6, Math.floor(box.w / 6));
  var cw = box.w / n;
  for (var i = 0; i < n; i++) {
    var a = unit(id * 40 + i, f);
    var b = unit(id * 40 + i, f + 1);
    var hi = Math.max(a, b, unit(id * 40 + i, f + 2));
    var lo = Math.min(a, b, unit(id * 40 + i, f + 3));
    var up = b >= a;
    var px = box.x + i * cw + cw * 0.5;
    ctx.strokeStyle = up ? "#39ff88" : "#ff3b6a";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(px, box.y + (1 - hi) * box.h);
    ctx.lineTo(px, box.y + (1 - lo) * box.h);
    ctx.stroke();
    var top = box.y + (1 - Math.max(a, b)) * box.h;
    var bh = Math.max(1.5, Math.abs(b - a) * box.h);
    ctx.fillRect(px - Math.max(1, cw * 0.28), top, Math.max(2, cw * 0.56), bh);
  }
}

function drawBubbles(box, id, f) {
  var n = 26;
  var pts = [];
  var i;
  for (i = 0; i < n; i++) {
    var px = box.x + (0.08 + 0.84 * unit(id + i, 3)) * box.w + Math.sin(f * 0.22 + i + id) * box.w * 0.07;
    var py = box.y + (0.08 + 0.84 * unit(id + i, 5)) * box.h + Math.cos(f * 0.27 + i * 1.4) * box.h * 0.08;
    var rad = 2 + unit(id, i + 9) * Math.min(box.w, box.h) * 0.07 * (0.55 + 0.45 * Math.sin(f * 0.35 + i));
    pts.push([px, py, Math.abs(rad)]);
  }
  ctx.lineWidth = 1;
  for (i = 0; i < n; i++) {
    if (((f + i + id) & 1) === 0) continue;
    var a = pts[i];
    var b = pts[(i * 7 + 3) % n];
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color(i + id + f);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < n; i++) {
    if (((f + i) % 7) === 0) continue;
    ctx.fillStyle = color(i + id + (f >> 1));
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], pts[i][2], 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBars(box, id, f) {
  var n = Math.max(6, Math.floor(box.w / 8));
  var bw = box.w / n;
  for (var i = 0; i < n; i++) {
    var h = 0.15 + 0.85 * unit(id + i, f);
    ctx.fillStyle = i % 2 ? "#ff3df0" : "#39ff88";
    if (((f + i) & 3) === 0) ctx.fillStyle = "#ffe14a";
    ctx.fillRect(box.x + i * bw + 1, box.y + box.h - h * box.h, Math.max(1, bw - 2), h * box.h);
  }
}

function drawGauges(box, id, f) {
  var n = 3;
  var gw = box.w / n;
  for (var i = 0; i < n; i++) {
    var cx = box.x + gw * i + gw / 2;
    var cy = box.y + box.h * 0.62;
    var rad = Math.max(8, Math.min(gw, box.h) * 0.38);
    ctx.strokeStyle = "#163028";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, Math.PI, Math.PI * 2);
    ctx.stroke();
    var ang = f * (0.18 + i * 0.07) + id;
    ctx.strokeStyle = color(id + i + f);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    ctx.stroke();
    ctx.fillStyle = color(id + i);
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRadar(box, id, f) {
  var cx = box.x + box.w / 2;
  var cy = box.y + box.h / 2;
  var rad = Math.max(8, Math.min(box.w, box.h) * 0.46);
  ctx.strokeStyle = "rgba(57,255,136,0.35)";
  ctx.lineWidth = 1;
  for (var ring = 1; ring <= 3; ring++) {
    ctx.beginPath();
    ctx.arc(cx, cy, rad * ring / 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  var sweep = f * 0.22 + id;
  ctx.strokeStyle = "#39ff88";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * rad, cy + Math.sin(sweep) * rad);
  ctx.stroke();
  for (var i = 0; i < 10; i++) {
    if (((f + i * 3) % 4) === 0) continue;
    var bx = cx + (unit(id + i, 2) - 0.5) * rad * 1.6;
    var by = cy + (unit(id + i, 4) - 0.5) * rad * 1.6;
    ctx.fillStyle = color(i + f);
    ctx.beginPath();
    ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBook(box, id, f) {
  var rows = Math.max(3, Math.floor(box.h / 14));
  var rh = box.h / rows;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (var i = 0; i < rows; i++) {
    var hot = ((f + i + id) % 3) === 0;
    ctx.fillStyle = hot ? (i % 2 ? "rgba(255,59,106,0.85)" : "rgba(57,255,136,0.8)") : "rgba(0,0,0,0.25)";
    ctx.fillRect(box.x, box.y + i * rh, box.w, rh - 1);
    ctx.fillStyle = hot ? "#061018" : color(i + f);
    var left = WORDS[(id + i) % WORDS.length];
    var num = Math.floor(unit(id + i, f) * 9999);
    ctx.textAlign = "left";
    ctx.fillText(left, box.x + 4, box.y + i * rh + rh / 2);
    ctx.textAlign = "right";
    ctx.fillText(String(num).padStart(4, "0"), box.x + box.w - 4, box.y + i * rh + rh / 2);
  }
  ctx.textAlign = "left";
}

function drawScribble(box, id, f) {
  for (var line = 0; line < 4; line++) {
    ctx.beginPath();
    ctx.strokeStyle = color(id + line + f);
    ctx.lineWidth = 1.5;
    var steps = 28;
    for (var i = 0; i <= steps; i++) {
      var px = box.x + (i / steps) * box.w;
      var py = box.y + unit(id * 9 + line * 20 + i, f) * box.h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function drawMeters(box, id, f) {
  var n = 5;
  var mw = box.w / n;
  for (var i = 0; i < n; i++) {
    var level = unit(id + i, f);
    ctx.fillStyle = "#102018";
    ctx.fillRect(box.x + i * mw + 3, box.y, mw - 6, box.h);
    ctx.fillStyle = color(i + id + (f >> 1));
    ctx.fillRect(box.x + i * mw + 3, box.y + box.h * (1 - level), mw - 6, box.h * level);
    if (((f + i) & 2) === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.35;
      ctx.fillRect(box.x + i * mw + 3, box.y + box.h * (1 - level), mw - 6, 2);
      ctx.globalAlpha = 1;
    }
  }
}

function drawWidget(kind, x, y, w, h, id, f) {
  if (w < 20 || h < 20) return;
  var box = chrome(x, y, w, h, id, f);
  if (kind === "candles") drawCandles(box, id, f);
  else if (kind === "bubbles") drawBubbles(box, id, f);
  else if (kind === "bars") drawBars(box, id, f);
  else if (kind === "gauges") drawGauges(box, id, f);
  else if (kind === "radar") drawRadar(box, id, f);
  else if (kind === "book") drawBook(box, id, f);
  else if (kind === "scribble") drawScribble(box, id, f);
  else drawMeters(box, id, f);
}

function drawLog(x, y, w, h, f) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, w, h);
  ctx.font = "12px ui-monospace, monospace";
  ctx.textBaseline = "top";
  var line = 14;
  var scroll = (f * 4) % line;
  var rows = Math.ceil(h / line) + 2;
  for (var i = 0; i < rows; i++) {
    var id = f + i;
    var yy = y + i * line - scroll;
    ctx.fillStyle = color(id);
    var a = WORDS[id % WORDS.length];
    var b = WORDS[(id * 3) % WORDS.length];
    var n = Math.floor(unit(i, f) * 0xffffff).toString(16);
    ctx.fillText(a + "  " + b + "  " + n + "  " + WORDS[(id * 5) % WORDS.length], x + 8, yy);
  }
  ctx.restore();
}

function spawnAlerts(f) {
  if ((f % 4) === 0) {
    alerts.push({
      x: unit(f, 1) * W,
      y: unit(f, 2) * H * 0.8,
      life: 22 + (f % 18),
      word: WORDS[f % WORDS.length],
      n: Math.floor(unit(f, 4) * 9999),
      c: color(f)
    });
  }
  var i;
  for (i = alerts.length - 1; i >= 0; i--) {
    alerts[i].life -= 1;
    alerts[i].x += Math.sin(f * 0.8 + i) * 4;
    if (alerts[i].life <= 0) alerts.splice(i, 1);
  }
  if (alerts.length > 36) alerts.splice(0, alerts.length - 36);
}

function drawAlerts() {
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (var i = 0; i < alerts.length; i++) {
    var a = alerts[i];
    var bw = 148;
    var bh = 28;
    ctx.globalAlpha = Math.max(0.25, a.life / 30);
    ctx.fillStyle = a.c;
    rounded(a.x, a.y, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = "#061018";
    ctx.textAlign = "left";
    ctx.fillText(a.word + "  " + a.n, a.x + 8, a.y + bh / 2);
    ctx.globalAlpha = 1;
  }
}

function drawTerminal(x, y, w, h, f, nested) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(Math.sin(f * 0.9) * 1.5, Math.cos(f * 1.1) * 1.5);

  drawLeds(nested ? ledInset : ledMain, x, y, w, h, f);
  drawTicker(x, y, w, 18, 1, f);
  drawTicker(x, y + h - 16, w, 16, -1, f);

  var top = y + 22;
  var bottom = y + h - 20;
  if (h > 230 && w > 280) {
    drawButtons(x + 8, top, Math.min(w - 16, 820), f);
    top += 32;
  }
  if (h > 300) {
    drawLog(x, bottom - 62, w, 58, f);
    bottom -= 66;
  }

  var gridH = Math.max(40, bottom - top);
  var cols = Math.max(2, Math.floor(w / (nested ? 150 : 230)));
  var rows = Math.max(2, Math.floor(gridH / (nested ? 110 : 150)));
  var cw = w / cols;
  var rh = gridH / rows;
  var shift = Math.floor(f / 40);
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var id = r * cols + c + (nested ? 80 : 0);
      var kind = KINDS[(id + shift) % KINDS.length];
      var pw = cw * (0.74 + 0.22 * Math.sin(f * 0.21 + id));
      var ph = rh * (0.7 + 0.24 * Math.cos(f * 0.19 + id * 1.3));
      var px = x + c * cw + (cw - pw) / 2 + Math.sin(f * 0.65 + id) * 6;
      var py = top + r * rh + (rh - ph) / 2 + Math.cos(f * 0.72 + id) * 5;
      drawWidget(kind, px, py, pw, ph, id + shift, f);
    }
  }

  if (!nested) {
    spawnAlerts(f);
    drawAlerts();
    drawIpad(f);
    drawStatus(f);
  }
  ctx.restore();
}

function drawIpad(f) {
  var iw = Math.max(220, Math.min(520, W * 0.4));
  var ih = Math.max(160, Math.min(340, H * 0.42));
  var cx = W * 0.7 + Math.sin(f * 0.045) * Math.min(90, W * 0.08);
  var cy = H * 0.46 + Math.cos(f * 0.037) * Math.min(60, H * 0.07);
  var rot = Math.sin(f * 0.03) * 0.1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = "#141820";
  ctx.strokeStyle = (f % 6 === 0) ? "#ff3df0" : "#3c4454";
  ctx.lineWidth = 3;
  rounded(-iw / 2 - 16, -ih / 2 - 18, iw + 32, ih + 36, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = (f % 4 === 0) ? "#ff3b6a" : "#2a303c";
  ctx.beginPath();
  ctx.arc(0, -ih / 2 - 8, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(-iw / 2, -ih / 2, iw, ih);
  ctx.clip();
  ctx.translate(-iw / 2, -ih / 2);
  drawTerminal(0, 0, iw, ih, f * 2 + 90, true);
  ctx.restore();
}

function drawStatus(f) {
  var label = ((f >> 3) % 2 === 0) ? "NO BROKER" : "LIGHTS ONLY";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  var tw = 118;
  var x = W - tw - 10;
  var y = 8;
  ctx.fillStyle = (f % 4 === 0) ? "#ff3b6a" : "rgba(0,0,0,0.55)";
  rounded(x, y, tw, 22, 4);
  ctx.fill();
  ctx.strokeStyle = color(f);
  ctx.stroke();
  ctx.fillStyle = "#f4fff8";
  ctx.fillText(label, x + tw - 8, y + 11);
  ctx.textAlign = "left";
}

function draw(f) {
  drawTerminal(0, 0, W, H, f, false);
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (userPaused || hidden) return;
  frame += 1;
  draw(frame);
}

function setPaused(next) {
  userPaused = next;
  pauseBtn.textContent = userPaused ? "Play" : "Pause";
  pauseBtn.classList.toggle("is-paused", userPaused);
  if (!userPaused && !raf) loop();
}

pauseBtn.addEventListener("click", function (event) {
  event.stopPropagation();
  setPaused(!userPaused);
});

document.addEventListener("keydown", function (event) {
  if (event.key === "p" || event.key === "P" || event.key === "Escape") {
    setPaused(!userPaused);
  }
});

canvas.addEventListener("pointerdown", function (event) {
  var rect = canvas.getBoundingClientRect();
  var x = event.clientX - rect.left;
  var y = event.clientY - rect.top;
  for (var i = 0; i < 14; i++) {
    alerts.push({
      x: x + (unit(frame + i, 8) - 0.5) * 220,
      y: y + (unit(frame + i, 9) - 0.5) * 120,
      life: 26,
      word: WORDS[(frame + i) % WORDS.length],
      n: Math.floor(unit(i, frame) * 9999),
      c: color(frame + i)
    });
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
if (reduceMotion) setPaused(true);
draw(frame);
loop();
