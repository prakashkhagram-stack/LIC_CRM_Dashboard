import { esc, inr, inr0, D, DT, badge, TONE, dataTable, chips, $, $$, toast, confirmBox, formModal, download, modal } from '../ui.js';
import { recordPayment, composeMessage, verifyTransaction, runAutomation, taskForm } from '../actions.js';
import { dueStatus, lapseRisk, graceEnding, graceEnd, amountOn, nextStep } from '../premium.js';
import { firmPending } from '../metrics.js';
import { xlsxBlob } from '../xlsx.js';
import { addDays, diffDays, monthKey, fmtDate } from '../dates.js';

let tab = 'dues';
export async function render(app, el) {
  if (app.route.q.f) tab = 'dues';
  el.innerHTML = `<div class="head"><div class="grow"><h1>Premiums &amp; reminders</h1><div class="sub">Installments, reminder history, payments and late-fee calculator</div></div>${app.can('write') ? '<button id="ra">⚙ Run automation</button>' : ''}</div>
  <div class="tabs" id="tabs">${[['dues', 'Installments'], ['reminders', 'Reminders'], ['payments', 'Payments'], ['late', 'Late-fee calculator']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tc"></div>`;
  $('#ra', el)?.addEventListener('click', async () => { await runAutomation(); app.rerender(); });
  $('#tabs', el).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; app.go('#/premiums'); } };
  const tc = $('#tc', el); ({ dues, reminders, payments, late }[tab])(app, tc);
  if (app.route.q.pay) toast('Pick an installment and press “Record payment”.');
}

