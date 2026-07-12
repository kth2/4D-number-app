/* App wiring: tabs, theme, and the five views. */
(async () => {
  const $ = (sel) => document.querySelector(sel);
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const WD_LABEL = (wd) => MY4D.WEEKDAYS[wd];

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

  /* ============================================================ RESULTS */
  let resDate = meta.lastDate;
  function renderResults() {
    rendered.add('results');
    $('#res-date').value = resDate;
    $('#res-date').min = meta.firstDate;
    $('#res-date').max = meta.lastDate;
    const wrap = $('#res-tickets');
    const todays = MY4D.drawsOn(resDate);
    if (!todays.length) {
      wrap.innerHTML = `<div class="empty">No draw on ${fmtDate(resDate)}. Draws are Wed / Sat / Sun plus special Tuesdays — use ‹ › to jump to the nearest draw.</div>`;
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
          <div class="pending-body">No result for this date yet.<br>
          ${prev ? `Latest available: <a href="#" class="goto-date" data-date="${prev.d}">${fmtDate(prev.d)}</a>` : 'No earlier draws in the dataset.'}</div>
        </div>`;
      }
      return `<div class="ticket op-${code}">
        <div class="t-head">
          <strong>${op.name}</strong>
          <span>${d.x ? '<span class="special-flag">SPECIAL DRAW</span> ' : ''}${fmtDate(d.d)} · #${d.n}</span>
        </div>
        <div class="prize-top">
          <div><div class="lbl">1st prize</div><div class="num">${d.p[0]}</div></div>
          <div><div class="lbl">2nd prize</div><div class="num">${d.p[1]}</div></div>
          <div><div class="lbl">3rd prize</div><div class="num">${d.p[2]}</div></div>
        </div>
        ${d.s && d.s.length ? `<div class="mini-title">Special</div><div class="mini-nums">${d.s.map((n) => `<span>${n}</span>`).join('')}</div>` : ''}
        ${d.c && d.c.length ? `<div class="mini-title">Consolation</div><div class="mini-nums">${d.c.map((n) => `<span>${n}</span>`).join('')}</div>` : ''}
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

  /* ============================================================ STATISTICS */
  const statsState = { op: 'ALL', range: 1095, tiers: 'top3' };
  function opChips(containerId, state, onChange) {
    const c = $(containerId);
    const ops = [['ALL', 'All operators'], ['M', 'Magnum'], ['D', 'Da Ma Cai'], ['T', 'Sports Toto']];
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
      <div class="tile"><div class="v">${scope.length.toLocaleString()}</div><div class="k">draws in scope</div></div>
      <div class="tile"><div class="v">${numbersDrawn.toLocaleString()}</div><div class="k">winning numbers</div></div>
      <div class="tile"><div class="v">${hot[0] ? hot[0][0] : '—'}</div><div class="k">hottest number</div><div class="d">${hot[0] ? hot[0][1] + ' wins' : ''}</div></div>
      <div class="tile"><div class="v">${freq.size.toLocaleString()}</div><div class="k">distinct numbers seen</div><div class="d">of 10,000 possible</div></div>`;

    $('#hot-sub').textContent = `Top 15 by wins · ${topOnly ? '1st–3rd prizes' : 'all 23 prizes'} · ${statsState.range ? 'last ' + Math.round(statsState.range / 365) + ' year(s)' : 'all history'}. Expected wins per number under a fair lottery: ${(numbersDrawn / 10000).toFixed(1)}.`;
    CHARTS.columns($('#chart-hot'), hot.map(([num, v]) => ({
      label: num, value: v,
      tip: `<strong>${num}</strong> <span class="tt-k">·</span> ${v} wins`,
    })));

    CHARTS.heatmap($('#chart-heat'), m,
      ['Position 1', 'Position 2', 'Position 3', 'Position 4'],
      [...Array(10).keys()].map(String),
      { tipFn: (i, j, v) => `<strong>Digit ${j}</strong> at position ${i + 1} <span class="tt-k">·</span> ${v}× (${(100 * v / (numbersDrawn || 1)).toFixed(1)}%)` });

    $('#cold-table').innerHTML = `<thead><tr><th>Number</th><th>Last seen</th><th>Days absent</th><th>Total wins</th></tr></thead><tbody>` +
      cold.map((r) => `<tr><td class="num">${r.num}</td><td>${fmtDate(r.lastSeen)}</td><td>${r.gapDays}</td><td>${r.count}</td></tr>`).join('') + '</tbody>';
  }
  $('#stats-range').addEventListener('change', (e) => { statsState.range = +e.target.value; renderStats(); });
  $('#stats-tiers').addEventListener('change', (e) => { statsState.tiers = e.target.value; renderStats(); });

  /* ============================================================ CHECK NUMBER */
  function tierBadge(t) {
    const cls = t <= 3 ? 't' + t : '';
    return `<span class="tier-badge ${cls}">${MY4D.TIERS[t]}</span>`;
  }
  function renderCheck() {
    rendered.add('check');
    const run = () => {
      const num = $('#check-input').value.trim();
      if (!/^\d{4}$/.test(num)) {
        $('#check-summary').innerHTML = '<div class="callout warn">Enter exactly 4 digits (0000–9999).</div>';
        $('#check-table').innerHTML = '';
        return;
      }
      const usePerm = $('#check-perm').checked;
      const targets = usePerm ? MY4D.permutations(num) : [num];
      const rows = [];
      for (const t of targets) for (const w of MY4D.winsOf(t)) rows.push({ num: t, ...w });
      rows.sort((a, b) => (a.draw.d < b.draw.d ? 1 : -1));
      const top3 = rows.filter((r) => r.tier <= 3).length;
      $('#check-summary').innerHTML = rows.length
        ? `<div class="callout"><strong>${num}${usePerm ? ` (+${targets.length - 1} permutations)` : ''}</strong> won
           <strong>${rows.length}</strong> time(s) — ${top3} in the top-3 prizes — between ${fmtDate(MY4D.dates[0])} and ${fmtDate(MY4D.dates[MY4D.dates.length - 1])}.</div>`
        : `<div class="callout"><strong>${num}</strong> has never won in the loaded history${usePerm ? ' (including permutations)' : ''}. With ${MY4D.draws.length.toLocaleString()} draws that is unremarkable — most numbers appear only a handful of times.</div>`;
      $('#check-table').innerHTML = rows.length
        ? `<thead><tr><th>Date</th><th>Operator</th><th>Number</th><th>Prize</th><th>Draw #</th></tr></thead><tbody>` +
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
      const num = $('#ana-input').value.trim();
      const out = $('#ana-out');
      if (!/^\d{4}$/.test(num)) {
        out.innerHTML = '<div class="callout warn">Enter exactly 4 digits (0000–9999).</div>';
        return;
      }
      const prof = STATS.numberProfile(num, MY4D.draws);
      const model = STATS.weekdayModel(MY4D.draws, true);
      const scores = STATS.scoreNumber(model, num);
      const { evBig, evSmall } = STATS.expectedValue();
      const totalNumbers = MY4D.draws.length * 23;
      const expWins = totalNumbers / 10000;
      const permWins = MY4D.permutations(num).reduce((s, p) => s + MY4D.winsOf(p).length, 0);
      const wdRows = Object.entries(prof.byWd).sort((a, b) => b[1] - a[1]);
      const maxWd = Math.max(1, ...wdRows.map(([, v]) => v));

      out.innerHTML = `
        <div class="tile-row">
          <div class="tile"><div class="v">${prof.wins.length}</div><div class="k">total wins (any prize)</div><div class="d">expected ≈ ${expWins.toFixed(1)} under fair odds</div></div>
          <div class="tile"><div class="v">${(prof.byTier[1] || 0) + (prof.byTier[2] || 0) + (prof.byTier[3] || 0)}</div><div class="k">top-3 prize wins</div></div>
          <div class="tile"><div class="v">${prof.lastSeen ? prof.currentGapDays + 'd' : '—'}</div><div class="k">since last win</div><div class="d">${prof.avgGapDays ? 'avg gap ' + prof.avgGapDays + 'd' : prof.lastSeen ? '' : 'never seen'}</div></div>
          <div class="tile"><div class="v">${permWins}</div><div class="k">wins incl. permutations</div></div>
        </div>

        <h3>Theoretical odds (every draw, any history)</h3>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Bet</th><th>Chance per prize</th><th>Typical prize (RM1 bet)</th><th>Expected return per RM1</th></tr></thead>
          <tbody>
            <tr><td>Straight — 1st prize</td><td>1 in 10,000</td><td>RM ${STATS.PRIZES.big['1st']} (Big) / RM ${STATS.PRIZES.small['1st']} (Small)</td><td rowspan="3">Big ≈ RM ${evBig.toFixed(2)}<br>Small ≈ RM ${evSmall.toFixed(2)}</td></tr>
            <tr><td>Straight — any top-3</td><td>3 in 10,000</td><td>see prize table</td></tr>
            <tr><td>Any of 23 prizes (Big)</td><td>23 in 10,000 (0.23%)</td><td>RM 60–2,500</td></tr>
          </tbody>
        </table></div>

        <h3>Wins by weekday</h3>
        ${wdRows.length ? `<div class="bar-list">${wdRows.map(([wd, v]) =>
          `<div class="bl-row"><span class="bl-k">${WD_LABEL(+wd)}</span>
             <span class="bl-track"><span class="bl-fill" style="width:${(100 * v / maxWd).toFixed(0)}%"></span></span>
             <span class="bl-v">${v}×</span></div>`).join('')}</div>`
        : '<p class="sub">No wins recorded, so no weekday pattern to show.</p>'}

        <h3>Weekday model score (naive Bayes, top-3 prizes)</h3>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Draw day</th><th>P(number | day)</th><th>vs fair 1/10,000</th></tr></thead>
          <tbody>${scores.map((s) => `<tr>
            <td>${WD_LABEL(s.wd)}</td>
            <td>${s.p.toExponential(2)}</td>
            <td style="color:${s.ratio >= 1 ? 'var(--good)' : 'var(--text-secondary)'}">${s.ratio >= 1 ? '+' : ''}${((s.ratio - 1) * 100).toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
        </table></div>

        <div class="callout warn"><strong>Reality check:</strong> these percentages are sampling noise, not an edge.
        In a fair lottery the true probability is exactly 1/10,000 on every day, and this model's "best day"
        changes as new draws arrive. Expected loss is ≈ RM ${(1 - evBig).toFixed(2)} per RM1 Big bet no matter
        which number or day you pick.</div>`;
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
      `<thead><tr><th>Draw day</th><th>Draws</th><th>Numbers</th><th>χ² (36 df)</th><th>p-value</th><th>Verdict</th></tr></thead><tbody>` +
      rows.map(({ wd, r }) => `<tr>
        <td>${WD_LABEL(wd)}</td><td>${r.nDraws}</td><td>${r.nNumbers.toLocaleString()}</td>
        <td>${r.chiAll.toFixed(1)}</td><td>${r.pAll < 0.001 ? r.pAll.toExponential(1) : r.pAll.toFixed(3)}</td>
        <td>${r.pAll < 0.05 ? '⚠ deviates from uniform' : '✓ consistent with fair draw'}</td>
      </tr>`).join('') + '</tbody>';
    const anySig = rows.some(({ r }) => r.pAll < 0.05);
    $('#wd-chi-verdict').innerHTML = anySig
      ? '<strong>Some day(s) deviate at the 5% level.</strong> With multiple tests, occasional low p-values are expected by chance (about 1 in 20). Persistent deviation across years would be needed before reading anything into it.'
      : '<strong>No weekday shows evidence of bias</strong> — digit distributions on every draw day are consistent with a fair, uniform lottery. That is exactly what the χ² test should find in real 4D data.';

    const model = STATS.weekdayModel(scope, true);
    const drawHeat = () => {
      const wd = +$('#wd-day').value;
      const entry = model[wd];
      if (!entry) { $('#wd-heat').innerHTML = '<div class="empty">No draws for this day in scope.</div>'; $('#wd-ml-out').innerHTML = ''; return; }
      CHARTS.heatmap($('#wd-heat'), entry.counts,
        ['Position 1', 'Position 2', 'Position 3', 'Position 4'],
        [...Array(10).keys()].map(String),
        { tipFn: (i, j, v) => `<strong>${WD_LABEL(wd)}</strong>: digit ${j} at position ${i + 1} <span class="tt-k">·</span> ${v}× (${(100 * v / entry.nNumbers).toFixed(1)}%)` });
      const tops = STATS.topDigits(model, wd);
      $('#wd-ml-out').innerHTML = `
        <div class="tile-row">${tops.map((t) => `
          <div class="tile">
            <div class="v">${t.best.digit}</div>
            <div class="k">position ${t.pos + 1}</div>
            <div class="d">${(100 * t.best.p).toFixed(1)}% vs 10.0% uniform · next: ${t.runnerUp.digit}</div>
          </div>`).join('')}</div>
        <p class="sub" style="margin-top:8px">Composite “model pick” for ${WD_LABEL(wd)}:
          <strong style="font-size:16px">${tops.map((t) => t.best.digit).join('')}</strong> —
          based on ${entry.nDraws} draws (${entry.nNumbers.toLocaleString()} top-3 numbers).</p>`;
    };
    $('#wd-day').onchange = drawHeat;
    drawHeat();
  }

  /* ============================================================ ABOUT */
  function renderAbout() {
    rendered.add('about');
    const sample = meta.source === 'synthetic-sample';
    $('#about-data').innerHTML = `
      <h3>Current dataset</h3>
      <p class="sub" style="margin-bottom:8px">
        ${meta.totalDraws.toLocaleString()} draws · ${fmtDate(meta.firstDate)} → ${fmtDate(meta.lastDate)} ·
        source: <strong>${meta.source}</strong>${meta.generated ? ' · generated ' + meta.generated : ''}
      </p>
      ${sample ? `<div class="callout warn"><strong>You are looking at synthetic sample data.</strong>
        It reproduces the real draw calendar and prize structure so every feature works, but the numbers are
        simulated. Run the scrapers in <code>scrapers/</code> to replace it with real history.</div>` : ''}`;
  }

  /* ---------- dispatch ---------- */
  function render(view) {
    ({ results: renderResults, stats: renderStats, check: renderCheck,
       analyzer: renderAnalyzer, weekday: renderWeekday, about: renderAbout }[view] || (() => {}))();
  }
  render('results');
})();
