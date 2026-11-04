// Shared workflows used from several screens: payments, client/policy/task/visit forms, message composer.
import { app, clientName } from './state.js';
import { modal, formModal, toast, esc, inr, D, DT, confirmBox, fieldHtml, readForm, $ } from './ui.js';
import { planPayment, amountOn, dueStatus, nextDueDate } from './premium.js';
import { planAutomations, applyPlan, nextActionForStage, DEFAULT_CLAIM_DOCS } from './automation.js';
import { TEMPLATE_DEFS, getTemplate, renderTemplate, waLink, mailLink, normalisePhone } from './templates.js';
import { PAY_METHODS, COLLECTION_METHODS, PRIORITIES, CATEGORIES, VISIT_PURPOSES, VISIT_STATUSES, FREQUENCIES, POLICY_STATUSES, PREFERRED, REL_STATUSES, CLAIM_TYPES, CLAIM_STAGES, RECEIPT_STATUSES } from './defaults.js';
import { addDays, diffDays } from './dates.js';

export const store = () => app.store;
export function needWrite() { if (!app.can('write')) { toast('Your role is read-only.', 'bad'); return false; } return true; }
const opts = (list) => (list || []).map(x => Array.isArray(x) ? x : [x, x]);

/* ------------------------------------------------ automation ------------------------------------------------ */
export async function runAutomation({ silent = false, trigger = 'app' } = {}) {
  if (!app.can('write')) return null;
  const plan = planAutomations(app.data, app.today, app.settings);
  await applyPlan(app.store, plan);
  await app.store.logAutomationRun({ date: app.today, ...plan.summary }, trigger);
  app.reindex();
  const s = plan.summary;
  if (!silent) toast(`Automation done – ${s.tasks_created} new task(s), ${s.reminders_created} reminder(s), ${s.dues_created} installment(s), ${s.claims_created} claim(s).`, 'good');
  return plan.summary;
}

