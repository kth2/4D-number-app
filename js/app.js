/* App wiring: tabs, theme, and the five views. */
(async () => {
  const $ = (sel) => document.querySelector(sel);
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(I18N.lang === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const WD_LABEL = (wd) => t('wd.' + wd);

  /* ---------- theme ---------- */
  const themeBtn = $('#theme-toggle');
  const applyTheme = (t) => { document.documentElement.dataset.theme = t || ''; };
  applyTheme(localStorage.getItem('my4d-theme'));
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    localStorage.setItem('my4d-theme', next);
    applyTheme(next);
    render(activeView); // charts re-read CSS vars via var() so mostly automatic; re-render for label inks
  });

  /* ---------- language ---------- */
  I18N.applyStatic();
  $('#lang-toggle').textContent = I18N.lang === 'zh' ? 'EN' : '中';
  $('#lang-toggle').addEventListener('click', () => {
    I18N.setLang(I18N.lang === 'zh' ? 'en' : 'zh');
    $('#lang-toggle').textContent = I18N.lang === 'zh' ? 'EN' : '中';
    rendered.clear();
    render(activeView);
  });

  /* ---------- share ---------- */
  async function shareText(text) {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); alert(t('share.copied')); }
    catch { prompt('Copy:', text); }
  }

  /* ---------- tabs ---------- */
  let activeView = 'results';
  const rendered = new Set();
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    activeView = btn.dataset.view;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('section.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + activeView));
    if (!rendered.has(activeView)) render(activeView);
  });

  /* ---------- load data ---------- */
  let meta;
  try {
    meta = await MY4D.load();
  } catch (err) {
    $('#loading').textContent = 'Could not load draw data: ' + err.message;
    return;
  }
  $('#loading').style.display = 'none';
  $('#view-results').classList.add('active');

  /* ---------- fresh-data banner ---------- */
  function showUpdateBanner(onClick) {
    if (document.querySelector('.update-banner')) return;
    const b = document.createElement('button');
    b.className = 'update-banner';
    b.textContent = onClick ? t('banner.update') : t('banner.fresh');
    b.onclick = onClick || (() => location.reload());
    document.body.appendChild(b);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'data-updated') showUpdateBanner();
    });
  }
  window.__my4dShowUpdateBanner = showUpdateBanner;

  /* ---------- watchlist (device-local) ---------- */
  const WATCH_KEY = 'my4d-watchlist';
  const getWatch = () => { try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || []; } catch { return []; } };
  const setWatch = (a) => localStorage.setItem(WATCH_KEY, JSON.stringify(a));

  /* ============================================================ RESULTS */
  let resDate = meta.lastDate;

  /* Wins for a watchlist entry: 4 digits = straight; 3 digits = 3D ending
     (any winning number ending with those digits), tagged with the full number. */
  function watchWins(entry) {
    if (entry.length === 4) return MY4D.winsOf(entry).map((w) => ({ ...w, num: entry }));
    const out = [];
    for (let d = 0; d < 10; d++) {
      const full = d + entry;
      for (const w of MY4D.winsOf(full)) out.push({ ...w, num: full });
    }
    return out;
  }

  function renderWatchlist() {
    const list = getWatch();
    $('#watch-empty').style.display = list.length ? 'none' : 'block';
    if (!list.length) { $('#watch-table').innerHTML = ''; return; }
    $('#watch-table').innerHTML =
      `<thead><tr><th>${t('wl.h.number')}</th><th>${t('wl.h.on', { date: fmtDate(resDate) })}</th><th>${t('wl.h.total')}</th><th>${t('wl.h.last')}</th><th></th></tr></thead><tbody>` +
      list.map((entry) => {
        const is3D = entry.length === 3;
        const wins = watchWins(entry);
        const today = wins.filter((w) => w.draw.d === resDate);
        const ds = wins.map((w) => w.draw.d).sort();
        const badge = today.length
          ? today.map((w) => `${tierBadge(w.tier)} ${is3D ? `<strong>${w.num}</strong> ` : ''}<span class="dim">${MY4D.OPS[w.draw.o].short}</span>`).join('<br>')
          : '<span class="dim">—</span>';
        return `<tr>
          <td class="num">${is3D ? `··${entry}` : entry} ${is3D ? '<span class="tier-badge">3D</span>' : ''}</td>
          <td>${badge}</td>
          <td>${wins.length}</td>
          <td>${ds.length ? fmtDate(ds[ds.length - 1]) : '—'}</td>
          <td><button class="icon-btn watch-del" data-num="${entry}" title="Remove">✕</button></td>
        </tr>`;
      }).join('') + '</tbody>';
  }
  function initWatchlist() {
    const add = () => {
      const v = $('#watch-input').value.trim();
      if (!/^\d{3,4}$/.test(v)) return;
      const list = getWatch();
      if (!list.includes(v)) {
        if (list.length >= 30) { alert(t('wl.limit')); return; }
        list.push(v);
        setWatch(list);
      }
      $('#watch-input').value = '';
      renderWatchlist();
    };
    $('#watch-add').addEventListener('click', add);
    $('#watch-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    $('#watch-table').addEventListener('click', (e) => {
      const btn = e.target.closest('.watch-del');
      if (!btn) return;
      setWatch(getWatch().filter((n) => n !== btn.dataset.num));
      renderWatchlist();
    });
  }
  initWatchlist();
  function renderResults() {
    rendered.add('results');
    $('#res-date').value = resDate;
    $('#res-date').min = meta.firstDate;
    $('#res-date').max = meta.lastDate;
    renderWatchlist();
    const wrap = $('#res-tickets');
    const todays = MY4D.drawsOn(resDate);
    if (!todays.length) {
      wrap.innerHTML = `<div class="empty">${t('r.noDraw', { date: fmtDate(resDate) })}</div>`;
      return;
    }
    const byOp = Object.fromEntries(todays.map((d) => [d.o, d]));
    wrap.innerHTML = ['M', 'D', 'T'].map((code) => {
      const op = MY4D.OPS[code];
      const d = byOp[code];
      if (!d) {
        // operator has no result for this date (e.g. its scrape lags the others)
        const prev = MY4D.latestFor(code, resDate);
        return `<div class="ticket op-${code} pending">
          <div class="t-head"><strong>${op.name}</strong><span>${fmtDate(resDate)}</span></div>
          <div class="pending-body">${t('r.pendingNo')}<br>
          ${prev ? `${t('r.pendingLatest')} <a href="#" class="goto-date" data-date="${prev.d}">${fmtDate(prev.d)}</a>` : t('r.pendingNone')}</div>
        </div>`;
      }
      return `<div class="ticket op-${code}">
        <div class="t-head">
          <strong>${op.name}</strong>
          <span>${d.x ? `<span class="special-flag">${t('r.specialDraw')}</span> ` : ''}${fmtDate(d.d)} · #${d.n}</span>
        </div>
        <div class="prize-top">
          <div><div class="lbl">${t('tier.1')}</div><div class="num">${d.p[0]}</div></div>
          <div><div class="lbl">${t('tier.2')}</div><div class="num">${d.p[1]}</div></div>
          <div><div class="lbl">${t('tier.3')}</div><div class="num">${d.p[2]}</div></div>
        </div>
        ${d.s && d.s.length ? `<div class="mini-title">${t('ticket.special')}</div><div class="mini-nums">${d.s.map((n) => `<span>${n}</span>`).join('')}</div>` : ''}
        ${d.c && d.c.length ? `<div class="mini-title">${t('ticket.consolation')}</div><div class="mini-nums">${d.c.map((n) => `<span>${n}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    wrap.querySelectorAll('.goto-date').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      resDate = a.dataset.date;
      renderResults();
    }));
  }
  const stepDate = (dir) => {
    const i = MY4D.dates.indexOf(resDate);
    if (i === -1) { // date picker set to a non-draw day: snap to nearest
      const next = MY4D.dates.find((d) => d > resDate);
      resDate = dir > 0 ? (next || meta.lastDate) : ([...MY4D.dates].reverse().find((d) => d < resDate) || meta.firstDate);
    } else {
      resDate = MY4D.dates[Math.min(MY4D.dates.length - 1, Math.max(0, i + dir))];
    }
    renderResults();
  };
  $('#res-prev').addEventListener('click', () => stepDate(-1));
  $('#res-next').addEventListener('click', () => stepDate(1));
  $('#res-latest').addEventListener('click', () => { resDate = meta.lastDate; renderResults(); });
  $('#res-date').addEventListener('change', (e) => { resDate = e.target.value; renderResults(); });
  $('#res-share').addEventListener('click', () => {
    const todays = MY4D.drawsOn(resDate);
    const lines = [t('share.resTitle', { date: fmtDate(resDate) }), ''];
    for (const code of ['M', 'D', 'T']) {
      const d = todays.find((x) => x.o === code);
      lines.push(`▸ ${MY4D.OPS[code].name}${d && d.n ? ' #' + d.n : ''}`);
      if (d) {
        lines.push(`🥇 ${d.p[0]}   🥈 ${d.p[1]}   🥉 ${d.p[2]}`);
        if (d.s && d.s.length) lines.push(`${t('ticket.special')}: ${d.s.join(' ')}`);
        if (d.c && d.c.length) lines.push(`${t('ticket.consolation')}: ${d.c.join(' ')}`);
      } else {
        lines.push(t('share.noResult'));
      }
      lines.push('');
    }
    lines.push(t('share.via') + ' · https://kth2.github.io/4D-number-app/');
    shareText(lines.join('\n'));
  });

  /* ============================================================ STATISTICS */
  const statsState = { op: 'ALL', range: 1095, tiers: 'top3' };
  function opChips(containerId, state, onChange) {
    const c = $(containerId);
    const ops = [['ALL', t('op.ALL')], ['M', t('op.M')], ['D', t('op.D')], ['T', t('op.T')]];
    c.innerHTML = ops.map(([k, l]) => `<button class="chip ${state.op === k ? 'active' : ''}" data-op="${k}">${l}</button>`).join('');
    c.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      state.op = b.dataset.op;
      c.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b));
      onChange();
    };
  }
  function renderStats() {
    rendered.add('stats');
    opChips('#stats-op-chips', statsState, renderStats);
    const topOnly = statsState.tiers === 'top3';
    const scope = MY4D.filtered({ op: statsState.op, sinceDays: statsState.range, topOnly });
    const freq = STATS.numberFrequency(scope, topOnly);
    const hot = STATS.hot(freq, 15);
    const cold = STATS.cold(scope, topOnly, 10);
    const { m } = STATS.digitPositionCounts(scope, topOnly);
    const numbersDrawn = [...freq.values()].reduce((a, b) => a + b, 0);

    $('#stats-tiles').innerHTML = `
      <div class="tile"><div class="v">${scope.length.toLocaleString()}</div><div class="k">${t('s.t.draws')}</div></div>
      <div class="tile"><div class="v">${numbersDrawn.toLocaleString()}</div><div class="k">${t('s.t.numbers')}</div></div>
      <div class="tile"><div class="v">${hot[0] ? hot[0][0] : '—'}</div><div class="k">${t('s.t.hot')}</div><div class="d">${hot[0] ? t('s.t.wins', { n: hot[0][1] }) : ''}</div></div>
      <div class="tile"><div class="v">${freq.size.toLocaleString()}</div><div class="k">${t('s.t.distinct')}</div><div class="d">${t('s.t.of10k')}</div></div>`;

    $('#hot-sub').textContent = t('s.hotSub', { tiers: topOnly ? t('s.top3') : t('s.all23'), range: statsState.range ? t('s.lastYears', { n: Math.round(statsState.range / 365) }) : t('s.allHist'), exp: (numbersDrawn / 10000).toFixed(1) });
    CHARTS.columns($('#chart-hot'), hot.map(([num, v]) => ({
      label: num, value: v,
      tip: `<strong>${num}</strong> <span class="tt-k">·</span> ${t('s.winsTip', { n: v })}`,
    })));

    CHARTS.heatmap($('#chart-heat'), m,
      [1, 2, 3, 4].map((n) => t('pos.axis', { n })),
      [...Array(10).keys()].map(String),
      { tipFn: (i, j, v) => `<strong>${t('s.heatTip', { d: j, p: i + 1 })}</strong> <span class="tt-k">·</span> ${v}× (${(100 * v / (numbersDrawn || 1)).toFixed(1)}%)` });

    $('#cold-table').innerHTML = `<thead><tr><th>${t('s.h.number')}</th><th>${t('s.h.lastSeen')}</th><th>${t('s.h.daysAbsent')}</th><th>${t('s.h.totalWins')}</th></tr></thead><tbody>` +
      cold.map((r) => `<tr><td class="num">${r.num}</td><td>${fmtDate(r.lastSeen)}</td><td>${r.gapDays}</td><td>${r.count}</td></tr>`).join('') + '</tbody>';
  }
  $('#stats-range').addEventListener('change', (e) => { statsState.range = +e.target.value; renderStats(); });
  $('#stats-tiers').addEventListener('change', (e) => { statsState.tiers = e.target.value; renderStats(); });

  /* ============================================================ CHECK NUMBER */
  function tierBadge(t) {
    const cls = t <= 3 ? 't' + t : '';
    return `<span class="tier-badge ${cls}">${I18N.t('tier.' + t)}</span>`;
  }
  function renderCheck() {
    rendered.add('check');
    const run = () => {
      const num = $('#check-input').value.trim();
      if (!/^\d{3,4}$/.test(num)) {
        $('#check-summary').innerHTML = `<div class="callout warn">${t('c.err34')}</div>`;
        $('#check-table').innerHTML = '';
        return;
      }
      const is3D = num.length === 3;
      const usePerm = $('#check-perm').checked;
      const stems = usePerm ? MY4D.permutations(num) : [num];
      // 3-digit (3D rule): expand each stem to the 10 full numbers ending with it
      const targets = is3D
        ? [...new Set(stems.flatMap((s) => Array.from({ length: 10 }, (_, d) => d + s)))]
        : stems;
      const rows = [];
      for (const t of targets) for (const w of MY4D.winsOf(t)) rows.push({ num: t, ...w });
      rows.sort((a, b) => (a.draw.d < b.draw.d ? 1 : -1));
      const top3 = rows.filter((r) => r.tier <= 3).length;
      const permN = usePerm ? stems.length - 1 : 0;
      $('#check-summary').innerHTML = rows.length
        ? `<div class="callout">${t(is3D ? 'c.sum3' : 'c.wonSummary', { num, perm: permN ? t('c.permSuffix', { n: permN }) : '', n: rows.length, top3, from: fmtDate(MY4D.dates[0]), to: fmtDate(MY4D.dates[MY4D.dates.length - 1]) })}</div>`
        : `<div class="callout">${t(is3D ? 'c.never3' : 'c.neverWon', { num, perm: usePerm ? t('c.neverPerm') : '', draws: MY4D.draws.length.toLocaleString() })}</div>`;
      $('#check-table').innerHTML = rows.length
        ? `<thead><tr><th>${t('c.h.date')}</th><th>${t('c.h.op')}</th><th>${t('c.h.num')}</th><th>${t('c.h.prize')}</th><th>${t('c.h.drawNo')}</th></tr></thead><tbody>` +
          rows.map((r) => `<tr>
              <td>${fmtDate(r.draw.d)}</td>
              <td><span class="op-dot ${r.draw.o}"></span>${MY4D.OPS[r.draw.o].short}</td>
              <td class="num">${r.num}</td>
              <td>${tierBadge(r.tier)}</td>
              <td>${r.draw.n}</td>
            </tr>`).join('') + '</tbody>'
        : '';
    };
    $('#check-btn').onclick = run;
    $('#check-input').onkeydown = (e) => { if (e.key === 'Enter') run(); };
    $('#check-perm').onchange = run;
  }

  /* ============================================================ ANALYZER */
  function renderAnalyzer() {
    rendered.add('analyzer');
    const run = () => {
      const raw = $('#ana-input').value.trim();
      const out = $('#ana-out');
      if (!/^\d{3,4}$/.test(raw)) {
        out.innerHTML = `<div class="callout warn">${t('c.err34')}</div>`;
        return;
      }
      const is3D = raw.length === 3;
      const display = is3D ? '\u00b7\u00b7' + raw : raw;
      const poss = is3D ? 1000 : 10000;
      const fullsOf = (stem) => (is3D ? Array.from({ length: 10 }, (_, d) => d + stem) : [stem]);

      // aggregate profile over the target full numbers (1 for straight, 10 for a 3D ending)
      const lastDate = MY4D.dates[MY4D.dates.length - 1];
      const profileFor = (nums) => {
        const wins = [];
        for (const n of nums) for (const w of MY4D.winsOf(n)) wins.push(w);
        const byTier = {}; const byWd = {};
        for (const w of wins) {
          byTier[w.tier] = (byTier[w.tier] || 0) + 1;
          byWd[w.draw.wd] = (byWd[w.draw.wd] || 0) + 1;
        }
        const ds = wins.map((w) => w.draw.d).sort();
        const gaps = [];
        for (let i = 1; i < ds.length; i++) gaps.push((new Date(ds[i]) - new Date(ds[i - 1])) / 86400000);
        return {
          wins, byTier, byWd,
          lastSeen: ds[ds.length - 1] || null,
          currentGapDays: ds.length ? Math.round((new Date(lastDate) - new Date(ds[ds.length - 1])) / 86400000) : null,
          avgGapDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
        };
      };
      const prof = profileFor(fullsOf(raw));

      // weekday naive-Bayes score: last-3 positions for an ending, all 4 for straight
      const model = STATS.weekdayModel(MY4D.draws, true);
      const digits = [...raw].map((c) => c.charCodeAt(0) - 48);
      const scores = Object.keys(model).map((wd) => {
        const pr = model[wd].probs;
        const p = is3D
          ? pr[1][digits[0]] * pr[2][digits[1]] * pr[3][digits[2]]
          : pr[0][digits[0]] * pr[1][digits[1]] * pr[2][digits[2]] * pr[3][digits[3]];
        return { wd: +wd, p, ratio: p * poss };
      }).sort((a, b) => b.p - a.p);

      const { evBig, evSmall } = STATS.expectedValue();
      let totalNumbers = 0; // exact count: early draws may lack special/consolation tiers
      for (const dr of MY4D.draws) totalNumbers += 3 + (dr.s ? dr.s.length : 0) + (dr.c ? dr.c.length : 0);
      const expWins = totalNumbers / poss;
      const permRows = MY4D.permutations(raw).map((p) => {
        const wins = fullsOf(p).flatMap((f) => MY4D.winsOf(f));
        const ds = wins.map((w) => w.draw.d).sort();
        const last = ds[ds.length - 1] || null;
        return {
          p, n: wins.length,
          top3: wins.filter((w) => w.tier <= 3).length,
          last,
          gapDays: last ? Math.round((new Date(lastDate) - new Date(last)) / 86400000) : null,
          ratio: expWins ? wins.length / expWins : 0,
        };
      }).sort((a, b) => b.n - a.n || (a.p < b.p ? -1 : 1));
      const permWins = permRows.reduce((s, r) => s + r.n, 0);
      const boxOdds = permRows.length;
      const wdRows = Object.entries(prof.byWd).sort((a, b) => b[1] - a[1]);
      const maxWd = Math.max(1, ...wdRows.map(([, v]) => v));

      const oddsRows = is3D
        ? `<tr><td>${t('a.bet3top1')}</td><td>${t('a.oneIn1k')}</td><td colspan="2" rowspan="3">${t('a.check3prize')}</td></tr>
           <tr><td>${t('a.bet3top3')}</td><td>${t('a.threeIn1k')}</td></tr>
           <tr><td>${t('a.bet3any')}</td><td>${t('a.t23of1k')}</td></tr>`
        : `<tr><td>${t('a.betStraight1')}</td><td>${t('a.oneIn10k')}</td><td>RM ${STATS.PRIZES.big['1st']} (${t('a.big')}) / RM ${STATS.PRIZES.small['1st']} (${t('a.small')})</td><td rowspan="3">${t('a.big')} \u2248 RM ${evBig.toFixed(2)}<br>${t('a.small')} \u2248 RM ${evSmall.toFixed(2)}</td></tr>
           <tr><td>${t('a.betStraightTop3')}</td><td>${t('a.threeIn10k')}</td><td>${t('a.seePrize')}</td></tr>
           <tr><td>${t('a.betAny23')}</td><td>${t('a.tt23')}</td><td>RM 60\u20132,500</td></tr>`;

      out.innerHTML = `
        <div class="tile-row">
          <div class="tile"><div class="v">${prof.wins.length}</div><div class="k">${t('a.t.total')}</div><div class="d">${t('a.t.expected', { n: expWins.toFixed(1) })}</div></div>
          <div class="tile"><div class="v">${(prof.byTier[1] || 0) + (prof.byTier[2] || 0) + (prof.byTier[3] || 0)}</div><div class="k">${t('a.t.top3')}</div></div>
          <div class="tile"><div class="v">${prof.lastSeen ? prof.currentGapDays + t('a.days') : '\u2014'}</div><div class="k">${t('a.t.sinceLast')}</div><div class="d">${prof.avgGapDays ? t('a.t.avgGap', { n: prof.avgGapDays }) : prof.lastSeen ? '' : t('a.t.neverSeen')}</div></div>
          <div class="tile"><div class="v">${permWins}</div><div class="k">${t('a.t.permWins')}</div></div>
        </div>

        <h3>${t('a.h.odds')}</h3>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>${t('a.h.bet')}</th><th>${t('a.h.chance')}</th><th>${t('a.h.prize')}</th><th>${t('a.h.ev')}</th></tr></thead>
          <tbody>${oddsRows}</tbody>
        </table></div>

        <h3>${t('a.h.weekdayWins')}</h3>
        ${wdRows.length ? `<div class="bar-list">${wdRows.map(([wd, v]) =>
          `<div class="bl-row"><span class="bl-k">${WD_LABEL(+wd)}</span>
             <span class="bl-track"><span class="bl-fill" style="width:${(100 * v / maxWd).toFixed(0)}%"></span></span>
             <span class="bl-v">${v}\u00d7</span></div>`).join('')}</div>`
        : `<p class="sub">${t('a.noWeekday')}</p>`}

        <h3>${t('a.h.perm', { n: permRows.length })}</h3>
        <p class="sub">${t('a.permSub')}</p>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>${t('a.h.permNum')}</th><th>${t('a.h.permTotal')}</th><th>${t('a.h.permTop3')}</th><th>${t('a.h.permLast')}</th><th>${t('a.h.permRatio')}</th></tr></thead>
          <tbody>${permRows.map((r) => `<tr${r.p === raw ? ' class="hl-row"' : ''}>
            <td class="num">${is3D ? '\u00b7\u00b7' + r.p : r.p}${r.p === raw ? ` <span class="you-tag">${t('a.yours')}</span>` : ''}</td>
            <td>${r.n}</td>
            <td>${r.top3}</td>
            <td>${r.last ? fmtDate(r.last) + ` <span class="dim">${t('a.daysAgo', { n: r.gapDays })}</span>` : '\u2014'}</td>
            <td style="color:${r.ratio > 1 ? 'var(--good)' : 'var(--text-secondary)'}">${r.ratio ? '\u00d7' + r.ratio.toFixed(2) : '\u2014'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="callout">${is3D ? t('a.ibox3', { n: boxOdds }) : t('a.ibox', { n: boxOdds, ev: evBig.toFixed(2) })}</div>

        <h3>${t('a.h.wdModel')}</h3>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>${t('a.h.day')}</th><th>${t('a.h.pnd')}</th><th>${is3D ? t('a.h.vsFair3') : t('a.h.vsFair')}</th></tr></thead>
          <tbody>${scores.map((s) => `<tr>
            <td>${WD_LABEL(s.wd)}</td>
            <td>${s.p.toExponential(2)}</td>
            <td style="color:${s.ratio >= 1 ? 'var(--good)' : 'var(--text-secondary)'}">${s.ratio >= 1 ? '+' : ''}${((s.ratio - 1) * 100).toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
        </table></div>

        <div class="callout warn">${is3D ? t('a.reality3') : t('a.reality', { loss: (1 - evBig).toFixed(2) })}</div>

        <details class="explain">
          <summary>${t('a.exSummary', { n: expWins.toFixed(1) })}</summary>
          <div class="ex-body">${t('a.exBody', { total: totalNumbers.toLocaleString(), n: expWins.toFixed(1), poss: poss.toLocaleString(), fairNote: t(is3D ? 'a.fairNote3' : 'a.fairNote4') })}</div>
        </details>

        <button class="btn-primary" id="ana-share" style="margin-top:12px">${t('share.analysis')}</button>`;
      $('#ana-share').onclick = () => {
        const lines = [t('share.anaTitle', { num: display }), ''];
        lines.push(t('share.anaWins', { n: prof.wins.length, exp: expWins.toFixed(1) }));
        lines.push(t('share.anaTop3', { n: (prof.byTier[1] || 0) + (prof.byTier[2] || 0) + (prof.byTier[3] || 0) }));
        lines.push(prof.lastSeen ? t('share.anaLast', { date: fmtDate(prof.lastSeen) }) : t('share.anaNever'));
        lines.push('');
        lines.push(t('share.anaHonest'));
        lines.push(t('share.via') + ' \u00b7 https://kth2.github.io/4D-number-app/');
        shareText(lines.join('\n'));
      };
    };
    $('#ana-btn').onclick = run;
    $('#ana-input').onkeydown = (e) => { if (e.key === 'Enter') run(); };
  }

  /* ============================================================ WEEKDAY MODEL */
  const wdState = { op: 'ALL' };
  function renderWeekday() {
    rendered.add('weekday');
    opChips('#wd-op-chips', wdState, renderWeekday);
    const scope = MY4D.filtered({ op: wdState.op });
    const days = [3, 6, 0, 2];

    const rows = days.map((wd) => ({ wd, r: STATS.weekdayChi(scope, wd, true) })).filter((x) => x.r);
    $('#wd-chi-table').innerHTML =
      `<thead><tr><th>${t('w.h.day')}</th><th>${t('w.h.draws')}</th><th>${t('w.h.numbers')}</th><th>${t('w.h.chi')}</th><th>${t('w.h.p')}</th><th>${t('w.h.verdict')}</th></tr></thead><tbody>` +
      rows.map(({ wd, r }) => `<tr>
        <td>${WD_LABEL(wd)}</td><td>${r.nDraws}</td><td>${r.nNumbers.toLocaleString()}</td>
        <td>${r.chiAll.toFixed(1)}</td><td>${r.pAll < 0.001 ? r.pAll.toExponential(1) : r.pAll.toFixed(3)}</td>
        <td>${r.pAll < 0.05 ? t('w.deviates') : t('w.consistent')}</td>
      </tr>`).join('') + '</tbody>';
    const anySig = rows.some(({ r }) => r.pAll < 0.05);
    $('#wd-chi-verdict').innerHTML = anySig ? t('w.someSig') : t('w.noneSig');

    const model = STATS.weekdayModel(scope, true);
    const drawHeat = () => {
      const wd = +$('#wd-day').value;
      const entry = model[wd];
      if (!entry) { $('#wd-heat').innerHTML = `<div class="empty">${t('w.noData')}</div>`; $('#wd-ml-out').innerHTML = ''; return; }
      CHARTS.heatmap($('#wd-heat'), entry.counts,
        [1, 2, 3, 4].map((n) => t('pos.axis', { n })),
        [...Array(10).keys()].map(String),
        { tipFn: (i, j, v) => `<strong>${WD_LABEL(wd)}</strong>: ${t('s.heatTip', { d: j, p: i + 1 })} <span class="tt-k">·</span> ${v}× (${(100 * v / entry.nNumbers).toFixed(1)}%)` });
      const tops = STATS.topDigits(model, wd);
      $('#wd-ml-out').innerHTML = `
        <div class="tile-row">${tops.map((tp) => `
          <div class="tile">
            <div class="v">${tp.best.digit}</div>
            <div class="k">${t('w.pos', { n: tp.pos + 1 })}</div>
            <div class="d">${t('w.vsUniform', { p: (100 * tp.best.p).toFixed(1), d: tp.runnerUp.digit })}</div>
          </div>`).join('')}</div>
        <p class="sub" style="margin-top:8px">${t('w.composite', { day: WD_LABEL(wd), num: tops.map((tp) => tp.best.digit).join(''), draws: entry.nDraws, numbers: entry.nNumbers.toLocaleString() })}</p>`;
    };
    $('#wd-day').onchange = drawHeat;
    drawHeat();
  }

  /* ============================================================ PREDICT */
  const predState = { op: 'ALL' };
  function renderPredict() {
    rendered.add('predict');
    opChips('#pred-op-chips', predState, renderPredict);
    const scope = MY4D.filtered({ op: predState.op });

    // next scheduled draw: first Wed/Sat/Sun after the last date in the data
    const last = new Date(meta.lastDate + 'T00:00:00');
    const next = new Date(last);
    do { next.setDate(next.getDate() + 1); } while (![0, 3, 6].includes(next.getDay()));
    const nextIso = next.toISOString().slice(0, 10);
    const wd = next.getDay();

    $('#pred-title').textContent = t('p.title', { date: fmtDate(nextIso) });
    const model = STATS.decayedModel(scope, wd);
    const mkModel = STATS.markovModel(scope, wd);
    if (!model || !mkModel) { $('#pred-out').innerHTML = `<div class="empty">${t('p.notEnough')}</div>`; return; }
    $('#pred-sub').textContent = t('p.sub', {
      n: model.nDraws.toLocaleString(), day: WD_LABEL(wd),
      scope: predState.op === 'ALL' ? t('p.scopeAll') : t('p.scopeOp', { op: MY4D.OPS[predState.op].name }),
    });
    const chips = (picks) => `<div class="pred-grid">${picks.map((pk, i) => `
        <div class="pred-chip">
          <span class="pred-rank">#${i + 1}</span>
          <span class="pred-num">${pk.num}</span>
          <span class="pred-edge">${t('p.vsUniform', { sign: pk.ratio >= 1 ? '+' : '', pct: ((pk.ratio - 1) * 100).toFixed(1) })}</span>
        </div>`).join('')}</div>`;
    $('#pred-out').innerHTML = `
      <h3>${t('p.h.nb')}</h3>
      ${chips(STATS.predictTop(model.probs, 6))}
      <h3>${t('p.h.mk')}</h3>
      ${chips(STATS.markovTop(mkModel, 6))}
      <p class="sub" style="margin-top:10px">${t('p.edgeNote')}</p>`;
    $('#bt-out').innerHTML = '';
    $('#bt-btn').onclick = () => {
      $('#bt-out').innerHTML = `<p class="sub" style="margin-top:10px">${t('p.testing')}</p>`;
      setTimeout(() => {
        const r = STATS.backtest(scope, { testN: 200, k: 23 });
        const best = r.models[0];
        const bestRatio = r.randExp ? best.hits / r.randExp : 0;
        const rows = r.models.map((m, i) => ({
          rank: i + 1, name: t('p.m.' + m.key), hits: m.hits,
          ratio: r.randExp ? m.hits / r.randExp : 0,
        }));
        $('#bt-out').innerHTML = `
          <div class="tile-row" style="margin-top:12px">
            <div class="tile"><div class="v">${r.tested}</div><div class="k">${t('p.t.replayed')}</div><div class="d">${t('p.t.topk', { k: r.k })}</div></div>
            <div class="tile"><div class="v">${r.randExp.toFixed(1)}</div><div class="k">${t('p.t.randExp')}</div><div class="d">${t('p.t.bar')}</div></div>
          </div>
          <div class="table-scroll"><table class="data">
            <thead><tr><th>${t('p.h.rank')}</th><th>${t('p.h.model')}</th><th>${t('p.h.hits')}</th><th>${t('p.h.vsRandom')}</th></tr></thead>
            <tbody>
              ${rows.map((m) => `<tr>
                <td>${m.rank}</td><td>${m.name}</td><td>${m.hits}</td>
                <td style="color:${m.ratio > 1 ? 'var(--good)' : 'var(--text-secondary)'}">×${m.ratio.toFixed(2)}</td>
              </tr>`).join('')}
              <tr><td>—</td><td class="dim">${t('p.m.rand')}</td><td class="dim">${r.randExp.toFixed(1)}</td><td class="dim">×1.00</td></tr>
            </tbody>
          </table></div>
          <h3>${t('p.h.cum')}</h3>
          <p class="sub">${t('p.cumSub')}</p>
          <div class="legend">
            <span><span class="sw" style="background:var(--series-1)"></span>${t('p.l.nb')}</span>
            <span><span class="sw" style="background:var(--series-2)"></span>${t('p.l.mk')}</span>
            <span><span class="sw" style="background:var(--series-3)"></span>${t('p.l.hot')}</span>
            <span><span class="sw" style="background:var(--text-muted)"></span>${t('p.l.rand')}</span>
          </div>
          <div class="chart-wrap" id="bt-chart"></div>
          <div class="callout warn">${t('p.verdict', { name: t('p.m.' + best.key), ratio: bestRatio.toFixed(2), n: r.tested })}</div>`;
        const fmtShort = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(I18N.lang === 'zh' ? 'zh-CN' : 'en-MY', { day: 'numeric', month: 'short' });
        CHARTS.lines($('#bt-chart'), {
          xLabels: r.series.map((s) => fmtShort(s.d)),
          series: [
            { name: t('p.l.nb'), color: 'var(--series-1)', values: r.series.map((s) => s.nb) },
            { name: t('p.l.mk'), color: 'var(--series-2)', values: r.series.map((s) => s.mk) },
            { name: t('p.l.hot'), color: 'var(--series-3)', values: r.series.map((s) => s.hot) },
            { name: t('p.l.rand'), color: 'var(--text-muted)', values: r.series.map((s) => s.exp), dash: true },
          ],
        });
      }, 30);
    };
  }

  /* ============================================================ ABOUT */
  function renderAbout() {
    rendered.add('about');
    const sample = meta.source === 'synthetic-sample';
    $('#about-data').innerHTML = `
      <h3>${t('ab.dataH')}</h3>
      <p class="sub" style="margin-bottom:8px">${t('ab.dataP', {
        total: meta.totalDraws.toLocaleString(), from: fmtDate(meta.firstDate), to: fmtDate(meta.lastDate),
        source: meta.source, gen: meta.generated ? t('ab.dataGen', { date: meta.generated }) : '',
      })}</p>
      ${sample ? `<div class="callout warn">${t('ab.sampleWarn')}</div>` : ''}`;
  }

  /* ---------- dispatch ---------- */
  function render(view) {
    ({ results: renderResults, stats: renderStats, check: renderCheck,
       analyzer: renderAnalyzer, weekday: renderWeekday, predict: renderPredict,
       about: renderAbout }[view] || (() => {}))();
  }
  render('results');
})();
