/* Statistics + probability engine.
   All functions take arrays of enriched draw records (see data.js). */
const STATS = (() => {

  /* ---- frequency of full 4-digit numbers ---- */
  function numberFrequency(draws, topOnly) {
    const freq = new Map();
    for (const dr of draws) {
      for (const [num] of MY4D.numbersOf(dr, topOnly)) {
        freq.set(num, (freq.get(num) || 0) + 1);
      }
    }
    return freq;
  }

  /* ---- 4x10 matrix: counts of digit d at position p ---- */
  function digitPositionCounts(draws, topOnly) {
    const m = Array.from({ length: 4 }, () => new Array(10).fill(0));
    let total = 0;
    for (const dr of draws) {
      for (const [num] of MY4D.numbersOf(dr, topOnly)) {
        for (let p = 0; p < 4; p++) m[p][num.charCodeAt(p) - 48]++;
        total++;
      }
    }
    return { m, total };
  }

  /* ---- hot numbers: top-k by frequency ---- */
  function hot(freq, k) {
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k);
  }

  /* ---- cold/overdue: numbers whose last appearance is oldest ---- */
  function cold(draws, topOnly, k) {
    const last = new Map(); // num -> {date, count}
    for (const dr of draws) {
      for (const [num] of MY4D.numbersOf(dr, topOnly)) {
        const rec = last.get(num);
        if (rec) { rec.count++; if (dr.d > rec.d) rec.d = dr.d; }
        else last.set(num, { d: dr.d, count: 1 });
      }
    }
    const lastDate = draws.length ? draws[draws.length - 1].d : null;
    const out = [...last.entries()]
      .map(([num, rec]) => ({
        num, lastSeen: rec.d, count: rec.count,
        gapDays: lastDate ? Math.round((new Date(lastDate) - new Date(rec.d)) / 86400000) : 0,
      }))
      .sort((a, b) => b.gapDays - a.gapDays || b.count - a.count);
    return out.slice(0, k);
  }

  /* ---- chi-square upper-tail p-value (regularized incomplete gamma Q) ---- */
  function chiSqPValue(x, df) {
    if (x <= 0) return 1;
    return gammaQ(df / 2, x / 2);
  }
  function gammaQ(a, x) {
    if (x < a + 1) return 1 - gammaPSeries(a, x);
    return gammaQContinued(a, x);
  }
  function gammaln(a) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = a, y = a, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaPSeries(a, x) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  function gammaQContinued(a, x) {
    let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }

  /* ---- weekday chi-square: per position, digits vs uniform ---- */
  function weekdayChi(draws, wd, topOnly) {
    const sub = draws.filter((d) => d.wd === wd);
    const { m, total } = digitPositionCounts(sub, topOnly);
    if (!total) return null;
    const perPos = m.map((row) => {
      const exp = total / 10;
      let chi = 0;
      for (const obs of row) chi += (obs - exp) ** 2 / exp;
      return { chi, p: chiSqPValue(chi, 9) };
    });
    const chiAll = perPos.reduce((s, r) => s + r.chi, 0);
    return { nDraws: sub.length, nNumbers: total, perPos, chiAll, pAll: chiSqPValue(chiAll, 36) };
  }

  /* ---- naive-Bayes weekday model ----
     P(number | weekday) = Π_p P(digit_p at position p | weekday), Laplace-smoothed.
     Under a fair lottery this equals 1e-4 in expectation; the ratio to 1e-4 is the
     (noise-driven) "edge" the model reports. */
  function weekdayModel(draws, topOnly) {
    const model = {}; // wd -> {probs: 4x10, nNumbers}
    for (const wd of [0, 2, 3, 6]) {
      const sub = draws.filter((d) => d.wd === wd);
      const { m, total } = digitPositionCounts(sub, topOnly);
      if (!total) continue;
      const probs = m.map((row) => row.map((c) => (c + 1) / (total + 10)));
      model[wd] = { probs, counts: m, nNumbers: total, nDraws: sub.length };
    }
    return model;
  }
  function scoreNumber(model, num) {
    const out = [];
    for (const wd of Object.keys(model)) {
      const { probs } = model[wd];
      let p = 1;
      for (let i = 0; i < 4; i++) p *= probs[i][num.charCodeAt(i) - 48];
      out.push({ wd: +wd, p, ratio: p / 1e-4 });
    }
    out.sort((a, b) => b.p - a.p);
    return out;
  }
  function topDigits(model, wd) {
    const entry = model[wd];
    if (!entry) return null;
    return entry.probs.map((row, pos) => {
      const ranked = row.map((p, digit) => ({ digit, p })).sort((a, b) => b.p - a.p);
      return { pos, best: ranked[0], runnerUp: ranked[1] };
    });
  }

  /* ---- prediction model: recency-weighted naive Bayes per draw day ----
     Each historical number contributes to per-position digit weights with an
     exponential decay (default half-life 2 years), so recent draws matter more.
     This is a genuine ML approach — and the walk-forward backtest below exists
     to measure honestly whether it beats random (in a fair lottery: it can't). */
  function decayedModel(draws, wd, halfLifeDays = 730) {
    const sub = draws.filter((d) => d.wd === wd);
    if (!sub.length) return null;
    const lastT = sub[sub.length - 1].date.getTime();
    const m = Array.from({ length: 4 }, () => new Array(10).fill(0));
    let total = 0;
    for (const dr of sub) {
      const w = Math.pow(0.5, (lastT - dr.date.getTime()) / (halfLifeDays * 86400000));
      for (const [num] of MY4D.numbersOf(dr, false)) {
        for (let p = 0; p < 4; p++) m[p][num.charCodeAt(p) - 48] += w;
        total += w;
      }
    }
    const probs = m.map((row) => row.map((c) => (c + 1) / (total + 10)));
    return { probs, nDraws: sub.length };
  }

  /* Rank scored numbers; scores are log-probabilities over all 10,000. */
  function topK(scores, k) {
    const idx = Array.from({ length: 10000 }, (_, i) => i)
      .sort((a, b) => scores[b] - scores[a]).slice(0, k);
    return idx.map((n) => {
      const p = Math.exp(scores[n]);
      return { num: String(n).padStart(4, '0'), p, ratio: p / 1e-4 };
    });
  }

  function nbScores(probs) {
    const lp = probs.map((row) => row.map(Math.log));
    const scores = new Float64Array(10000);
    for (let n = 0; n < 10000; n++) {
      scores[n] = lp[0][(n / 1000) | 0] + lp[1][((n / 100) | 0) % 10] +
                  lp[2][((n / 10) | 0) % 10] + lp[3][n % 10];
    }
    return scores;
  }

  function predictTop(probs, k) { return topK(nbScores(probs), k); }

  /* ---- Markov chain model: P(d1)·P(d2|d1)·P(d3|d2)·P(d4|d3) ----
     Captures digit-pair structure the position-independent NB cannot,
     with the same recency decay and per-draw-day training. */
  function markovModel(draws, wd, halfLifeDays = 730) {
    const sub = draws.filter((d) => d.wd === wd);
    if (!sub.length) return null;
    const lastT = sub[sub.length - 1].date.getTime();
    const first = new Array(10).fill(0);
    const trans = Array.from({ length: 3 }, () => Array.from({ length: 10 }, () => new Array(10).fill(0)));
    let total = 0;
    for (const dr of sub) {
      const w = Math.pow(0.5, (lastT - dr.date.getTime()) / (halfLifeDays * 86400000));
      for (const [num] of MY4D.numbersOf(dr, false)) {
        const d = [...num].map((c) => c.charCodeAt(0) - 48);
        first[d[0]] += w;
        for (let i = 0; i < 3; i++) trans[i][d[i]][d[i + 1]] += w;
        total += w;
      }
    }
    return { first, trans, total, nDraws: sub.length };
  }

  function markovScores(model) {
    const lpFirst = model.first.map((c) => Math.log((c + 1) / (model.total + 10)));
    const lpTrans = model.trans.map((mat) => mat.map((row) => {
      const rowTot = row.reduce((a, b) => a + b, 0);
      return row.map((c) => Math.log((c + 1) / (rowTot + 10)));
    }));
    const scores = new Float64Array(10000);
    for (let n = 0; n < 10000; n++) {
      const d1 = (n / 1000) | 0, d2 = ((n / 100) | 0) % 10, d3 = ((n / 10) | 0) % 10, d4 = n % 10;
      scores[n] = lpFirst[d1] + lpTrans[0][d1][d2] + lpTrans[1][d2][d3] + lpTrans[2][d3][d4];
    }
    return scores;
  }

  function markovTop(model, k) { return topK(markovScores(model), k); }

  /* Walk-forward model-vs-model backtest: for each of the last testN draws,
     every model trains only on earlier draws, predicts top-k numbers, and we
     count real hits per model against the k-random-picks expectation. */
  function backtest(draws, { testN = 200, k = 23 } = {}) {
    const nb = {};      // wd -> {m: 4x10, total}
    const mk = {};      // wd -> {first[10], trans[3][10][10], total}
    const hot = new Map(); // full-number frequency, all days
    const startIdx = Math.max(0, draws.length - testN);
    let tested = 0, randExp = 0;
    const hits = { nb: 0, mk: 0, hot: 0 };
    const series = []; // cumulative hits after each tested draw

    draws.forEach((dr, i) => {
      const cn = nb[dr.wd], cm = mk[dr.wd];
      if (i >= startIdx && cn && cn.total > 5000) {
        const probs = cn.m.map((row) => row.map((x) => (x + 1) / (cn.total + 10)));
        const nbSet = new Set(topK(nbScores(probs), k).map((t) => t.num));
        const mkSet = new Set(topK(markovScores({ first: cm.first, trans: cm.trans, total: cm.total }), k).map((t) => t.num));
        const hotSet = new Set([...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map((e) => e[0]));
        let prizes = 0;
        for (const [num] of MY4D.numbersOf(dr, false)) {
          prizes++;
          if (nbSet.has(num)) hits.nb++;
          if (mkSet.has(num)) hits.mk++;
          if (hotSet.has(num)) hits.hot++;
        }
        randExp += (prizes * k) / 10000;
        tested++;
        series.push({ d: dr.d, nb: hits.nb, mk: hits.mk, hot: hits.hot, exp: randExp });
      }
      if (!nb[dr.wd]) {
        nb[dr.wd] = { m: Array.from({ length: 4 }, () => new Array(10).fill(0)), total: 0 };
        mk[dr.wd] = { first: new Array(10).fill(0),
                      trans: Array.from({ length: 3 }, () => Array.from({ length: 10 }, () => new Array(10).fill(0))),
                      total: 0 };
      }
      for (const [num] of MY4D.numbersOf(dr, false)) {
        const d = [...num].map((c) => c.charCodeAt(0) - 48);
        for (let p = 0; p < 4; p++) nb[dr.wd].m[p][d[p]]++;
        nb[dr.wd].total++;
        mk[dr.wd].first[d[0]]++;
        for (let t = 0; t < 3; t++) mk[dr.wd].trans[t][d[t]][d[t + 1]]++;
        mk[dr.wd].total++;
        hot.set(num, (hot.get(num) || 0) + 1);
      }
    });
    return {
      tested, randExp, k, series,
      models: [
        { key: 'nb', name: 'Naive Bayes (weekday digits)', hits: hits.nb },
        { key: 'mk', name: 'Markov chain (digit pairs)', hits: hits.mk },
        { key: 'hot', name: 'Hot numbers (frequency)', hits: hits.hot },
      ].sort((a, b) => b.hits - a.hits),
    };
  }

  /* ---- profile of a single number across history ---- */
  function numberProfile(num, draws) {
    const wins = MY4D.winsOf(num).filter((w) => draws.includes(w.draw));
    const byTier = {}; const byWd = {}; const byOp = {};
    for (const w of wins) {
      byTier[w.tier] = (byTier[w.tier] || 0) + 1;
      byWd[w.draw.wd] = (byWd[w.draw.wd] || 0) + 1;
      byOp[w.draw.o] = (byOp[w.draw.o] || 0) + 1;
    }
    const dates = wins.map((w) => w.draw.d).sort();
    const lastDate = MY4D.dates[MY4D.dates.length - 1];
    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
    }
    return {
      num, wins, byTier, byWd, byOp,
      firstSeen: dates[0] || null,
      lastSeen: dates[dates.length - 1] || null,
      currentGapDays: dates.length ? Math.round((new Date(lastDate) - new Date(dates[dates.length - 1])) / 86400000) : null,
      avgGapDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    };
  }

  /* ---- theoretical odds & expected value (standard RM1 bet, typical prize table) ---- */
  const PRIZES = {
    big:   { '1st': 2500, '2nd': 1000, '3rd': 500, special: 180, consolation: 60 },
    small: { '1st': 3500, '2nd': 2000, '3rd': 1000 },
  };
  function expectedValue() {
    const b = PRIZES.big;
    const evBig = (b['1st'] + b['2nd'] + b['3rd'] + 10 * b.special + 10 * b.consolation) / 10000;
    const s = PRIZES.small;
    const evSmall = (s['1st'] + s['2nd'] + s['3rd']) / 10000;
    return { evBig, evSmall };
  }

  return { numberFrequency, digitPositionCounts, hot, cold, chiSqPValue, weekdayChi,
           weekdayModel, scoreNumber, topDigits, numberProfile, PRIZES, expectedValue,
           decayedModel, predictTop, markovModel, markovTop, backtest };
})();
