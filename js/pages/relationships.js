import { esc, inr0, D, badge, dataTable, chips, $, $$, toast, formModal } from '../ui.js';
import { engagementScore, clientSegments, annualPremium } from '../metrics.js';
import { composeMessage } from '../actions.js';
import { ACTIVE_POLICY } from '../defaults.js';

let f = 'all';
export async function render(app, el) {
  const { data, ix, today, settings: S } = app;
  const rows = data.clients.filter(c => !c.archived).map(c => { const e = engagementScore(c, data, ix, today, S), seg = clientSegments(c, data, ix, today); const pols = (ix.policiesByClient.get(c.id) || []); return { c, score: e.score, parts: e.parts, seg, prem: pols.reduce((s, p) => s + annualPremium(p), 0), act: pols.filter(p => ACTIVE_POLICY.includes(p.status)).length }; });
  const F = { all: () => true, vip: r => r.seg.includes('VIP'), regular: r => !r.seg.includes('VIP') && !r.seg.includes('New') && !r.seg.includes('Dormant'), new: r => r.seg.includes('New'), dormant: r => r.seg.includes('Dormant'), risk: r => r.score < 40 && r.act > 0, maturity: r => r.seg.includes('Upcoming maturity'), multi: r => r.seg.includes('Multiple policies'), high: r => r.seg.includes('High service priority') };
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
  el.innerHTML = `<div class="head"><div class="grow"><h1>Relationships</h1><div class="sub">Segments and an explainable engagement score for every client</div></div></div>
   <div class="grid g4" style="margin-bottom:12px"><div class="stat"><div class="l">Average engagement</div><div class="v">${avg}/100</div></div><div class="stat"><div class="l">VIP clients</div><div class="v">${rows.filter(F.vip).length}</div></div><div class="stat warn"><div class="l">Low engagement (&lt;40) with active policies</div><div class="v">${rows.filter(F.risk).length}</div></div><div class="stat"><div class="l">No active policy (dormant)</div><div class="v">${rows.filter(F.dormant).length}</div></div></div>
   <div class="banner info">Score = a base + points for active policies, on-time payments, recent contact, years with you and family served, minus points for open tasks and overdue premiums. Every part is shown on the client's page and the weights are editable in Settings.</div>
   ${chips([['all', 'All', rows.length], ['vip', 'VIP', rows.filter(F.vip).length], ['regular', 'Regular', rows.filter(F.regular).length], ['new', 'New', rows.filter(F.new).length], ['dormant', 'Dormant', rows.filter(F.dormant).length], ['risk', 'Needs attention', rows.filter(F.risk).length], ['maturity', 'Upcoming maturity', rows.filter(F.maturity).length], ['multi', 'Multiple policies', rows.filter(F.multi).length], ['high', 'High service priority', rows.filter(F.high).length]], f)}<div id="t" style="margin-top:10px"></div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => { f = b.dataset.f; app.rerender(); });
  dataTable($('#t', el), { rows: rows.filter(F[f]), sortKey: 'score', sortDir: -1, search: r => `${r.c.name} ${r.c.mobile || ''}`, onRow: r => app.go('#/clients/' + r.c.id),
    cols: [{ key: 'c', label: 'Client', sort: r => r.c.name, render: r => `<b>${esc(r.c.name)}</b><div class="sm mut">${esc(r.c.client_code)}</div>` }, { key: 'seg', label: 'Segments', render: r => r.seg.map(s => badge(s, s === 'VIP' ? 'warn' : s === 'Dormant' ? 'bad' : 'info')).join(' ') }, { key: 'score', label: 'Score', num: true, sort: r => r.score, render: r => `<div style="min-width:90px"><b>${r.score}</b><div class="bar"><i style="width:${r.score}%"></i></div></div>` }, { key: 'act', label: 'Policies', num: true, render: r => r.act }, { key: 'prem', label: 'Annual premium', num: true, hideSm: true, render: r => inr0(r.prem) }] });
}
