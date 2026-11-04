import { esc, inr, inr0, D, badge, dataTable, chips, $, $$, toast, formModal, modal } from '../ui.js';
import { visitForm, recordPayment, composeMessage, needWrite } from '../actions.js';
import { orderStops, mapsLinks, totalKm, searchLink } from '../routes.js';
import { telLink } from '../templates.js';
import { VISIT_STATUSES } from '../defaults.js';
import { addDays } from '../dates.js';

let date = null, tab = 'visits';
export async function render(app, el) {
  date ||= app.today; const { data, ix, today } = app;
  const inDay = data.visits.filter(v => v.visit_date === date).sort((a, b) => (a.route_order ?? 999) - (b.route_order ?? 999));
  el.innerHTML = `<div class="head"><div class="grow"><h1>Collections &amp; visits</h1><div class="sub">Plan field visits, collect premiums, and open a Google Maps route</div></div>${app.can('write') ? '<button class="primary" id="nv">＋ Schedule visit</button>' : ''}</div>
   <div class="row" style="margin-bottom:12px"><button class="sm" id="pv">‹</button><input type="date" id="dt" value="${date}" style="width:auto"><button class="sm" id="nx">›</button><button class="sm" id="td">Today</button><span class="mut">${inDay.length} visit(s) · expected ${inr0(inDay.reduce((s, v) => s + Number(v.amount_expected || 0), 0))} · collected ${inr0(inDay.reduce((s, v) => s + Number(v.amount_collected || 0), 0))}</span></div>
   <div class="tabs" id="tabs">${[['visits', 'Day plan'], ['all', 'All visits'], ['suggest', 'Suggest visits']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tc"></div>`;
  const setDate = d => { date = d; app.rerender(); };
  $('#dt', el).onchange = e => setDate(e.target.value || today); $('#pv', el).onclick = () => setDate(addDays(date, -1)); $('#nx', el).onclick = () => setDate(addDays(date, 1)); $('#td', el).onclick = () => setDate(today); $('#nv', el)?.addEventListener('click', () => visitForm(null, { visit_date: date }));
  $('#tabs', el).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; app.rerender(); } };
  const tc = $('#tc', el);
  if (tab === 'visits') dayPlan(app, tc, inDay); else if (tab === 'all') allVisits(app, tc); else suggest(app, tc);
}
function dayPlan(app, el, visits) {
  const { ix } = app; const stops = visits.map(v => { const c = ix.clientById.get(v.client_id); return { v, name: c?.name || '', lat: c?.latitude == null ? NaN : Number(c.latitude), lng: c?.longitude == null ? NaN : Number(c.longitude), address: [c?.address, c?.area_city].filter(Boolean).join(', '), area: c?.area_city || '' }; });
  const nocoord = stops.filter(s => !Number.isFinite(s.lat)).length, links = mapsLinks(stops, app.settings.business.home_address || '');
  el.innerHTML = `${visits.length ? `<div class="row no-print" style="margin-bottom:10px">${app.can('write') ? '<button id="opt">↕ Order by nearest stop</button>' : ''}${links.map((l, i) => `<a class="btn primary" target="_blank" rel="noopener" href="${l.url}">🗺 Open route${links.length > 1 ? ` part ${i + 1} (stops ${l.from}–${l.to})` : ' in Google Maps'}</a>`).join('')}<button id="pr" class="sm">🖨 Print</button></div>
    <div class="banner info">Route order is a <b>suggestion</b> (straight-line nearest-stop). Google Maps does not optimise stops for you and shows only up to 9 stops per link. ${nocoord ? `<b>${nocoord} stop(s) have no coordinates</b> – they are placed last and use the written address; add latitude/longitude to the client for accurate ordering.` : ''}${app.settings.business.home_address ? '' : ' Set your starting address in Settings → Business for a start point.'}</div>` : ''}
   <div class="list">${visits.map((v, i) => { const c = ix.clientById.get(v.client_id), s = stops[i], due = v.due_id && ix.dueById.get(v.due_id); return `<div style="padding:10px 0"><div style="width:28px;height:28px;border-radius:50%;background:var(--brand);color:var(--brandink);display:grid;place-items:center;flex:none">${i + 1}</div><div class="grow"><b><a href="#/clients/${c.id}">${esc(c.name)}</a></b> ${badge(v.status, v.status === 'Collected' ? 'good' : v.status === 'Missed' || v.status === 'Cancelled' ? 'bad' : '')}<div class="sm mut">${esc(v.purpose)} · ${esc(c.address || 'no address')}${c.area_city ? ', ' + esc(c.area_city) : ''}</div><div class="sm">${v.amount_expected ? 'Expected ' + inr0(v.amount_expected) + (v.method ? ' by ' + esc(v.method) : '') : ''}${v.amount_collected ? ' · collected ' + inr0(v.amount_collected) : ''}${v.remarks ? ' · ' + esc(v.remarks) : ''}</div>
      <div class="row no-print" style="margin-top:6px">${telLink(c.mobile) ? `<a class="btn sm" href="${telLink(c.mobile)}">📞 Call</a>` : ''}${s.address ? `<a class="btn sm" target="_blank" rel="noopener" href="${searchLink(Number.isFinite(s.lat) ? s.lat + ',' + s.lng : s.address)}">🗺 Map</a>` : ''}<button class="sm wa" data-cf="${v.id}">💬 Confirm</button>
      ${app.can('write') ? `${due && due.status === 'pending' ? `<button class="sm primary" data-col="${v.id}">Collect payment</button>` : ''}<select data-st="${v.id}" style="width:auto;min-height:28px;padding:2px 6px">${VISIT_STATUSES.map(x => `<option ${x === v.status ? 'selected' : ''}>${x}</option>`).join('')}</select><button class="sm" data-ed="${v.id}">Edit</button>` : ''}</div></div></div>`; }).join('') || '<div class="empty">No visits planned for this day.</div>'}</div>`;
  $('#pr', el)?.addEventListener('click', () => print());
  $('#opt', el)?.addEventListener('click', async () => { const { ordered } = orderStops(stops, null); for (let i = 0; i < ordered.length; i++) await app.store.update('collection_visits', ordered[i].v.id, { route_order: i + 1 }); toast('Reordered (' + totalKm(ordered.filter(o => Number.isFinite(o.lat))) + ' km straight-line)', 'good'); app.rerender(); });
  el.onclick = async e => {
    const b = e.target.closest('[data-cf],[data-col],[data-ed]'); if (!b) return; const id = b.dataset.cf || b.dataset.col || b.dataset.ed, v = app.data.visits.find(x => x.id === id), c = ix.clientById.get(v.client_id);
    if (b.dataset.cf) composeMessage({ client: c, policy: ix.policyById.get(v.policy_id), due: ix.dueById.get(v.due_id), visit: v, template: 'collection_appointment' });
    else if (b.dataset.col) recordPayment(v.due_id, { visit: v, prefill: { method: v.method || 'Cash' } }); else visitForm(v);
  };
  el.addEventListener('change', async e => { const s = e.target.closest('[data-st]'); if (!s) return; const v = app.data.visits.find(x => x.id === s.dataset.st); if (s.value === 'Collected') { toast('Use “Collect payment” so the payment is recorded and verified.', 'bad'); s.value = v.status; return; } await app.store.update('collection_visits', v.id, { status: s.value }); toast('Updated'); app.rerender(); });
}
function allVisits(app, el) {
  const { data, ix } = app; el.innerHTML = '<div id="t"></div>';
  dataTable($('#t', el), { rows: [...data.visits].sort((a, b) => b.visit_date.localeCompare(a.visit_date)), search: v => `${ix.clientById.get(v.client_id)?.name || ''} ${v.status} ${v.purpose}`, cols: [{ key: 'visit_date', label: 'Date', render: v => D(v.visit_date) }, { key: 'c', label: 'Client', render: v => `<a href="#/clients/${v.client_id}">${esc(ix.clientById.get(v.client_id)?.name || '')}</a>` }, { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status', render: v => badge(v.status) }, { key: 'amount_expected', label: 'Expected', num: true, render: v => inr0(v.amount_expected) }, { key: 'amount_collected', label: 'Collected', num: true, render: v => v.amount_collected ? inr0(v.amount_collected) : '–' }] });
}
/** installments that fall due soon and have no visit planned – a shortlist to schedule */
function suggest(app, el) {
  const { data, ix, today } = app, planned = new Set(data.visits.filter(v => !['Cancelled', 'Collected', 'Missed', 'Rescheduled'].includes(v.status)).map(v => v.due_id).filter(Boolean));
  const rows = data.dues.filter(d => d.status === 'pending' && !d.verify_first && d.due_date <= addDays(today, 10) && !planned.has(d.id) && ix.policyById.get(d.policy_id)?.status === 'In force').sort((a, b) => a.due_date.localeCompare(b.due_date));
  el.innerHTML = `<div class="banner info">Installments due within 10 days (or overdue) that have no visit planned. Tick the ones you want and schedule them for <b>${D(date)}</b>.</div><div id="t"></div>${app.can('write') ? '<p><button class="primary" id="sc">Schedule ticked visits</button></p>' : ''}`;
  dataTable($('#t', el), { rows, pageSize: 40, search: d => `${ix.clientById.get(ix.policyById.get(d.policy_id).client_id).name} ${ix.policyById.get(d.policy_id).policy_no}`, cols: [{ key: 'k', label: '', render: d => `<input type="checkbox" data-k="${d.id}">` }, { key: 'due_date', label: 'Due', render: d => D(d.due_date) }, { key: 'c', label: 'Client', render: d => { const p = ix.policyById.get(d.policy_id), c = ix.clientById.get(p.client_id); return `<b>${esc(c.name)}</b><div class="sm mut">${esc(c.area_city || '')} · ${esc(p.policy_no)}</div>`; } }, { key: 'amount', label: 'Amount', num: true, render: d => inr(d.amount) }] });
  $('#sc', el)?.addEventListener('click', async () => { const ids = $$('[data-k]:checked', el).map(x => x.dataset.k); if (!ids.length) return toast('Tick at least one', 'bad'); for (const id of ids) { const d = ix.dueById.get(id), p = ix.policyById.get(d.policy_id); await app.store.insert('collection_visits', { client_id: p.client_id, policy_id: p.id, due_id: d.id, purpose: 'Premium collection', visit_date: date, status: 'Scheduled', amount_expected: d.amount }); } toast(ids.length + ' visit(s) scheduled', 'good'); tab = 'visits'; app.rerender(); });
}
