/* Pitch-by-pitch game simulator. simGame() plays a whole game instantly and
   returns a box score plus an event log the toy board can replay. */
(function () {
  'use strict';
  const TB = globalThis.TB, U = TB.U;
  const R = Math.random;
  const clamp = U.clamp;

  const OUT_FIELDERS = {
    GO: { P: 5, '1B': 15, '2B': 27, SS: 30, '3B': 23 },
    FO: { LF: 32, CF: 36, RF: 32 },
    LO: { '1B': 8, '2B': 14, SS: 14, '3B': 10, LF: 18, CF: 18, RF: 18 },
    PO: { C: 12, '1B': 20, '2B': 22, SS: 24, '3B': 22 },
  };
  const POS_NAME = { P: 'pitcher', C: 'catcher', '1B': 'first', '2B': 'second', '3B': 'third', SS: 'short', LF: 'left', CF: 'center', RF: 'right' };

  TB.simGame = function (L, awayId, homeId, opts) {
    opts = opts || {};
    const T = [L.teams[awayId], L.teams[homeId]];
    const P = (id) => L.players[id];
    const log = [];
    const g = { inn: 1, half: 0, outs: 0, b: 0, s: 0, bases: [null, null, null], score: [0, 0] };
    const line = [[], []], hits = [0, 0], errs = [0, 0];
    const lu = T.map((t) => t.lineup.map((x) => ({ pid: x.pid, pos: x.pos })));
    const def = lu.map((l) => { const d = {}; l.forEach((x) => { if (x.pos !== 'DH') d[x.pos] = x.pid; }); return d; });
    const teamFld = def.map((d) => U.sum(Object.keys(d), (pos) => TB.fieldAt(P(d[pos]), pos)) / 8);
    const bo = [0, 0];
    const bat = [{}, {}], pit = [[], []];
    lu.forEach((l, i) => l.forEach((x) => (bat[i][x.pid] = { pid: x.pid, pos: x.pos, pa: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0, cs: 0, sf: 0 })));
    const ps = [null, null];
    const used = [new Set(), new Set()];
    let goAhead = null;
    let done = false;

    const snap = () => ({ inn: g.inn, half: g.half, outs: g.outs, b: g.b, s: g.s, bases: g.bases.map((x) => (x ? x.pid : null)), score: g.score.slice() });
    const push = (ev) => { log.push(Object.assign(ev, snap())); return ev; };

    function enter(ti, pid, starter) {
      const p = P(pid);
      let lim = starter ? 45 + p.sta * 0.65 : 12 + p.sta * 0.4;
      lim -= p.fatigue * 0.5;
      const ln = { pid, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, pc: 0, dec: '', gs: starter ? 1 : 0, lead: g.score[ti] - g.score[1 - ti] };
      pit[ti].push(ln);
      used[ti].add(pid);
      ps[ti] = { pid, pc: 0, lim: Math.max(lim, 15), line: ln, starter, maxOuts: starter ? 99 : p.sta >= 42 ? 9 : 3 };
    }
    enter(0, opts.starters[0], true);
    enter(1, opts.starters[1], true);

    function available(ti, id) {
      const p = P(id);
      return p && !used[ti].has(id) && !p.inj && p.fatigue < 40 && p.team === T[ti].id;
    }
    function pickReliever(ti, hi, longMan) {
      const t = T[ti];
      const pool = t.bullpen.filter((id) => id !== t.closer && available(ti, id)).map(P);
      if (!pool.length) return null;
      if (longMan) return pool.sort((a, b) => b.sta - a.sta)[0];
      pool.sort((a, b) => TB.ovr(b) - TB.ovr(a));
      if (hi) return pool[0];
      return pool[Math.min(pool.length - 1, 1 + Math.floor(R() * (pool.length - 1)))];
    }
    function change(ti, pid) {
      const old = ps[ti].pid;
      enter(ti, pid, false);
      push({ t: 'sub', team: ti, in: pid, out: old, desc: `Pitching change: ${P(pid).name} replaces ${P(old).name}.` });
    }
    function maybeChange(ft, halfStart) {
      const st = ps[ft], t = T[ft];
      const lead = g.score[ft] - g.score[1 - ft];
      if (halfStart && g.inn >= 9 && lead >= 1 && lead <= 3 && t.closer && st.pid !== t.closer && available(ft, t.closer)) {
        change(ft, t.closer);
        return;
      }
      let pull = st.pc >= st.lim;
      if (st.starter && st.line.r >= 6) pull = true;
      if (st.starter && st.line.r >= 5 && g.inn <= 5) pull = true;
      if (!st.starter && st.line.r >= 3) pull = true;
      if (halfStart && !st.starter && st.line.outs >= st.maxOuts && st.pid !== t.closer) pull = true;
      if (halfStart && st.starter && g.inn >= 8 && Math.abs(lead) <= 3 && st.pc > st.lim - 22) pull = true;
      if (!pull) return;
      const hi = g.inn >= 7 && Math.abs(lead) <= 3;
      const r = pickReliever(ft, hi, st.starter && g.inn <= 5);
      if (r) change(ft, r.id);
    }

    // ---------- runs & runners ----------
    function scoreRun(bt, runner, mv, from, rbiTo) {
      const before = g.score[bt] - g.score[1 - bt];
      g.score[bt]++;
      bat[bt][runner.pid].r++;
      runner.line.r++;
      if (runner.earned) runner.line.er++;
      if (rbiTo) rbiTo.rbi++;
      if (before === 0) goAhead = { team: bt, wp: ps[bt].line, lp: runner.line };
      mv.push({ pid: runner.pid, from, to: 4 });
    }

    // ---------- pitch model ----------
    function throwPitch(eb, ep) {
      const zoneP = clamp(0.5 + (ep.ctl - 50) * 0.0025, 0.32, 0.64);
      const inZone = R() < zoneP;
      let swing;
      if (inZone) {
        let p = 0.66 + (eb.con - 50) * 0.001;
        if (g.s === 2) p += 0.14;
        if (g.b === 3 && g.s === 0) p *= 0.35;
        swing = R() < p;
      } else {
        let p = 0.31 - (eb.eye - 50) * 0.0025 + (ep.S - 50) * 0.0015;
        if (g.s === 2) p += 0.1;
        if (g.b === 3 && g.s < 2) p *= 0.4;
        swing = R() < clamp(p, 0.05, 0.6);
      }
      let r;
      if (!swing) r = inZone ? 'CS' : 'B';
      else {
        const cp = inZone ? 0.82 + (eb.con - ep.S - 5) * 0.002 : 0.55 + (eb.con - ep.S - 5) * 0.003;
        if (R() > clamp(cp, 0.35, 0.97)) r = 'SS';
        else if (R() < (inZone ? 0.42 : 0.55)) r = 'F';
        else r = 'X';
      }
      // cosmetic pitch type / speed / location
      const p = P(ps[ep.ti].pid);
      const fb = R() < 0.55;
      const kind = fb ? 'FB' : U.pick(['SL', 'CB', 'CH']);
      const mph = fb ? p.vel - U.randInt(0, 2) : p.vel - U.randInt(7, 12);
      let x, y;
      if (inZone) { x = (R() * 2 - 1) * 0.85; y = (R() * 2 - 1) * 0.85; }
      else {
        x = (R() * 2 - 1) * 1.5; y = (R() * 2 - 1) * 1.5;
        if (Math.abs(x) < 1.05 && Math.abs(y) < 1.05) { if (R() < 0.5) x = Math.sign(x || 1) * (1.1 + R() * 0.4); else y = Math.sign(y || 1) * (1.1 + R() * 0.4); }
      }
      return { r, inZone, kind, mph, x, y };
    }

    function effBatter(p, pp) {
      const c = (p.cond - 2) * 3;
      const hand = p.bats === 'S' ? (pp.throws === 'R' ? 'L' : 'R') : p.bats;
      const pl = hand === pp.throws ? -4 : 2;
      return { con: p.con + c + pl, pow: p.pow + c * 0.8 + pl, eye: p.eye + c * 0.5, spd: p.spd, hand };
    }
    function effPitcher(ti) {
      const st = ps[ti], p = P(st.pid);
      const tired = clamp((st.pc - st.lim) / 20, 0, 1.5);
      const c = (p.cond - 2) * 4;
      return { ti, S: TB.stuff(p) + c - tired * 12, ctl: p.ctl + c - tired * 15, tired };
    }

    // ---------- ball in play ----------
    function battedBall(eb, ep, inZone, ft) {
      const S = ep.S;
      const dfn = Math.exp(-(teamFld[ft] - 50) * 0.005);
      const tir = 1 + 0.15 * ep.tired;
      const w = {
        HR: 0.037 * Math.exp((eb.pow - 55) * 0.028 - (S - 50) * 0.008) * tir,
        '3B': 0.005 * Math.exp((eb.spd - 50) * 0.035) * dfn,
        '2B': 0.061 * Math.exp((eb.pow - 55) * 0.009 + (eb.con - 55) * 0.004 - (S - 50) * 0.004) * dfn * tir,
        '1B': 0.233 * Math.exp((eb.con - 55) * 0.006 + (eb.spd - 50) * 0.003 - (S - 50) * 0.005) * dfn * tir,
      };
      if (!inZone) { w.HR *= 0.45; w['2B'] *= 0.7; w['1B'] *= 0.85; }
      const hitTot = w.HR + w['3B'] + w['2B'] + w['1B'];
      w.OUT = Math.max(0.3, 1 - hitTot);
      return U.weighted(w);
    }

    function pocketFor(type, hand) {
      // pockets: 0..3 along left-field wall (DOUBLE, SINGLE, TRIPLE, OUT), 4 = HOMERUN, 5..8 right-field wall (OUT, TRIPLE, SINGLE, DOUBLE)
      const pull = R() < 0.6;
      const left = hand === 'R' ? pull : !pull;
      const m = { '2B': [0, 8], '1B': [1, 7], '3B': [2, 6], OUT: [3, 5] }[type];
      if (type === 'HR') return 4;
      return left ? m[0] : m[1];
    }

    // ---------- plate appearance ----------
    function plateAppearance(bt) {
      const ft = 1 - bt;
      const slot = lu[bt][bo[bt]];
      bo[bt] = (bo[bt] + 1) % 9;
      const b = P(slot.pid);
      const st = ps[ft], pp = P(st.pid);
      const bl = bat[bt][b.id];
      const eb = effBatter(b, pp);
      g.b = 0; g.s = 0;
      push({ t: 'pa', bat: b.id, pit: pp.id, hand: eb.hand, pos: slot.pos, order: (bo[bt] + 8) % 9 });
      const B = g.bases;
      const pitLine = st.line;

      // stolen base attempt
      if (B[0] && !B[1]) {
        const rn = P(B[0].pid);
        if (rn.spd >= 58 && R() < 0.22 * (rn.spd - 54) / 40) {
          const cArm = P(def[ft].C).arm;
          const ok = R() < clamp(0.66 + (rn.spd - 65) * 0.011 - (cArm - 50) * 0.004, 0.4, 0.93);
          const mv = [];
          if (ok) {
            B[1] = B[0]; B[0] = null; bat[bt][rn.id].sb++;
            mv.push({ pid: rn.id, from: 1, to: 2 });
          } else {
            B[0] = null; g.outs++; pitLine.outs++; bat[bt][rn.id].cs++;
            mv.push({ pid: rn.id, from: 1, to: 'out' });
          }
          push({ t: 'steal', ok, runner: rn.id, moves: mv, desc: ok ? `${rn.name} steals second!` : `${rn.name} is caught stealing.` });
          if (g.outs >= 3) { bo[bt] = (bo[bt] + 8) % 9; return; }
        }
      }

      bl.pa++;
      for (;;) {
        const ep = effPitcher(ft);
        const pc = throwPitch(eb, ep);
        st.pc++; pitLine.pc++;
        if (pc.r === 'B') g.b++;
        else if (pc.r === 'CS' || pc.r === 'SS') g.s++;
        else if (pc.r === 'F' && g.s < 2) g.s++;
        push({ t: 'pitch', r: pc.r, kind: pc.kind, mph: pc.mph, x: pc.x, y: pc.y });

        if (g.b === 4) { // walk
          const mv = [], nb = B.slice();
          const runner = { pid: b.id, line: pitLine, earned: true };
          if (B[0]) {
            if (B[1]) {
              if (B[2]) scoreRun(bt, B[2], mv, 3, bl);
              nb[2] = B[1]; mv.push({ pid: B[1].pid, from: 2, to: 3 });
            }
            nb[1] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 2 });
          }
          nb[0] = runner; mv.push({ pid: b.id, from: 0, to: 1 });
          g.bases = nb;
          bl.bb++; pitLine.bb++;
          push({ t: 'play', res: 'BB', moves: mv, desc: `${b.name} walks.` + runsTxt(mv) });
          return;
        }
        if (g.s === 3) {
          g.outs++; bl.ab++; bl.so++; pitLine.so++; pitLine.outs++;
          push({ t: 'play', res: 'K', moves: [{ pid: b.id, from: 0, to: 'out' }], desc: `${b.name} strikes out ${pc.r === 'CS' ? 'looking' : 'swinging'}.` });
          return;
        }
        if (pc.r === 'X') { inPlay(bt, ft, b, bl, eb, ep, pc.inZone, pitLine); return; }
      }
    }

    function runsTxt(mv) {
      const n = mv.filter((m) => m.to === 4).length;
      return n ? ` ${n === 1 ? 'A run scores' : n + ' runs score'}!` : '';
    }

    function inPlay(bt, ft, b, bl, eb, ep, inZone, pitLine) {
      const B = g.bases;
      const type = battedBall(eb, ep, inZone, ft);
      const mv = [];
      const batter = { pid: b.id, line: pitLine, earned: true };
      const spdOf = (r) => P(r.pid).spd;
      const nb = [null, null, null];
      let desc = '', res = type, fielder = null, pocket = null, arc = false;

      if (type !== 'OUT') {
        hits[bt]++; bl.h++; bl.ab++; pitLine.h++;
        pocket = pocketFor(type, eb.hand);
        if (type === 'HR') {
          [2, 1, 0].forEach((i) => { if (B[i]) scoreRun(bt, B[i], mv, i + 1, bl); });
          scoreRun(bt, batter, mv, 0, bl);
          bl.hr++; pitLine.hr++; arc = true;
          const n = mv.length;
          desc = n === 4 ? `GRAND SLAM by ${b.name}!` : `${b.name} hits a ${n === 1 ? 'solo' : n + '-run'} HOME RUN!`;
        } else if (type === '3B') {
          [2, 1, 0].forEach((i) => { if (B[i]) scoreRun(bt, B[i], mv, i + 1, bl); });
          nb[2] = batter; mv.push({ pid: b.id, from: 0, to: 3 });
          bl.t++; desc = `${b.name} triples!`;
        } else if (type === '2B') {
          if (B[2]) scoreRun(bt, B[2], mv, 3, bl);
          if (B[1]) scoreRun(bt, B[1], mv, 2, bl);
          if (B[0]) {
            if (R() < 0.42 + (spdOf(B[0]) - 50) * 0.007) scoreRun(bt, B[0], mv, 1, bl);
            else { nb[2] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 3 }); }
          }
          nb[1] = batter; mv.push({ pid: b.id, from: 0, to: 2 });
          bl.d++; desc = `${b.name} doubles!`;
        } else {
          if (B[2]) scoreRun(bt, B[2], mv, 3, bl);
          if (B[1]) {
            if (R() < 0.55 + (spdOf(B[1]) - 50) * 0.006) scoreRun(bt, B[1], mv, 2, bl);
            else { nb[2] = B[1]; mv.push({ pid: B[1].pid, from: 2, to: 3 }); }
          }
          if (B[0]) {
            if (!nb[2] && R() < 0.27 + (spdOf(B[0]) - 50) * 0.005) { nb[2] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 3 }); }
            else { nb[1] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 2 }); }
          }
          nb[0] = batter; mv.push({ pid: b.id, from: 0, to: 1 });
          desc = `${b.name} singles.`;
        }
        g.bases = nb;
        desc += runsTxt(mv);
      } else {
        const kind = U.weighted({ GO: 44, FO: 30, LO: 10, PO: 16 });
        fielder = U.weighted(OUT_FIELDERS[kind]);
        arc = kind === 'FO' || kind === 'PO';
        if (kind === 'FO' && R() < 0.3) { pocket = pocketFor('OUT', eb.hand); fielder = null; }
        const fp = fielder ? (fielder === 'P' ? null : P(def[ft][fielder])) : null;
        const fldR = fp ? TB.fieldAt(fp, fielder) : 55;
        const where = fielder ? POS_NAME[fielder] : 'deep ' + (pocket <= 3 ? 'left' : 'right');
        const errP = clamp(0.018 - (fldR - 50) * 0.0003, 0.004, 0.04);
        if (fielder && R() < errP) {
          // reached on error: everyone moves up one, runs unearned
          errs[ft]++; bl.ab++; res = 'E';
          if (B[2]) { B[2].earned = false; scoreRun(bt, B[2], mv, 3, null); }
          if (B[1]) { nb[2] = B[1]; mv.push({ pid: B[1].pid, from: 2, to: 3 }); }
          if (B[0]) { nb[1] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 2 }); }
          batter.earned = false; nb[0] = batter; mv.push({ pid: b.id, from: 0, to: 1 });
          g.bases = nb;
          desc = `${b.name} reaches on an error by the ${fielder === 'P' ? 'pitcher' : fielder}!` + runsTxt(mv);
        } else if (kind === 'GO') {
          const outsBefore = g.outs;
          if (B[0] && outsBefore < 2 && R() < 0.5 - (b.spd - 50) * 0.006) {
            res = 'DP'; g.outs += 2; pitLine.outs += 2; bl.ab++;
            mv.push({ pid: B[0].pid, from: 1, to: 'out' }, { pid: b.id, from: 0, to: 'out' });
            if (g.outs < 3) {
              if (B[2]) scoreRun(bt, B[2], mv, 3, null);
              if (B[1]) { nb[2] = B[1]; mv.push({ pid: B[1].pid, from: 2, to: 3 }); }
              g.bases = nb;
            }
            desc = `${b.name} grounds into a double play.` + runsTxt(mv);
          } else {
            g.outs++; pitLine.outs++; bl.ab++; res = 'GO';
            mv.push({ pid: b.id, from: 0, to: 'out' });
            if (g.outs < 3) {
              const forced1 = !!B[0], forced2 = forced1 && !!B[1], forced3 = forced2 && !!B[2];
              if (B[2]) {
                if (forced3 || R() < 0.45) scoreRun(bt, B[2], mv, 3, bl); else nb[2] = B[2];
              }
              if (B[1]) {
                if (forced2 || (!nb[2] && R() < 0.5)) { nb[2] = B[1]; mv.push({ pid: B[1].pid, from: 2, to: 3 }); } else nb[1] = B[1];
              }
              if (B[0]) { nb[1] = B[0]; mv.push({ pid: B[0].pid, from: 1, to: 2 }); }
              g.bases = nb;
            }
            desc = `${b.name} grounds out to ${POS_NAME[fielder]}.` + runsTxt(mv);
          }
        } else {
          g.outs++; pitLine.outs++; res = kind;
          mv.push({ pid: b.id, from: 0, to: 'out' });
          let sf = false;
          if (kind === 'FO' && g.outs < 3) {
            const nb2 = B.slice();
            if (B[2] && R() < 0.65) { scoreRun(bt, B[2], mv, 3, bl); nb2[2] = null; sf = true; }
            if (B[1] && !nb2[2] && R() < 0.25) { nb2[2] = B[1]; nb2[1] = null; mv.push({ pid: B[1].pid, from: 2, to: 3 }); }
            g.bases = nb2;
          }
          if (sf) { bl.sf++; res = 'SF'; } else bl.ab++;
          const verb = { FO: 'flies out', LO: 'lines out', PO: 'pops out' }[kind];
          desc = sf ? `${b.name} hits a sacrifice fly to ${where}.` + runsTxt(mv) : `${b.name} ${verb} to ${where}.`;
        }
      }
      push({ t: 'play', res, fielder, pocket, arc, moves: mv, desc });
    }

    // ---------- main loop ----------
    while (!done) {
      const bt = g.half, ft = 1 - bt;
      g.outs = 0; g.bases = [null, null, null]; g.b = 0; g.s = 0;
      const startRuns = g.score[bt];
      if (!(g.inn === 1)) maybeChange(ft, true);
      push({ t: 'half' });
      while (g.outs < 3) {
        maybeChange(ft, false);
        plateAppearance(bt);
        if (bt === 1 && g.inn >= 9 && g.score[1] > g.score[0]) { done = true; break; }
      }
      line[bt].push(g.score[bt] - startRuns);
      if (done) break;
      if (g.half === 0) {
        if (g.inn >= 9 && g.score[1] > g.score[0]) { line[1].push('X'); break; }
        g.half = 1;
      } else {
        if (g.inn >= 9 && g.score[0] !== g.score[1]) break;
        g.half = 0; g.inn++;
      }
      if (g.inn > 30) break; // safety valve
    }

    // ---------- decisions ----------
    const winner = g.score[1] > g.score[0] ? 1 : 0;
    const loser = 1 - winner;
    if (goAhead) {
      let wl = goAhead.wp;
      if (wl.gs && wl.outs < 15 && pit[winner].length > 1) {
        const rel = pit[winner].slice(1).sort((a, b) => b.outs - a.outs)[0];
        if (rel) wl = rel;
      }
      wl.dec = 'W';
      goAhead.lp.dec = 'L';
      const last = pit[winner][pit[winner].length - 1];
      if (last !== wl && !last.gs && last.lead >= 1 && ((last.lead <= 3 && last.outs >= 3) || last.outs >= 9)) last.dec = 'S';
    }
    push({ t: 'end', desc: `Final: ${T[0].abbr} ${g.score[0]}, ${T[1].abbr} ${g.score[1]}` + (g.inn > 9 ? ` (${g.inn} inn.)` : '') });

    const box = {
      a: awayId, h: homeId, score: g.score.slice(), line, hits, errs, inn: g.inn,
      bat: lu.map((l, i) => l.map((x) => bat[i][x.pid])),
      pit,
    };
    return { box, log, winner };
  };
})();
