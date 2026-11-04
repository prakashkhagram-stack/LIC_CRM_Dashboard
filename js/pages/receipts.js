import { esc, inr, inr0, D, DT, badge, dataTable, chips, $, $$, toast, formModal, modal } from '../ui.js';
import { composeMessage } from '../actions.js';
import { RECEIPT_STATUSES } from '../defaults.js';
import { diffDays } from '../dates.js';

let f = 'open';
export async function render(app, el) {
  const { data, ix, today, settings: S } = app;
  const OPEN = ['Awaiting Receipt', 'Receipt Received', 'Dispatch Pending'], F = { open: r => OPEN.includes(r.status), stuck: r => OPEN.includes(r.status) && diffDays(today, r.payment_date) >= S.automation.receipt_alert_days, dispatched: r => ['Dispatched', 'Client Confirmation Pending'].includes(r.status), done: r => r.status === 'Completed', all: () => true };
  el.innerHTML = `<div class="head"><div class="grow"><h1>Receipts</h1><div class="sub">Track the official LIC receipt for every verified payment until it reaches the client</div></div></div>
   <div class="banner info">Only the <b>official insurer receipt</b> is a receipt. Messages sent from this CRM are acknowledgments and are labelled that way. Enter the real LIC receipt number when you have it – nothing is generated here.</div>
   ${chips([['open', 'Not yet with client', data.receipts.filter(F.open).length], ['stuck', `Waiting ${S.automation.receipt_alert_days}+ days`, data.receipts.filter(F.stuck).length], ['dispatched', 'Dispatched', data.receipts.filter(F.dispatched).length], ['done', 'Completed', data.receipts.filter(F.done).length], ['all', 'All', data.receipts.length]], f)}<div id="t" style="margin-top:10px"></div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => { f = b.dataset.f; app.rerender(); });
  dataTable($('#t', el), { rows: data.receipts.filter(F[f]).sort((a, b) => a.payment_date.localeCompare(b.payment_date)), search: r => `${ix.clientById.get(r.client_id)?.name || ''} ${ix.policyById.get(r.policy_id)?.policy_no || ''} ${r.receipt_no || ''}`,
    cols: [{ key: 'payment_date', label: 'Paid on', render: r => D(r.payment_date) + (OPEN.includes(r.status) ? `<div class="sm" style="color:var(--bad)">${diffDays(today, r.payment_date)} days ago</div>` : '') }, { key: 'c', label: 'Client', render: r => `<a href="#/clients/${r.client_id}"><b>${esc(ix.clientById.get(r.client_id)?.name || '')}</b></a><div class="sm mut">${esc(ix.policyById.get(r.policy_id)?.policy_no || '')}</div>` },
      { key: 'amount', label: 'Amount', num: true, render: r => inr(r.amount) }, { key: 'receipt_no', label: 'LIC receipt no.', hideSm: true, render: r => esc(r.receipt_no || '–') }, { key: 'status', label: 'Status', render: r => badge(r.status, r.status === 'Completed' ? 'good' : OPEN.includes(r.status) ? 'warn' : 'info') + (r.dispatch_method ? `<div class="sm mut">${esc(r.dispatch_method)} ${D(r.dispatch_date)}</div>` : '') },
      { key: 'a', label: '', render: r => app.can('write') ? `<button class="sm primary" data-e="${r.id}">Update</button> <button class="sm wa" data-w="${r.id}">💬</button>` : '' }] });
  el.onclick = e => { const b = e.target.closest('[data-e],[data-w]'); if (!b) return; const r = data.receipts.find(x => x.id === (b.dataset.e || b.dataset.w)); if (b.dataset.w) composeMessage({ client: ix.clientById.get(r.client_id), policy: ix.policyById.get(r.policy_id), receipt: r, template: ['Dispatched', 'Dispatch Pending', 'Receipt Received'].includes(r.status) ? 'receipt_dispatch' : 'payment_ack' }); else edit(app, r); };
}
function edit(app, r) {
  formModal({ title: 'Update receipt', intro: `${esc(app.ix.clientById.get(r.client_id)?.name)} · ${inr(r.amount)} paid ${D(r.payment_date)}`, fields: [
    { name: 'status', label: 'Status', type: 'select', options: RECEIPT_STATUSES, blank: false }, { name: 'receipt_no', label: 'LIC receipt number', hint: 'From the actual receipt – leave blank until you have it' }, { name: 'dispatch_method', label: 'Dispatch method', type: 'select', options: ['WhatsApp', 'Email', 'Physical Delivery'] }, { name: 'dispatch_date', label: 'Dispatch date', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }], values: r,
    onSubmit: async v => { if (['Dispatched', 'Client Confirmation Pending', 'Completed'].includes(v.status)) { if (!v.dispatch_method || !v.dispatch_date) throw new Error('Enter how and when the receipt was dispatched.'); if (!v.receipt_no && !await (await import('../ui.js')).confirmBox('No LIC receipt number entered. Mark as dispatched anyway?')) throw new Error('Cancelled'); } await app.store.update('receipts', r.id, v); toast('Receipt updated', 'good'); app.rerender(); } });
}
