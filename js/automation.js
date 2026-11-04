// Automation planner: PURE function. Given a snapshot of the data it returns the rows to insert / patch.
// The same file runs in the browser (when the app is open) and inside the "daily-automation" Edge Function.
// Re-running it is always safe: every generated row has a unique key, so nothing is ever created twice.
import { addDays, diffDays, fmtDate } from './dates.js';
import { ACTIVE_POLICY, OPEN_TASK, CLAIM_STAGES } from './defaults.js';
import { nextDueDate, graceEnd, lapseRisk } from './premium.js';

const uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); });
const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const DEFAULT_CLAIM_DOCS = {
  'Maturity': ['Original policy bond / indemnity bond','Discharge voucher (signed, with revenue stamp if required)','Cancelled cheque / bank passbook copy','ID proof (Aadhaar / PAN)','Address proof','Photograph (if asked by LIC)','NEFT mandate'],
  'Survival Benefit': ['Discharge voucher','Cancelled cheque / bank passbook copy','ID proof (Aadhaar / PAN)','Policy bond (if asked)'],
  'Death': ['Claim form','Death certificate','Original policy bond','Nominee ID & address proof','Nominee bank details','Medical / hospital records (if applicable)','FIR / post-mortem (unnatural death)'],
  'Health': ['Claim form','Hospital discharge summary','Bills and receipts','Investigation reports','ID proof','Bank details'],
  'General Insurance': ['Claim form','Policy copy','ID proof','Supporting bills / reports','Bank details'],
  'Other': []
};
const NEXT_ACTION_BY_STAGE = {
  'Maturity Approaching':'Inform client about the upcoming maturity','Client Informed':'Send the list of required documents','Documents Required':'Collect documents from client',
  'Documents Collected':'Submit the claim to the insurer','Claim Submitted':'Follow up with the insurer','Claim Under Process':'Follow up with the insurer for settlement',
  'Payment Received':'Confirm payment with client and complete','Completed':'—'
};
export function nextActionForStage(stage){ return NEXT_ACTION_BY_STAGE[stage] || 'Follow up'; }

