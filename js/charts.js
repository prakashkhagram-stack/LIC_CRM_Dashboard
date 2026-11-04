// Small dependency-free SVG charts. Colours come from CSS variables so light/dark mode work.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nice = max => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const short = n => n >= 1e7 ? (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(n));
export function barChart(data, { height = 200, money = false, color = 'var(--c1)' } = {}) {
  const W = 560, H = height, L = 44, B = 26, T = 10, R = 8, max = nice(Math.max(0, ...data.map(d => d.value))), bw = (W - L - R) / Math.max(1, data.length);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Bar chart">`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = T + (H - T - B) * (1 - i / 4); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" class="axis">${money ? '₹' : ''}${short(v)}</text>`; }
  data.forEach((d, i) => { const h = (H - T - B) * d.value / max, x = L + i * bw + bw * .18, y = H - B - h; s += `<g><rect x="${x}" y="${y}" width="${bw * .64}" height="${Math.max(h, d.value ? 1 : 0)}" rx="3" fill="${color}"><title>${esc(d.label)}: ${money ? '₹' + d.value.toLocaleString('en-IN') : d.value}</title></rect><text x="${x + bw * .32}" y="${H - 8}" text-anchor="middle" class="axis">${esc(d.label)}</text></g>`; });
  return s + '</svg>';
}
export function donut(parts, { size = 160 } = {}) {
  const tot = parts.reduce((s, p) => s + p.value, 0), r = 56, c = 2 * Math.PI * r; let off = 0;
  let s = `<svg viewBox="0 0 160 160" width="${size}" height="${size}" class="chart" role="img" aria-label="Donut chart"><circle cx="80" cy="80" r="${r}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
  if (tot) parts.forEach(p => { const len = c * p.value / tot; s += `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${p.color}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(p.label)}: ${p.value}</title></circle>`; off += len; });
  return s + `<text x="80" y="86" text-anchor="middle" class="donut-n">${tot}</text></svg>`;
}
export function legend(parts) { return `<ul class="legend">${parts.map(p => `<li><i style="background:${p.color}"></i>${esc(p.label)} <b>${p.value}</b></li>`).join('')}</ul>`; }
export function lineChart(data, { height = 180, color = 'var(--c1)' } = {}) {
  const W = 560, H = height, L = 36, B = 24, T = 10, R = 10, max = nice(Math.max(1, ...data.map(d => d.value))), n = Math.max(1, data.length - 1);
  const pt = (d, i) => [L + (W - L - R) * i / n, T + (H - T - B) * (1 - d.value / max)];
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Line chart">`;
  for (let i = 0; i <= 4; i++) { const y = T + (H - T - B) * (1 - i / 4); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" class="axis">${short(max * i / 4)}</text>`; }
  s += `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${data.map((d, i) => pt(d, i).join(',')).join(' ')}"/>`;
  data.forEach((d, i) => { const [x, y] = pt(d, i); s += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"><title>${esc(d.label)}: ${d.value}</title></circle>`; if (i % Math.ceil(data.length / 8) === 0) s += `<text x="${x}" y="${H - 6}" text-anchor="middle" class="axis">${esc(d.label)}</text>`; });
  return s + '</svg>';
}
