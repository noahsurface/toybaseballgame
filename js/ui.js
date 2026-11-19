/* All screens. Plain DOM + template strings, one delegated click/change handler. */
(function () {
  'use strict';
  const TB = globalThis.TB, U = TB.U;
  const UI = (TB.UI = {});
  const esc = U.esc;

  let L = null;
  let view = 'home';
  let board = null;
  const st = {
    teamTab: 'roster', leagueTeam: null, tradeTeam: null, give: new Set(), get: new Set(), verdict: null,
    park: null, setupTeam: 0, setupLen: 44, leaderTab: 'bat',
  };
  const P = (id) => L.players[id];
  const T = (id) => L.teams[id];
  const $ = (s) => document.querySelector(s);

  // ---------- small renderers ----------
  const badge = (t, cls) => `<span class="badge ${cls || ''}" style="--c:${t.color}">${t.abbr}</span>`;
  const tname = (t) => `${esc(t.city)} ${esc(t.name)}`;
  const grade = (v) => { const g = U.grade(v); return `<span class="gr gr-${g}">${g}</span><span class="grn">${Math.round(v)}</span>`; };
  const COND = ['Awful', 'Bad', 'Normal', 'Good', 'Great'];
  const cond = (p) => `<span class="cond cond-${p.cond}" title="${COND[p.cond]} condition">➜</span>`;
  const pname = (p) => `<span class="link" data-player="${p.id}">${esc(p.name)}</span>`;
  const status = (p) => {
    if (p.inj) return `<span class="tag inj" title="${esc(p.injDesc)}">IL ${p.inj}d</span>`;
    if (p.type === 'P' && p.fatigue > 20) return `<span class="tag tired">Tired</span>`;
    return '';
  };
  const rec = (t) => `${t.w}-${t.l}`;
  const velGrade = (p) => U.clamp((p.vel - 84) * 5.5, 1, 99);
  const pitLine = (s) => `${s.w}-${s.l}, ${U.era(s.er, s.outs)} ERA`;

  function toast(msg) {
    const old = $('.toast');
    if (old) old.remove();
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
  function save() {
    if (!TB.save(L)) toast('Could not save to this browser (storage full or blocked).');
  }

  // ---------- boot ----------
  UI.start = function () {
    L = TB.load();
    if (L && L.version !== 1) L = null;
    if (!L) renderSetup();
    else renderApp();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
  };

  // ---------- setup ----------
  function renderSetup() {
    if (board) { board.destroy(); board = null; }
    const app = $('#app');
    app.innerHTML = `
      <header class="topbar"><div class="brand"><h1>TOY BASEBALL</h1><small>Season mode</small></div></header>
      <main>
        <section class="hero">
          <div>
            <h2>PLAY BALL<br>ON THE TABLE!</h2>
            <p>Pick a club in the 12-team Tabletop League, set your lineup and rotation, make trades and steer
            your team through the season and the playoffs. Every game is simulated pitch by pitch, and you can watch any of
            yours play out on the toy board.</p>
          </div>
          <canvas id="hero-board" aria-label="Toy baseball board"></canvas>
        </section>
        <div class="panel">
          <h2>1 · Choose your club</h2>
          <div class="teamgrid">
            ${TB.TEAMS.map((t, i) => `
              <button class="teamcard ${i === st.setupTeam ? 'on' : ''}" data-setup-team="${i}">
                ${badge(t)}<span><b>${esc(t.city)}</b><small>${esc(t.name)} · ${TB.DIVS[t.div].split(' ')[0]}</small></span>
              </button>`).join('')}
          </div>
        </div>
        <div class="panel">
          <h2>2 · Season length</h2>
          <div class="seg" id="lenseg">
            ${[22, 44, 88, 154].map((n) => `<button data-setup-len="${n}" class="${n === st.setupLen ? 'on' : ''}">${n} games</button>`).join('')}
          </div>
          <p class="muted">Every club plays each of the other 11 the same number of times. The top 4 make the playoffs:
          two division winners plus two wild cards, then best-of-5 semifinals and a best-of-7 Toy Box Series.</p>
          <div class="actions"><button class="btn big red" data-act="newleague">Start season ▶</button></div>
        </div>
      </main>`;
    board = new TB.Board($('#hero-board'));
    board.colors = ['#1f5fbf', TB.TEAMS[st.setupTeam].color];
    if (U.colorDist(board.colors[0], board.colors[1]) < 110) board.colors[0] = TB.TEAMS[st.setupTeam].alt;
    board.abbr = ['AWAY', TB.TEAMS[st.setupTeam].abbr];
    board.state.half = 0;
    board.state.bat.show = true;
    board.state.runners = { a: { x: 500, y: 800, a: 1 }, b: { x: 200, y: 500, a: 1 } };
    board.state.pocketBalls = [{ x: 260, y: 165 }];
    board.state.b = 2; board.state.s = 1; board.state.o = 1;
    board.state.line = [[0, 1, 0], [2, 0]];
    board.state.score = [1, 2]; board.state.hits = [3, 4]; board.state.inn = 3;
    board.draw();
  }

  // ---------- app shell ----------
  function renderApp() {
    const app = $('#app');
    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><h1>TOY BASEBALL</h1><small id="season-lbl"></small></div>
        <div class="teamchip" id="teamchip"></div>
      </header>
      <nav class="tabs" id="tabs"></nav>
      <main id="view"></main>
      <div class="foot">Toy Baseball · an original tabletop season sim · progress saves automatically in this browser</div>`;
    go(view);
  }

  const TABS = [
    ['home', 'Clubhouse'], ['park', 'Ballpark'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['team', 'My Team'],
    ['trades', 'Trades'], ['leaders', 'Leaders'], ['league', 'League'], ['playoffs', 'Playoffs'], ['options', 'Options'],
  ];
  function renderTop() {
    const me = T(L.user);
    $('#season-lbl').textContent = `Season ${L.season}` + (L.phase === 'regular' ? ` · Game ${Math.min(L.day + 1, L.schedule.length)} of ${L.schedule.length}` : L.phase === 'playoffs' ? ' · Playoffs' : L.phase === 'done' ? ' · Offseason' : ' · Regular season over');
    $('#teamchip').innerHTML = `${badge(me, 'sm')} ${esc(me.abbr)} ${rec(me)}`;
    $('#tabs').innerHTML = TABS.filter(([k]) => (k !== 'park' || st.park) && (k !== 'playoffs' || L.po))
      .map(([k, n]) => `<button class="tab ${view === k ? 'on' : ''}" data-go="${k}">${n}</button>`).join('');
  }
  function go(v) {
    if (board && v !== 'park') { board.destroy(); board = null; }
    if (v !== view || v === 'park') window.scrollTo(0, 0);
    view = v;
    renderTop();
    const views = { home: homeView, park: parkView, schedule: scheduleView, standings: standingsView, team: teamView, trades: tradesView, leaders: leadersView, league: leagueView, playoffs: playoffsView, options: optionsView };
    const f = views[v] || homeView;
    $('#view').innerHTML = f();
    if (v === 'park') startPark();
  }
  function rerender() { go(view); }

  // ---------- clubhouse ----------
  function nextGameCard() {
    if (L.phase === 'post-regular') {
      const seeds = TB.playoffSeeds(L);
      const inIt = seeds.includes(L.user);
      return `<div class="panel"><h2>Regular season complete</h2>
        <div class="paper">
          <p><b>${inIt ? 'You made the playoffs! 🎉' : 'Your club missed the playoffs this year.'}</b></p>
          <ol>${seeds.map((id, i) => `<li>${badge(T(id), 'sm')} <b>${tname(T(id))}</b> (${rec(T(id))}) ${i < 2 ? '— division champ' : '— wild card'}</li>`).join('')}</ol>
          ${awardsHtml()}
        </div>
        <div class="actions"><button class="btn big red" data-act="startpo">Start the playoffs ▶</button></div></div>`;
    }
    if (L.phase === 'done') {
      const c = T(L.po.champion);
      return `<div class="panel"><div class="paper champ">
          <div>${badge(c, 'lg')}</div>
          <h2>${tname(c)}</h2><p><b>Season ${L.season} Toy Box Series champions!</b></p>
          ${L.po.champion === L.user ? '<p>🏆 That\'s your club! What a season.</p>' : ''}
          ${awardsHtml()}
        </div>
        <div class="actions"><button class="btn big red" data-act="nextseason">Start season ${L.season + 1} ▶</button></div></div>`;
    }
    const g = TB.userPlaysToday(L);
    if (!g) {
      return `<div class="panel"><h2>Playoffs in progress</h2><div class="paper"><p>Your club has been eliminated. The playoffs go on without you.</p></div>
        <div class="actions"><button class="btn" data-act="sim1">Sim next playoff day</button><button class="btn yellow" data-act="simpo">Sim rest of playoffs</button></div></div>`;
    }
    const [pa, ph] = TB.probables(L, g);
    const A = T(g.a), Hm = T(g.h);
    let title = `Game ${L.day + 1} of ${L.schedule.length}`;
    if (L.phase === 'playoffs') {
      const sr = (L.po.round === 1 ? L.po.series : [L.po.finals]).find((s) => s.hi === L.user || s.lo === L.user);
      const myW = sr.w[sr.hi === L.user ? 0 : 1], thW = sr.w[sr.hi === L.user ? 1 : 0];
      title = `${sr.name} · Game ${sr.games.length + 1} · ${myW === thW ? 'Series tied' : myW > thW ? 'You lead' : 'You trail'} ${Math.max(myW, thW)}-${Math.min(myW, thW)}`;
    }
    const side = (t, pid) => {
      const p = P(pid);
      return `<div class="side">${badge(t, 'lg')}<div class="nm">${tname(t)}</div><div class="prob">${rec(t)}</div>
        <div class="prob">SP ${pname(p)} ${cond(p)}<br>${pitLine(p.stats.pit)}</div></div>`;
    };
    const btns = L.phase === 'regular'
      ? `<button class="btn big red" data-act="watch">▶ Watch on the board</button>
         <button class="btn" data-act="sim1">Sim game</button>
         <button class="btn ghost" data-act="sim7">Sim 7 days</button>
         <button class="btn ghost" data-act="simall">Sim to season end</button>`
      : `<button class="btn big red" data-act="watch">▶ Watch on the board</button>
         <button class="btn" data-act="sim1">Sim game</button>
         <button class="btn ghost" data-act="simpo">Sim rest of playoffs</button>`;
    return `<div class="panel"><h2>${title}</h2>
      <div class="paper"><div class="matchup">${side(A, pa)}<div class="vs">@</div>${side(Hm, ph)}</div></div>
      <div class="actions">${btns}</div></div>`;
  }
  function awardsHtml() {
    if (!L.awards) return '';
    const m = L.awards.mvp && P(L.awards.mvp), a = L.awards.ace && P(L.awards.ace);
    const s = m ? m.stats.bat : null, q = a ? a.stats.pit : null;
    return `<p style="margin-top:12px"><b>Season awards</b></p><ul>
      ${m ? `<li>MVP: ${pname(m)} (${T(m.team).abbr}) — ${U.avg(s)}, ${s.hr} HR, ${s.rbi} RBI</li>` : ''}
      ${a ? `<li>Top Pitcher: ${pname(a)} (${T(a.team).abbr}) — ${pitLine(q)}, ${q.so} K${q.sv ? `, ${q.sv} SV` : ''}</li>` : ''}</ul>`;
  }
  function homeView() {
    const me = T(L.user);
    const div = TB.standings(L, me.div);
    const rank = div.findIndex((x) => x.t === me) + 1;
    const myGames = recentUserGames(8);
    const stand = (d) => `<table class="tbl"><tr><th>${esc(TB.DIVS[d])}</th><th class="num">W</th><th class="num">L</th><th class="num">GB</th></tr>
      ${TB.standings(L, d).map((x) => `<tr class="${x.t.id === L.user ? 'me' : ''}"><td>${badge(x.t, 'sm')} ${esc(x.t.abbr)}</td><td class="num">${x.t.w}</td><td class="num">${x.t.l}</td><td class="num">${x.gb ? x.gb.toFixed(1).replace('.0', '') : '-'}</td></tr>`).join('')}</table>`;
    return `<div class="grid2">
      <div>
        ${nextGameCard()}
        <div class="panel"><h2>${tname(me)}</h2>
          <div class="statline">
            <div class="stat"><b>${rec(me)}</b><span>Record</span></div>
            <div class="stat"><b>${U.ordinal(rank)}</b><span>${esc(TB.DIVS[me.div].split(' ')[0])}</span></div>
            <div class="stat"><b>${TB.streak(me)}</b><span>Streak</span></div>
            <div class="stat"><b>${me.rs}</b><span>Runs for</span></div>
            <div class="stat"><b>${me.ra}</b><span>Runs against</span></div>
          </div>
          ${myGames.length ? `<p class="muted" style="margin:14px 0 6px">Recent games (tap for box score)</p><div class="results-strip">${myGames.map(resultChip).join('')}</div>` : ''}
        </div>
        <div class="panel"><h2>League news</h2><ul class="news">${L.news.slice(0, 40).map((n) => `<li class="${n.mine ? 'mine' : ''}"><small>S${n.s} D${n.d + 1}</small>${esc(n.txt)}</li>`).join('')}</ul></div>
      </div>
      <div>
        <div class="panel"><h2>Standings</h2><div class="tbl-wrap">${stand(0)}</div><div style="height:12px"></div><div class="tbl-wrap">${stand(1)}</div></div>
      </div>
    </div>`;
  }
  function recentUserGames(n) {
    const out = [];
    for (let d = L.day - 1; d >= 0 && out.length < n; d--) {
      const g = (L.schedule[d] || []).find((x) => (x.a === L.user || x.h === L.user) && x.r);
      if (g) out.push(g);
    }
    if (L.po) {
      [...L.po.series, L.po.finals].filter(Boolean).forEach((s) => s.games.forEach((g) => { if (g.a === L.user || g.h === L.user) out.unshift(g); }));
    }
    return out.slice(0, n);
  }
  function resultChip(g) {
    const home = g.h === L.user;
    const my = g.r[home ? 1 : 0], th = g.r[home ? 0 : 1];
    const opp = T(home ? g.a : g.h);
    const w = my > th ? 'W' : 'L';
    return `<button class="res-chip ${w}" data-box="${g.id}">${w} ${my}-${th} ${home ? 'vs' : '@'} ${opp.abbr}</button>`;
  }

  // ---------- actions ----------
  function recordSnap() { const t = T(L.user); return { w: t.w, l: t.l }; }
  function doAct(a, el) {
    if (a === 'newleague') {
      L = TB.newLeague({ userTeamId: st.setupTeam, gamesPerTeam: st.setupLen });
      st.park = null;
      save();
      view = 'home';
      if (board) { board.destroy(); board = null; }
      renderApp();
      return;
    }
    if (a === 'watch') {
      const res = TB.simDay(L);
      save();
      if (res) { st.park = { res, finished: false }; go('park'); }
      else { toast('No game for your club today.'); rerender(); }
      return;
    }
    if (a === 'sim1') {
      const res = TB.simDay(L);
      save();
      if (res) {
        const home = res.game.h === L.user;
        const my = res.box.score[home ? 1 : 0], th = res.box.score[home ? 0 : 1];
        toast(`${my > th ? 'WIN' : 'LOSS'} ${my}-${th} ${home ? 'vs' : '@'} ${T(home ? res.game.a : res.game.h).abbr}`);
      } else toast('Day simulated.');
      rerender();
      return;
    }
    if (a === 'sim7' || a === 'simall' || a === 'simpo') {
      const before = recordSnap();
      let n = 0;
      if (a === 'sim7') while (n < 7 && L.phase === 'regular') { TB.simDay(L); n++; }
      if (a === 'simall') while (L.phase === 'regular') { TB.simDay(L); n++; }
      if (a === 'simpo') while (L.phase === 'playoffs') { TB.simDay(L); n++; }
      save();
      const after = recordSnap();
      if (a !== 'simpo') toast(`Simmed ${n} days: you went ${after.w - before.w}-${after.l - before.l}.`);
      else toast(L.po && L.po.champion !== null ? `${T(L.po.champion).name} win it all!` : 'Playoffs simulated.');
      rerender();
      return;
    }
    if (a === 'startpo') { TB.startPlayoffs(L); save(); rerender(); return; }
    if (a === 'nextseason') { TB.nextSeason(L); st.park = null; save(); go('home'); return; }
    // ballpark controls
    if (a === 'pause' && board) { board.paused = !board.paused; el.textContent = board.paused ? '▶ Resume' : '❚❚ Pause'; return; }
    if (a === 'skip' && board) { board.skipToEnd(); return; }
    // lineup
    const team = T(L.user);
    if (a === 'lu-up' || a === 'lu-down') {
      const i = +el.dataset.i, j = a === 'lu-up' ? i - 1 : i + 1;
      if (j < 0 || j > 8) return;
      [team.lineup[i], team.lineup[j]] = [team.lineup[j], team.lineup[i]];
      save(); rerender(); return;
    }
    if (a === 'lu-auto') { TB.autoLineup(L, team); save(); rerender(); toast('Best available lineup set.'); return; }
    if (a === 'lu-order') { team.lineup = TB.battingOrder(L, team.lineup); save(); rerender(); toast('Batting order re-sorted.'); return; }
    if (a === 'rot-auto') { TB.autoPitching(L, team); save(); rerender(); toast('Rotation and bullpen reset.'); return; }
    if (a === 'propose') { proposeTrade(); return; }
    if (a === 'trade-clear') { st.give.clear(); st.get.clear(); st.verdict = null; rerender(); return; }
    if (a === 'export') { exportSave(); return; }
    if (a === 'import') { $('#importfile').click(); return; }
    if (a === 'reset') {
      if (confirm('Delete this league and start a new one? This cannot be undone.')) {
        TB.clearSave(); L = null; st.park = null; view = 'home'; renderSetup();
      }
      return;
    }
    if (a === 'close') { closeModal(); return; }
  }

  // ---------- ballpark ----------
  let live = null;
  function parkView() {
    const res = st.park.res, box = res.box;
    const A = T(box.a), Hm = T(box.h);
    const sp = L.settings.speed || 1;
    return `<div class="park">
      <div>
        <div class="boardwrap"><canvas id="board" aria-label="Toy baseball board replay"></canvas></div>
        <div class="ctrls">
          <button class="btn sm ghost" data-act="pause">❚❚ Pause</button>
          <div class="seg">${[1, 2, 4].map((s) => `<button data-speed="${s}" class="${s === sp ? 'on' : ''}">${s}×</button>`).join('')}</div>
          <button class="btn sm yellow" data-act="skip">Skip to final ⏭</button>
        </div>
      </div>
      <div>
        <div class="panel">
          <div class="panel-h">${badge(A, 'sm')} ${esc(A.abbr)} <span class="muted">@</span> ${badge(Hm, 'sm')} ${esc(Hm.abbr)}<span class="spacer"></span><span id="park-sit" class="muted"></span></div>
          <div class="paper" style="margin-bottom:12px">
            <div class="card-mini" id="park-bat"></div>
            <hr style="border:0;border-top:1px dashed #e0d5ad;margin:10px 0">
            <div class="card-mini" id="park-pit"></div>
            <hr style="border:0;border-top:1px dashed #e0d5ad;margin:10px 0">
            <div class="zone-row">
              <svg class="zone" id="zone" width="110" height="128" viewBox="0 0 110 128"></svg>
              <ul class="pitchlist" id="pitches"></ul>
            </div>
          </div>
          <div id="park-final"></div>
          <ul class="pbp" id="pbp"></ul>
        </div>
      </div>
    </div>`;
  }
  function startPark() {
    const res = st.park.res;
    live = { pitchCount: {}, today: {}, pitches: [], bat: null, pit: null, inn: null };
    board = new TB.Board($('#board'));
    board.setGame(L, res.box);
    board.speed = L.settings.speed || 1;
    drawZone();
    board.play(res.log, { onEvent: parkEvent, onDone: parkDone });
    if (st.park.finished) board.skipToEnd();
  }
  function drawZone() {
    const z = $('#zone');
    if (!z) return;
    const col = { B: '#2a67c9', CS: '#d6262f', SS: '#d6262f', F: '#e5a31a', X: '#2f9a45' };
    z.innerHTML = `<rect x="0" y="0" width="110" height="128" rx="10" fill="#efe6c8"/>
      <rect x="25" y="24" width="60" height="80" fill="none" stroke="#5b6a61" stroke-width="2" stroke-dasharray="4 3"/>
      ${live.pitches.map((p, i) => `<circle cx="${55 + p.x * 30}" cy="${64 - p.y * 40}" r="8" fill="${col[p.r]}" stroke="#fff" stroke-width="1.5"/>
        <text x="${55 + p.x * 30}" y="${64 - p.y * 40 + 3.5}" font-size="9" font-weight="900" fill="#fff" text-anchor="middle">${i + 1}</text>`).join('')}`;
  }
  function parkEvent(ev, phase) {
    if (!$('#pbp')) return;
    const res = st.park.res;
    const box = res.box;
    const sit = $('#park-sit');
    if (phase === 'start' && ev.t === 'half') {
      const li = document.createElement('li');
      li.className = 'inn';
      li.textContent = `${ev.half ? 'Bottom' : 'Top'} of the ${U.ordinal(ev.inn)} — ${T(ev.half ? box.h : box.a).name} batting`;
      $('#pbp').prepend(li);
    }
    if (phase === 'start' && ev.t === 'pa') {
      live.bat = ev.bat; live.pit = ev.pit; live.pitches = [];
      const b = P(ev.bat), p = P(ev.pit);
      const td = live.today[b.id] || { ab: 0, h: 0 };
      $('#park-bat').innerHTML = `${badge(T(ev.half ? box.h : box.a), 'sm')}<div><div class="who">${pname(b)} <span class="muted" style="font-size:13px">${ev.pos} · bats ${ev.hand}</span></div>
        <div class="sub">Contact ${grade(b.con)} Power ${grade(b.pow)} ${cond(b)} · Today ${td.h}-${td.ab}</div></div>`;
      $('#park-pit').innerHTML = `${badge(T(ev.half ? box.a : box.h), 'sm')}<div><div class="who">${pname(p)} <span class="muted" style="font-size:13px">${p.throws}HP</span></div>
        <div class="sub">${p.vel} mph · Control ${grade(p.ctl)} ${cond(p)} · <b id="pcnt">${live.pitchCount[p.id] || 0}</b> pitches</div></div>`;
      $('#pitches').innerHTML = '';
      drawZone();
    }
    if (phase === 'end' && ev.t === 'pitch') {
      live.pitchCount[live.pit] = (live.pitchCount[live.pit] || 0) + 1;
      const pc = $('#pcnt'); if (pc) pc.textContent = live.pitchCount[live.pit];
      live.pitches.push(ev);
      drawZone();
      const lbl = { B: 'Ball', CS: 'Called strike', SS: 'Swinging strike', F: 'Foul', X: 'In play' }[ev.r];
      const li = document.createElement('li');
      li.innerHTML = `<span class="n">${live.pitches.length}</span> ${ev.kind} ${ev.mph} · ${lbl} <span class="muted">(${ev.b}-${ev.s})</span>`;
      $('#pitches').appendChild(li);
    }
    if (phase === 'end' && (ev.t === 'play' || ev.t === 'steal' || ev.t === 'sub')) {
      if (ev.t === 'play') {
        const td = (live.today[live.bat] = live.today[live.bat] || { ab: 0, h: 0 });
        if (!['BB', 'SF'].includes(ev.res)) td.ab++;
        if (['1B', '2B', '3B', 'HR'].includes(ev.res)) td.h++;
      }
      const li = document.createElement('li');
      const scored = ev.moves && ev.moves.some((m) => m.to === 4);
      li.className = scored ? 'score' : '';
      li.textContent = ev.desc + (scored ? `  (${T(box.a).abbr} ${ev.score[0]}, ${T(box.h).abbr} ${ev.score[1]})` : '');
      $('#pbp').prepend(li);
    }
    if (sit && ev.t !== 'end') sit.textContent = `${ev.half ? '▼' : '▲'}${ev.inn} · ${ev.outs} out`;
  }
  function parkDone() {
    st.park.finished = true;
    const res = st.park.res, box = res.box;
    const A = T(box.a), Hm = T(box.h);
    const dec = { W: null, L: null, S: null };
    box.pit.forEach((ls) => ls.forEach((x) => { if (x.dec) dec[x.dec] = x.pid; }));
    const home = box.h === L.user;
    const won = box.score[home ? 1 : 0] > box.score[home ? 0 : 1];
    const next = TB.userPlaysToday(L);
    const el = $('#park-final');
    if (!el) return;
    el.innerHTML = `<div class="paper" style="margin-bottom:12px;text-align:center">
      <div style="font-family:var(--font-display);font-size:22px;color:${won ? 'var(--green)' : 'var(--red)'}">${won ? 'VICTORY!' : 'TOUGH LOSS'}</div>
      <div style="font-weight:900;font-size:18px">${esc(A.abbr)} ${box.score[0]} — ${esc(Hm.abbr)} ${box.score[1]}${box.inn > 9 ? ` (${box.inn})` : ''}</div>
      <div class="muted" style="font-size:13px">W: ${dec.W ? esc(P(dec.W).name) : '-'} · L: ${dec.L ? esc(P(dec.L).name) : '-'}${dec.S ? ` · S: ${esc(P(dec.S).name)}` : ''}</div>
      <div class="actions" style="justify-content:center">
        <button class="btn sm" data-box="${res.game.id}">Box score</button>
        <button class="btn sm ghost" data-go="home">Clubhouse</button>
        ${next ? `<button class="btn sm red" data-act="watch">Next game ▶</button>` : ''}
      </div></div>`;
    renderTop();
  }

  // ---------- schedule ----------
  function scheduleView() {
    const rows = [];
    L.schedule.forEach((games, d) => {
      const g = games.find((x) => x.a === L.user || x.h === L.user);
      if (!g) return;
      const home = g.h === L.user;
      const opp = T(home ? g.a : g.h);
      let res = d === L.day && L.phase === 'regular' ? '<span class="tag ok">NEXT</span>' : '<span class="muted">—</span>';
      if (g.r) {
        const my = g.r[home ? 1 : 0], th = g.r[home ? 0 : 1];
        res = `<span class="link" data-box="${g.id}">${my > th ? 'W' : 'L'} ${my}-${th}${g.inn > 9 ? ` (${g.inn})` : ''}</span>`;
      }
      rows.push(`<tr class="${d === L.day ? 'me' : ''}"><td class="num">${d + 1}</td><td>${home ? 'vs' : '@'} ${badge(opp, 'sm')} ${tname(opp)}</td><td>${res}</td></tr>`);
    });
    const lastDay = L.phase === 'regular' ? L.day - 1 : L.schedule.length - 1;
    const scoreboard = lastDay >= 0 ? L.schedule[lastDay].map((g) => `<tr><td>${badge(T(g.a), 'sm')} ${T(g.a).abbr} <b>${g.r ? g.r[0] : ''}</b></td><td>@</td><td>${badge(T(g.h), 'sm')} ${T(g.h).abbr} <b>${g.r ? g.r[1] : ''}</b></td><td>${g.inn > 9 ? `F/${g.inn}` : 'F'}</td></tr>`).join('') : '';
    return `<div class="grid2">
      <div class="panel"><h2>${tname(T(L.user))} schedule</h2><div class="tbl-wrap" style="max-height:640px"><table class="tbl"><tr><th class="num">G</th><th>Opponent</th><th>Result</th></tr>${rows.join('')}</table></div></div>
      <div class="panel"><h2>Around the league${lastDay >= 0 ? ` · Day ${lastDay + 1}` : ''}</h2>${scoreboard ? `<div class="tbl-wrap"><table class="tbl">${scoreboard}</table></div>` : '<p class="muted">No games played yet.</p>'}</div>
    </div>`;
  }

  // ---------- standings ----------
  function standingsTable(d) {
    return `<div class="tbl-wrap"><table class="tbl"><tr><th>${esc(TB.DIVS[d])}</th><th class="num">W</th><th class="num">L</th><th class="num">PCT</th><th class="num">GB</th><th class="num">RS</th><th class="num">RA</th><th class="num">DIFF</th><th>STRK</th><th>L10</th></tr>
      ${TB.standings(L, d).map((x) => { const t = x.t; const df = t.rs - t.ra; return `<tr class="${t.id === L.user ? 'me' : ''}"><td>${badge(t, 'sm')} <span class="link" data-team="${t.id}">${tname(t)}</span></td><td class="num">${t.w}</td><td class="num">${t.l}</td><td class="num">${U.pct(t.w, t.l)}</td><td class="num">${x.gb ? x.gb.toFixed(1) : '-'}</td><td class="num">${t.rs}</td><td class="num">${t.ra}</td><td class="num" style="color:${df >= 0 ? '#1b7a32' : '#a3202a'}">${df > 0 ? '+' : ''}${df}</td><td>${TB.streak(t)}</td><td>${TB.last10(t)}</td></tr>`; }).join('')}</table></div>`;
  }
  function standingsView() {
    const seeds = TB.playoffSeeds(L);
    return `<div class="panel"><h2>Standings</h2>${standingsTable(0)}<div style="height:16px"></div>${standingsTable(1)}</div>
      <div class="panel"><h2>Playoff picture ${L.phase === 'regular' ? '(if the season ended today)' : ''}</h2>
        <div class="paper"><ol>${seeds.map((id, i) => `<li>${badge(T(id), 'sm')} <b>${tname(T(id))}</b> ${rec(T(id))} — ${i < 2 ? 'division leader' : 'wild card'}</li>`).join('')}</ol>
        <p class="muted">Semifinals (best of 5): 1 vs 4, 2 vs 3. Toy Box Series: best of 7.</p></div></div>`;
  }

  // ---------- rosters ----------
  function hittersTable(team, mine) {
    const ids = team.roster.filter((id) => P(id).type === 'H').map(P).sort((a, b) => TB.POS_SORT[a.pos] - TB.POS_SORT[b.pos] || TB.ovr(b) - TB.ovr(a));
    const inLu = new Set(team.lineup.map((s) => s.pid));
    return `<div class="tbl-wrap"><table class="tbl"><tr><th>Pos</th><th>Name</th><th class="num">Age</th><th>B/T</th><th>Cond</th><th>Contact</th><th>Power</th><th>Eye</th><th>Speed</th><th>Field</th><th>Arm</th><th class="num">OVR</th><th class="num">AVG</th><th class="num">HR</th><th class="num">RBI</th><th class="num">OPS</th><th class="num">SB</th><th></th></tr>
      ${ids.map((p) => { const s = p.stats.bat; return `<tr class="${p.inj ? 'dim' : ''}"><td><b>${p.pos}</b>${p.pos2 ? `<span class="grn">/${p.pos2}</span>` : ''}</td><td>${pname(p)}${mine && inLu.has(p.id) ? ' <span class="tag ok">LU</span>' : ''}</td><td class="num">${p.age}</td><td>${p.bats}/${p.throws}</td><td>${cond(p)}</td>
      <td>${grade(p.con)}</td><td>${grade(p.pow)}</td><td>${grade(p.eye)}</td><td>${grade(p.spd)}</td><td>${grade(p.fld)}</td><td>${grade(p.arm)}</td><td class="num"><b>${TB.ovr(p)}</b></td>
      <td class="num">${U.avg(s)}</td><td class="num">${s.hr}</td><td class="num">${s.rbi}</td><td class="num">${U.fmtRate(U.opsN(s))}</td><td class="num">${s.sb}</td><td>${status(p)}</td></tr>`; }).join('')}</table></div>`;
  }
  function pitchersTable(team) {
    const role = (p) => { const r = team.rotation.indexOf(p.id); return r >= 0 ? 'SP' + (r + 1) : team.closer === p.id ? 'CL' : 'RP'; };
    const ids = team.roster.filter((id) => P(id).type === 'P').map(P).sort((a, b) => role(a).localeCompare(role(b)) || TB.ovr(b) - TB.ovr(a));
    return `<div class="tbl-wrap"><table class="tbl"><tr><th>Role</th><th>Name</th><th class="num">Age</th><th>T</th><th>Cond</th><th class="num">Velo</th><th>Control</th><th>Movement</th><th>Stamina</th><th class="num">OVR</th><th class="num">W-L</th><th class="num">ERA</th><th class="num">IP</th><th class="num">SO</th><th class="num">SV</th><th>Rest</th><th></th></tr>
      ${ids.map((p) => { const s = p.stats.pit; return `<tr class="${p.inj ? 'dim' : ''}"><td><b>${role(p)}</b></td><td>${pname(p)}</td><td class="num">${p.age}</td><td>${p.throws}</td><td>${cond(p)}</td>
      <td class="num">${p.vel}</td><td>${grade(p.ctl)}</td><td>${grade(p.brk)}</td><td>${grade(p.sta)}</td><td class="num"><b>${TB.ovr(p)}</b></td>
      <td class="num">${s.w}-${s.l}</td><td class="num">${U.era(s.er, s.outs)}</td><td class="num">${U.fmtIP(s.outs)}</td><td class="num">${s.so}</td><td class="num">${s.sv}</td>
      <td><span class="fat" title="Fatigue"><i style="width:${Math.min(100, p.fatigue)}%"></i></span></td><td>${status(p)}</td></tr>`; }).join('')}</table></div>`;
  }

  // ---------- my team ----------
  function teamView() {
    const team = T(L.user);
    const tabs = [['roster', 'Roster'], ['lineup', 'Lineup'], ['pitching', 'Pitching staff']];
    let body;
    if (st.teamTab === 'lineup') body = lineupEditor(team);
    else if (st.teamTab === 'pitching') body = pitchingEditor(team);
    else body = `<div class="panel"><h2>Position players</h2>${hittersTable(team, true)}</div><div class="panel"><h2>Pitchers</h2>${pitchersTable(team)}</div>`;
    return `<div class="row" style="margin-bottom:16px">${badge(team, 'lg')}<h2 style="font-size:24px">${tname(team)}</h2><span class="muted">${rec(team)}</span><span class="spacer"></span>
      <div class="seg">${tabs.map(([k, n]) => `<button data-teamtab="${k}" class="${st.teamTab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>${body}
      <p class="muted">Condition arrows: <span class="cond cond-4">➜</span> great · <span class="cond cond-3">➜</span> good · <span class="cond cond-2">➜</span> normal · <span class="cond cond-1">➜</span> bad · <span class="cond cond-0">➜</span> awful. Hot players hit and pitch better; condition changes day to day.</p>`;
  }
  TB.lineupProblems = function (Lg, team) {
    const out = [];
    const pos = team.lineup.map((s) => s.pos);
    ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].forEach((p) => { if (!pos.includes(p)) out.push(`Nobody is playing ${p}.`); });
    const ids = team.lineup.map((s) => s.pid);
    if (new Set(ids).size !== ids.length) out.push('A player is listed twice.');
    team.lineup.forEach((s) => { const p = Lg.players[s.pid]; if (p && p.inj) out.push(`${p.name} is injured — he'll be swapped out automatically at game time.`); });
    return out;
  };
  function lineupEditor(team) {
    const hitters = team.roster.map(P).filter((p) => p.type === 'H').sort((a, b) => TB.POS_SORT[a.pos] - TB.POS_SORT[b.pos]);
    const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
    const probs = TB.lineupProblems(L, team);
    const inLu = new Set(team.lineup.map((s) => s.pid));
    const rows = team.lineup.map((s, i) => {
      const p = P(s.pid);
      const fit = TB.fieldAt(p, s.pos);
      return `<tr><td class="ord">${i + 1}</td>
        <td><button class="mv" data-act="lu-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button> <button class="mv" data-act="lu-down" data-i="${i}" ${i === 8 ? 'disabled' : ''}>▼</button></td>
        <td><select data-lu-pos="${i}">${POS.map((x) => `<option ${x === s.pos ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><select data-lu-pid="${i}">${hitters.map((h) => `<option value="${h.id}" ${h.id === s.pid ? 'selected' : ''}>${esc(h.name)} (${h.pos}${h.pos2 ? '/' + h.pos2 : ''})${h.inj ? ' — IL' : ''}</option>`).join('')}</select></td>
        <td>${cond(p)}</td><td>${grade(p.con)}</td><td>${grade(p.pow)}</td><td>${grade(p.spd)}</td>
        <td>${s.pos === 'DH' ? '<span class="muted">—</span>' : grade(fit)}${s.pos !== 'DH' && s.pos !== p.pos && s.pos !== p.pos2 ? ' <span class="tag tired" title="Playing out of position">OOP</span>' : ''}</td>
        <td class="num">${U.avg(p.stats.bat)} · ${p.stats.bat.hr} HR</td><td>${status(p)}</td></tr>`;
    }).join('');
    const bench = hitters.filter((h) => !inLu.has(h.id));
    return `<div class="panel"><h2>Batting order & defense <span class="row"><button class="btn sm" data-act="lu-order">Re-sort order</button><button class="btn sm yellow" data-act="lu-auto">Auto lineup</button></span></h2>
      ${probs.length ? `<div class="warn">${probs.map(esc).join('<br>')}</div>` : '<div class="ok-note">Lineup is set. Picking a player or position that\'s already used swaps the two.</div>'}
      <div class="tbl-wrap"><table class="tbl lineup"><tr><th>#</th><th>Move</th><th>Pos</th><th>Player</th><th>Cond</th><th>Contact</th><th>Power</th><th>Speed</th><th>Def. at pos</th><th class="num">Season</th><th></th></tr>${rows}</table></div></div>
      <div class="panel"><h2>Bench</h2><div class="tbl-wrap"><table class="tbl"><tr><th>Pos</th><th>Name</th><th>Cond</th><th>Contact</th><th>Power</th><th>Speed</th><th>Field</th><th class="num">Season</th><th></th></tr>
      ${bench.map((p) => `<tr><td><b>${p.pos}</b>${p.pos2 ? `<span class="grn">/${p.pos2}</span>` : ''}</td><td>${pname(p)}</td><td>${cond(p)}</td><td>${grade(p.con)}</td><td>${grade(p.pow)}</td><td>${grade(p.spd)}</td><td>${grade(p.fld)}</td><td class="num">${U.avg(p.stats.bat)} · ${p.stats.bat.hr} HR</td><td>${status(p)}</td></tr>`).join('')}</table></div></div>`;
  }
  function pitchingEditor(team) {
    const pit = team.roster.map(P).filter((p) => p.type === 'P').sort((a, b) => TB.ovr(b) - TB.ovr(a));
    const opt = (sel, pool) => pool.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} (${p.pos}, OVR ${TB.ovr(p)})${p.inj ? ' — IL' : ''}</option>`).join('');
    const nextUp = team.rotation[team.rotIdx % Math.max(1, team.rotation.length)];
    const rows = team.rotation.map((id, i) => {
      const p = P(id);
      return `<tr class="${id === nextUp ? 'me' : ''}"><td class="ord">SP${i + 1}</td><td><select data-rot="${i}">${opt(id, pit)}</select></td><td>${cond(p)}</td><td class="num">${p.vel}</td><td>${grade(p.ctl)}</td><td>${grade(p.brk)}</td><td>${grade(p.sta)}</td>
        <td class="num">${pitLine(p.stats.pit)}</td><td><span class="fat"><i style="width:${Math.min(100, p.fatigue)}%"></i></span></td><td>${id === nextUp ? '<span class="tag ok">NEXT</span>' : ''} ${status(p)}</td></tr>`;
    }).join('');
    const pen = team.bullpen.map(P);
    return `<div class="panel"><h2>Starting rotation <button class="btn sm yellow" data-act="rot-auto">Auto staff</button></h2>
      <p class="muted" style="margin-top:0">Starters need about 4 days of rest. A tired or injured starter gets skipped automatically.</p>
      <div class="tbl-wrap"><table class="tbl lineup"><tr><th>#</th><th>Pitcher</th><th>Cond</th><th class="num">Velo</th><th>Control</th><th>Movement</th><th>Stamina</th><th class="num">Season</th><th>Rest</th><th></th></tr>${rows}</table></div></div>
      <div class="panel"><h2>Bullpen</h2>
      <div class="row" style="margin-bottom:12px"><b>Closer:</b> <span class="lineup"><select data-closer="1">${opt(team.closer, pen)}</select></span><span class="muted">Comes in to protect 1-3 run leads in the 9th.</span></div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>Name</th><th>Cond</th><th class="num">Velo</th><th>Control</th><th>Movement</th><th>Stamina</th><th class="num">Season</th><th class="num">SV</th><th>Rest</th><th></th></tr>
      ${pen.map((p) => `<tr><td>${pname(p)} ${p.id === team.closer ? '<span class="tag ok">CL</span>' : ''}</td><td>${cond(p)}</td><td class="num">${p.vel}</td><td>${grade(p.ctl)}</td><td>${grade(p.brk)}</td><td>${grade(p.sta)}</td><td class="num">${pitLine(p.stats.pit)}</td><td class="num">${p.stats.pit.sv}</td><td><span class="fat"><i style="width:${Math.min(100, p.fatigue)}%"></i></span></td><td>${status(p)}</td></tr>`).join('')}</table></div></div>`;
  }

  // ---------- trades ----------
  function tradesView() {
    const others = L.teams.filter((t) => t.id !== L.user);
    if (st.tradeTeam === null || st.tradeTeam === L.user) st.tradeTeam = others[0].id;
    const them = T(st.tradeTeam), me = T(L.user);
    const open = L.phase === 'regular' && L.day < L.deadline;
    const list = (team, set, key) => {
      const ps = team.roster.map(P).sort((a, b) => (a.type === b.type ? 0 : a.type === 'H' ? -1 : 1) || TB.POS_SORT[a.pos] - TB.POS_SORT[b.pos] || TB.ovr(b) - TB.ovr(a));
      return `<div class="tbl-wrap" style="max-height:520px"><table class="tbl"><tr><th></th><th>Pos</th><th>Name</th><th class="num">Age</th><th class="num">OVR</th><th>Key stats</th><th class="num">Value</th></tr>
        ${ps.map((p) => `<tr class="${set.has(p.id) ? 'me' : ''}"><td><input type="checkbox" data-${key}="${p.id}" ${set.has(p.id) ? 'checked' : ''} ${open ? '' : 'disabled'}></td><td><b>${p.pos}</b></td><td>${pname(p)} ${status(p)}</td><td class="num">${p.age}</td><td class="num"><b>${TB.ovr(p)}</b></td>
        <td>${p.type === 'H' ? `${U.avg(p.stats.bat)}, ${p.stats.bat.hr} HR` : pitLine(p.stats.pit)}</td><td class="num">${TB.value(p)}</td></tr>`).join('')}</table></div>`;
    };
    const vGive = U.sum([...st.give], (id) => TB.value(P(id)));
    const vGet = U.sum([...st.get], (id) => TB.value(P(id)));
    const tot = Math.max(1, vGive + vGet);
    return `<div class="panel"><h2>Trade desk</h2>
      <p class="muted" style="margin-top:0">${open ? `Trade deadline: before game ${L.deadline + 1}. Even trades only (1-for-1, 2-for-2...). Teams want a little more value back than they give up.` : 'The trading window is closed until next season.'}</p>
      <div class="row"><b>Trade with:</b><div class="seg" style="flex-wrap:wrap">${others.map((t) => `<button data-tradeteam="${t.id}" class="${t.id === st.tradeTeam ? 'on' : ''}">${t.abbr}</button>`).join('')}</div></div>
      <div style="margin-top:14px" class="paper">
        <div class="row"><b>You give: ${vGive}</b><span class="spacer"></span><b>You get: ${vGet}</b></div>
        <div class="meter" style="margin:8px 0"><i style="width:${(vGive / tot) * 100}%;background:var(--blue)"></i><i style="width:${(vGet / tot) * 100}%;background:var(--red)"></i></div>
        <div class="row"><button class="btn red" data-act="propose" ${open ? '' : 'disabled'}>Propose trade</button><button class="btn ghost sm" data-act="trade-clear" style="color:#333;background:#e9dfbd;box-shadow:none">Clear</button></div>
        ${st.verdict ? `<div class="verdict ${st.verdict.ok ? 'yes' : 'no'}">${esc(st.verdict.reason)}</div>` : ''}
      </div></div>
      <div class="grid2">
        <div class="panel trade-col"><h2>${badge(me, 'sm')} Your players</h2>${list(me, st.give, 'give')}</div>
        <div class="panel trade-col"><h2>${badge(them, 'sm')} ${tname(them)} (${rec(them)})</h2>${list(them, st.get, 'get')}</div>
      </div>`;
  }
  function proposeTrade() {
    const give = [...st.give], get = [...st.get];
    const v = TB.tradeCheck(L, st.tradeTeam, give, get);
    st.verdict = v;
    if (v.ok) {
      TB.executeTrade(L, L.user, st.tradeTeam, give, get);
      st.give.clear(); st.get.clear();
      save();
    }
    rerender();
  }

  // ---------- leaders ----------
  function leadersView() {
    const cats = st.leaderTab === 'bat' ? [['AVG', 'Batting average'], ['HR', 'Home runs'], ['RBI', 'Runs batted in'], ['OPS', 'OPS'], ['H', 'Hits'], ['SB', 'Stolen bases']]
      : [['ERA', 'ERA'], ['W', 'Wins'], ['SO', 'Strikeouts'], ['SV', 'Saves'], ['WHIP', 'WHIP']];
    return `<div class="row" style="margin-bottom:16px"><h2 style="font-size:24px">League leaders</h2><span class="spacer"></span>
      <div class="seg"><button data-leadtab="bat" class="${st.leaderTab === 'bat' ? 'on' : ''}">Batting</button><button data-leadtab="pit" class="${st.leaderTab === 'pit' ? 'on' : ''}">Pitching</button></div></div>
      <div class="grid3">${cats.map(([k, n]) => `<div class="paper lb"><h3 style="color:#8a5a00">${n}</h3><ol>${TB.leaders(L, k, 10).map((x) => `<li>${badge(T(x.p.team), 'sm')} ${pname(x.p)} <span class="t">${T(x.p.team).abbr}</span><span class="v">${x.txt}</span></li>`).join('') || '<li>No qualifiers yet</li>'}</ol></div>`).join('')}</div>`;
  }

  // ---------- league ----------
  function leagueView() {
    if (st.leagueTeam === null) st.leagueTeam = L.teams.find((t) => t.id !== L.user).id;
    const t = T(st.leagueTeam);
    return `<div class="panel"><h2>Scout the league</h2>
      <div class="seg" style="flex-wrap:wrap">${L.teams.map((x) => `<button data-leagueteam="${x.id}" class="${x.id === t.id ? 'on' : ''}">${x.abbr}</button>`).join('')}</div></div>
      <div class="row" style="margin-bottom:16px">${badge(t, 'lg')}<h2 style="font-size:24px">${tname(t)}</h2><span class="muted">${rec(t)} · ${esc(TB.DIVS[t.div])}</span></div>
      <div class="panel"><h2>Position players</h2>${hittersTable(t, false)}</div><div class="panel"><h2>Pitchers</h2>${pitchersTable(t)}</div>`;
  }

  // ---------- playoffs ----------
  function seriesCard(sr) {
    if (!sr) return `<div class="series"><p class="muted">Waiting on the semifinals…</p></div>`;
    const row = (id, w) => `<div class="tm ${sr.winner === id ? 'win' : ''}">${badge(T(id), 'sm')} ${tname(T(id))} <span class="muted">(${L.po.seeds.indexOf(id) + 1})</span><span class="w">${w}</span></div>`;
    return `<div class="series"><b>${esc(sr.name)} · best of ${sr.bestOf}</b>${row(sr.hi, sr.w[0])}${row(sr.lo, sr.w[1])}
      <div class="results-strip">${sr.games.map((g, i) => `<button class="res-chip" style="background:#333" data-box="${g.id}">G${i + 1}: ${T(g.a).abbr} ${g.r[0]}-${g.r[1]} ${T(g.h).abbr}</button>`).join('')}</div></div>`;
  }
  function playoffsView() {
    if (!L.po) return '<div class="panel"><h2>Playoffs</h2><p>Not started yet.</p></div>';
    return `<div class="panel"><h2>Semifinals</h2><div class="bracket">${L.po.series.map(seriesCard).join('')}</div></div>
      <div class="panel"><h2>Toy Box Series</h2>${seriesCard(L.po.finals)}${L.po.champion !== null ? `<p style="margin-top:12px;font-weight:900">🏆 Champions: ${tname(T(L.po.champion))}</p>` : ''}</div>`;
  }

  // ---------- options ----------
  function optionsView() {
    const hist = L.history.slice().reverse();
    return `<div class="grid2"><div>
      <div class="panel"><h2>Replay speed</h2><div class="seg">${[1, 2, 4].map((s) => `<button data-defspeed="${s}" class="${(L.settings.speed || 1) === s ? 'on' : ''}">${s}×</button>`).join('')}</div></div>
      <div class="panel"><h2>Save data</h2><p class="muted" style="margin-top:0">The league saves to this browser automatically after every day. Export a file to back it up or move it to another device.</p>
        <div class="actions"><button class="btn" data-act="export">Export save</button><button class="btn ghost" data-act="import">Import save</button><input type="file" id="importfile" accept=".json,application/json" hidden></div></div>
      <div class="panel"><h2>Start over</h2><div class="actions"><button class="btn red" data-act="reset">New league…</button></div></div>
      </div><div>
      <div class="panel"><h2>Hall of champions</h2>${hist.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Season</th><th>Champion</th><th>MVP</th><th>Your record</th></tr>${hist.map((h) => `<tr><td>${h.season}</td><td>${badge(T(h.champ), 'sm')} ${tname(T(h.champ))}</td><td>${h.mvp && P(h.mvp) ? esc(P(h.mvp).name) : '—'}</td><td>${h.user.w}-${h.user.l}</td></tr>`).join('')}</table></div>` : '<p class="muted">No champions crowned yet.</p>'}</div>
      <div class="panel"><h2>How it works</h2><div class="paper" style="font-size:14px;line-height:1.5">
        <p><b>Ratings</b> run from G (weak) up to S (superstar). Hitters: Contact, Power, Eye (walks, fewer chases), Speed, Field and Arm. Pitchers: Velocity, Control, Movement and Stamina.</p>
        <p><b>Condition</b> arrows change every day and with each performance. Ride the hot hands, bench the cold ones.</p>
        <p><b>Fatigue</b>: starters need about four days off; relievers who pitched yesterday may be unavailable. Injured players are swapped out of your lineup automatically.</p>
        <p><b>Playoffs</b>: two division winners plus two wild cards. Semifinals are best of 5, the Toy Box Series best of 7.</p>
      </div></div></div></div>`;
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(L)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toybaseball-season${L.season}-day${L.day + 1}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- modals ----------
  function openModal(html) {
    $('#modal-root').innerHTML = `<div class="modal-bg" data-act="close"><div class="modal" role="dialog">${html}</div></div>`;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  function bar(v, col) { return `<div class="bar"><i style="width:${U.clamp(v, 0, 100)}%;background:${col}"></i></div>`; }
  const GCOL = { S: '#c79a00', A: '#e0367d', B: '#e5702a', C: '#d8a91d', D: '#6fae3a', E: '#2f9a6d', F: '#2a67c9', G: '#7c8580' };
  function playerModal(id) {
    const p = P(id);
    if (!p) return;
    const t = T(p.team);
    const ratings = p.type === 'H'
      ? [['Contact', p.con], ['Power', p.pow], ['Eye', p.eye], ['Speed', p.spd], ['Fielding', p.fld], ['Arm', p.arm]]
      : [['Velocity', velGrade(p), `${p.vel}`], ['Control', p.ctl], ['Movement', p.brk], ['Stamina', p.sta]];
    let stats;
    if (p.type === 'H') {
      const s = p.stats.bat;
      stats = `<table class="tbl"><tr><th class="num">G</th><th class="num">AB</th><th class="num">H</th><th class="num">2B</th><th class="num">3B</th><th class="num">HR</th><th class="num">R</th><th class="num">RBI</th><th class="num">BB</th><th class="num">SO</th><th class="num">SB</th><th class="num">AVG</th><th class="num">OBP</th><th class="num">SLG</th></tr>
        <tr>${[s.g, s.ab, s.h, s.d, s.t, s.hr, s.r, s.rbi, s.bb, s.so, s.sb].map((x) => `<td class="num">${x}</td>`).join('')}<td class="num">${U.avg(s)}</td><td class="num">${U.fmtRate(U.obpN(s))}</td><td class="num">${U.fmtRate(U.slgN(s))}</td></tr></table>`;
    } else {
      const s = p.stats.pit;
      stats = `<table class="tbl"><tr><th class="num">G</th><th class="num">GS</th><th class="num">W</th><th class="num">L</th><th class="num">SV</th><th class="num">IP</th><th class="num">H</th><th class="num">ER</th><th class="num">BB</th><th class="num">SO</th><th class="num">HR</th><th class="num">ERA</th></tr>
        <tr>${[s.g, s.gs, s.w, s.l, s.sv, U.fmtIP(s.outs), s.h, s.er, s.bb, s.so, s.hr].map((x) => `<td class="num">${x}</td>`).join('')}<td class="num">${U.era(s.er, s.outs)}</td></tr></table>`;
    }
    const hist = p.hist.length ? `<h3 style="font-size:14px;margin:14px 0 6px">Career</h3><div class="tbl-wrap"><table class="tbl">${p.type === 'H'
      ? `<tr><th>Season</th><th>Team</th><th class="num">AVG</th><th class="num">HR</th><th class="num">RBI</th><th class="num">OPS</th></tr>${p.hist.map((h) => `<tr><td>${h.s}</td><td>${h.team}</td><td class="num">${U.avg(h.bat)}</td><td class="num">${h.bat.hr}</td><td class="num">${h.bat.rbi}</td><td class="num">${U.fmtRate(U.opsN(h.bat))}</td></tr>`).join('')}`
      : `<tr><th>Season</th><th>Team</th><th class="num">W-L</th><th class="num">ERA</th><th class="num">IP</th><th class="num">SO</th><th class="num">SV</th></tr>${p.hist.map((h) => `<tr><td>${h.s}</td><td>${h.team}</td><td class="num">${h.pit.w}-${h.pit.l}</td><td class="num">${U.era(h.pit.er, h.pit.outs)}</td><td class="num">${U.fmtIP(h.pit.outs)}</td><td class="num">${h.pit.so}</td><td class="num">${h.pit.sv}</td></tr>`).join('')}`}</table></div>` : '';
    openModal(`<button class="btn sm ghost x" data-act="close">✕</button>
      <div class="row" style="margin-bottom:14px">${badge(t, 'lg')}<div><h2 style="font-size:22px">${esc(p.name)}</h2>
      <div class="muted">${p.pos}${p.pos2 ? '/' + p.pos2 : ''} · ${tname(t)} · Age ${p.age} · ${p.type === 'H' ? `Bats ${p.bats}, throws ${p.throws}` : `Throws ${p.throws}`}</div></div></div>
      <div class="grid2"><div class="paper"><div class="bars">${ratings.map(([n, v, lbl]) => { const g = U.grade(v); return `<span>${n}</span>${bar(v, GCOL[g])}<span><span class="gr gr-${g}">${g}</span>${lbl ? '' : ''}</span>`; }).join('')}</div>
        ${p.type === 'P' ? `<p class="muted" style="margin:8px 0 0">Fastball tops out around ${p.vel} mph.</p>` : ''}</div>
      <div class="paper"><p style="margin:0 0 6px"><b>Overall:</b> ${TB.ovr(p)} · <b>Trade value:</b> ${TB.value(p)}</p>
        <p style="margin:0 0 6px"><b>Condition:</b> ${cond(p)} ${COND[p.cond]}</p>
        <p style="margin:0"><b>Status:</b> ${p.inj ? `Injured (${esc(p.injDesc)}), ${p.inj} days` : p.type === 'P' && p.fatigue > 20 ? 'Resting' : 'Ready to play'}</p></div></div>
      <h3 style="font-size:14px;margin:14px 0 6px">Season ${L.season}</h3><div class="tbl-wrap">${stats}</div>${hist}`);
  }
  function findGame(id) {
    for (const day of L.schedule) for (const g of day) if (g.id === id) return g;
    if (L.po) for (const s of [...L.po.series, L.po.finals].filter(Boolean)) for (const g of s.games) if (g.id === id) return g;
    return null;
  }
  function boxModal(id) {
    const box = L.boxes[id];
    if (!box) { toast('Box score not available for that game.'); return; }
    const A = T(box.a), Hm = T(box.h);
    const n = Math.max(9, box.line[0].length, box.line[1].length);
    const ls = `<div class="tbl-wrap"><table class="tbl linescore"><tr><th></th>${[...Array(n)].map((_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr>
      ${[0, 1].map((k) => `<tr><td style="text-align:left!important">${badge([A, Hm][k], 'sm')} <b>${[A, Hm][k].abbr}</b></td>${[...Array(n)].map((_, i) => `<td>${box.line[k][i] ?? ''}</td>`).join('')}<td><b>${box.score[k]}</b></td><td>${box.hits[k]}</td><td>${box.errs[k]}</td></tr>`).join('')}</table></div>`;
    const batT = (k) => `<div class="tbl-wrap"><table class="tbl"><tr><th>${[A, Hm][k].abbr} batting</th><th class="num">AB</th><th class="num">R</th><th class="num">H</th><th class="num">RBI</th><th class="num">BB</th><th class="num">SO</th><th>XBH</th></tr>
      ${box.bat[k].map((b) => { const p = P(b.pid); const x = [b.d && `${b.d}×2B`, b.t && `${b.t}×3B`, b.hr && `${b.hr}×HR`, b.sb && `${b.sb}×SB`].filter(Boolean).join(' '); return `<tr><td>${p ? pname(p) : 'Retired'} <span class="grn">${b.pos}</span></td><td class="num">${b.ab}</td><td class="num">${b.r}</td><td class="num">${b.h}</td><td class="num">${b.rbi}</td><td class="num">${b.bb}</td><td class="num">${b.so}</td><td>${x}</td></tr>`; }).join('')}</table></div>`;
    const pitT = (k) => `<div class="tbl-wrap"><table class="tbl"><tr><th>${[A, Hm][k].abbr} pitching</th><th class="num">IP</th><th class="num">H</th><th class="num">R</th><th class="num">ER</th><th class="num">BB</th><th class="num">SO</th><th class="num">HR</th><th class="num">PC</th></tr>
      ${box.pit[k].map((x) => { const p = P(x.pid); return `<tr><td>${p ? pname(p) : 'Retired'} ${x.dec ? `<span class="tag ${x.dec === 'L' ? 'inj' : 'ok'}">${x.dec}</span>` : ''}</td><td class="num">${U.fmtIP(x.outs)}</td><td class="num">${x.h}</td><td class="num">${x.r}</td><td class="num">${x.er}</td><td class="num">${x.bb}</td><td class="num">${x.so}</td><td class="num">${x.hr}</td><td class="num">${x.pc}</td></tr>`; }).join('')}</table></div>`;
    openModal(`<button class="btn sm ghost x" data-act="close">✕</button><h2 style="font-size:20px;margin-bottom:12px">${tname(A)} ${box.score[0]} @ ${tname(Hm)} ${box.score[1]}</h2>
      ${ls}<div style="height:12px"></div><div class="grid2"><div>${batT(0)}<div style="height:10px"></div>${pitT(0)}</div><div>${batT(1)}<div style="height:10px"></div>${pitT(1)}</div></div>`);
  }

  // ---------- events ----------
  function onClick(e) {
    const el = e.target.closest('[data-act],[data-go],[data-player],[data-box],[data-team],[data-speed],[data-teamtab],[data-tradeteam],[data-leadtab],[data-leagueteam],[data-defspeed],[data-setup-team],[data-setup-len]');
    if (!el) return;
    const d = el.dataset;
    if (d.act === 'close' && e.target !== el && el.classList.contains('modal-bg')) return; // clicks inside modal
    if (d.setupTeam !== undefined) {
      st.setupTeam = +d.setupTeam;
      document.querySelectorAll('.teamcard').forEach((c) => c.classList.toggle('on', c === el));
      if (board) {
        const t = TB.TEAMS[st.setupTeam];
        board.colors = ['#1f5fbf', t.color];
        if (U.colorDist(board.colors[0], t.color) < 110) board.colors[0] = t.alt;
        board.abbr = ['AWAY', t.abbr];
        board.draw();
      }
      return;
    }
    if (d.setupLen !== undefined) {
      st.setupLen = +d.setupLen;
      document.querySelectorAll('#lenseg button').forEach((b) => b.classList.toggle('on', b === el));
      return;
    }
    if (d.act) { doAct(d.act, el); return; }
    if (d.go) { closeModal(); go(d.go); return; }
    if (d.player) { playerModal(d.player); return; }
    if (d.box) { boxModal(d.box); return; }
    if (d.team !== undefined) { st.leagueTeam = +d.team; if (+d.team === L.user) go('team'); else go('league'); return; }
    if (d.speed) {
      const s = +d.speed;
      L.settings.speed = s; save();
      if (board) board.speed = s;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      return;
    }
    if (d.defspeed) { L.settings.speed = +d.defspeed; save(); rerender(); return; }
    if (d.teamtab) { st.teamTab = d.teamtab; rerender(); return; }
    if (d.tradeteam) { st.tradeTeam = +d.tradeteam; st.get.clear(); st.verdict = null; rerender(); return; }
    if (d.leadtab) { st.leaderTab = d.leadtab; rerender(); return; }
    if (d.leagueteam) { st.leagueTeam = +d.leagueteam; rerender(); return; }
  }

  function onChange(e) {
    const el = e.target;
    const d = el.dataset;
    if (!L) return;
    const team = T(L.user);
    if (d.luPos !== undefined) {
      const i = +d.luPos, v = el.value;
      const j = team.lineup.findIndex((s, k) => k !== i && s.pos === v);
      if (j >= 0) team.lineup[j].pos = team.lineup[i].pos;
      team.lineup[i].pos = v;
      save(); rerender(); return;
    }
    if (d.luPid !== undefined) {
      const i = +d.luPid, v = el.value;
      const j = team.lineup.findIndex((s, k) => k !== i && s.pid === v);
      if (j >= 0) team.lineup[j].pid = team.lineup[i].pid;
      team.lineup[i].pid = v;
      save(); rerender(); return;
    }
    if (d.rot !== undefined) {
      const i = +d.rot, v = el.value;
      const j = team.rotation.indexOf(v);
      if (j >= 0) team.rotation[j] = team.rotation[i];
      team.rotation[i] = v;
      if (team.closer === v) team.closer = null;
      TB.repairPitching(L, team);
      save(); rerender(); return;
    }
    if (d.closer) { team.closer = el.value; save(); rerender(); return; }
    if (d.give || d.get) {
      const set = d.give ? st.give : st.get, id = d.give || d.get;
      if (el.checked) set.add(id); else set.delete(id);
      st.verdict = null;
      rerender(); return;
    }
    if (el.id === 'importfile' && el.files && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data || data.version !== 1 || !data.teams || !data.players) throw new Error('bad');
          L = data; st.park = null; save(); view = 'home'; renderApp(); toast('Save imported.');
        } catch (err) { toast('That file is not a Toy Baseball save.'); }
      };
      r.readAsText(el.files[0]);
    }
  }
})();
