/* The tabletop toy board. Draws a plastic baseball game (pegs, scoop cups,
   wall pockets, steel ball, lever bat) on a canvas and replays a game log. */
(function () {
  'use strict';
  const TB = globalThis.TB, U = TB.U;

  // ---------- geometry (logical 1000 x 1000) ----------
  const H = { x: 200, y: 800 };
  const rad = (d) => (d * Math.PI) / 180;
  const pol = (deg, r) => ({ x: H.x + r * Math.sin(rad(deg)), y: H.y - r * Math.cos(rad(deg)) });
  const BASES = [{ x: 200, y: 800 }, { x: 500, y: 800 }, { x: 500, y: 500 }, { x: 200, y: 500 }, { x: 200, y: 800 }];
  const MOUND = { x: 350, y: 650 };
  const RAMP_EXIT = { x: 318, y: 682 }, RAMP_BACK = { x: 418, y: 582 };
  const CATCH = { x: 172, y: 828 };
  const FIELD = [[110, 190], [690, 190], [810, 310], [810, 890], [110, 890]];
  const FIELDERS = {
    P: { x: 400, y: 652 }, C: { x: 156, y: 848 },
    '1B': pol(84, 330), '2B': pol(62, 425), SS: pol(28, 425), '3B': pol(6, 330),
    LF: pol(17, 540), CF: pol(45, 650), RF: pol(73, 540),
  };
  const unitFromHome = (p) => { const dx = p.x - H.x, dy = p.y - H.y, d = Math.hypot(dx, dy); return { x: dx / d, y: dy / d }; };
  const CUPS = {};
  Object.keys(FIELDERS).forEach((k) => {
    if (k === 'C') return;
    const f = FIELDERS[k];
    const u = k === 'P' ? (() => { const dx = f.x - H.x, dy = f.y - H.y, d = Math.hypot(dx, dy); return { x: dx / d, y: dy / d }; })() : unitFromHome(f);
    const back = k === 'P' ? 30 : 34;
    CUPS[k] = { x: f.x - u.x * back, y: f.y - u.y * back, ang: Math.atan2(u.y, u.x), w: ['LF', 'CF', 'RF'].includes(k) ? 92 : 74 };
  });
  const POCKET_LABELS = ['DOUBLE', 'SINGLE', 'TRIPLE', 'OUT', 'HOMERUN', 'OUT', 'TRIPLE', 'SINGLE', 'DOUBLE'];
  const POCKET_COL = { DOUBLE: '#2f9a45', SINGLE: '#2a67c9', TRIPLE: '#e7b52a', OUT: '#e5702a' };
  const PW = 122.5;
  const POCKETS = [];
  for (let i = 0; i < 4; i++) POCKETS.push({ x0: 200 + PW * i, y0: 122, x1: 200 + PW * (i + 1), y1: 190, cx: 200 + PW * i + PW / 2, cy: 160, vert: false });
  POCKETS.push({ cx: 772, cy: 228, hr: true });
  for (let i = 0; i < 4; i++) POCKETS.push({ x0: 810, y0: 310 + PW * i, x1: 878, y1: 310 + PW * (i + 1), cx: 846, cy: 310 + PW * i + PW / 2, vert: true });

  const BANNERS = {
    '1B': ['SINGLE!', '#2a67c9'], '2B': ['DOUBLE!', '#2f9a45'], '3B': ['TRIPLE!', '#d9a31a'], HR: ['HOME RUN!!', '#d6262f'],
    GO: ['OUT!', '#e5702a'], FO: ['OUT!', '#e5702a'], LO: ['OUT!', '#e5702a'], PO: ['OUT!', '#e5702a'],
    DP: ['DOUBLE PLAY!', '#e5702a'], SF: ['SAC FLY!', '#7a4fc0'], E: ['ERROR!', '#7a4fc0'], K: ['STRIKEOUT!', '#c22f6b'], BB: ['WALK', '#2a67c9'],
  };
  const ease = (t) => 1 - (1 - t) * (1 - t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpP = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const ord = (n) => U.ordinal(n);

  class Board {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.speed = 1;
      this.paused = false;
      this.queue = [];
      this.anim = null;
      this.raf = null;
      this.reset();
      this.resize();
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.staticCanvas = null; this.draw(); });
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this._onResize);
      this.queue = [];
      this.anim = null;
      this.dead = true;
    }
    reset() {
      this.state = {
        runners: {}, batter: null, ball: null, pocketBalls: [], bat: { hand: 'R', ang: 150, show: false },
        b: 0, s: 0, o: 0, inn: 1, half: 0, score: [0, 0], line: [[], []], hits: [0, 0], errs: [0, 0],
        banner: null, flash: null, callout: null, final: false,
      };
    }
    setGame(L, box) {
      this.L = L;
      const A = L.teams[box.a], Hm = L.teams[box.h];
      this.abbr = [A.abbr, Hm.abbr];
      this.colors = [A.color, Hm.color];
      if (U.colorDist(A.color, Hm.color) < 110) this.colors[0] = A.alt;
    }
    resize() {
      const w = Math.max(200, Math.round(this.cv.clientWidth || 600));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(w * dpr);
      this.scale = (w * dpr) / 1000;
      this.staticCanvas = null;
      this.draw();
    }

    // ---------- playback ----------
    play(log, opts) {
      this.reset();
      this.queue = log.slice();
      this.opts = opts || {};
      this.lastT = null;
      this.prevScore = [0, 0];
      this.nextEvent();
      cancelAnimationFrame(this.raf);
      const loop = (t) => {
        if (this.dead) return;
        const dt = this.lastT == null ? 16 : Math.min(60, t - this.lastT);
        this.lastT = t;
        if (!this.paused) this.tick(dt * this.speed);
        this.draw();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    skipToEnd() {
      while (this.anim) { this.finishAnim(); }
    }
    tick(dt) {
      const st = this.state;
      if (st.banner) st.banner.t += dt;
      if (st.callout) { st.callout.t += dt; if (st.callout.t > 900) st.callout = null; }
      if (st.flash) { st.flash.t += dt; if (st.flash.t > 900) st.flash = null; }
      let budget = dt;
      while (this.anim && budget > 0) {
        const a = this.anim;
        const need = a.dur - a.t;
        if (budget >= need) { budget -= need; this.finishAnim(); }
        else { a.t += budget; budget = 0; a.update(a.t / a.dur); }
      }
    }
    finishAnim() {
      const a = this.anim;
      if (!a) return;
      a.update(1);
      a.done && a.done();
      this.applySnap(a.ev);
      this.opts.onEvent && this.opts.onEvent(a.ev, 'end');
      this.anim = null;
      this.nextEvent();
    }
    nextEvent() {
      const ev = this.queue.shift();
      if (!ev) { this.opts.onDone && this.opts.onDone(); return; }
      this.opts.onEvent && this.opts.onEvent(ev, 'start');
      this.anim = Object.assign({ t: 0, ev }, this.build(ev));
    }
    applySnap(ev) {
      const st = this.state;
      // line score bookkeeping
      const h = ev.half, i = ev.inn - 1;
      if (st.line[h][i] === undefined) st.line[h][i] = 0;
      const d = ev.score[h] - this.prevScore[h];
      if (d > 0) st.line[h][i] += d;
      this.prevScore = ev.score.slice();
      st.inn = ev.inn; st.half = ev.half; st.score = ev.score.slice();
      st.b = Math.min(3, ev.b); st.s = Math.min(2, ev.s); st.o = Math.min(3, ev.outs);
      if (ev.t === 'play' && (ev.res === 'K' || ev.res === 'BB')) { st.b = 0; st.s = 0; }
      // runners straight from the snapshot
      if (ev.t === 'end') return;
      const nr = {};
      ev.bases.forEach((pid, k) => { if (pid) nr[pid] = { x: BASES[k + 1].x, y: BASES[k + 1].y, a: 1 }; });
      st.runners = nr;
      if (ev.t === 'play') st.batter = null;
    }
    runnerPos(from) {
      if (from === 0) return this.batterSpot(this.state.bat.hand);
      return BASES[from];
    }
    batterSpot(hand) {
      const k = hand === 'L' ? 1 : -1;
      return { x: H.x + k * 40, y: H.y + k * 40 };
    }
    pathPoint(from, to, t) {
      // runner travelling base to base (to may be 4 = home)
      const pts = [this.runnerPos(from)];
      for (let b = from + 1; b <= to; b++) pts.push(BASES[b]);
      if (pts.length === 1) return pts[0];
      const segs = pts.length - 1;
      const f = Math.min(segs - 1e-6, t * segs);
      const k = Math.floor(f);
      return lerpP(pts[k], pts[k + 1], f - k);
    }
    runnerAnim(moves) {
      const st = this.state;
      const starts = {};
      moves.forEach((m) => {
        const r = st.runners[m.pid];
        starts[m.pid] = r ? { x: r.x, y: r.y } : this.runnerPos(m.from);
        if (!r) st.runners[m.pid] = { x: starts[m.pid].x, y: starts[m.pid].y, a: 1 };
      });
      return (t) => {
        moves.forEach((m) => {
          const r = st.runners[m.pid];
          if (!r) return;
          if (m.to === 'out') {
            const tgt = lerpP(this.runnerPos(m.from), BASES[Math.min(4, m.from + 1)], 0.45);
            const p = lerpP(starts[m.pid], tgt, Math.min(1, t * 1.6));
            r.x = p.x; r.y = p.y; r.a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
          } else {
            const p = this.pathPoint(m.from, m.to, ease(t));
            r.x = p.x; r.y = p.y; r.a = m.to === 4 && t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
          }
        });
        if (moves.some((m) => m.from === 0)) st.batter = null;
      };
    }
    banner(text, color, hold) { this.state.banner = { text, color, t: 0, hold: hold || 1100 }; }

    build(ev) {
      const st = this.state;
      const sp = (ms) => ms;
      switch (ev.t) {
        case 'half': {
          st.pocketBalls = []; st.ball = null; st.runners = {}; st.batter = null; st.b = 0; st.s = 0; st.o = 0;
          st.half = ev.half; st.inn = ev.inn;
          if (st.line[ev.half][ev.inn - 1] === undefined) st.line[ev.half][ev.inn - 1] = 0;
          this.banner(`${ev.half ? 'BOTTOM' : 'TOP'} ${ord(ev.inn)}`, '#20343f', 1000);
          return { dur: sp(1150), update() {} };
        }
        case 'pa': {
          st.pocketBalls = []; st.ball = null; st.b = 0; st.s = 0;
          st.bat = { hand: ev.hand, ang: ev.hand === 'L' ? 120 : 150, show: true };
          st.batter = { pid: ev.bat, hand: ev.hand, a: 0 };
          return { dur: sp(420), update: (t) => { if (st.batter) st.batter.a = t; } };
        }
        case 'sub': {
          this.banner('PITCHING CHANGE', '#5b3f8c', 1000);
          return { dur: sp(1200), update() {} };
        }
        case 'steal': {
          const mv = this.runnerAnim(ev.moves);
          this.banner(ev.ok ? 'STOLEN BASE!' : 'CAUGHT STEALING!', ev.ok ? '#2f9a45' : '#e5702a', 900);
          return {
            dur: sp(1100),
            update: (t) => {
              mv(Math.min(1, t * 1.2));
              const p = t < 0.35 ? null : lerpP(CATCH, BASES[2], (t - 0.35) / 0.65);
              st.ball = p ? { x: p.x, y: p.y, h: 0.35 * Math.sin(Math.PI * Math.min(1, (t - 0.35) / 0.65)) } : null;
            },
            done: () => { st.ball = null; },
          };
        }
        case 'pitch': return this.buildPitch(ev);
        case 'play': return this.buildPlay(ev);
        case 'end': {
          st.final = true;
          st.runners = {}; st.batter = null; st.ball = null; st.bat.show = false;
          if (ev.half === 0) st.line[1][ev.inn - 1] = 'X';
          this.banner('FINAL', '#20343f', 1e9);
          return { dur: 600, update() {} };
        }
      }
      return { dur: 10, update() {} };
    }

    swingAngle(hand, t) {
      // t 0..1 over the swing; contact at ~0.55
      if (hand === 'L') return lerp(120, 300, t);
      return lerp(150, -30, t);
    }

    buildPitch(ev) {
      const st = this.state;
      const swing = ev.r === 'SS' || ev.r === 'F' || ev.r === 'X';
      const roll = 560, after = ev.r === 'X' ? 60 : 380;
      const tot = roll + after;
      const hand = st.bat.hand;
      let foulTo = null;
      if (ev.r === 'F') {
        foulTo = U.pick([{ x: 135, y: 880 }, { x: 140, y: 560 + Math.random() * 160 }, { x: 290 + Math.random() * 160, y: 870 }, { x: 130, y: 400 }]);
      }
      const label = { B: 'BALL', CS: 'STRIKE', SS: 'SWING & MISS', F: 'FOUL', X: null }[ev.r];
      return {
        dur: tot,
        update: (t) => {
          const ms = t * tot;
          if (ms <= roll) {
            const k = ms / roll;
            const p = lerpP(RAMP_EXIT, H, k * k * 0.3 + k * 0.7);
            // a ball that misses the zone drifts off line a bit
            const off = Math.abs(ev.x) > 1 || Math.abs(ev.y) > 1 ? ev.x * 14 * k : ev.x * 5 * k;
            st.ball = { x: p.x + off, y: p.y + off, h: 0 };
          } else if (ev.r === 'F') {
            const k = (ms - roll) / after;
            const p = lerpP(H, foulTo, ease(k));
            st.ball = { x: p.x, y: p.y, h: 0.5 * Math.sin(Math.PI * k) };
          } else if (ev.r !== 'X') {
            const k = Math.min(1, (ms - roll) / (after * 0.5));
            const p = lerpP(H, CATCH, k);
            st.ball = k >= 1 ? null : { x: p.x, y: p.y, h: 0 };
          }
          if (swing) {
            const s0 = roll * 0.62, s1 = roll + 120;
            const k = U.clamp((ms - s0) / (s1 - s0), 0, 1);
            st.bat.ang = this.swingAngle(hand, ev.r === 'SS' ? k : k * 0.92);
          }
          if (label && ms > roll && !st.callout) st.callout = { text: label, t: 0 };
        },
        done: () => {
          if (ev.r !== 'X') st.ball = null;
          st.bat.ang = hand === 'L' ? 120 : 150;
        },
      };
    }

    buildPlay(ev) {
      const st = this.state;
      const bt = ev.half, ft = 1 - bt;
      const [txt, col] = BANNERS[ev.res] || ['', '#333'];
      const mv = this.runnerAnim(ev.moves || []);
      const hitRes = ['1B', '2B', '3B', 'HR'].includes(ev.res);
      if (ev.res === 'K' || ev.res === 'BB') {
        this.banner(txt, col, 900);
        return {
          dur: 1000,
          update: (t) => { if (ev.res === 'BB') mv(Math.min(1, t * 1.3)); else if (st.batter) st.batter.a = 1 - t; },
          done: () => { st.batter = null; },
        };
      }
      let target, cup = null;
      if (ev.pocket !== null && ev.pocket !== undefined) {
        const pk = POCKETS[ev.pocket];
        target = { x: pk.cx + (Math.random() - 0.5) * 30 * (pk.vert ? 0.3 : 1), y: pk.cy + (Math.random() - 0.5) * 30 * (pk.vert ? 1 : 0.3) };
        if (pk.hr) target = { x: pk.cx + (Math.random() - 0.5) * 40, y: pk.cy - (Math.random() - 0.5) * 40 };
      } else {
        cup = CUPS[ev.fielder] || CUPS.SS;
        target = { x: cup.x, y: cup.y };
      }
      const dist = Math.hypot(target.x - H.x, target.y - H.y);
      const fly = ev.arc;
      const travel = U.clamp(dist * (fly ? 2.3 : 1.7), 450, 1500);
      let bounce = null;
      if (ev.res === 'E') bounce = { x: target.x + (Math.random() - 0.5) * 120, y: target.y + 40 + Math.random() * 50 };
      const tot = travel + (bounce ? 450 : 0) + 650;
      const swingFrom = st.bat.ang;
      return {
        dur: tot,
        update: (t) => {
          const ms = t * tot;
          // follow-through
          st.bat.ang = this.swingAngle(st.bat.hand, U.clamp(0.92 + ms / 250, 0, 1));
          if (ms <= travel) {
            const k = ms / travel;
            const p = lerpP(H, target, fly ? k : ease(k));
            st.ball = { x: p.x, y: p.y, h: fly ? Math.sin(Math.PI * k) * (ev.res === 'HR' ? 1.25 : 0.9) : 0 };
          } else if (bounce && ms <= travel + 450) {
            const k = (ms - travel) / 450;
            const p = lerpP(target, bounce, ease(k));
            st.ball = { x: p.x, y: p.y, h: 0.25 * Math.sin(Math.PI * k) };
          } else if (!st.flash && (cup || hitRes || ev.pocket !== null)) {
            st.flash = { cup: cup ? ev.fielder : null, pocket: cup ? null : ev.pocket, t: 0, good: hitRes };
            if (!st.banner || st.banner.t > st.banner.hold) this.banner(txt, col, 900);
          }
          const rk = U.clamp((ms - travel * 0.15) / (travel * 0.85 + 300), 0, 1);
          mv(rk);
        },
        done: () => {
          if (ev.res === 'HR' || ev.pocket !== null) st.pocketBalls.push(st.ball ? { x: st.ball.x, y: st.ball.y } : target);
          else if (cup && !bounce) st.pocketBalls.push(target);
          st.ball = null;
          if (hitRes) st.hits[bt]++;
          if (ev.res === 'E') st.errs[ft]++;
        },
      };
    }

    // ---------- drawing ----------
    draw() {
      const c = this.ctx;
      if (!this.staticCanvas) this.renderStatic();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      c.drawImage(this.staticCanvas, 0, 0);
      c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.drawDynamic(c);
    }
    renderStatic() {
      const cv = document.createElement('canvas');
      cv.width = this.cv.width; cv.height = this.cv.height;
      const c = cv.getContext('2d');
      c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      drawBoard(c);
      this.staticCanvas = cv;
    }
    drawDynamic(c) {
      const st = this.state;
      const fc = this.colors ? this.colors[1 - st.half] : '#c8232c';
      const bc = this.colors ? this.colors[st.half] : '#1f5fbf';
      // flash a cup / pocket
      if (st.flash) {
        const a = 0.55 * (1 - st.flash.t / 900);
        c.save();
        c.globalAlpha = Math.max(0, a);
        c.fillStyle = st.flash.good ? '#fff6a8' : '#ffffff';
        if (st.flash.cup && CUPS[st.flash.cup]) {
          const cp = CUPS[st.flash.cup];
          c.beginPath(); c.arc(cp.x, cp.y, 48, 0, Math.PI * 2); c.fill();
        } else if (st.flash.pocket !== null && POCKETS[st.flash.pocket]) {
          const pk = POCKETS[st.flash.pocket];
          c.beginPath(); c.arc(pk.cx, pk.cy, 52, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      // count pegs
      drawCount(c, st.b, st.s, st.o);
      // resting balls
      st.pocketBalls.forEach((b) => drawBall(c, b.x, b.y, 0));
      // fielders
      Object.keys(FIELDERS).forEach((k) => drawPeg(c, FIELDERS[k].x, FIELDERS[k].y, fc, 1, k === 'C' ? 0.9 : 1));
      // bat + batter
      if (st.bat.show) {
        const bs = this.batterSpot(st.bat.hand);
        if (st.batter) drawPeg(c, bs.x - (st.bat.hand === 'L' ? -10 : 10), bs.y - (st.bat.hand === 'L' ? -10 : 10), bc, st.batter.a, 1);
        drawBat(c, st.bat.hand, st.bat.ang);
      }
      // runners
      Object.keys(st.runners).forEach((pid) => {
        const r = st.runners[pid];
        if (r.a > 0.01) drawPeg(c, r.x + 14, r.y - 14, bc, r.a, 0.95);
      });
      // ball
      if (st.ball) drawBall(c, st.ball.x, st.ball.y, st.ball.h || 0);
      // scoreboard
      this.drawScoreboard(c);
      // callout near home
      if (st.callout) {
        const k = st.callout.t / 900;
        c.save();
        c.globalAlpha = 1 - k * k;
        c.font = '900 26px Nunito, system-ui, sans-serif';
        c.textAlign = 'center';
        c.lineWidth = 6; c.strokeStyle = '#10261a';
        c.fillStyle = st.callout.text === 'BALL' ? '#9fd3ff' : st.callout.text === 'FOUL' ? '#fff' : '#ffd84a';
        c.strokeText(st.callout.text, 300, 760 - k * 30);
        c.fillText(st.callout.text, 300, 760 - k * 30);
        c.restore();
      }
      if (st.banner && st.banner.t < st.banner.hold + 300) this.drawBanner(c, st.banner);
    }
    drawBanner(c, b) {
      const pop = Math.min(1, b.t / 160);
      const fade = b.t > b.hold ? 1 - (b.t - b.hold) / 300 : 1;
      const s = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3)) + (pop < 1 ? 0 : 0);
      c.save();
      c.globalAlpha = Math.max(0, fade);
      c.translate(560, 410);
      c.rotate(-0.06);
      c.scale(s, s);
      c.font = '400 54px Bungee, Impact, system-ui, sans-serif';
      const w = c.measureText(b.text).width + 60;
      roundRect(c, -w / 2, -42, w, 84, 18);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.save(); c.translate(6, 8); c.fill(); c.restore();
      c.fillStyle = b.color; c.fill();
      c.lineWidth = 6; c.strokeStyle = '#fff'; c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b.text, 0, 4);
      c.restore();
    }
    drawScoreboard(c) {
      const st = this.state;
      const x = 150, y = 18, w = 700, h = 96;
      c.save();
      roundRect(c, x, y, w, h, 12);
      c.fillStyle = '#121414'; c.fill();
      c.lineWidth = 5; c.strokeStyle = '#2c3a33'; c.stroke();
      const nInn = Math.max(9, st.line[0].length, st.line[1].length);
      const first = Math.max(0, nInn - 9);
      const cols = 9;
      const cw = 44, x0 = x + 92, top = y + 30;
      c.font = '700 15px Nunito, system-ui, sans-serif';
      c.fillStyle = '#7d8b84'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < cols; i++) c.fillText(String(first + i + 1), x0 + i * cw + cw / 2, y + 15);
      ['R', 'H', 'E'].forEach((k, j) => c.fillText(k, x0 + cols * cw + 12 + j * 50 + 25, y + 15));
      for (let tm = 0; tm < 2; tm++) {
        const ry = top + 8 + tm * 30;
        c.textAlign = 'left';
        c.font = '400 20px Bungee, Impact, sans-serif';
        c.fillStyle = this.colors ? this.colors[tm] : '#fff';
        c.fillRect(x + 12, ry - 9, 8, 18);
        c.fillStyle = '#f4efe2';
        c.fillText(this.abbr ? this.abbr[tm] : (tm ? 'HOME' : 'AWAY'), x + 26, ry + 1);
        c.textAlign = 'center';
        c.font = '700 22px "Courier New", monospace';
        for (let i = 0; i < cols; i++) {
          const v = st.line[tm][first + i];
          const live = !st.final && st.half === tm && st.inn === first + i + 1;
          if (live) { c.fillStyle = '#3a2f12'; c.fillRect(x0 + i * cw + 3, ry - 13, cw - 6, 26); }
          c.fillStyle = live ? '#ffd84a' : '#ffb627';
          if (v !== undefined) c.fillText(String(v), x0 + i * cw + cw / 2, ry + 1);
        }
        const tot = [st.score[tm], st.hits[tm], st.errs[tm]];
        tot.forEach((v, j) => {
          c.fillStyle = j === 0 ? '#ff6b4a' : '#ffb627';
          c.fillText(String(v), x0 + cols * cw + 12 + j * 50 + 25, ry + 1);
        });
      }
      c.restore();
    }
  }

  // ---------- static board art ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fieldPath(c) {
    c.beginPath();
    FIELD.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }
  function stripes(c, col, w, gap) {
    c.save();
    c.fillStyle = col;
    for (let k = -1200; k < 1200; k += w + gap) {
      c.beginPath();
      // bands running along (1,1): perpendicular to the line to center field
      c.moveTo(k, 0); c.lineTo(k + w, 0); c.lineTo(k + w + 1000, 1000); c.lineTo(k + 1000, 1000);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  function drawBoard(c) {
    // outer plastic tray
    roundRect(c, 6, 6, 988, 988, 74);
    const g = c.createLinearGradient(0, 0, 1000, 1000);
    g.addColorStop(0, '#24573a'); g.addColorStop(1, '#173f29');
    c.fillStyle = g; c.fill();
    // bleacher ridges
    for (let i = 0; i < 9; i++) {
      roundRect(c, 14 + i * 10, 14 + i * 10, 972 - i * 20, 972 - i * 20, 66 - i * 5);
      c.lineWidth = 3;
      c.strokeStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.22)';
      c.stroke();
    }
    // raised wall behind the field
    c.save();
    c.beginPath();
    c.moveTo(96, 112); c.lineTo(690, 112); c.lineTo(888, 310); c.lineTo(888, 904); c.lineTo(96, 904); c.closePath();
    c.fillStyle = '#1a4630'; c.fill();
    c.lineWidth = 6; c.strokeStyle = '#123322'; c.stroke();
    c.restore();

    // pockets
    POCKETS.forEach((pk, i) => {
      if (pk.hr) return;
      c.fillStyle = '#0f2c1d';
      c.fillRect(pk.x0, pk.y0, pk.x1 - pk.x0, pk.y1 - pk.y0);
      // divider walls
      c.fillStyle = '#2b6a47';
      if (pk.vert) { c.fillRect(pk.x0, pk.y0 - 3, pk.x1 - pk.x0 + 10, 6); c.fillRect(pk.x0, pk.y1 - 3, pk.x1 - pk.x0 + 10, 6); }
      else { c.fillRect(pk.x0 - 3, pk.y0 - 10, 6, pk.y1 - pk.y0 + 10); c.fillRect(pk.x1 - 3, pk.y0 - 10, 6, pk.y1 - pk.y0 + 10); }
      sticker(c, POCKET_LABELS[i], pk);
    });
    // home run trough
    c.save();
    c.beginPath();
    c.moveTo(690, 190); c.lineTo(690, 118); c.lineTo(892, 320); c.lineTo(810, 310); c.closePath();
    c.fillStyle = '#0f2c1d'; c.fill();
    c.translate(790, 200); c.rotate(Math.PI / 4);
    c.font = '400 30px Bungee, Impact, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#2e6e4a'; c.fillText('HOMERUN', 0, 0);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillText('HOMERUN', 1.5, 2);
    c.restore();

    // playing surface (dark plastic with stripes)
    c.save();
    fieldPath(c);
    c.clip();
    c.fillStyle = '#245a3b'; c.fillRect(0, 0, 1000, 1000);
    stripes(c, 'rgba(255,255,255,.055)', 34, 34);
    // dirt infield fan
    c.beginPath();
    c.moveTo(H.x, H.y);
    c.arc(H.x, H.y, 470, rad(-96), rad(6));
    c.closePath();
    const dirt = c.createRadialGradient(H.x, H.y, 50, H.x, H.y, 480);
    dirt.addColorStop(0, '#d2a46c'); dirt.addColorStop(1, '#c08d55');
    c.fillStyle = dirt; c.fill();
    // speckle the dirt
    c.fillStyle = 'rgba(90,55,20,.12)';
    for (let i = 0; i < 700; i++) {
      const a = rad(-96 + Math.random() * 102), r = Math.random() * 465;
      c.fillRect(H.x + Math.cos(a) * r, H.y + Math.sin(a) * r, 2, 2);
    }
    // infield grass square with stripes
    c.save();
    c.beginPath(); c.rect(232, 532, 236, 236); c.clip();
    c.fillStyle = '#4a9f47'; c.fillRect(232, 532, 236, 236);
    stripes(c, 'rgba(255,255,255,.12)', 20, 20);
    c.restore();
    // home plate dirt circle & mound
    c.fillStyle = '#cf9f66';
    c.beginPath(); c.arc(H.x, H.y, 62, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(MOUND.x, MOUND.y, 50, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(120,80,40,.4)'; c.lineWidth = 2; c.stroke();
    // foul lines
    c.strokeStyle = '#f6f4ec'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(H.x, H.y); c.lineTo(H.x, 190); c.stroke();
    c.beginPath(); c.moveTo(H.x, H.y); c.lineTo(810, H.y); c.stroke();
    // batter boxes
    c.lineWidth = 3;
    [[-1], [1]].forEach(([k]) => {
      c.save(); c.translate(H.x + k * 36, H.y + k * 36); c.rotate(Math.PI / 4);
      c.strokeRect(-14, -26, 28, 52); c.restore();
    });
    c.restore();

    // bases
    [1, 2, 3].forEach((b) => {
      c.save(); c.translate(BASES[b].x, BASES[b].y); c.rotate(Math.PI / 4);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-11, -9, 22, 22);
      c.fillStyle = '#fbfbf6'; c.fillRect(-12, -12, 22, 22);
      c.restore();
    });
    // home plate (pentagon pointing at the catcher)
    c.save(); c.translate(H.x, H.y); c.rotate(Math.PI / 4 + Math.PI / 2);
    c.beginPath(); c.moveTo(-11, -9); c.lineTo(11, -9); c.lineTo(11, 3); c.lineTo(0, 13); c.lineTo(-11, 3); c.closePath();
    c.fillStyle = '#fbfbf6'; c.fill(); c.restore();

    // scoop cups
    Object.keys(CUPS).forEach((k) => drawCup(c, CUPS[k], k));
    // pitching ramp with steel balls
    drawRamp(c);
    // catcher's backstop trough
    c.save();
    c.translate(150, 858); c.rotate(Math.PI / 4);
    roundRect(c, -40, -18, 80, 36, 10);
    c.fillStyle = '#163b27'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#2b6a47'; c.stroke();
    c.restore();
    // count strip housing
    roundRect(c, 330, 822, 300, 72, 14);
    c.fillStyle = '#16402a'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#0e2a1b'; c.stroke();
    // embossed brand on the frame
    c.save();
    c.font = '400 22px Bungee, Impact, sans-serif';
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.textAlign = 'center';
    c.translate(944, 640); c.rotate(-Math.PI / 2);
    c.fillText('TOY BASEBALL', 0, 0);
    c.restore();
  }

  function sticker(c, label, pk) {
    const col = POCKET_COL[label];
    c.save();
    if (pk.vert) {
      c.translate(pk.x1 - 14, (pk.y0 + pk.y1) / 2);
      c.rotate(Math.PI / 2);
    } else {
      c.translate((pk.x0 + pk.x1) / 2, pk.y0 + 14);
    }
    const w = 104, h = 24;
    c.fillStyle = col; c.fillRect(-w / 2, -h / 2, w, h);
    // striped ends like the printed stickers
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 3; i++) {
      [-1, 1].forEach((s) => {
        const x = s * (w / 2 - 6 - i * 5);
        c.beginPath(); c.moveTo(x - 1.5, -h / 2); c.lineTo(x + 1.5, -h / 2); c.lineTo(x - 2.5, h / 2); c.lineTo(x - 5.5, h / 2); c.closePath(); c.fill();
      });
    }
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(-w / 2, -h / 2, w, h);
    c.font = '400 15px Bungee, Impact, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(label, 0, 1);
    c.fillStyle = '#fff'; c.fillText(label, 0, 1);
    c.restore();
  }

  function drawCup(c, cp, label) {
    c.save();
    c.translate(cp.x, cp.y);
    c.rotate(cp.ang + Math.PI / 2); // local -y points away from home
    const w = cp.w, d = 30;
    // shadow
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.moveTo(-w / 2 + 4, 4); c.lineTo(w / 2 + 4, 4); c.lineTo(w / 2 - 14 + 4, -d + 4); c.lineTo(-w / 2 + 14 + 4, -d + 4); c.closePath(); c.fill();
    // scoop body (open toward home)
    const g = c.createLinearGradient(0, -d, 0, 6);
    g.addColorStop(0, '#2e5f45'); g.addColorStop(1, '#1d4330');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-w / 2, 6); c.lineTo(-w / 2 + 14, -d); c.lineTo(w / 2 - 14, -d); c.lineTo(w / 2, 6);
    c.lineTo(w / 2 - 8, 6); c.lineTo(w / 2 - 18, -d + 9); c.lineTo(-w / 2 + 18, -d + 9); c.lineTo(-w / 2 + 8, 6); c.closePath();
    c.fill();
    c.strokeStyle = '#3f7a5a'; c.lineWidth = 2; c.stroke();
    // floor of the cup
    c.fillStyle = 'rgba(10,30,20,.55)';
    c.beginPath(); c.moveTo(-w / 2 + 8, 6); c.lineTo(-w / 2 + 18, -d + 9); c.lineTo(w / 2 - 18, -d + 9); c.lineTo(w / 2 - 8, 6); c.closePath(); c.fill();
    // embossed position letters on the back wall
    c.font = '800 13px Nunito, system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, 0, -d + 4);
    c.restore();
  }

  function drawRamp(c) {
    c.save();
    const ang = Math.atan2(RAMP_BACK.y - RAMP_EXIT.y, RAMP_BACK.x - RAMP_EXIT.x);
    const len = Math.hypot(RAMP_BACK.x - RAMP_EXIT.x, RAMP_BACK.y - RAMP_EXIT.y);
    c.translate(RAMP_EXIT.x, RAMP_EXIT.y);
    c.rotate(ang);
    c.fillStyle = 'rgba(0,0,0,.3)'; roundRect(c, -6 + 5, -17 + 6, len + 16, 34, 8); c.fill();
    const g = c.createLinearGradient(0, -17, 0, 17);
    g.addColorStop(0, '#3a3f3c'); g.addColorStop(0.5, '#222624'); g.addColorStop(1, '#3a3f3c');
    c.fillStyle = g; roundRect(c, -6, -17, len + 16, 34, 8); c.fill();
    c.fillStyle = '#121513'; roundRect(c, 4, -9, len - 4, 18, 6); c.fill();
    c.fillStyle = '#c8232c'; c.fillRect(len - 10, -14, 10, 6);
    c.restore();
    for (let i = 0; i < 5; i++) {
      const p = lerpP(RAMP_EXIT, RAMP_BACK, 0.2 + i * 0.16);
      drawBall(c, p.x, p.y, 0, 0.85);
    }
  }

  function drawCount(c, b, s, o) {
    const rows = [['BALL', '#2a67c9', 3, b], ['STRIKE', '#e7b52a', 2, s], ['OUT', '#e5702a', 2, o]];
    rows.forEach(([lab, col, n, v], r) => {
      const y = 836 + r * 22;
      c.fillStyle = col;
      roundRect(c, 340, y - 9, 280, 18, 9); c.fill();
      c.font = '400 12px Bungee, Impact, sans-serif';
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(lab, 352, y + 1);
      for (let i = 0; i < n; i++) {
        const x = 470 + i * 46;
        c.fillStyle = '#0d241a';
        c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
        if (i < v) {
          const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
          g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfcfcf');
          c.fillStyle = g;
          c.beginPath(); c.arc(x, y, 6.5, 0, Math.PI * 2); c.fill();
        }
      }
    });
  }

  function drawPeg(c, x, y, color, alpha, scale) {
    if (alpha <= 0) return;
    const s = scale || 1;
    c.save();
    c.globalAlpha = Math.min(1, alpha);
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(x + 6 * s, y + 8 * s, 15 * s, 12 * s, 0.6, 0, Math.PI * 2); c.fill();
    // uniform body
    const gb = c.createRadialGradient(x - 4 * s, y - 2 * s, 2, x, y + 2 * s, 15 * s);
    gb.addColorStop(0, '#ffffff'); gb.addColorStop(1, '#bdbdb8');
    c.fillStyle = gb;
    c.beginPath(); c.ellipse(x, y + 3 * s, 14 * s, 12 * s, 0, 0, Math.PI * 2); c.fill();
    // cap / helmet
    const gh = c.createRadialGradient(x - 4 * s, y - 7 * s, 1, x, y - 3 * s, 11 * s);
    gh.addColorStop(0, U.shade(color, 0.45)); gh.addColorStop(1, color);
    c.fillStyle = gh;
    c.beginPath(); c.arc(x, y - 3 * s, 10 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = U.shade(color, -0.3);
    c.beginPath(); c.ellipse(x - 6 * s, y + 3 * s, 7 * s, 3.5 * s, 0.7, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawBall(c, x, y, h, scale) {
    const s = (scale || 1) * (1 + h * 0.9);
    const r = 8 * s;
    c.save();
    c.fillStyle = `rgba(0,0,0,${0.35 - h * 0.12})`;
    c.beginPath(); c.ellipse(x + 3 + h * 22, y + 4 + h * 22, 8 * (scale || 1), 6 * (scale || 1), 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#d8dde0'); g.addColorStop(0.8, '#7e878c'); g.addColorStop(1, '#4b5357');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawBat(c, hand, angDeg) {
    const k = hand === 'L' ? 1 : -1;
    const piv = { x: H.x + k * 30, y: H.y + k * 30 };
    const a = rad(angDeg);
    const len = 70;
    c.save();
    c.translate(piv.x, piv.y);
    c.rotate(a);
    c.fillStyle = 'rgba(0,0,0,.3)';
    roundRect(c, 4, -4 + 6, len, 9, 4.5); c.fill();
    const g = c.createLinearGradient(0, -5, 0, 5);
    g.addColorStop(0, '#f0f3f5'); g.addColorStop(0.5, '#9aa3a8'); g.addColorStop(1, '#5e666b');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -3); c.lineTo(len - 8, -5); c.arc(len - 8, 0, 5, -Math.PI / 2, Math.PI / 2); c.lineTo(0, 3); c.closePath();
    c.fill();
    c.fillStyle = '#c8232c';
    c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd7d7';
    c.beginPath(); c.arc(-2, -2, 2, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  TB.Board = Board;
  TB.drawBoardPreview = function (canvas) {
    const b = new Board(canvas);
    return b;
  };
})();