export function planAutomations(data, today, settings, opts = {}) {
  const S = settings, A = S.automation, R = S.reminder;
  const inserts = { premium_dues:[], premium_reminders:[], tasks:[], claims:[], receipts:[] };
  const patches = { tasks:[], claims:[] };
  const summary = { A:0, B:0, C:0, D:0, E:0, F:0, G:0, H:{}, dues_created:0, reminders_created:0, tasks_created:0, tasks_updated:0, tasks_closed:0, claims_created:0, receipts_created:0 };

  const clientById = new Map(data.clients.map(c => [c.id, c]));
  const policyById = new Map(data.policies.map(p => [p.id, p]));
  const duesByPolicy = new Map(); for (const d of data.dues) { if (!duesByPolicy.has(d.policy_id)) duesByPolicy.set(d.policy_id, []); duesByPolicy.get(d.policy_id).push(d); }
  const receiptByDue = new Map(); for (const r of data.receipts) if (r.due_id) receiptByDue.set(r.due_id, r);
  const reminderKeys = new Set(data.reminders.map(r => r.due_id + ':' + r.stage));
  const openByKey = new Map(), anyKeys = new Set();
  for (const t of data.tasks) { if (t.auto_key) { anyKeys.add(t.auto_key); if (OPEN_TASK.includes(t.status)) openByKey.set(t.auto_key, t); } }
  const claimKey = new Set(data.claims.map(c => c.policy_id + '|' + c.claim_type + '|' + (c.event_date||'')));

  const seenKeys = new Set();
  const upsertTask = (key, row, { rolling = true } = {}) => {
    seenKeys.add(key);
    const open = openByKey.get(key);
    if (open) {
      const patch = {};
      if (row.description !== open.description) patch.description = row.description;
      if (row.priority !== open.priority && row.priority_force !== false) patch.priority = row.priority;
      if (Object.keys(patch).length) { patches.tasks.push({ id: open.id, patch }); summary.tasks_updated++; }
      return open;
    }
    if (!rolling && anyKeys.has(key)) return null;        // milestone-style tasks are created once ever
    const t = { id: uuid(), task_code: undefined, status:'Open', created_on: today, source:'automation', auto_key: key, ...row };
    delete t.priority_force;
    inserts.tasks.push(t); summary.tasks_created++; anyKeys.add(key); openByKey.set(key, t);
    return t;
  };
  const closeIfGone = (prefix, activeKeys, note) => {
    for (const [key, t] of openByKey) {
      if (!key.startsWith(prefix) || activeKeys.has(key) || !t.id) continue;
      if (inserts.tasks.includes(t)) continue;
      patches.tasks.push({ id: t.id, patch: { status:'Done', completed_on: today, last_action: note, next_action: null, next_action_date: null } });
      summary.tasks_closed++; openByKey.delete(key);
    }
  };

  /* ---------- 0. create the next installment once the previous one is paid (or when nothing exists yet) ---------- */
  if (A.auto_next_due !== false) {
    const horizon = addDays(today, 45);
    for (const p of data.policies) {
      if (p.status !== 'In force' || p.archived) continue;
      const list = duesByPolicy.get(p.id) || [];
      const pending = list.filter(d => d.status === 'pending');
      if (pending.length) continue;                         // wait until the open installment is settled
      let nd = null;
      if (list.length) { const last = list.reduce((a, b) => a.due_date > b.due_date ? a : b); nd = nextDueDate(p, last.due_date); }
      else if (p.next_due_date && p.next_due_date >= today) nd = p.next_due_date;
      if (nd && nd <= horizon && nd >= addDays(today, -7) && !list.some(d => d.due_date === nd) && p.premium > 0) {
        const row = { id: uuid(), policy_id: p.id, due_date: nd, amount: p.premium, status:'pending', source_list:'auto' };
        inserts.premium_dues.push(row); summary.dues_created++;
        (duesByPolicy.get(p.id) || duesByPolicy.set(p.id, []).get(p.id)).push(row);
      }
    }
  }

  /* ---------- firm pending dues (verify-first entries are kept out of reminders unless switched on) ---------- */
  const allDues = [...data.dues, ...inserts.premium_dues];
  const firmPending = allDues.filter(d => d.status === 'pending' && (!d.verify_first || R.include_verify));
  const stages = [];
  for (const n of R.before) stages.push({ key:'B'+n, offset:-n, label:`${n} day${n>1?'s':''} before due date` });
  if (R.on_due) stages.push({ key:'D0', offset:0, label:'On the due date' });
  for (const n of R.after) stages.push({ key:'A'+n, offset:n, label:`${n} day${n>1?'s':''} after due date` });
  stages.sort((a, b) => a.offset - b.offset);

  /* ---------- 1. reminder history rows (one per installment and stage, never duplicated) ---------- */
  for (const d of firmPending) {
    const p = policyById.get(d.policy_id); if (!p || p.status !== 'In force') continue;
    const c = clientById.get(p.client_id); if (!c) continue;
    const due = stages.filter(s => addDays(d.due_date, s.offset) <= today);
    if (!due.length) continue;
    const top = due[due.length - 1];
    if (reminderKeys.has(d.id + ':' + top.key)) continue;
    const channel = (['WhatsApp','Call','SMS','Email'].includes(c.preferred_contact) ? c.preferred_contact : ((c.whatsapp || c.mobile) && c.consent_whatsapp !== false ? 'WhatsApp' : 'Call'));
    inserts.premium_reminders.push({ id: uuid(), due_id: d.id, policy_id: p.id, client_id: c.id, stage: top.key, scheduled_for: addDays(d.due_date, top.offset), channel, status:'scheduled', remarks: top.label });
    reminderKeys.add(d.id + ':' + top.key); summary.reminders_created++;
  }

  /* ---------- A + B. one rolling task per client for upcoming and for overdue premiums ---------- */
  const byClient = new Map();
  for (const d of firmPending) {
    const p = policyById.get(d.policy_id); if (!p || p.status !== 'In force') continue;
    if (!byClient.has(p.client_id)) byClient.set(p.client_id, []);
    byClient.get(p.client_id).push({ d, p });
  }
  const aKeys = new Set(), bKeys = new Set();
  for (const [cid, list] of byClient) {
    const c = clientById.get(cid); if (!c) continue;
    const upcoming = list.filter(x => x.d.due_date >= today && diffDays(x.d.due_date, today) <= R.lookahead_days);
    const overdue = list.filter(x => x.d.due_date < today);
    if (A.A && upcoming.length) {
      const key = 'A:' + cid; aKeys.add(key);
      const first = upcoming.reduce((a, b) => a.d.due_date < b.d.due_date ? a : b);
      const days = diffDays(first.d.due_date, today);
      upsertTask(key, { client_id: cid, policy_id: upcoming.length === 1 ? first.p.id : null, category:'Premium Reminder',
        description: `Send premium reminder – ${upcoming.length} installment${upcoming.length>1?'s':''} due by ${fmtDate(upcoming.reduce((a,b)=>a.d.due_date>b.d.due_date?a:b).d.due_date)} (${money(upcoming.reduce((s,x)=>s+Number(x.d.amount),0))})`,
        due_date: today, priority: days <= 1 ? 'High' : 'Medium', assigned_to: null, next_action:'Send WhatsApp / call reminder', next_action_date: today, ref_table:'premium_dues', ref_id: first.d.id });
      summary.A++;
    }
    if (A.B && overdue.length) {
      const key = 'B:' + cid; bKeys.add(key);
      const oldest = overdue.reduce((a, b) => a.d.due_date < b.d.due_date ? a : b);
      const risk = overdue.some(x => lapseRisk(x.d, x.p, today));
      upsertTask(key, { client_id: cid, policy_id: overdue.length === 1 ? oldest.p.id : null, category:'Premium Reminder',
        description: `Overdue premium follow-up – ${overdue.length} installment${overdue.length>1?'s':''}, ${money(overdue.reduce((s,x)=>s+Number(x.d.amount),0))} (oldest ${fmtDate(oldest.d.due_date)}${risk?', PAST GRACE – lapse risk':''})`,
        due_date: today, priority: risk ? 'Critical' : 'High', next_action: risk ? 'Call client today – policy may lapse' : 'Call / WhatsApp follow-up', next_action_date: today, ref_table:'premium_dues', ref_id: oldest.d.id });
      summary.B++;
    }
  }
  closeIfGone('A:', aKeys, 'Auto-closed: no installment due in the reminder window any more');
  closeIfGone('B:', bKeys, 'Auto-closed: no overdue installment any more');

  /* ---------- C + D. receipt dispatch: every verified payment needs a receipt, undispatched receipts raise an alert ---------- */
  const rKeys = new Set();
  for (const d of data.dues) {
    if (d.status !== 'paid') continue;
    const p = policyById.get(d.policy_id); if (!p) continue;
    let r = receiptByDue.get(d.id);
    if (!r && A.C && d.paid_on && diffDays(today, d.paid_on) <= 90) {
      r = { id: uuid(), due_id: d.id, policy_id: p.id, client_id: p.client_id, payment_date: d.paid_on, amount: d.paid_amount || d.amount, status:'Awaiting Receipt', notes:'Created automatically after payment was recorded' };
      inserts.receipts.push(r); summary.receipts_created++; summary.C++; receiptByDue.set(d.id, r);
    }
    if (!r) continue;
    const pendingDispatch = ['Awaiting Receipt','Receipt Received','Dispatch Pending'].includes(r.status);
    const key = 'R:' + d.id;
    if (pendingDispatch) {
      rKeys.add(key);
      const late = A.D && diffDays(today, r.payment_date) >= A.receipt_alert_days;
      const c = clientById.get(p.client_id);
      upsertTask(key, { client_id: p.client_id, policy_id: p.id, category:'Receipt Dispatch',
        description: `${late ? 'ALERT – receipt not dispatched. ' : ''}${r.status === 'Awaiting Receipt' ? 'Get the insurer receipt and' : 'Dispatch receipt:'} policy ${p.policy_no}, ${money(r.amount)} paid ${fmtDate(r.payment_date)}${c ? ' – ' + c.name : ''}`,
        due_date: today, priority: late ? 'High' : 'Medium', next_action: r.status === 'Awaiting Receipt' ? 'Download / collect the insurer receipt and upload it' : 'Send the receipt to the client', next_action_date: today, ref_table:'receipts', ref_id: r.id });
      if (late) summary.D++;
    }
  }
  closeIfGone('R:', rKeys, 'Auto-closed: receipt dispatched');

  /* ---------- E. maturity and claims ---------- */
  if (A.E) {
    const ms = [...A.maturity_milestones].sort((a, b) => a - b);
    for (const p of data.policies) {
      if (!p.maturity_date || p.archived || !ACTIVE_POLICY.includes(p.status)) continue;
      const days = diffDays(p.maturity_date, today);
      if (days > ms[ms.length - 1] || days < -90) continue;
      let claim = data.claims.find(c => c.policy_id === p.id && c.claim_type === 'Maturity' && c.event_date === p.maturity_date) || inserts.claims.find(c => c.policy_id === p.id && c.event_date === p.maturity_date);
      if (!claim && !claimKey.has(p.id + '|Maturity|' + p.maturity_date)) {
        claim = { id: uuid(), claim_type:'Maturity', policy_id: p.id, client_id: p.client_id, event_date: p.maturity_date, stage:'Maturity Approaching', expected_amount: null,
          required_documents: DEFAULT_CLAIM_DOCS['Maturity'].map(n => ({ name: n, received: false, received_on: null })), remarks:'Created automatically as maturity approaches' };
        inserts.claims.push(claim); summary.claims_created++; claimKey.add(p.id + '|Maturity|' + p.maturity_date);
      }
      if (claim && ['Payment Received','Completed'].includes(claim.stage)) continue;
      const m = ms.find(x => days <= x); if (m === undefined) continue;
      const key = `E:${p.id}:${m}`;
      const c = clientById.get(p.client_id);
      const stage = claim?.stage || 'Maturity Approaching';
      const t = upsertTask(key, { client_id: p.client_id, policy_id: p.id, category:'Maturity Claim',
        description: `${days >= 0 ? `Maturity in ${days} day${days===1?'':'s'}` : `Matured ${-days} day${days===-1?'':'s'} ago`} (${fmtDate(p.maturity_date)}) – policy ${p.policy_no}${c ? ', ' + c.name : ''}. Claim stage: ${stage}.`,
        due_date: today, priority: days <= 15 ? 'Critical' : days <= 30 ? 'High' : days <= 90 ? 'Medium' : 'Low', priority_force:false,
        next_action: nextActionForStage(stage), next_action_date: today, ref_table:'claims', ref_id: claim?.id || null }, { rolling:false });
      if (t) summary.E++;
    }
  }

  /* ---------- F. unsuccessful / missed visits get a reschedule suggestion ---------- */
  if (A.F) {
    for (const v of data.visits) {
      const missed = ['Payment Not Received','Not Met','Visit Pending'].includes(v.status) || (['Scheduled','Client Confirmed'].includes(v.status) && v.visit_date < today);
      if (!missed || v.rescheduled_to) continue;
      const c = clientById.get(v.client_id); if (!c) continue;
      const t = upsertTask('F:' + v.id, { client_id: v.client_id, policy_id: v.policy_id || null, category:'Client Meeting',
        description: `Visit on ${fmtDate(v.visit_date)} (${v.purpose}) was not completed – reschedule the visit to ${c.name}`, due_date: today, priority:'High',
        next_action:'Call the client and fix a new visit date', next_action_date: today, ref_table:'collection_visits', ref_id: v.id }, { rolling:false });
      if (t) summary.F++;
    }
  }

  /* ---------- G + H. reports only (nothing is changed): overdue tasks and tomorrow's action list ---------- */
  summary.G = data.tasks.filter(t => OPEN_TASK.includes(t.status) && t.due_date < today).length;
  const tomorrow = addDays(today, 1);
  summary.H = {
    date: tomorrow,
    tasks: data.tasks.filter(t => OPEN_TASK.includes(t.status) && (t.next_action_date || t.due_date) <= tomorrow).length,
    dues: firmPending.filter(d => d.due_date === tomorrow).length,
    visits: data.visits.filter(v => v.visit_date === tomorrow && !['Cancelled','Collected','Completed'].includes(v.status)).length
  };
  return { inserts, patches, summary };
}

/** Apply a plan through any store that offers insert(table, rows, {ignoreDuplicates}) and update(table, id, patch). */
export async function applyPlan(store, plan) {
  const order = ['premium_dues','claims','receipts','premium_reminders','tasks'];
  for (const t of order) { const rows = plan.inserts[t]; if (rows && rows.length) await store.insertMany(t, rows, { ignoreDuplicates:true }); }
  for (const { id, patch } of plan.patches.tasks) await store.update('tasks', id, patch);
  for (const { id, patch } of plan.patches.claims) await store.update('claims', id, patch);
}
