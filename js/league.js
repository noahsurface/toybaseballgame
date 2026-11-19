/* League creation: players, rosters, schedule, auto lineups/rotations,
   player ratings and trade value. */
(function () {
  'use strict';
  const TB = globalThis.TB, U = TB.U;

  TB.HIT_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  TB.POS_SORT = { C: 0, '1B': 1, '2B': 2, '3B': 3, SS: 4, LF: 5, CF: 6, RF: 7, DH: 8, SP: 9, RP: 10 };
  TB.emptyBat = () => ({ g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, bb: 0, so: 0, sb: 0, cs: 0, sf: 0 });
  TB.emptyPit = () => ({ g: 0, gs: 0, w: 0, l: 0, sv: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0 });

  const rate = (m, sd) => Math.round(U.clamp(U.gauss(m, sd), 12, 99));
  const age = (m = 28) => Math.round(U.clamp(U.gauss(m, 3.8), 21, 38));
  function uniqueName(L) {
    for (let i = 0; i < 50; i++) {
      const n = U.pick(TB.FIRST) + ' ' + U.pick(TB.LAST);
      if (!L.names[n]) { L.names[n] = 1; return n; }
    }
    return U.pick(TB.FIRST) + ' ' + U.pick(TB.LAST) + ' Jr.';
  }

  const BIAS = {
    C: { pow: 0, spd: -12, fld: 2, arm: 8 },
    '1B': { pow: 9, spd: -8, fld: -6, arm: -8 },
    '2B': { pow: -5, spd: 6, fld: 6, arm: -2 },
    '3B': { pow: 4, spd: -2, fld: 2, arm: 8 },
    SS: { pow: -6, spd: 8, fld: 9, arm: 8 },
    LF: { pow: 5, spd: 0, fld: -4, arm: -4 },
    CF: { pow: -2, spd: 12, fld: 6, arm: 2 },
    RF: { pow: 6, spd: 0, fld: 0, arm: 9 },
  };

  function base(L, extra) {
    return Object.assign(
      { id: 'p' + L.nextId++, name: uniqueName(L), cond: 2, inj: 0, injDesc: '', fatigue: 0, hist: [], team: null },
      extra
    );
  }

  TB.makeHitter = function (L, pos, tier, pos2, ageMean) {
    let t = tier === 'bench' ? U.gauss(47, 7) : tier === 'rookie' ? U.gauss(46, 8) : U.gauss(57, 8);
    if (tier !== 'bench' && U.chance(0.07)) t += 10;
    const b = BIAS[pos];
    const r = Math.random();
    const bats = r < 0.58 ? 'R' : r < 0.9 ? 'L' : 'S';
    const throws = ['C', '2B', '3B', 'SS'].includes(pos) ? 'R' : U.chance(0.25) ? 'L' : 'R';
    return base(L, {
      type: 'H', pos, pos2: pos2 || null, bats, throws, age: age(ageMean),
      con: rate(t, 9), pow: rate(t + b.pow, 10), eye: rate(t - 2, 10), spd: rate(50 + b.spd, 14),
      fld: rate(t + b.fld, 10), arm: rate(52 + b.arm, 13),
      stats: { bat: TB.emptyBat() },
    });
  };

  TB.makePitcher = function (L, role, tier, ageMean) {
    let t = tier === 'bench' ? U.gauss(47, 7) : tier === 'rookie' ? U.gauss(46, 8) : role === 'SP' ? U.gauss(56, 8) : U.gauss(52, 8);
    if (tier !== 'bench' && U.chance(0.07)) t += 10;
    const vel = Math.round(U.clamp(U.gauss(role === 'SP' ? 92.3 : 93.8, 2.2) + (t - 54) * 0.07, 84, 102));
    return base(L, {
      type: 'P', pos: role, throws: U.chance(0.28) ? 'L' : 'R', bats: 'R', age: age(ageMean),
      vel, ctl: rate(t, 10), brk: rate(t, 11), sta: role === 'SP' ? rate(66 + (t - 55) * 0.3, 9) : rate(32, 9),
      stats: { pit: TB.emptyPit() },
    });
  };

  // ---------- ratings ----------
  TB.stuff = (p) => 0.5 * U.clamp((p.vel - 84) * 5.5, 1, 99) + 0.5 * p.brk;
  TB.fieldAt = function (p, pos) {
    if (p.type !== 'H') return 10;
    if (pos === 'DH' || pos === p.pos) return p.fld;
    if (pos === p.pos2) return p.fld - 4;
    const pen = pos === 'C' ? 40 : pos === '1B' ? 10 : pos === 'SS' || pos === 'CF' ? 26 : 20;
    return p.fld - pen;
  };
  TB.offense = (p) => 0.36 * p.con + 0.36 * p.pow + 0.16 * p.eye + 0.12 * p.spd;
  TB.ovr = function (p) {
    if (p.type === 'H') {
      const posAdj = { C: 4, SS: 4, CF: 3, '2B': 2, '3B': 1, RF: 0, LF: -1, '1B': -2 }[p.pos] || 0;
      return Math.round(U.clamp(0.29 * p.con + 0.29 * p.pow + 0.14 * p.eye + 0.11 * p.spd + 0.17 * p.fld + posAdj, 1, 99));
    }
    const s = TB.stuff(p);
    if (p.pos === 'SP') return Math.round(U.clamp(0.46 * s + 0.36 * p.ctl + 0.18 * p.sta + 2, 1, 99));
    return Math.round(U.clamp(0.6 * s + 0.4 * p.ctl, 1, 99));
  };
  TB.value = function (p) {
    let o = TB.ovr(p);
    if (p.age <= 25) o += 4; else if (p.age <= 27) o += 2; else if (p.age >= 33) o -= (p.age - 32) * 3;
    if (p.type === 'P' && p.pos === 'RP') o -= 4;
    let v = Math.pow(Math.max(0, o - 30), 2) / 10;
    if (p.inj > 10) v *= 0.6;
    return Math.round(v);
  };

  // ---------- roster building ----------
  TB.buildRoster = function (L, team) {
    const add = (p) => { p.team = team.id; L.players[p.id] = p; team.roster.push(p.id); };
    TB.HIT_POS.forEach((pos) => add(TB.makeHitter(L, pos, 'reg')));
    add(TB.makeHitter(L, U.pick(['1B', 'LF', 'RF']), 'reg')); // DH type
    add(TB.makeHitter(L, 'C', 'bench'));
    add(TB.makeHitter(L, 'SS', 'bench', U.pick(['2B', '3B'])));
    add(TB.makeHitter(L, 'CF', 'bench', U.pick(['LF', 'RF'])));
    add(TB.makeHitter(L, '2B', 'bench', '3B'));
    for (let i = 0; i < 5; i++) add(TB.makePitcher(L, 'SP', 'reg'));
    for (let i = 0; i < 8; i++) add(TB.makePitcher(L, 'RP', i < 6 ? 'reg' : 'bench'));
  };

  // Best nine + batting order. Skips injured players when possible.
  TB.autoLineup = function (L, team) {
    const P = (id) => L.players[id];
    let avail = team.roster.map(P).filter((p) => p.type === 'H' && !p.inj);
    if (avail.length < 9) avail = team.roster.map(P).filter((p) => p.type === 'H');
    const used = new Set();
    const w = { C: 0.6, SS: 0.55, CF: 0.45, '2B': 0.45, '3B': 0.35, RF: 0.3, LF: 0.2, '1B': 0.15 };
    const slots = [];
    ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'].forEach((pos) => {
      let best = null, bv = -1e9;
      avail.forEach((p) => {
        if (used.has(p.id)) return;
        const v = TB.offense(p) + TB.fieldAt(p, pos) * w[pos] * 2;
        if (v > bv) { bv = v; best = p; }
      });
      if (best) { used.add(best.id); slots.push({ pid: best.id, pos }); }
    });
    const dh = avail.filter((p) => !used.has(p.id)).sort((a, b) => TB.offense(b) - TB.offense(a))[0];
    if (dh) { slots.push({ pid: dh.id, pos: 'DH' }); used.add(dh.id); }
    // polish the greedy pass: swap positions / bring in bench guys while it helps
    const val = (id, pos) => { const p = P(id); return TB.offense(p) + (pos === 'DH' ? 0 : TB.fieldAt(p, pos) * w[pos] * 2); };
    for (let pass = 0, better = true; better && pass < 20; pass++) {
      better = false;
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i], b = slots[j];
          if (val(a.pid, b.pos) + val(b.pid, a.pos) > val(a.pid, a.pos) + val(b.pid, b.pos) + 0.01) {
            [a.pid, b.pid] = [b.pid, a.pid]; better = true;
          }
        }
        avail.forEach((p) => {
          if (used.has(p.id)) return;
          const sl = slots[i];
          if (val(p.id, sl.pos) > val(sl.pid, sl.pos) + 0.01) { used.delete(sl.pid); used.add(p.id); sl.pid = p.id; better = true; }
        });
      }
    }
    team.lineup = TB.battingOrder(L, slots);
  };

  TB.battingOrder = function (L, slots) {
    const P = (id) => L.players[id];
    const rest = slots.slice();
    const lead = rest.slice().sort((a, b) => {
      const s = (x) => { const p = P(x.pid); return p.con * 0.35 + p.eye * 0.3 + p.spd * 0.35; };
      return s(b) - s(a);
    })[0];
    rest.splice(rest.indexOf(lead), 1);
    rest.sort((a, b) => TB.offense(P(b.pid)) - TB.offense(P(a.pid)));
    const order = [lead, rest[2], rest[0], rest[1], ...rest.slice(3)].filter(Boolean);
    return order;
  };

  TB.autoPitching = function (L, team) {
    const P = (id) => L.players[id];
    const pit = team.roster.map(P).filter((p) => p.type === 'P');
    const healthy = pit.filter((p) => !p.inj);
    const spv = (p) => 0.45 * TB.stuff(p) + 0.35 * p.ctl + 0.2 * p.sta + (p.pos === 'SP' ? 15 : 0);
    const rot = healthy.slice().sort((a, b) => spv(b) - spv(a)).slice(0, 5);
    team.rotation = rot.map((p) => p.id);
    const pen = pit.filter((p) => !team.rotation.includes(p.id));
    team.bullpen = pen.map((p) => p.id);
    const cl = pen.filter((p) => !p.inj).sort((a, b) => TB.ovr(b) - TB.ovr(a))[0];
    team.closer = cl ? cl.id : null;
  };

  // Keep a hand-set lineup legal: swap out injured / departed players for the
  // best healthy bench option at that spot.
  TB.repairLineup = function (L, team) {
    const P = (id) => L.players[id];
    const changes = [];
    const inLineup = new Set(team.lineup.map((s) => s.pid));
    team.lineup.forEach((slot) => {
      const p = P(slot.pid);
      if (p && p.team === team.id && !p.inj) return;
      const bench = team.roster.map(P).filter((q) => q.type === 'H' && !q.inj && !inLineup.has(q.id));
      if (!bench.length) return;
      bench.sort((a, b) => TB.offense(b) + TB.fieldAt(b, slot.pos) * 0.8 - (TB.offense(a) + TB.fieldAt(a, slot.pos) * 0.8));
      const sub = bench[0];
      inLineup.delete(slot.pid);
      inLineup.add(sub.id);
      changes.push({ out: slot.pid, in: sub.id, pos: slot.pos });
      slot.pid = sub.id;
    });
    if (team.lineup.length < 9) { TB.autoLineup(L, team); }
    return changes;
  };

  TB.repairPitching = function (L, team) {
    const mine = (id) => L.players[id] && L.players[id].team === team.id;
    team.rotation = team.rotation.filter(mine);
    const pit = team.roster.filter((id) => L.players[id].type === 'P');
    while (team.rotation.length < 5) {
      const cand = pit.filter((id) => !team.rotation.includes(id) && id !== team.closer)
        .map((id) => L.players[id])
        .sort((a, b) => (b.pos === 'SP') - (a.pos === 'SP') || b.sta - a.sta)[0];
      if (!cand) break;
      team.rotation.push(cand.id);
    }
    team.bullpen = pit.filter((id) => !team.rotation.includes(id));
    if (!team.closer || !mine(team.closer) || team.rotation.includes(team.closer)) {
      const cl = team.bullpen.map((id) => L.players[id]).sort((a, b) => TB.ovr(b) - TB.ovr(a))[0];
      team.closer = cl ? cl.id : null;
    }
  };

  // ---------- schedule ----------
  TB.makeSchedule = function (n, gamesPerTeam) {
    const ids = [...Array(n).keys()];
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push([ids[i], ids[n - 1 - i]]);
      rounds.push(pairs);
      ids.splice(1, 0, ids.pop()); // rotate all but the first
    }
    const cycles = Math.max(1, Math.round(gamesPerTeam / (n - 1)));
    const days = [];
    for (let c = 0; c < cycles; c++) {
      U.shuffle(rounds.slice()).forEach((pairs) => {
        days.push(pairs.map(([x, y]) => {
          const flip = (c % 2 === 1) !== (((x + y) * 7 + rounds.indexOf(pairs)) % 2 === 1);
          return { a: flip ? y : x, h: flip ? x : y, r: null };
        }));
      });
    }
    days.forEach((games, d) => games.forEach((g, i) => (g.id = 'g' + d + '_' + i)));
    return days;
  };

  TB.newLeague = function (opts) {
    const L = {
      version: 1, season: 1, day: 0, phase: 'regular', nextId: 1, names: {},
      user: opts.userTeamId, gamesPerTeam: opts.gamesPerTeam,
      teams: [], players: {}, schedule: [], news: [], boxes: {}, history: [], awards: null, po: null,
      settings: { speed: 1 },
    };
    TB.TEAMS.forEach((def, i) => {
      const t = Object.assign({}, def, {
        id: i, roster: [], lineup: [], rotation: [], bullpen: [], closer: null, rotIdx: 0,
        w: 0, l: 0, rs: 0, ra: 0, results: [],
      });
      L.teams.push(t);
      TB.buildRoster(L, t);
      TB.autoLineup(L, t);
      TB.autoPitching(L, t);
    });
    L.schedule = TB.makeSchedule(12, opts.gamesPerTeam);
    L.deadline = Math.floor(L.schedule.length * 0.67);
    TB.news(L, `Season ${L.season} is about to begin! ${L.schedule.length} games on the slate.`, true);
    return L;
  };
})();