function dues(app, el) {
  const { data, ix, today, settings: S } = app; let f = app.route.q.f || 'pending';
  const rows = data.dues.filter(d => { const p = ix.policyById.get(d.policy_id); return p && !p.archived; }).map(d => ({ d, p: ix.policyById.get(d.policy_id), c: ix.clientById.get(ix.policyById.get(d.policy_id).client_id), st: dueStatus(d, today, ix.receiptByDue.get(d.id), S) }));
  const inForce = r => r.p.status === 'In force', pend = r => r.d.status === 'pending' && !r.d.verify_first && inForce(r);
  const F = { pending: pend, today: r => pend(r) && r.d.due_date === today, week: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 7, d15: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 15, d30: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 30,
    overdue: r => pend(r) && r.d.due_date < today, lapse: r => pend(r) && lapseRisk(r.d, r.p, today), grace: r => pend(r) && graceEnding(r.d, r.p, today, S.automation.lapse_warning_days), unverified: r => data.transactions.some(t => t.due_id === r.d.id && !t.verified), verify: r => r.d.status === 'pending' && r.d.verify_first,
    paid: r => r.d.status === 'paid' && monthKey(r.d.paid_on || '') === monthKey(today), receipt: r => r.st === 'Receipt Pending' || r.st === 'Payment Received', all: () => true }[f] || (() => true);
  const chipSet = [['pending', 'All pending'], ['today', 'Due today'], ['week', '7 days'], ['d15', '15 days'], ['d30', '30 days'], ['overdue', 'Overdue'], ['grace', 'Grace ending'], ['lapse', 'Lapse risk'], ['unverified', 'Unverified payment'], ['verify', 'Verify first'], ['paid', 'Paid this month'], ['receipt', 'Receipt pending'], ['all', 'Everything']].map(([k, l]) => [k, l, rows.filter(F === undefined ? () => true : { pending: pend, today: r => pend(r) && r.d.due_date === today, week: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 7, d15: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 15, d30: r => pend(r) && r.d.due_date >= today && diffDays(r.d.due_date, today) <= 30, overdue: r => pend(r) && r.d.due_date < today, grace: r => pend(r) && graceEnding(r.d, r.p, today, S.automation.lapse_warning_days), lapse: r => pend(r) && lapseRisk(r.d, r.p, today), unverified: r => data.transactions.some(t => t.due_id === r.d.id && !t.verified), verify: r => r.d.status === 'pending' && r.d.verify_first, paid: r => r.d.status === 'paid' && monthKey(r.d.paid_on || '') === monthKey(today), receipt: r => r.st === 'Receipt Pending' || r.st === 'Payment Received', all: () => true }[k]).length]);
  const list = rows.filter(F); const total = list.reduce((s, r) => s + Number(r.d.amount), 0);
  el.innerHTML = `<div class="chips" id="ch">${chipSet.map(([k, l, n]) => `<button class="chip ${k === f ? 'on' : ''}" data-f="${k}">${l} (${n})</button>`).join('')}</div>
   <div class="row" style="margin:10px 0"><b>${list.length}</b> installments · total <b>${inr0(total)}</b><span class="grow"></span><button id="xl" class="sm">⬇ Excel</button></div><div id="t"></div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => app.go('#/premiums?f=' + b.dataset.f));
  $('#xl', el).onclick = () => download(xlsxBlob([{ name: 'Installments', columns: ['Client', 'Mobile', 'Policy no.', 'Mode', 'Due date', 'Premium', 'Status', 'Days overdue'], rows: list.map(r => [r.c.name, r.c.mobile || '', r.p.policy_no, r.p.frequency || '', fmtDate(r.d.due_date), Number(r.d.amount), r.st, r.d.due_date < today ? diffDays(today, r.d.due_date) : 0]) }]), `installments_${today}.xlsx`);
  dataTable($('#t', el), { rows: list, sortKey: 'due', pageSize: 50, search: r => `${r.c.name} ${r.c.mobile || ''} ${r.p.policy_no}`,
    cols: [{ key: 'due', label: 'Due date', sort: r => r.d.due_date, render: r => `<b>${D(r.d.due_date)}</b>${r.d.due_date < today ? `<div class="sm" style="color:var(--bad)">${diffDays(today, r.d.due_date)} days late</div>` : ''}` },
      { key: 'c', label: 'Client', sort: r => r.c.name, render: r => `<a href="#/clients/${r.c.id}"><b>${esc(r.c.name)}</b></a><div class="sm mut">${esc(r.c.mobile || 'no mobile')}</div>` }, { key: 'p', label: 'Policy', hideSm: true, sort: r => r.p.policy_no, render: r => `<a href="#/policies/${r.p.id}">${esc(r.p.policy_no)}</a><div class="sm mut">${esc(r.p.frequency || '')}</div>` },
      { key: 'amt', label: 'Premium', num: true, sort: r => Number(r.d.amount), render: r => inr(r.d.amount) + (r.d.paid_amount > 0 && r.d.status !== 'paid' ? `<div class="sm mut">verified ${inr(r.d.paid_amount)}</div>` : '') },
      { key: 'st', label: 'Status', render: r => badge(r.st, TONE[r.st]) + (r.d.verify_first ? ' ' + badge('verify first', 'warn') : '') + (pend(r) && lapseRisk(r.d, r.p, today) ? ' ' + badge('lapse risk', 'bad') : '') + (r.d.verify_note ? `<div class="sm mut">${esc(r.d.verify_note)}</div>` : '') },
      { key: 'act', label: '', render: r => r.d.status === 'pending' ? `<span class="nowrap">${app.can('write') ? `<button class="sm primary" data-pay="${r.d.id}">Paid</button> ` : ''}<button class="sm wa" data-wa="${r.d.id}" title="WhatsApp reminder">💬</button>${r.d.verify_first && app.can('write') ? ` <button class="sm" data-ok="${r.d.id}" title="I checked – it is really unpaid">Confirm unpaid</button>` : ''}</span>` : '' }] });
  el.addEventListener('click', async e => {
    const b = e.target.closest('button[data-pay],button[data-wa],button[data-ok]'); if (!b) return;
    if (b.dataset.pay) recordPayment(b.dataset.pay);
    else if (b.dataset.wa) { const d = ix.dueById.get(b.dataset.wa), p = ix.policyById.get(d.policy_id), rm = data.reminders.filter(x => x.due_id === d.id && x.status === 'scheduled').pop(); composeMessage({ policy: p, due: d, reminder: rm, template: d.due_date < today ? 'overdue' : 'premium_due' }); }
    else if (b.dataset.ok) { await app.store.update('premium_dues', b.dataset.ok, { verify_first: false }); toast('Now included in reminders', 'good'); app.rerender(); }
  });
}

function reminders(app, el) {
  const { data, ix, today } = app; let f = 'today';
  const label = s => ({ D0: 'On due date' }[s] || (s[0] === 'B' ? s.slice(1) + ' days before' : s.slice(1) + ' days after'));
  const draw = () => {
    const pool = data.reminders.filter(r => { const d = ix.dueById.get(r.due_id); return d && d.status === 'pending' || r.status !== 'scheduled'; });
    const L = { today: r => r.status === 'scheduled' && r.scheduled_for <= today && ix.dueById.get(r.due_id)?.status === 'pending', sent: r => ['sent', 'delivered', 'read'].includes(r.status), all: () => true }[f]; const rows = pool.filter(L);
    el.innerHTML = `<div class="banner info">A reminder row is created once per installment and stage (never duplicated). “Open WhatsApp” prepares the message – it is only recorded as <b>sent</b> after you confirm. Only the latest due stage is shown for each installment.</div>
     ${chips([['today', 'To send now'], ['sent', 'Sent'], ['all', 'All history']], f)}<div id="t" style="margin-top:10px"></div>`;
    $$('[data-f]', el).forEach(b => b.onclick = () => { f = b.dataset.f; draw(); });
    dataTable($('#t', el), { rows: rows.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)), search: r => `${ix.clientById.get(r.client_id)?.name || ''} ${ix.policyById.get(r.policy_id)?.policy_no || ''}`,
      cols: [{ key: 'scheduled_for', label: 'Scheduled', render: r => D(r.scheduled_for) }, { key: 'client', label: 'Client', render: r => `<a href="#/clients/${r.client_id}">${esc(ix.clientById.get(r.client_id)?.name || '')}</a>` }, { key: 'pol', label: 'Policy / due', render: r => `${esc(ix.policyById.get(r.policy_id)?.policy_no || '')}<div class="sm mut">due ${D(ix.dueById.get(r.due_id)?.due_date)} · ${inr0(ix.dueById.get(r.due_id)?.amount)}</div>` },
        { key: 'stage', label: 'Stage', render: r => esc(label(r.stage)) }, { key: 'status', label: 'Status', render: r => badge(r.status, r.status === 'scheduled' ? 'warn' : r.status === 'failed' ? 'bad' : 'good') + (r.sent_at ? `<div class="sm mut">${DT(r.sent_at)}</div>` : '') },
        { key: 'a', label: '', render: r => r.status === 'scheduled' ? `<span class="nowrap"><button class="sm wa" data-w="${r.id}">💬 Open</button> ${app.can('write') ? `<button class="sm" data-s="${r.id}">Skip</button>` : ''}</span>` : '' }] });
    el.onclick = async e => { const b = e.target.closest('[data-w],[data-s]'); if (!b) return; if (b.dataset.w) { const r = data.reminders.find(x => x.id === b.dataset.w), d = ix.dueById.get(r.due_id); composeMessage({ policy: ix.policyById.get(r.policy_id), due: d, reminder: r, template: d.due_date < today ? 'overdue' : 'premium_due' }); } else { await app.store.update('premium_reminders', b.dataset.s, { status: 'skipped', remarks: 'Skipped by user' }); toast('Skipped'); app.rerender(); } };
  }; draw();
}

function payments(app, el) {
  const { data, ix } = app; const rows = [...data.transactions].sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  el.innerHTML = `<div class="banner info">A premium is marked <b>paid</b> only when verified payments cover the whole premium. Unverified entries and partial amounts keep the installment pending.</div><div id="t"></div>`;
  dataTable($('#t', el), { rows, search: t => `${ix.clientById.get(t.client_id)?.name || ''} ${ix.policyById.get(t.policy_id)?.policy_no || ''} ${t.reference || ''}`,
    cols: [{ key: 'paid_on', label: 'Date', render: t => D(t.paid_on) }, { key: 'c', label: 'Client', render: t => `<a href="#/clients/${t.client_id}">${esc(ix.clientById.get(t.client_id)?.name || '')}</a>` }, { key: 'p', label: 'Policy', hideSm: true, render: t => esc(ix.policyById.get(t.policy_id)?.policy_no || '') },
      { key: 'amount', label: 'Amount', num: true, render: t => inr(t.amount) + (t.late_fee > 0 ? `<div class="sm mut">late fee ${inr(t.late_fee)}</div>` : '') }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference', hideSm: true },
      { key: 'v', label: 'Verified', render: t => t.verified ? badge('verified', 'good') : (app.can('write') ? `<button class="sm" data-v="${t.id}">Verify…</button>` : badge('unverified', 'warn')) }] });
  el.onclick = e => { const b = e.target.closest('[data-v]'); if (b) verifyTransaction(data.transactions.find(t => t.id === b.dataset.v)); };
}

function late(app, el) {
  const { data, ix, today, settings: S } = app; let payDate = today;
  const draw = () => {
    const rows = data.dues.filter(d => d.status === 'pending' && !d.verify_first && d.due_date < payDate).map(d => { const p = ix.policyById.get(d.policy_id); if (!p || p.status !== 'In force') return null; const a = amountOn(d.amount, d.due_date, p.frequency, payDate, S.late_fee), n = nextStep(d.amount, d.due_date, p.frequency, payDate, S.late_fee); return { d, p, c: ix.clientById.get(p.client_id), a, n }; }).filter(Boolean);
    const fee = rows.reduce((s, r) => s + r.a.fee, 0);
    el.innerHTML = `<div class="banner info">Late fee = premium × ${S.late_fee.rate_pct}% ÷ 12 × months late (minimum ₹${S.late_fee.min_fee}), counted after the grace period. This is an <b>estimate</b> – it can differ by ₹1–2 from the LIC portal, which is the final authority. The premium amounts themselves are never changed.</div>
     <div class="row" style="margin:10px 0"><label class="f" style="margin:0"><span>If the client pays on</span><input type="date" id="pd" value="${payDate}" min="${addDays(today, -400)}"></label><div class="grow"><b>${rows.length}</b> overdue installments · premium ${inr0(rows.reduce((s, r) => s + Number(r.d.amount), 0))} + late fee <b>${inr0(fee)}</b></div><button class="sm" id="xl">⬇ Excel</button></div><div id="t"></div>`;
    $('#pd', el).onchange = e => { payDate = e.target.value || today; draw(); };
    $('#xl', el).onclick = () => download(xlsxBlob([{ name: 'Late fee ' + payDate, columns: ['Client', 'Mobile', 'Policy no.', 'Mode', 'Due date', 'Grace ends', 'Premium', 'Months late', 'Late fee', 'Total payable', 'Pay date'], rows: rows.map(r => [r.c.name, r.c.mobile || '', r.p.policy_no, r.p.frequency, fmtDate(r.d.due_date), fmtDate(r.a.graceEnd), Number(r.d.amount), r.a.months, r.a.fee, r.a.total, fmtDate(payDate)]) }]), `late_fee_${payDate}.xlsx`);
    dataTable($('#t', el), { rows, sortKey: 'due', search: r => `${r.c.name} ${r.p.policy_no} ${r.c.mobile || ''}`, cols: [{ key: 'due', label: 'Due', sort: r => r.d.due_date, render: r => D(r.d.due_date) }, { key: 'c', label: 'Client', sort: r => r.c.name, render: r => `<a href="#/clients/${r.c.id}">${esc(r.c.name)}</a><div class="sm mut">${esc(r.p.policy_no)} · ${esc(r.p.frequency || '')}</div>` },
      { key: 'g', label: 'Grace ends', hideSm: true, render: r => D(r.a.graceEnd) }, { key: 'pr', label: 'Premium', num: true, render: r => inr(r.d.amount) }, { key: 'm', label: 'Months', num: true, hideSm: true, render: r => r.a.months || '–' }, { key: 'f', label: 'Late fee', num: true, sort: r => r.a.fee, render: r => r.a.fee ? inr(r.a.fee) : '–' }, { key: 't', label: 'Total', num: true, sort: r => r.a.total, render: r => `<b>${inr(r.a.total)}</b>` },
      { key: 'n', label: 'Next increase', hideSm: true, render: r => r.n ? `${D(r.n.from)} → ${inr(r.n.total)}` : '' }] });
  }; draw();
}
