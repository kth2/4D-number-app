/* Data layer: loads data/draws.json and builds lookup indexes.
   Draw record schema (my4d-draws-v1):
     o: operator code M|D|T
     d: ISO date, n: draw number label
     p: [1st, 2nd, 3rd]   s: [10 special]   c: [10 consolation]
     x: 1 if special (off-calendar) draw
*/
const MY4D = (() => {
  const OPS = {
    M: { name: 'Magnum 4D', short: 'Magnum', cssVar: '--series-1' },
    D: { name: 'Da Ma Cai 1+3D', short: 'Da Ma Cai', cssVar: '--series-2' },
    T: { name: 'Sports Toto 4D', short: 'Sports Toto', cssVar: '--series-3' },
  };
  const TIERS = { 1: '1st prize', 2: '2nd prize', 3: '3rd prize', 4: 'Special', 5: 'Consolation' };
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let raw = null;
  let draws = [];          // enriched, sorted by date asc
  let dates = [];          // unique ISO dates asc
  let byNumber = new Map();// "1234" -> [{draw, tier}]
  let tag = '';            // ETag/Last-Modified of the currently loaded snapshot

  /* Iterate a draw's numbers as [number, tierId]; topOnly limits to 1st-3rd. */
  function* numbersOf(draw, topOnly) {
    for (let i = 0; i < 3; i++) if (draw.p[i]) yield [draw.p[i], i + 1];
    if (topOnly) return;
    for (const n of draw.s || []) yield [n, 4];
    for (const n of draw.c || []) yield [n, 5];
  }

  async function load() {
    const res = await fetch('data/draws.json');
    if (!res.ok) throw new Error('Failed to load data/draws.json: ' + res.status);
    tag = res.headers.get('ETag') || res.headers.get('Last-Modified') || '';
    raw = await res.json();
    draws = raw.draws.map((r) => {
      const date = new Date(r.d + 'T00:00:00');
      return Object.assign({}, r, { date, wd: date.getDay() });
    });
    draws.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.o.localeCompare(b.o)));

    const dset = new Set();
    byNumber = new Map();
    for (const dr of draws) {
      dset.add(dr.d);
      for (const [num, tier] of numbersOf(dr, false)) {
        let arr = byNumber.get(num);
        if (!arr) byNumber.set(num, (arr = []));
        arr.push({ draw: dr, tier });
      }
    }
    dates = [...dset].sort();
    return meta();
  }

  /* Cheap check (headers only, bypasses the service-worker cache) for whether the
     server has a newer draws.json than the one currently loaded. */
  async function hasUpdate() {
    try {
      const res = await fetch('data/draws.json', { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return false;
      const fresh = res.headers.get('ETag') || res.headers.get('Last-Modified') || '';
      return !!fresh && !!tag && fresh !== tag;
    } catch {
      return false;
    }
  }

  function meta() {
    return {
      source: raw.source,
      generated: raw.generated,
      note: raw.note || '',
      totalDraws: draws.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    };
  }

  function filtered({ op = 'ALL', sinceDays = 0, topOnly = true } = {}) {
    let out = draws;
    if (op !== 'ALL') out = out.filter((d) => d.o === op);
    if (sinceDays > 0) {
      const cutoff = new Date(new Date(dates[dates.length - 1] + 'T00:00:00').getTime() - sinceDays * 86400000);
      out = out.filter((d) => d.date >= cutoff);
    }
    return out;
  }

  const drawsOn = (iso) => draws.filter((d) => d.d === iso);
  const winsOf = (num) => byNumber.get(num) || [];

  /* Most recent draw for an operator on or before the given date. */
  function latestFor(op, iso) {
    for (let i = draws.length - 1; i >= 0; i--) {
      if (draws[i].o === op && draws[i].d <= iso) return draws[i];
    }
    return null;
  }

  /* All distinct digit-permutations of a 4-char number string. */
  function permutations(num) {
    const out = new Set();
    const a = num.split('');
    (function perm(cur, rest) {
      if (!rest.length) { out.add(cur.join('')); return; }
      for (let i = 0; i < rest.length; i++) {
        perm(cur.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1)));
      }
    })([], a);
    return [...out];
  }

  return { OPS, TIERS, WEEKDAYS, load, hasUpdate, meta, filtered, drawsOn, winsOf, latestFor, permutations, numbersOf,
           get draws() { return draws; }, get dates() { return dates; } };
})();
