import { esc, DT, badge, dataTable, $, toast } from '../ui.js';
export async function render(app, el) {
  if (!app.can('delete')) { el.innerHTML = '<div class="head"><h1>Audit trail</h1></div><div class="banner warn">Only the administrator can view the audit trail.</div>'; return; }
  el.innerHTML = `<div class="head"><div class="grow"><h1>Audit trail</h1><div class="sub">Who changed what and when (latest 300 changes). Stored in the database – cannot be edited from the app.</div></div></div><div id="t">Loading…</div>`;
  let rows = []; try { rows = await app.store.audit(300); } catch (e) { $('#t', el).innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; return; }
  const who = id => id ? (id === app.store.user?.id ? 'you' : String(id).slice(0, 8)) : 'system';
  const diff = r => { if (r.action === 'INSERT') return 'created'; if (r.action === 'DELETE') return 'deleted'; const o = r.old_data || {}, n = r.new_data || {}; return Object.keys(n).filter(k => k !== 'updated_at' && JSON.stringify(o[k]) !== JSON.stringify(n[k])).slice(0, 6).map(k => `${k}: ${JSON.stringify(o[k] ?? null)} → ${JSON.stringify(n[k])}`).join('; ').slice(0, 220); };
  dataTable($('#t', el), { rows, search: r => `${r.table_name} ${r.action} ${diff(r)}`, empty: 'No changes recorded yet (demo mode keeps no audit trail).', cols: [{ key: 'at', label: 'When', render: r => DT(r.at) }, { key: 'u', label: 'Who', render: r => esc(who(r.user_id)) }, { key: 'table_name', label: 'Table' }, { key: 'action', label: 'Action', render: r => badge(r.action, r.action === 'DELETE' ? 'bad' : r.action === 'INSERT' ? 'good' : 'info') }, { key: 'd', label: 'Change', hideSm: true, render: r => `<span class="sm">${esc(diff(r))}</span>` }] });
}
