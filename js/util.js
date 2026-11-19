/* Shared helpers. Everything hangs off the global TB namespace so the game
   runs straight from index.html (file://) with no build step. */
(function () {
  'use strict';
  const TB = (globalThis.TB = globalThis.TB || {});
  const U = (TB.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.gauss = (m = 0, sd = 1) => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // pick a key from {key: weight}
  U.weighted = (obj) => {
    let tot = 0;
    for (const k in obj) tot += obj[k];
    let r = Math.random() * tot;
    for (const k in obj) {
      r -= obj[k];
      if (r <= 0) return k;
    }
    return Object.keys(obj)[0];
  };
  U.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);

  // ---- formatting ----
  U.rate3 = (n, d) => (d ? (n / d).toFixed(3).replace(/^0(?=\.)/, '') : '.000');
  U.fmtIP = (outs) => Math.floor(outs / 3) + '.' + (outs % 3);
  U.era = (er, outs) => (outs ? ((er * 27) / outs).toFixed(2) : er ? '99.99' : '-.--');
  U.pct = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0(?=\.)/, '') : '.000');
  U.grade = (v) =>
    v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : v >= 30 ? 'F' : 'G';
  U.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  U.ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // batting line helpers (work on {ab,h,d,t,hr,bb,sf,...})
  U.avg = (s) => U.rate3(s.h, s.ab);
  U.obpN = (s) => (s.ab + s.bb + s.sf ? (s.h + s.bb) / (s.ab + s.bb + s.sf) : 0);
  U.slgN = (s) => (s.ab ? (s.h + s.d + 2 * s.t + 3 * s.hr) / s.ab : 0);
  U.opsN = (s) => U.obpN(s) + U.slgN(s);
  U.fmtRate = (x) => x.toFixed(3).replace(/^0(?=\.)/, '');

  // hex colour helpers
  U.hexToRgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.colorDist = (a, b) => {
    const x = U.hexToRgb(a), y = U.hexToRgb(b);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  U.shade = (hex, amt) => {
    const [r, g, b] = U.hexToRgb(hex);
    const f = (c) => U.clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
    return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
  };
})();
