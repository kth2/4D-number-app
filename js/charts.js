/* Minimal SVG chart helpers: column chart + heatmap, with hover tooltips.
   Colors are CSS custom properties so light/dark swap automatically. */
const CHARTS = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tooltip = () => document.getElementById('viz-tooltip');

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  function showTip(evt, html) {
    const t = tooltip();
    t.innerHTML = html;
    t.style.display = 'block';
    t.style.left = evt.pageX + 'px';
    t.style.top = evt.pageY + 'px';
  }
  function hideTip() { tooltip().style.display = 'none'; }

  /* Vertical column chart. data: [{label, value, tip}] */
  function columns(container, data, { height = 220, fill = 'var(--seq-450, var(--seq-400))' } = {}) {
    container.innerHTML = '';
    if (!data.length) { container.innerHTML = '<div class="empty">No data in this scope.</div>'; return; }
    const W = 720, H = height + 18, padL = 34, padB = 52, padT = 12;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, container);
    const max = Math.max(...data.map((d) => d.value));
    const innerW = W - padL - 8, innerH = H - padT - padB;
    const step = innerW / data.length;
    const barW = Math.min(26, step - 2);

    // hairline gridlines + y ticks (4 ticks)
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const y = padT + innerH - (innerH * v) / max;
      el('line', { x1: padL, x2: W - 8, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      const t = el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-muted)' }, svg);
      t.textContent = Math.round(v);
    }
    // baseline
    el('line', { x1: padL, x2: W - 8, y1: padT + innerH, y2: padT + innerH, stroke: 'var(--axis)', 'stroke-width': 1 }, svg);

    data.forEach((d, i) => {
      const h = max ? (innerH * d.value) / max : 0;
      const x = padL + i * step + (step - barW) / 2;
      const y = padT + innerH - h;
      const bar = el('rect', {
        x, y, width: barW, height: h,
        rx: 4, ry: 4,
        style: `fill:${fill}`,
      }, svg);
      // square off the bottom corners (rounded data-end only, anchored baseline)
      el('rect', { x, y: Math.max(y, padT + innerH - 4), width: barW, height: Math.min(4, h), style: `fill:${fill}` }, svg);
      // x label
      const t = el('text', {
        x: x + barW / 2, y: padT + innerH + 14, 'text-anchor': 'middle',
        'font-size': 10.5, fill: 'var(--text-secondary)',
        transform: `rotate(45 ${x + barW / 2} ${padT + innerH + 14})`,
      }, svg);
      t.textContent = d.label;
      // hover hit target (wider than the mark)
      const hit = el('rect', { x: padL + i * step, y: padT, width: step, height: innerH, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', (e) => showTip(e, d.tip || `<strong>${d.label}</strong> <span class="tt-k">·</span> ${d.value}`));
      hit.addEventListener('mouseleave', hideTip);
    });
  }

  /* Heatmap rows×cols. m: rows of numbers; rowLabels/colLabels arrays. */
  function heatmap(container, m, rowLabels, colLabels, { tipFn } = {}) {
    container.innerHTML = '';
    const rows = m.length, cols = m[0].length;
    const cw = 60, ch = 40, padL = 84, padT = 28;
    const W = padL + cols * cw + 8, H = padT + rows * ch + 8;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, container);
    const flat = m.flat();
    const lo = Math.min(...flat), hi = Math.max(...flat);
    const steps = ['var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)',
                   'var(--seq-500)', 'var(--seq-600)', 'var(--seq-700)'];
    const bucket = (v) => hi === lo ? 3 : Math.min(steps.length - 1, Math.floor(((v - lo) / (hi - lo)) * steps.length));

    colLabels.forEach((c, j) => {
      const t = el('text', { x: padL + j * cw + cw / 2, y: padT - 8, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--text-muted)' }, svg);
      t.textContent = c;
    });
    rowLabels.forEach((r, i) => {
      const t = el('text', { x: padL - 10, y: padT + i * ch + ch / 2 + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--text-secondary)' }, svg);
      t.textContent = r;
    });
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = m[i][j];
        const idx = bucket(v);
        const cell = el('rect', {
          x: padL + j * cw + 1, y: padT + i * ch + 1, width: cw - 2, height: ch - 2,
          rx: 4, style: `fill:${steps[idx]}`,
        }, svg);
        // value label, ink switches with cell darkness
        const t = el('text', {
          x: padL + j * cw + cw / 2, y: padT + i * ch + ch / 2 + 4,
          'text-anchor': 'middle', 'font-size': 11,
          fill: idx >= 4 ? '#ffffff' : '#10315c',
        }, svg);
        t.textContent = v;
        cell.addEventListener('mousemove', (e) =>
          showTip(e, tipFn ? tipFn(i, j, v) : `<strong>${rowLabels[i]} / ${colLabels[j]}</strong> <span class="tt-k">·</span> ${v}`));
        cell.addEventListener('mouseleave', hideTip);
        t.style.pointerEvents = 'none';
      }
    }
  }

  /* Multi-series line chart with crosshair tooltip.
     series: [{name, color, values[], dash?}] — all values arrays same length.
     xLabels: one label per index (shown sparsely on the axis, fully in tooltip). */
  function lines(container, { series, xLabels, height = 240 }) {
    container.innerHTML = '';
    const N = xLabels.length;
    if (!N) { container.innerHTML = '<div class="empty">No data.</div>'; return; }
    const W = 720, H = height, padL = 38, padR = 10, padT = 12, padB = 26;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, container);
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const x = (i) => padL + (W - padL - padR) * (N <= 1 ? 0 : i / (N - 1));
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);

    for (let t = 0; t <= 4; t++) {
      const v = (max / 4) * t;
      el('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      const txt = el('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-muted)' }, svg);
      txt.textContent = max <= 8 ? v.toFixed(1) : Math.round(v);
    }
    el('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), stroke: 'var(--axis)', 'stroke-width': 1 }, svg);
    [0, Math.floor(N / 4), Math.floor(N / 2), Math.floor(3 * N / 4), N - 1]
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((i) => {
        const t = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--text-muted)' }, svg);
        t.textContent = xLabels[i];
      });

    for (const s of series) {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      el('path', {
        d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        style: `stroke:${s.color}`, ...(s.dash ? { 'stroke-dasharray': '5 4' } : {}),
      }, svg);
    }

    const cross = el('line', { y1: padT, y2: H - padB, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 }, svg);
    const hit = el('rect', { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(N - 1, Math.round(((px - padL) / (W - padL - padR)) * (N - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 0.7);
      showTip(e, `<strong>${xLabels[i]}</strong><br>` + series.map((s) =>
        `<span class="sw" style="background:${s.color};display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px"></span>` +
        `${s.name}: <strong>${Number.isInteger(s.values[i]) ? s.values[i] : s.values[i].toFixed(1)}</strong>`).join('<br>'));
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); hideTip(); });
  }

  return { columns, heatmap, lines };
})();
