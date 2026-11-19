/* Season flow: daily sims, stat bookkeeping, condition & injuries, standings,
   leaders, playoffs, trades, awards, next season, save/load. */
(function () {
  'use strict';
  const TB = globalThis.TB, U = TB.U;
  const SAVE_KEY = 'toybaseball.save.v1';

  TB.news = function (L, txt, mine) {
    L.news.unshift({ s: L.season, d: L.day, txt, mine: !!mine });
    if (L.news.length > 120) L.news.length = 120;
  };
  const P = (L, id) => L.players[id];

  // ---------- game prep ----------
  TB.pickStarter = function (L, team) {
    const rot = team.rotation.map((id) => P(L, id)).filter((p) => p && p.team === team.id);
    const n = rot.length || 1;
    for (let k = 0; k < n; k++) {
      const p = rot[(team.rotIdx + k) % n];
      if (p && !p.inj && p.fatigue <= 20) { team.rotIdx = (team.rotIdx + k + 1) % n; return p.id; }
    }
    // everybody is gassed: most rested healthy pitcher
    const all = team.roster.map((id) => P(L, id)).filter((p) => p.type === 'P' && !p.inj);
    all.sort((a, b) => a.fatigue - b.fatigue);
    team.rotIdx = (team.rotIdx + 1) % n;
    return (all[0] || P(L, team.rotation[0])).id;
  };

  TB.prepareTeam = function (L, team) {
    if (team.id !== L.user) {
      TB.autoLineup(L, team);
      TB.autoPitching(L, team);
      return;
    }
    TB.repairPitching(L, team);
    const pos = new Set(team.lineup.map((s) => s.pos));
    const ids = new Set(team.lineup.map((s) => s.pid));
    if (team.lineup.length !== 9 || pos.size !== 9 || ids.size !== 9 || !pos.has('C')) {
      TB.autoLineup(L, team);
      TB.news(L, 'Your lineup card had a problem, so the manager filled it in automatically.', true);
    }
    const ch = TB.repairLineup(L, team);
    ch.forEach((c) => TB.news(L, `${P(L, c.in).name} steps into the lineup at ${c.pos} for ${P(L, c.out).name}.`, true));
  };

  TB.probables = function (L, game) {
    const peek = (t) => {
      const save = t.rotIdx;
      const id = TB.pickStarter(L, t);
      t.rotIdx = save;
      return id;
    };
    return [peek(L.teams[game.a]), peek(L.teams[game.h])];
  };

  // ---------- applying a finished game ----------
  function applyBox(L, game, box, post) {
    const teams = [L.teams[box.a], L.teams[box.h]];
    const [as, hs] = box.score;
    game.r = [as, hs];
    game.inn = box.inn;
    if (!post) {
      teams[0].rs += as; teams[0].ra += hs; teams[1].rs += hs; teams[1].ra += as;
      const win = hs > as ? 1 : 0;
      teams[win].w++; teams[1 - win].l++;
      teams[win].results.push('W'); teams[1 - win].results.push('L');
    }
    box.bat.forEach((lines) => lines.forEach((ln) => {
      const p = P(L, ln.pid);
      if (!post) {
        const s = p.stats.bat;
        s.g++;
        ['pa', 'ab', 'h', 'd', 't', 'hr', 'r', 'rbi', 'bb', 'so', 'sb', 'cs', 'sf'].forEach((k) => (s[k] += ln[k]));
      }
      // condition reacts to the day at the plate
      if (ln.h >= 2 || ln.hr) { if (U.chance(0.45)) p.cond = Math.min(4, p.cond + 1); }
      else if (ln.ab >= 3 && ln.h === 0 && U.chance(0.3)) p.cond = Math.max(0, p.cond - 1);
      if (U.chance(0.0016)) injure(L, p);
    }));
    box.pit.forEach((lines) => lines.forEach((ln) => {
      const p = P(L, ln.pid);
      if (!post) {
        const s = p.stats.pit;
        s.g++; s.gs += ln.gs;
        ['outs', 'h', 'r', 'er', 'bb', 'so', 'hr'].forEach((k) => (s[k] += ln[k]));
        if (ln.dec === 'W') s.w++; else if (ln.dec === 'L') s.l++; else if (ln.dec === 'S') s.sv++;
      }
      p.fatigue += ln.pc;
      if (ln.gs && ln.outs >= 18 && ln.er <= 2 && U.chance(0.5)) p.cond = Math.min(4, p.cond + 1);
      if (ln.er >= 5 && U.chance(0.5)) p.cond = Math.max(0, p.cond - 1);
      if (U.chance(ln.gs ? 0.004 : 0.0015)) injure(L, p);
    }));
  }

  function injure(L, p) {
    if (p.inj) return;
    p.inj = Math.round(3 + Math.pow(Math.random(), 2) * 45);
    p.injDesc = U.pick(TB.INJURIES);
    const t = L.teams[p.team];
    TB.news(L, `${t.abbr} ${p.pos} ${p.name} is hurt (${p.injDesc}) and will miss about ${p.inj} days.`, p.team === L.user);
  }

  function endOfDay(L) {
    Object.values(L.players).forEach((p) => {
      p.fatigue = Math.max(0, p.fatigue - 22);
      if (p.inj) {
        p.inj--;
        if (!p.inj) {
          p.injDesc = '';
          if (p.team === L.user) TB.news(L, `${p.name} is healthy and available again.`, true);
        }
      }
      const r = Math.random();
      const up = 0.11 + (p.cond < 2 ? 0.06 : 0), down = 0.11 + (p.cond > 2 ? 0.06 : 0);
      if (r < up) p.cond = Math.min(4, p.cond + 1);
      else if (r < up + down) p.cond = Math.max(0, p.cond - 1);
    });
    if (L.phase === 'regular' && L.day < L.deadline && U.chance(0.035)) aiTrade(L);
  }

  function playOne(L, game, post) {
    const A = L.teams[game.a], H = L.teams[game.h];
    TB.prepareTeam(L, A);
    TB.prepareTeam(L, H);
    const starters = [TB.pickStarter(L, A), TB.pickStarter(L, H)];
    const res = TB.simGame(L, game.a, game.h, { starters });
    applyBox(L, game, res.box, post);
    if (game.a === L.user || game.h === L.user || post) L.boxes[game.id] = res.box;
    return res;
  }

  // Sims one day. Returns the user's game result (with replay log) if they played.
  TB.simDay = function (L) {
    let mine = null;
    let games;
    if (L.phase === 'regular') {
      games = L.schedule[L.day];
      if (!games) return null;
    } else if (L.phase === 'playoffs') {
      games = playoffGames(L);
    } else return null;
    games.forEach((g) => {
      const res = playOne(L, g, L.phase === 'playoffs');
      if (L.phase === 'playoffs') recordPlayoffGame(L, g);
      if (g.a === L.user || g.h === L.user) mine = Object.assign({ game: g }, res);
    });
    endOfDay(L);
    if (L.phase === 'regular') {
      L.day++;
      if (L.day >= L.schedule.length) {
        L.phase = 'post-regular';
        computeAwards(L);
        TB.news(L, 'The regular season is over! Playoff seeds are set.', true);
      }
    } else if (L.phase === 'playoffs') {
      L.po.day++;
      advancePlayoffs(L);
    }
    return mine;
  };

  TB.userPlaysToday = function (L) {
    if (L.phase === 'regular') return (L.schedule[L.day] || []).find((g) => g.a === L.user || g.h === L.user) || null;
    if (L.phase === 'playoffs') return playoffGames(L, true).find((g) => g.a === L.user || g.h === L.user) || null;
    return null;
  };

  // ---------- standings & leaders ----------
  TB.standings = function (L, div) {
    const ts = L.teams.filter((t) => div === undefined || t.div === div).slice();
    ts.sort((a, b) => b.w / Math.max(1, b.w + b.l) - a.w / Math.max(1, a.w + a.l) || b.rs - b.ra - (a.rs - a.ra) || b.w - a.w);
    const lead = ts[0];
    return ts.map((t) => ({ t, gb: (lead.w - t.w + (t.l - lead.l)) / 2 }));
  };
  TB.streak = function (t) {
    const r = t.results;
    if (!r.length) return '-';
    let n = 0;
    for (let i = r.length - 1; i >= 0 && r[i] === r[r.length - 1]; i--) n++;
    return r[r.length - 1] + n;
  };
  TB.last10 = function (t) {
    const r = t.results.slice(-10);
    const w = r.filter((x) => x === 'W').length;
    return w + '-' + (r.length - w);
  };

  TB.leaders = function (L, cat, n) {
    const games = Math.max(1, L.phase === 'regular' ? L.day : L.schedule.length);
    const minPA = games * 2.7, minOuts = games * 2.4;
    const hit = Object.values(L.players).filter((p) => p.type === 'H');
    const pit = Object.values(L.players).filter((p) => p.type === 'P');
    const defs = {
      AVG: [hit.filter((p) => p.stats.bat.pa >= minPA), (p) => (p.stats.bat.ab ? p.stats.bat.h / p.stats.bat.ab : 0), (v) => U.fmtRate(v)],
      HR: [hit, (p) => p.stats.bat.hr, String],
      RBI: [hit, (p) => p.stats.bat.rbi, String],
      OPS: [hit.filter((p) => p.stats.bat.pa >= minPA), (p) => U.opsN(p.stats.bat), (v) => U.fmtRate(v)],
      SB: [hit, (p) => p.stats.bat.sb, String],
      H: [hit, (p) => p.stats.bat.h, String],
      ERA: [pit.filter((p) => p.stats.pit.outs >= minOuts), (p) => -(p.stats.pit.er * 27) / Math.max(1, p.stats.pit.outs), (v) => (-v).toFixed(2)],
      W: [pit, (p) => p.stats.pit.w, String],
      SO: [pit, (p) => p.stats.pit.so, String],
      SV: [pit, (p) => p.stats.pit.sv, String],
      WHIP: [pit.filter((p) => p.stats.pit.outs >= minOuts), (p) => -(p.stats.pit.h + p.stats.pit.bb) * 3 / Math.max(1, p.stats.pit.outs), (v) => (-v).toFixed(2)],
    };
    const [pool, f, fmt] = defs[cat];
    return pool.map((p) => ({ p, v: f(p) })).filter((x) => x.v !== 0 || cat === 'ERA' || cat === 'WHIP')
      .sort((a, b) => b.v - a.v).slice(0, n || 10).map((x) => ({ p: x.p, txt: fmt(x.v) }));
  };

  // ---------- awards ----------
  function computeAwards(L) {
    const hit = Object.values(L.players).filter((p) => p.type === 'H' && p.stats.bat.pa > L.schedule.length * 2.5);
    const mvpScore = (p) => {
      const s = p.stats.bat;
      return (U.opsN(s) - 0.68) * s.pa + s.hr * 0.5 + s.sb * 0.2 + (p.pos === 'C' || p.pos === 'SS' ? 8 : 0) + L.teams[p.team].w * 0.15;
    };
    const mvp = hit.sort((a, b) => mvpScore(b) - mvpScore(a))[0];
    const pit = Object.values(L.players).filter((p) => p.type === 'P' && p.stats.pit.outs > 0);
    const pScore = (p) => {
      const s = p.stats.pit;
      return ((4.5 - (s.er * 27) / s.outs) * s.outs) / 27 + s.w * 0.6 + s.sv * 0.25 + s.so * 0.02;
    };
    const ace = pit.sort((a, b) => pScore(b) - pScore(a))[0];
    L.awards = { mvp: mvp && mvp.id, ace: ace && ace.id };
  }

  // ---------- playoffs ----------
  TB.playoffSeeds = function (L) {
    const d0 = TB.standings(L, 0), d1 = TB.standings(L, 1);
    const winners = [d0[0].t, d1[0].t].sort((a, b) => b.w - a.w || b.rs - b.ra - (a.rs - a.ra));
    const rest = TB.standings(L).map((x) => x.t).filter((t) => !winners.includes(t)).slice(0, 2);
    return [...winners, ...rest].map((t) => t.id);
  };
  TB.startPlayoffs = function (L) {
    const s = TB.playoffSeeds(L);
    const mk = (hi, lo, bestOf, name) => ({ hi, lo, bestOf, w: [0, 0], games: [], winner: null, name });
    L.po = { round: 1, day: 0, seeds: s, series: [mk(s[0], s[3], 5, 'Semifinal'), mk(s[1], s[2], 5, 'Semifinal')], finals: null, champion: null };
    L.phase = 'playoffs';
    TB.news(L, `Playoffs begin! ${L.teams[s[0]].abbr} vs ${L.teams[s[3]].abbr} and ${L.teams[s[1]].abbr} vs ${L.teams[s[2]].abbr}.`, true);
  };
  function activeSeries(L) {
    return L.po.round === 1 ? L.po.series : [L.po.finals];
  }
  function playoffGames(L, peek) {
    const out = [];
    activeSeries(L).forEach((sr, si) => {
      if (sr.winner !== null) return;
      const n = sr.games.length;
      const pat = sr.bestOf === 5 ? [1, 1, 0, 0, 1] : [1, 1, 0, 0, 0, 1, 1];
      const hiHome = pat[n];
      const g = { id: `po${L.season}_${L.po.round}_${si}_${n}`, a: hiHome ? sr.lo : sr.hi, h: hiHome ? sr.hi : sr.lo, r: null, si, po: true };
      out.push(g);
    });
    return out;
  }
  function recordPlayoffGame(L, g) {
    const sr = activeSeries(L)[g.si];
    sr.games.push({ id: g.id, a: g.a, h: g.h, r: g.r });
    const winTeam = g.r[1] > g.r[0] ? g.h : g.a;
    sr.w[winTeam === sr.hi ? 0 : 1]++;
    const need = Math.ceil(sr.bestOf / 2);
    if (sr.w[0] === need || sr.w[1] === need) {
      sr.winner = sr.w[0] === need ? sr.hi : sr.lo;
      const loser = sr.winner === sr.hi ? sr.lo : sr.hi;
      TB.news(L, `${L.teams[sr.winner].city} ${L.teams[sr.winner].name} win the ${sr.name} over ${L.teams[loser].abbr}, ${Math.max(...sr.w)}-${Math.min(...sr.w)}.`, sr.winner === L.user || loser === L.user);
    }
  }
  function advancePlayoffs(L) {
    const po = L.po;
    if (po.round === 1 && po.series.every((s) => s.winner !== null)) {
      const [a, b] = po.series.map((s) => s.winner);
      const ia = po.seeds.indexOf(a), ib = po.seeds.indexOf(b);
      po.finals = { hi: ia < ib ? a : b, lo: ia < ib ? b : a, bestOf: 7, w: [0, 0], games: [], winner: null, name: 'Toy Box Series' };
      po.round = 2;
      TB.news(L, `The Toy Box Series is set: ${L.teams[po.finals.hi].abbr} vs ${L.teams[po.finals.lo].abbr}!`, true);
    } else if (po.round === 2 && po.finals.winner !== null) {
      po.champion = po.finals.winner;
      L.phase = 'done';
      const c = L.teams[po.champion];
      L.history.push({ season: L.season, champ: c.id, runnerUp: po.finals.winner === po.finals.hi ? po.finals.lo : po.finals.hi, mvp: L.awards && L.awards.mvp, ace: L.awards && L.awards.ace, user: { w: L.teams[L.user].w, l: L.teams[L.user].l } });
      TB.news(L, `🏆 The ${c.city} ${c.name} are Season ${L.season} champions!`, true);
    }
  }

  // ---------- trades ----------
  TB.tradeCheck = function (L, otherId, give, get) {
    const me = L.teams[L.user], them = L.teams[otherId];
    if (L.phase !== 'regular') return { ok: false, reason: 'Trades are only allowed during the regular season.' };
    if (L.day >= L.deadline) return { ok: false, reason: 'The trade deadline has passed.' };
    if (!give.length || !get.length) return { ok: false, reason: 'Pick at least one player from each side.' };
    if (give.length !== get.length) return { ok: false, reason: 'Trades must be even (same number of players each way) to keep 26-man rosters.' };
    const cnt = (team, out, inn) => {
      const ids = team.roster.filter((id) => !out.includes(id)).concat(inn);
      const ps = ids.map((id) => P(L, id));
      return { H: ps.filter((p) => p.type === 'H').length, P: ps.filter((p) => p.type === 'P').length, C: ps.filter((p) => p.pos === 'C').length, SP: ps.filter((p) => p.pos === 'SP').length };
    };
    const a = cnt(me, give, get), b = cnt(them, get, give);
    for (const [who, c] of [['You', a], [them.abbr, b]]) {
      if (c.H < 11) return { ok: false, reason: `${who} would have fewer than 11 position players.` };
      if (c.P < 10) return { ok: false, reason: `${who} would have fewer than 10 pitchers.` };
      if (c.C < 1) return { ok: false, reason: `${who} would be left without a catcher.` };
    }
    const vGive = U.sum(give, (id) => TB.value(P(L, id)));
    const vGet = U.sum(get, (id) => TB.value(P(L, id)));
    // AI wants a small premium, and gets pickier as you ask for more
    const need = vGet * 1.08 + 2;
    const ok = vGive >= need;
    let reason;
    if (ok) reason = `${them.city} accepts! "Pleasure doing business."`;
    else if (vGive >= vGet * 0.85) reason = `${them.city} says: "Close... sweeten it a little."`;
    else reason = `${them.city} says: "No way. That's not nearly enough."`;
    return { ok, reason, vGive, vGet, need };
  };

  TB.executeTrade = function (L, aId, bId, aGives, bGives) {
    const A = L.teams[aId], B = L.teams[bId];
    const move = (ids, from, to) => ids.forEach((id) => {
      from.roster.splice(from.roster.indexOf(id), 1);
      to.roster.push(id);
      P(L, id).team = to.id;
    });
    move(aGives, A, B);
    move(bGives, B, A);
    [A, B].forEach((t) => {
      if (t.id === L.user) { TB.repairPitching(L, t); TB.repairLineup(L, t); }
      else { TB.autoLineup(L, t); TB.autoPitching(L, t); }
    });
    const names = (ids) => ids.map((id) => `${P(L, id).pos} ${P(L, id).name}`).join(', ');
    TB.news(L, `TRADE: ${A.abbr} send ${names(aGives)} to ${B.abbr} for ${names(bGives)}.`, aId === L.user || bId === L.user);
  };

  function aiTrade(L) {
    const ais = L.teams.filter((t) => t.id !== L.user);
    const [a, b] = U.shuffle(ais.slice());
    const type = U.chance(0.5) ? 'H' : 'P';
    const pa = U.pick(a.roster.map((id) => P(L, id)).filter((p) => p.type === type && !p.inj));
    if (!pa) return;
    const va = TB.value(pa);
    const cands = b.roster.map((id) => P(L, id)).filter((p) => p.type === type && !p.inj && Math.abs(TB.value(p) - va) <= Math.max(3, va * 0.15) && (type === 'P' || (p.pos === 'C') === (pa.pos === 'C')));
    if (!cands.length) return;
    TB.executeTrade(L, a.id, b.id, [pa.id], [U.pick(cands).id]);
  }

  // ---------- next season ----------
  TB.nextSeason = function (L) {
    const retired = [];
    Object.values(L.players).forEach((p) => {
      const t = L.teams[p.team];
      p.hist.push({ s: L.season, team: t.abbr, bat: p.stats.bat, pit: p.stats.pit });
      p.age++;
      const dev = p.age <= 24 ? U.randInt(1, 7) : p.age <= 27 ? U.randInt(-1, 5) : p.age <= 31 ? U.randInt(-3, 2) : U.randInt(-7, 0);
      const keys = p.type === 'H' ? ['con', 'pow', 'eye', 'fld', 'arm'] : ['ctl', 'brk', 'sta'];
      keys.forEach((k) => (p[k] = U.clamp(Math.round(p[k] + dev + U.randInt(-2, 2)), 12, 99)));
      if (p.type === 'H') p.spd = U.clamp(p.spd + (p.age >= 30 ? U.randInt(-4, 0) : U.randInt(-1, 2)), 12, 99);
      else p.vel = U.clamp(p.vel + (p.age >= 31 ? U.randInt(-2, 0) : U.randInt(0, 1)), 82, 103);
      p.stats = p.type === 'H' ? { bat: TB.emptyBat() } : { pit: TB.emptyPit() };
      p.cond = 2; p.inj = 0; p.injDesc = ''; p.fatigue = 0;
      if (p.age >= 36 && U.chance((p.age - 34) * 0.22)) retired.push(p);
    });
    retired.forEach((p) => {
      const t = L.teams[p.team];
      t.roster.splice(t.roster.indexOf(p.id), 1);
      const kid = p.type === 'H' ? TB.makeHitter(L, p.pos, 'rookie', p.pos2, 22) : TB.makePitcher(L, p.pos, 'rookie', 22);
      kid.team = t.id;
      L.players[kid.id] = kid;
      t.roster.push(kid.id);
      L.retired = L.retired || [];
      L.retired.push({ name: p.name, s: L.season, hist: p.hist });
      delete L.players[p.id];
      if (t.id === L.user) TB.news(L, `${p.name} retires. Rookie ${kid.name} (${kid.pos}) joins the club.`, true);
    });
    L.season++;
    L.day = 0;
    L.phase = 'regular';
    L.po = null;
    L.awards = null;
    L.boxes = {};
    L.schedule = TB.makeSchedule(12, L.gamesPerTeam);
    L.deadline = Math.floor(L.schedule.length * 0.67);
    L.teams.forEach((t) => {
      Object.assign(t, { w: 0, l: 0, rs: 0, ra: 0, results: [], rotIdx: 0 });
      if (t.id === L.user) { TB.repairPitching(L, t); TB.repairLineup(L, t); }
      else { TB.autoLineup(L, t); TB.autoPitching(L, t); }
    });
    TB.news(L, `Season ${L.season} begins! ${retired.length} veterans retired over the winter.`, true);
  };

  // ---------- persistence ----------
  TB.save = function (L) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(L)); return true; } catch (e) { return false; }
  };
  TB.load = function () {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  TB.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  };
})();
