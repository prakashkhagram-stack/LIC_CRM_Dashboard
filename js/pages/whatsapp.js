import { esc, D, DT, badge, dataTable, chips, $, $$, toast } from '../ui.js';
import { composeMessage, messageVars } from '../actions.js';
import { TEMPLATE_DEFS, getTemplate, renderTemplate, waLink, normalisePhone } from '../templates.js';
import { nextOccurrence } from '../dates.js';
import { addDays } from '../dates.js';

let tab = 'today';
export async function render(app, el) {
  const { data, ix, today, settings: S } = app, api = S.wa_api;
  el.innerHTML = `<div class="head"><div class="grow"><h1>WhatsApp centre</h1><div class="sub">Prepared messages in English and Gujarati. You press Send in WhatsApp – nothing is sent behind your back.</div></div></div>
   <div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div class="grow"><b>Official WhatsApp Business API:</b> ${api?.enabled ? badge('enabled in settings', 'info') : badge('not connected', 'bad')}<div class="sm mut">${api?.enabled ? 'Automatic sending uses the send-whatsapp Edge Function and only pre-approved Meta templates. Delivery status is shown only when Meta reports it.' : 'Until the API is connected (see SETUP.md), messages open in your own WhatsApp via a pre-filled link. The CRM does not claim a message was delivered – you confirm it.'}</div></div>
   <div class="tabs" id="tabs">${[['today', 'Reminders to send'], ['greet', 'Greetings'], ['compose', 'Compose'], ['log', 'Message log']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tc"></div>`;
  $('#tabs', el).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; app.rerender(); } };
  const tc = $('#tc', el);
  if (tab === 'today') {
    const rows = data.reminders.filter(r => r.status === 'scheduled' && r.scheduled_for <= today && ix.dueById.get(r.due_id)?.status === 'pending').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    tc.innerHTML = `<div id="t"></div>`; dataTable($('#t', tc), { rows, search: r => ix.clientById.get(r.client_id)?.name || '', empty: 'No reminders waiting. ✔', cols: [{ key: 's', label: 'Scheduled', render: r => D(r.scheduled_for) }, { key: 'c', label: 'Client', render: r => { const c = ix.clientById.get(r.client_id); return `<b>${esc(c.name)}</b><div class="sm mut">${esc(c.mobile || 'no number')}</div>`; } }, { key: 'd', label: 'Due', render: r => `${D(ix.dueById.get(r.due_id)?.due_date)} · ₹${Math.round(ix.dueById.get(r.due_id)?.amount || 0).toLocaleString('en-IN')}` }, { key: 'a', label: '', render: r => `<button class="sm wa" data-r="${r.id}">💬 Prepare</button>` }] });
    tc.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const r = data.reminders.find(x => x.id === b.dataset.r), d = ix.dueById.get(r.due_id); composeMessage({ policy: ix.policyById.get(r.policy_id), due: d, reminder: r, template: d.due_date < today ? 'overdue' : 'premium_due' }); };
  } else if (tab === 'greet') {
    const list = []; const lim = addDays(today, 7);
    for (const c of data.clients) { if (c.archived) continue; for (const [k, tpl] of [['dob', 'birthday'], ['anniversary', 'anniversary']]) { const n = nextOccurrence(c[k], today); if (n && n >= today && n <= lim) list.push({ date: n, kind: k === 'dob' ? 'Birthday' : 'Anniversary', c, tpl }); } }
    for (const p of data.policies) if (p.status === 'In force' && p.start_date) { const n = nextOccurrence(p.start_date, today); const c = ix.clientById.get(p.client_id); if (n && n >= today && n <= lim && c && !c.archived) list.push({ date: n, kind: 'Policy anniversary', c, p, tpl: 'policy_anniversary' }); }
    list.sort((a, b) => a.date.localeCompare(b.date));
    tc.innerHTML = `<div class="card"><h2>Next 7 days</h2>${list.length ? `<div class="list">${list.map((x, i) => `<div><span class="nowrap b" style="width:84px">${D(x.date)}</span><div class="grow">${badge(x.kind, 'good')} <a href="#/clients/${x.c.id}">${esc(x.c.name)}</a>${x.p ? ' <span class="mut sm">' + esc(x.p.policy_no) + '</span>' : ''}</div><button class="sm wa" data-g="${i}">💬</button></div>`).join('')}</div>` : '<div class="empty">No birthdays or anniversaries this week</div>'}</div>`;
    tc.onclick = e => { const b = e.target.closest('[data-g]'); if (b) { const x = list[+b.dataset.g]; composeMessage({ client: x.c, policy: x.p, template: x.tpl }); } };
  } else if (tab === 'compose') {
    tc.innerHTML = `<div class="card"><label class="f"><span>Client</span><input id="cs" list="cl" placeholder="Type a name or mobile…"><datalist id="cl">${data.clients.filter(c => !c.archived).slice(0, 3000).map(c => `<option value="${esc(c.name)} · ${esc(c.client_code)}">`).join('')}</datalist></label><button class="wa" id="go">Open composer</button></div>
     <div class="card"><h2>Templates</h2><p class="mut sm">Edit wording in Settings → Message templates. Placeholders such as {client_name} are filled automatically; missing information is flagged, never invented.</p><div class="list">${TEMPLATE_DEFS.map(t => `<div><div class="grow"><b>${esc(t.label)}</b><div class="sm mut" style="white-space:pre-wrap">${esc(getTemplate(t.key, 'en', S))}</div></div></div>`).join('')}</div></div>`;
    $('#go', tc).onclick = () => { const code = ($('#cs', tc).value.split('·')[1] || '').trim(), c = data.clients.find(x => x.client_code === code) || data.clients.find(x => x.name === $('#cs', tc).value.trim()); if (!c) return toast('Pick a client from the list', 'bad'); composeMessage({ client: c, template: 'general' }); };
  } else {
    const rows = [...data.communications].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    tc.innerHTML = '<div id="t"></div>'; dataTable($('#t', tc), { rows, search: x => `${ix.clientById.get(x.client_id)?.name || ''} ${x.message || ''}`, cols: [{ key: 'at', label: 'When', render: x => DT(x.at) }, { key: 'c', label: 'Client', render: x => `<a href="#/clients/${x.client_id}">${esc(ix.clientById.get(x.client_id)?.name || '')}</a>` }, { key: 'channel', label: 'Channel' }, { key: 'status', label: 'Status', render: x => badge(x.status, x.status === 'sent' || x.status === 'delivered' ? 'good' : x.status === 'failed' ? 'bad' : '') }, { key: 'm', label: 'Message', hideSm: true, render: x => `<span class="sm">${esc((x.message || '').slice(0, 140))}</span>` }] });
  }
}
