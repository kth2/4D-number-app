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
           weekdayModel, scoreNumber, topDigits, numberProfile, PRIZES, expectedValue };
})();
