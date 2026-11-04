// Visit route planning. Google Maps URLs have no waypoint optimisation, so ordering is a local suggestion only.
const R = 6371;
export function haversine(a, b) {
  const t = x => x * Math.PI / 180, dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Nearest-neighbour from `start`. Stops without coordinates are grouped by area (then name) and appended – never guessed. */
export function orderStops(stops, start) {
  const geo = stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const nogeo = stops.filter(s => !(Number.isFinite(s.lat) && Number.isFinite(s.lng)))
    .sort((a, b) => String(a.area||'').localeCompare(String(b.area||'')) || String(a.name||'').localeCompare(String(b.name||'')));
  const left = [...geo], out = []; let cur = start && Number.isFinite(start.lat) ? start : left[0];
  if (!start && left.length) out.push(left.shift());
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((s, i) => { const d = haversine(cur, s); if (d < bd) { bd = d; bi = i; } }); cur = left.splice(bi, 1)[0]; out.push(cur); }
  return { ordered: [...out, ...nogeo], withoutCoords: nogeo.length };
}
export function totalKm(stops, start) { let km = 0, p = start; for (const s of stops) { if (!Number.isFinite(s.lat)) continue; if (p && Number.isFinite(p.lat)) km += haversine(p, s); p = s; } return Math.round(km * 10) / 10; }
const loc = s => (Number.isFinite(s.lat) && Number.isFinite(s.lng)) ? `${s.lat},${s.lng}` : (s.address || '');
/** Split into Google Maps directions links of at most `max` stops each (Maps limit ~9 waypoints). */
export function mapsLinks(stops, origin, max = 9) {
  const pts = stops.filter(s => loc(s)); const links = [];
  for (let i = 0; i < pts.length; i += max) {
    const chunk = pts.slice(i, i + max), dest = chunk[chunk.length - 1], via = chunk.slice(0, -1);
    const o = i === 0 ? (origin ? (typeof origin === 'string' ? origin : loc(origin)) : '') : loc(pts[i - 1]);
    const q = new URLSearchParams({ api: '1', destination: loc(dest), travelmode: 'driving' });
    if (o) q.set('origin', o);
    if (via.length) q.set('waypoints', via.map(loc).join('|'));
    links.push({ url: 'https://www.google.com/maps/dir/?' + q, from: i + 1, to: i + chunk.length });
  }
  return links;
}
export const searchLink = address => address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : null;
