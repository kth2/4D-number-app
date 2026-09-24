/* Library layer: the passphrase-locked 千字图 / 万字图 reference.
   data/library.enc (my4d-library-enc-v1, written by tools/encrypt_library.py) is
   gzip(JSON) encrypted with AES-256-GCM under a PBKDF2-SHA256 key. The passphrase
   arrives once via an unlock link (#unlock=…) or the Library tab, and is kept in
   localStorage on this device only; the file is re-decrypted on each app start so
   a newly published library is picked up automatically.

   Decrypted schema (my4d-library-v1):
     sources: [{ id, name, name_en?, digits: 3|4, from?, count? }]
     entries: { [sourceId]: [{ n: '001', t: '天', k?: ['sky', …] }] }
*/
const LIB = (() => {
  const PASS_KEY = 'my4d-lib-pass';
  const URL_ = 'data/library.enc';

  // 'idle' | 'loading' | 'none' (not published) | 'locked' | 'bad' (wrong passphrase) | 'error' | 'ready'
  let state = 'idle';
  let sources = [];
  let generated = '';
  let byNum = new Map();   // 'src:n' -> [entry]
  let all = [];            // flat [{ src, n, t, k, hay }]
  let pending = null;

  const getPass = () => { try { return localStorage.getItem(PASS_KEY) || ''; } catch { return ''; } };
  const setPass = (p) => { try { p ? localStorage.setItem(PASS_KEY, p) : localStorage.removeItem(PASS_KEY); } catch { /* private mode */ } };
  const norm = (s) => String(s).normalize('NFKC').toLowerCase().trim();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /* Scraped text goes into innerHTML, so it is always escaped. */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function fetchEnc() {
    const res = await fetch(URL_);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* Returns the decrypted library, or null if the passphrase is wrong. */
  async function decrypt(enc, pass) {
    if (enc.schema !== 'my4d-library-enc-v1') throw new Error('unknown library format');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.kdf.salt), iterations: enc.kdf.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    } catch {
      return null; // GCM tag mismatch = wrong passphrase
    }
    const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function index(lib) {
    sources = lib.sources;
    generated = lib.generated || '';
    byNum = new Map();
    all = [];
    for (const s of sources) {
      for (const e of lib.entries[s.id] || []) {
        const row = { src: s.id, n: e.n, t: e.t, k: e.k || [] };
        row.hay = norm([e.t, ...row.k].join(' '));
        all.push(row);
        const key = s.id + ':' + e.n;
        let arr = byNum.get(key);
        if (!arr) byNum.set(key, (arr = []));
        arr.push(row);
      }
    }
  }

  async function open(pass) {
    const enc = await fetchEnc();
    if (!enc) { state = 'none'; return state; }
    if (!pass) { state = 'locked'; return state; }
    const lib = await decrypt(enc, pass);
    if (!lib) { state = 'bad'; return state; }
    index(lib);
    state = 'ready';
    return state;
  }

  /* Load once per session (concurrent callers share one attempt). reload=true
     re-reads the file, e.g. after the service worker saw a new version. */
  function ensure(reload) {
    if (!reload && (state === 'ready' || state === 'none' || state === 'locked' || state === 'bad')) return Promise.resolve(state);
    if (pending) return pending;
    state = 'loading';
    pending = open(getPass().normalize('NFC'))
      .catch(() => (state = 'error'))
      .finally(() => { pending = null; });
    return pending;
  }

  /* Try a passphrase; it is remembered only if it actually decrypts the file. */
  async function unlock(pass) {
    pass = String(pass || '').trim().normalize('NFC');
    if (!pass) return 'bad';
    if (pending) await pending;
    let st;
    try { st = await open(pass); } catch { st = state = 'error'; }
    if (st === 'ready') setPass(pass);
    return st;
  }

  function lock() {
    setPass('');
    sources = []; all = []; byNum = new Map();
    state = 'locked';
  }

  const source = (id) => sources.find((s) => s.id === id);
  const entries = (src, n) => byNum.get(src + ':' + n) || [];

  /* Every chart meaning relevant to a 3- or 4-digit number, grouped by source.
     4 digits: 4-digit charts for the number, 3-digit charts for its last 3 digits.
     3 digits: 3-digit charts for the number, 4-digit charts for every number ending in it. */
  function forNumber(num) {
    const out = [];
    for (const s of sources) {
      let rows = [];
      let via = '';
      if (num.length === s.digits) rows = entries(s.id, num);
      else if (num.length === 4 && s.digits === 3) { rows = entries(s.id, num.slice(1)); via = 'last3'; }
      else if (num.length === 3 && s.digits === 4) {
        for (let d = 0; d < 10; d++) rows = rows.concat(entries(s.id, d + num));
        via = 'ending';
      }
      if (rows.length) out.push({ source: s, rows, via });
    }
    return out;
  }

  /* Text search over meanings and aliases; digits-only queries become forNumber(). */
  function search(q, limit = 300) {
    const nq = norm(q).replace(/\s+/g, ' ');
    if (!nq) return { groups: [], total: 0, number: false };
    if (/^\d{3,4}$/.test(nq)) {
      const groups = forNumber(nq);
      return { groups, total: groups.reduce((a, g) => a + g.rows.length, 0), number: true };
    }
    const terms = nq.split(' ');
    const hits = all.filter((r) => terms.every((w) => r.hay.includes(w)));
    const groups = [];
    let shown = 0;
    for (const s of sources) {
      const rows = hits.filter((r) => r.src === s.id).slice(0, Math.max(0, limit - shown));
      shown += rows.length;
      if (rows.length) groups.push({ source: s, rows, via: '' });
    }
    return { groups, total: hits.length, number: false };
  }

  /* One block of 100 consecutive numbers of a source, e.g. block 3 = 300–399 / 0300–0399. */
  function browse(src, block) {
    const s = source(src);
    if (!s) return [];
    const rows = [];
    for (let i = block * 100; i < block * 100 + 100; i++) {
      const n = String(i).padStart(s.digits, '0');
      rows.push({ n, rows: entries(src, n) });
    }
    return rows;
  }

  return {
    ensure, unlock, lock, forNumber, search, browse, esc, source,
    get state() { return state; },
    get sources() { return sources; },
    get generated() { return generated; },
    get size() { return all.length; },
  };
})();