/* ------------------------------------------------ message composer ------------------------------------------------ */
export function messageVars(ctx = {}) {
  const B = app.settings.business, c = ctx.client || (ctx.policy && app.ix.clientById.get(ctx.policy.client_id)) || null;
  const p = ctx.policy || null, d = ctx.due || null, cl = ctx.claim || null, rc = ctx.receipt || null, v = ctx.visit || null;
  const days = d ? diffDays(app.today, d.due_date) : null;
  return { client_name: c ? ((c.salutation ? c.salutation + ' ' : '') + c.name) : '', advisor_name: B.advisor_name || '', advisor_phone: B.phone || '', signature: B.signature || (B.advisor_name ? '– ' + B.advisor_name : ''),
    amount: d ? Math.round(d.amount).toLocaleString('en-IN') : rc ? Math.round(rc.amount).toLocaleString('en-IN') : p?.premium ? Math.round(p.premium).toLocaleString('en-IN') : '', policy_no: p?.policy_no || '', due_date: d ? D(d.due_date) : '', days_overdue: days > 0 ? days : '',
    visit_date: v ? D(v.visit_date) : '', visit_time: '', address: c?.address || '', paid_on: rc ? D(rc.payment_date) : ctx.tx ? D(ctx.tx.paid_on) : '', method: ctx.tx?.method || '',
    claim_type: cl ? (cl.claim_type === 'Survival Benefit' ? 'survival benefit' : cl.claim_type.toLowerCase()) : '', event_date: cl ? D(cl.event_date) : '', days_left: cl?.event_date ? diffDays(cl.event_date, app.today) : '', stage: cl?.stage || '', next_action: cl ? nextActionForStage(cl.stage) : '',
    documents: cl ? (DEFAULT_CLAIM_DOCS[cl.claim_type] || []).join('; ') : '', years: p?.start_date ? Math.max(0, Math.floor(diffDays(app.today, p.start_date) / 365.25)) : '', message: ctx.message || '' };
}
export function composeMessage(ctx = {}) {
  const c = ctx.client || (ctx.policy && app.ix.clientById.get(ctx.policy.client_id)); if (!c) return toast('Choose a client first.', 'bad');
  const lang0 = ctx.lang || app.settings.business.default_language || 'en', key0 = ctx.template || 'premium_due';
  const body = document.createElement('div');
  body.innerHTML = `<div class="fgrid"><label class="f"><span>Template</span><select id="m_t">${TEMPLATE_DEFS.map(t => `<option value="${t.key}" ${t.key === key0 ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
  <label class="f"><span>Language</span><select id="m_l"><option value="en" ${lang0 === 'en' ? 'selected' : ''}>English</option><option value="gu" ${lang0 === 'gu' ? 'selected' : ''}>ગુજરાતી (Gujarati)</option></select></label>
  <label class="f full"><span>Message (you can edit before sending)</span><textarea id="m_x" rows="9"></textarea></label></div><div id="m_w"></div><div class="mut sm" id="m_to"></div>`;
  const refresh = () => {
    const key = $('#m_t', body).value, lang = $('#m_l', body).value; const r = renderTemplate(getTemplate(key, lang, app.settings), messageVars(ctx));
    $('#m_x', body).value = r.text; $('#m_w', body).innerHTML = r.missing.length ? `<div class="banner warn">Missing information: <b>${r.missing.map(esc).join(', ')}</b>. Fill it in above before sending – nothing has been guessed.</div>` : '';
  };
  const phone = c.whatsapp || c.mobile; $('#m_to', body).innerHTML = phone ? `To: ${esc(c.name)} · +${normalisePhone(phone) || esc(phone) + ' (invalid number)'}${c.consent_whatsapp === false ? ' <b style="color:var(--bad)">· client has NOT consented to WhatsApp messages</b>' : ''}` : '<b style="color:var(--bad)">This client has no mobile / WhatsApp number.</b>';
  body.addEventListener('change', e => { if (e.target.id === 'm_t' || e.target.id === 'm_l') refresh(); }); refresh();
  const log = async (status, ch = 'WhatsApp') => {
    const msg = $('#m_x', body).value; if (!app.can('write')) return;
    await app.store.insert('communications', { client_id: c.id, policy_id: ctx.policy?.id || ctx.due?.policy_id || null, due_id: ctx.due?.id || null, direction: 'out', channel: ch, template_key: $('#m_t', body).value, language: $('#m_l', body).value, message: msg, status });
    if (status === 'sent' && ctx.reminder) await app.store.update('premium_reminders', ctx.reminder.id, { status: 'sent', sent_at: new Date().toISOString(), message_text: msg });
  };
  const m = modal({ title: 'Message to ' + c.name, body, wide: true, actions: [
    { label: '📋 Copy', onClick: async () => { await navigator.clipboard?.writeText($('#m_x', body).value); toast('Copied'); return false; } },
    ...(c.email ? [{ label: '✉ Email', onClick: async () => { const l = mailLink(c.email, $('#m_t', body).selectedOptions[0].text, $('#m_x', body).value); await log('opened', 'Email'); window.open(l, '_blank'); return false; } }] : []),
    { label: 'Open in WhatsApp', kind: 'wa', onClick: async () => { const r = waLink(phone, $('#m_x', body).value); if (!r) { toast('No valid mobile number for this client.', 'bad'); return false; } if (r.truncated) toast('Message was too long and was shortened.', 'bad'); await log('opened'); window.open(r.url, '_blank', 'noopener'); toast('WhatsApp opened. After you press Send there, use "Mark as sent" so the record is accurate.'); return false; } },
    { label: '✔ Mark as sent', kind: 'primary', onClick: async (close) => { await log('sent'); toast('Recorded as sent', 'good'); close(); app.rerender(); } } ] });
  return m;
}

/* ------------------------------------------------ payments ------------------------------------------------ */
export function recordPayment(dueId, { prefill = {}, visit = null, onDone } = {}) {
  if (!needWrite()) return; const due = app.ix.dueById.get(dueId); if (!due) return toast('Installment not found', 'bad');
  const pol = app.ix.policyById.get(due.policy_id), cli = app.ix.clientById.get(pol.client_id);
  const today = app.today, late = amountOn(due.amount, due.due_date, pol.frequency, today, app.settings.late_fee);
  const body = document.createElement('form'); body.addEventListener('submit', e => e.preventDefault());
  body.innerHTML = `<div class="card" style="background:var(--bg)"><b>${esc(cli.name)}</b> · policy ${esc(pol.policy_no)} · ${esc(pol.frequency || '')}<br>Installment due <b>${D(due.due_date)}</b> · premium <b>${inr(due.amount)}</b>${due.paid_amount > 0 ? ` · already verified ₹${due.paid_amount}` : ''}</div>
  <div class="fgrid">${[
    { name: 'paid_on', label: 'Payment date', type: 'date', required: true, value: prefill.paid_on || today, max: today },
    { name: 'method', label: 'Method', type: 'select', options: PAY_METHODS, required: true, value: prefill.method || 'Cash' },
    { name: 'late_fee', label: 'Late fee included in amount (₹)', type: 'number', value: prefill.late_fee ?? late.fee, hint: late.fee ? `Estimated late fee if paid on the selected date: ₹${late.fee} (${late.months} month(s) late). The LIC portal figure is final – edit if different.` : 'No late fee within the grace period.' },
    { name: 'amount', label: 'Total amount received (₹)', type: 'number', required: true, value: prefill.amount ?? late.total },
    { name: 'reference', label: 'Reference (cheque no. / UTR / UPI ref / LIC receipt no.)', type: 'text', value: prefill.reference || '', full: true, hint: 'Required for every method except cash.' },
    { name: 'collected_by', label: 'Collected by', type: 'text', value: prefill.collected_by || app.settings.business.advisor_name || '' },
    { name: 'verified', label: 'Payment is verified (money actually received / confirmed in LIC portal or bank)', type: 'checkbox', value: prefill.verified ?? false, full: true, hint: 'The installment is marked PAID only when a verified payment covers the full premium. Leave unticked to record it as "received, awaiting verification".' },
    { name: 'allow_partial', label: 'Allow partial payment for this installment', type: 'checkbox', full: true, value: due.partial_allowed, hint: 'A partial amount is recorded but the installment stays PENDING until the full premium is verified.' },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, full: true }].map(f => fieldHtml(f)).join('')}</div><div id="pw"></div>`;
  const upd = () => { // recompute suggested late fee when the date changes
    const f = Object.fromEntries([...body.elements].filter(e => e.name).map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
    const covers = Number(f.amount || 0) - Number(f.late_fee || 0), remain = Number(due.amount) - Number(due.paid_amount || 0) - covers;
    $('#pw', body).innerHTML = f.verified && remain > 0.005 ? `<div class="banner warn">The premium part (₹${covers}) is less than the premium due (₹${due.amount}). This will be a <b>partial</b> payment – the installment will remain pending.</div>` : '';
  };
  body.addEventListener('change', e => { if (e.target.name === 'paid_on') { const l = amountOn(due.amount, due.due_date, pol.frequency, e.target.value, app.settings.late_fee); body.elements.late_fee.value = l.fee; body.elements.amount.value = l.total; } upd(); }); body.addEventListener('input', upd); upd();
  modal({ title: 'Record payment', body, actions: [{ label: 'Save payment', kind: 'primary', onClick: async (close) => {
    if (!body.reportValidity()) return false;
    const f = Object.fromEntries([...body.elements].filter(e => e.name).map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
    const plan = planPayment({ due, policy: pol, client: cli, amount: f.amount, lateFee: f.late_fee, paidOn: f.paid_on, method: f.method, reference: f.reference, collectedBy: f.collected_by, verified: f.verified, notes: f.notes, today });
    if (plan.errors?.length) { toast(plan.errors.join(' '), 'bad'); return false; }
    if (plan.isPartial && !f.allow_partial) { toast('This is a partial amount. Tick "Allow partial payment" to record it – it will not mark the premium as paid.', 'bad'); return false; }
    if (f.allow_partial && !due.partial_allowed) await app.store.update('premium_dues', due.id, { partial_allowed: true });
    const tx = await app.store.insert('premium_transactions', plan.transaction);
    const fresh = app.ix && app.store.data.dues.find(d => d.id === due.id);
    if (tx.verified && fresh?.status === 'paid') {
      await app.store.insert('receipts', { transaction_id: tx.id, due_id: due.id, policy_id: pol.id, client_id: cli.id, payment_date: tx.paid_on, amount: tx.amount, payment_reference: tx.reference || null, status: 'Awaiting Receipt' });
      const adv = nextDueDate(pol, due.due_date); if (adv) await app.store.update('policies', pol.id, { next_due_date: adv });
    }
    if (visit) await app.store.update('collection_visits', visit.id, { status: tx.verified ? 'Collected' : 'Visit Completed', amount_collected: tx.amount, transaction_id: tx.id });
    app.reindex(); await runAutomation({ silent: true }); close();
    toast(tx.verified ? (fresh?.status === 'paid' ? 'Payment recorded – premium marked PAID. Receipt is now awaited.' : 'Partial payment recorded – installment is still pending.') : 'Payment recorded – awaiting verification.', 'good'); onDone?.(tx); app.rerender(); return false;
  } }] });
}
export async function verifyTransaction(tx) {
  if (!needWrite()) return; if (!await confirmBox(`Confirm that ₹${tx.amount} (${tx.method}${tx.reference ? ', ref ' + esc(tx.reference) : ''}) was really received/credited?`, { yes: 'Yes, verified' })) return;
  await app.store.update('premium_transactions', tx.id, { verified: true });
  const due = app.store.data.dues.find(d => d.id === tx.due_id);
  if (due?.status === 'paid' && !app.data.receipts.some(r => r.transaction_id === tx.id)) await app.store.insert('receipts', { transaction_id: tx.id, due_id: due.id, policy_id: tx.policy_id, client_id: tx.client_id, payment_date: tx.paid_on, amount: tx.amount, payment_reference: tx.reference || null, status: 'Awaiting Receipt' });
  app.reindex(); await runAutomation({ silent: true }); toast(due?.status === 'paid' ? 'Verified – premium marked PAID.' : 'Verified – but the premium is not fully covered, so it stays pending.', 'good'); app.rerender();
}

/* ------------------------------------------------ client / policy ------------------------------------------------ */
export function clientForm(client) {
  if (!needWrite()) return; const isNew = !client; client = client || {};
  const fields = [
    { name: 'salutation', label: 'Salutation', type: 'select', options: ['Shri', 'Smt', 'Kum', 'Dr', 'M/s'], value: client.salutation }, { name: 'name', label: 'Full name', required: true },
    { name: 'mobile', label: 'Mobile (10 digits)', type: 'tel' }, { name: 'whatsapp', label: 'WhatsApp number', type: 'tel', hint: 'Leave blank if same as mobile' }, { name: 'alt_mobile', label: 'Alternate mobile', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
    { name: 'address', label: 'Address', type: 'textarea', rows: 2, full: true }, { name: 'area_city', label: 'Area / City' }, { name: 'latitude', label: 'Latitude (for route planner)', type: 'number', hint: 'Optional – paste from Google Maps (right-click → coordinates)' }, { name: 'longitude', label: 'Longitude', type: 'number' },
    { name: 'dob', label: 'Date of birth', type: 'date' }, { name: 'anniversary', label: 'Wedding anniversary', type: 'date' }, { name: 'occupation', label: 'Occupation' }, { name: 'business_name', label: 'Business name' },
    { name: 'preferred_contact', label: 'Preferred contact', type: 'select', options: PREFERRED }, { name: 'category', label: 'Category', type: 'select', options: app.settings.lists.categories || ['VIP', 'Regular', 'New', 'Dormant'], blank: false },
    { name: 'relationship_status', label: 'Relationship status', type: 'select', options: REL_STATUSES, blank: false },
    { name: 'family_id', label: 'Family', type: 'select', options: app.data.families.map(f => [f.id, f.family_name + (f.family_code ? ' (' + f.family_code + ')' : '')]), hint: 'Optional – choose an existing family, or leave blank for none' },
    { name: 'consent_whatsapp', label: 'Client agrees to receive WhatsApp messages', type: 'checkbox', full: true }, { name: 'high_service_priority', label: 'High service priority', type: 'checkbox' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }];
  return formModal({ title: isNew ? 'New client' : 'Edit client', fields, values: { consent_whatsapp: true, category: 'Regular', relationship_status: 'Active', ...client }, wide: true, onSubmit: async (v) => {
    if (v.mobile && !normalisePhone(v.mobile)) throw new Error('Mobile number must be 10 digits starting with 6–9.');
    for (const k of ['mobile', 'whatsapp', 'alt_mobile']) if (v[k]) v[k] = normalisePhone(v[k])?.slice(2) || v[k];
    if (isNew) { const dup = v.mobile && app.data.clients.find(c => c.mobile === v.mobile && c.name.toLowerCase() === v.name.toLowerCase()); if (dup && !await confirmBox(`A client named "${esc(dup.name)}" with this mobile already exists (${dup.client_code}). Save another one anyway?`)) throw new Error('Cancelled'); const c = await app.store.insert('clients', v); app.reindex(); app.go('#/clients/' + c.id); toast('Client ' + c.client_code + ' created', 'good'); }
    else { await app.store.update('clients', client.id, v); app.reindex(); toast('Client updated', 'good'); app.rerender(); }
  } });
}
export function policyForm(policy, clientId) {
  if (!needWrite()) return; const isNew = !policy; policy = policy || {};
  const fields = [
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: app.data.clients.filter(c => !c.archived).map(c => [c.id, `${c.name} (${c.client_code})`]).sort((a, b) => a[1].localeCompare(b[1])), value: policy.client_id || clientId, full: true },
    { name: 'insurance_company', label: 'Insurance company', value: policy.insurance_company || 'LIC of India' }, { name: 'policy_no', label: 'Policy number', required: true },
    { name: 'policy_type', label: 'Policy type', type: 'select', options: app.settings.lists.policy_types }, { name: 'plan_name', label: 'Plan name' }, { name: 'plan_code', label: 'Plan code' }, { name: 'start_date', label: 'Policy start date', type: 'date' },
    { name: 'premium', label: 'Premium amount (₹)', type: 'number', hint: 'Leave blank if unknown – nothing is assumed' }, { name: 'frequency', label: 'Premium frequency', type: 'select', options: FREQUENCIES }, { name: 'pay_mode', label: 'Payment mode' },
    { name: 'next_due_date', label: 'Next premium due date', type: 'date', hint: 'Leave blank if unknown – no reminders are created without a due date' }, { name: 'policy_term', label: 'Policy term (years)', type: 'number' }, { name: 'premium_paying_term', label: 'Premium paying term (years)', type: 'number' },
    { name: 'maturity_date', label: 'Maturity date', type: 'date' }, { name: 'sum_assured', label: 'Sum assured (₹)', type: 'number' }, { name: 'nominee', label: 'Nominee' },
    { name: 'status', label: 'Status', type: 'select', options: POLICY_STATUSES, blank: false }, { name: 'agency_code', label: 'Agency code' }, { name: 'branch', label: 'Branch' }, { name: 'advisor_notes', label: 'Notes', type: 'textarea', full: true }];
  return formModal({ title: isNew ? 'New policy' : 'Edit policy ' + policy.policy_no, fields, values: { status: 'In force', ...policy }, wide: true, onSubmit: async (v) => {
    if (isNew && app.data.policies.some(p => p.policy_no === v.policy_no)) throw new Error('A policy with this number already exists.');
    if (v.maturity_date && v.start_date && v.maturity_date < v.start_date) throw new Error('Maturity date is before the start date.');
    if (v.maturity_date !== policy.maturity_date) v.maturity_date_exact = !!v.maturity_date;
    if (isNew) { const p = await app.store.insert('policies', v); app.reindex(); toast('Policy ' + p.policy_code + ' saved', 'good'); await runAutomation({ silent: true }); app.rerender(); }
    else { await app.store.update('policies', policy.id, v); app.reindex(); toast('Policy updated', 'good'); app.rerender(); }
  } });
}

/* ------------------------------------------------ tasks ------------------------------------------------ */
export function taskForm(task, preset = {}) {
  if (!needWrite()) return; const isNew = !task; task = task || {};
  const fields = [
    { name: 'client_id', label: 'Client', type: 'select', options: app.data.clients.filter(c => !c.archived).map(c => [c.id, `${c.name} (${c.client_code})`]).sort((a, b) => a[1].localeCompare(b[1])), value: task.client_id || preset.client_id, full: true },
    { name: 'category', label: 'Category', type: 'select', options: app.settings.lists.task_categories || CATEGORIES, required: true, blank: false }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, blank: false },
    { name: 'description', label: 'What needs to be done', required: true, full: true }, { name: 'due_date', label: 'Due date', type: 'date', required: true }, { name: 'assigned_to', label: 'Assigned to' },
    { name: 'next_action', label: 'Next action', required: true, hint: 'Every open task must have a next action and a date', full: true }, { name: 'next_action_date', label: 'Next action date', type: 'date', required: true },
    { name: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Waiting', 'Done', 'Cancelled'], blank: false }, { name: 'last_action', label: 'Last action taken', full: true }];
  return formModal({ title: isNew ? 'New task' : 'Edit task ' + (task.task_code || ''), fields, values: { priority: 'Medium', status: 'Open', due_date: app.today, next_action_date: app.today, category: 'Other Service', assigned_to: app.settings.business.advisor_name, ...preset, ...task }, wide: true, onSubmit: async (v) => {
    if (['Done', 'Cancelled'].includes(v.status) && !task.completed_on) v.completed_on = app.today;
    if (isNew) await app.store.insert('tasks', { ...v, source: 'manual' }); else await app.store.update('tasks', task.id, v); app.reindex(); toast('Task saved', 'good'); app.rerender();
  } });
}
export function completeTask(task) {
  if (!needWrite()) return;
  return formModal({ title: 'Complete task', intro: esc(task.description), fields: [{ name: 'last_action', label: 'What was done / outcome', type: 'textarea', required: true, full: true }, { name: 'next_action', label: 'Follow-up needed? (leave blank if none)', full: true }, { name: 'next_action_date', label: 'Follow-up date', type: 'date' }], submit: 'Mark done', onSubmit: async (v) => {
    await app.store.update('tasks', task.id, { status: 'Done', completed_on: app.today, last_action: v.last_action });
    if (v.next_action) { if (!v.next_action_date) throw new Error('Choose a date for the follow-up.'); await app.store.insert('tasks', { client_id: task.client_id, policy_id: task.policy_id, category: task.category, description: v.next_action, due_date: v.next_action_date, priority: task.priority, assigned_to: task.assigned_to, next_action: v.next_action, next_action_date: v.next_action_date, status: 'Open', source: 'manual', ref_table: task.ref_table, ref_id: task.ref_id }); }
    if (task.client_id) await app.store.insert('communications', { client_id: task.client_id, policy_id: task.policy_id, direction: 'out', channel: 'Note', message: `Task done: ${task.description} – ${v.last_action}`, status: 'sent' });
    app.reindex(); toast('Task completed', 'good'); app.rerender();
  } });
}
export async function snoozeTask(task, days) { if (!needWrite()) return; const d = addDays(app.today, days); await app.store.update('tasks', task.id, { next_action_date: d, due_date: task.due_date < d ? d : task.due_date }); app.reindex(); toast('Moved to ' + D(d)); app.rerender(); }

/* ------------------------------------------------ visits ------------------------------------------------ */
export function visitForm(visit, preset = {}) {
  if (!needWrite()) return; const isNew = !visit; visit = visit || {};
  const fields = [
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: app.data.clients.filter(c => !c.archived).map(c => [c.id, `${c.name} (${c.client_code}) – ${c.area_city || ''}`]).sort((a, b) => a[1].localeCompare(b[1])), value: visit.client_id || preset.client_id, full: true },
    { name: 'purpose', label: 'Purpose', type: 'select', options: VISIT_PURPOSES, blank: false }, { name: 'visit_date', label: 'Visit date', type: 'date', required: true }, { name: 'method', label: 'Expected method', type: 'select', options: COLLECTION_METHODS }, { name: 'amount_expected', label: 'Amount expected (₹)', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: VISIT_STATUSES, blank: false }, { name: 'due_id', label: 'Related installment', type: 'select', options: [], hint: '' }, { name: 'remarks', label: 'Remarks / outcome', type: 'textarea', full: true }];
  const pending = () => app.data.dues.filter(d => d.status === 'pending' && !d.verify_first).map(d => { const p = app.ix.policyById.get(d.policy_id); return { d, p }; });
  return formModal({ title: isNew ? 'Schedule visit' : 'Edit visit', fields, values: { purpose: 'Premium collection', visit_date: app.today, status: 'Scheduled', ...preset, ...visit }, wide: true,
    extra: (ov) => { const cs = ov.querySelector('[name=client_id]'), ds = ov.querySelector('[name=due_id]'); const fill = () => { const list = pending().filter(x => x.p.client_id === cs.value); ds.innerHTML = '<option value="">— none —</option>' + list.map(x => `<option value="${x.d.id}" ${x.d.id === (visit.due_id || preset.due_id) ? 'selected' : ''}>${esc(x.p.policy_no)} · due ${D(x.d.due_date)} · ${inr(x.d.amount)}</option>`).join(''); }; cs.onchange = fill; fill(); ds.onchange = () => { const d = app.ix.dueById.get(ds.value); if (d) { ov.querySelector('[name=amount_expected]').value = d.amount; } }; },
    onSubmit: async (v) => { const due = v.due_id && app.ix.dueById.get(v.due_id); if (due) v.policy_id = due.policy_id; if (isNew) await app.store.insert('collection_visits', v); else await app.store.update('collection_visits', visit.id, v); app.reindex(); toast('Visit saved', 'good'); app.rerender(); } });
}
export async function logNote(clientId, channel = 'Note') {
  if (!needWrite()) return;
  formModal({ title: 'Add to timeline', fields: [{ name: 'channel', label: 'Type', type: 'select', options: ['Note', 'Call', 'Visit', 'WhatsApp', 'Email', 'SMS'], blank: false }, { name: 'message', label: 'What happened', type: 'textarea', required: true, full: true }], values: { channel }, onSubmit: async v => { await app.store.insert('communications', { client_id: clientId, direction: 'out', channel: v.channel, message: v.message, status: 'sent' }); toast('Added', 'good'); app.rerender(); } });
}
