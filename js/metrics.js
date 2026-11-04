// Dashboard numbers, alerts, engagement score and report builders. Pure functions over the loaded data.
import { addDays, diffDays, fmtDate, monthKey, monthLabel, startOfWeek, nextOccurrence, ageYears } from './dates.js';
import { ACTIVE_POLICY, OPEN_TASK, FREQ_PER_YEAR, PRIORITY_RANK } from './defaults.js';
import { dueStatus, lapseRisk, graceEnding, graceEnd } from './premium.js';

export function indexData(data) {
  const ix = { clientById:new Map(), policyById:new Map(), dueById:new Map(), policiesByClient:new Map(), duesByPolicy:new Map(), receiptByDue:new Map(), claimsByPolicy:new Map(), familyById:new Map(), clientsByFamily:new Map(), txByDue:new Map() };
  for (const c of data.clients) { ix.clientById.set(c.id, c); if (c.family_id) { if (!ix.clientsByFamily.has(c.family_id)) ix.clientsByFamily.set(c.family_id, []); ix.clientsByFamily.get(c.family_id).push(c); } }
  for (const f of data.families||[]) ix.familyById.set(f.id, f);
  for (const p of data.policies) { ix.policyById.set(p.id, p); if (!ix.policiesByClient.has(p.client_id)) ix.policiesByClient.set(p.client_id, []); ix.policiesByClient.get(p.client_id).push(p); }
  for (const d of data.dues) { ix.dueById.set(d.id, d); if (!ix.duesByPolicy.has(d.policy_id)) ix.duesByPolicy.set(d.policy_id, []); ix.duesByPolicy.get(d.policy_id).push(d); }
  for (const r of data.receipts) if (r.due_id) ix.receiptByDue.set(r.due_id, r);
  for (const c of data.claims) { if (!ix.claimsByPolicy.has(c.policy_id)) ix.claimsByPolicy.set(c.policy_id, []); ix.claimsByPolicy.get(c.policy_id).push(c); }
  for (const t of data.transactions||[]) { if (!ix.txByDue.has(t.due_id)) ix.txByDue.set(t.due_id, []); ix.txByDue.get(t.due_id).push(t); }
  return ix;
}

export function annualPremium(p) { return ACTIVE_POLICY.includes(p.status) && p.status === 'In force' ? Number(p.premium||0) * (FREQ_PER_YEAR[p.frequency] ?? 0) : 0; }

/** Dues the advisor should act on: pending, not flagged verify-first */
export const firmPending = (data) => data.dues.filter(d => d.status === 'pending' && !d.verify_first);

export function computeMetrics(data, ix, today, S) {
  const m = {};
  const activePolicies = data.policies.filter(p => ACTIVE_POLICY.includes(p.status) && !p.archived);
  const fp = firmPending(data).filter(d => ix.policyById.get(d.policy_id)?.status === 'In force');
  m.clients = data.clients.filter(c => !c.archived).length;
  m.activePolicies = activePolicies.length;
  m.annualPremium = data.policies.reduce((s, p) => s + (p.archived ? 0 : annualPremium(p)), 0);
  m.dueToday = fp.filter(d => d.due_date === today);
  m.due7 = fp.filter(d => d.due_date >= today && diffDays(d.due_date, today) <= 7);
  m.overdue = fp.filter(d => d.due_date < today);
  const mk = monthKey(today);
  m.collectedMonth = data.transactions.filter(t => t.verified && monthKey(t.paid_on) === mk).reduce((s, t) => s + Number(t.amount) - Number(t.late_fee||0), 0);
  m.receiptsPending = data.receipts.filter(r => ['Awaiting Receipt','Receipt Received','Dispatch Pending'].includes(r.status));
  m.maturityUpcoming = data.claims.filter(c => !['Payment Received','Completed'].includes(c.stage) && c.event_date && diffDays(c.event_date, today) <= 90);
  m.followups = data.tasks.filter(t => OPEN_TASK.includes(t.status) && (t.next_action_date || t.due_date) <= today);
  const leadClients = new Set(data.clients.filter(c => c.relationship_status === 'Prospect' && !c.archived).map(c => c.id));
  data.tasks.filter(t => OPEN_TASK.includes(t.status) && t.category === 'New Business' && t.client_id).forEach(t => leadClients.add(t.client_id));
  m.leads = leadClients.size;
  m.atRisk = new Set(fp.filter(d => lapseRisk(d, ix.policyById.get(d.policy_id), today)).map(d => d.policy_id));
  m.overdueAmount = m.overdue.reduce((s, d) => s + Number(d.amount), 0);
  return m;
}

/** Colour coded alerts shown on the dashboard and in the bell menu */
export function computeAlerts(data, ix, today, S) {
  const A = [], push = (level, text, link, count) => A.push({ level, text, link, count });
  const fp = firmPending(data).filter(d => ix.policyById.get(d.policy_id)?.status === 'In force');
  const od = fp.filter(d => d.due_date < today);
  if (od.length) push('bad', `${od.length} premium installment${od.length>1?'s':''} overdue`, '#/premiums?f=overdue', od.length);
  const risk = fp.filter(d => lapseRisk(d, ix.policyById.get(d.policy_id), today));
  if (risk.length) push('bad', `${new Set(risk.map(d=>d.policy_id)).size} polic${new Set(risk.map(d=>d.policy_id)).size>1?'ies':'y'} past the grace period – at risk of lapse`, '#/premiums?f=lapse', risk.length);
  const ge = fp.filter(d => graceEnding(d, ix.policyById.get(d.policy_id), today, S.automation.lapse_warning_days));
  if (ge.length) push('warn', `${ge.length} policy grace period${ge.length>1?'s':''} ending within ${S.automation.lapse_warning_days} days`, '#/premiums?f=grace', ge.length);
  const mat = data.claims.filter(c => !['Payment Received','Completed'].includes(c.stage) && c.event_date && diffDays(c.event_date, today) <= 30);
  if (mat.length) push('warn', `${mat.length} maturit${mat.length>1?'ies':'y'} within 30 days (or already due)`, '#/claims', mat.length);
  const rn = data.receipts.filter(r => ['Awaiting Receipt','Receipt Received','Dispatch Pending'].includes(r.status) && diffDays(today, r.payment_date) >= S.automation.receipt_alert_days);
  if (rn.length) push('warn', `${rn.length} receipt${rn.length>1?'s':''} not dispatched for ${S.automation.receipt_alert_days}+ days`, '#/receipts', rn.length);
  const cd = data.claims.filter(c => ['Documents Required','Client Informed'].includes(c.stage) && c.event_date && diffDays(c.event_date, today) <= 60);
  if (cd.length) push('warn', `${cd.length} claim${cd.length>1?'s':''} waiting for documents`, '#/claims', cd.length);
  const missed = data.tasks.filter(t => OPEN_TASK.includes(t.status) && (t.next_action_date || t.due_date) < today);
  if (missed.length) push('bad', `${missed.length} follow-up${missed.length>1?'s':''} missed (next-action date passed)`, '#/tasks?f=overdue', missed.length);
  const unver = data.transactions.filter(t => !t.verified);
  if (unver.length) push('info', `${unver.length} payment${unver.length>1?'s':''} recorded but not yet verified`, '#/premiums?f=unverified', unver.length);
  const ver = data.dues.filter(d => d.status === 'pending' && d.verify_first);
  if (ver.length) push('info', `${ver.length} installment${ver.length>1?'s':''} flagged "verify first" (excluded from reminders)`, '#/premiums?f=verify', ver.length);
  return A;
}

/** Priority tasks for today: open tasks whose next-action date has come, sorted by priority */
export function todaysTasks(data, today) {
  return data.tasks.filter(t => OPEN_TASK.includes(t.status) && (t.next_action_date || t.due_date) <= today)
    .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || String(a.due_date).localeCompare(String(b.due_date)));
}
export function upcomingActivities(data, ix, today, days) {
  const end = addDays(today, days), out = [];
  for (const t of data.tasks) if (OPEN_TASK.includes(t.status)) { const d = t.next_action_date || t.due_date; if (d > today && d <= end) out.push({ date:d, kind:'Task', text:`${t.category}: ${t.description}`, ref:t, client_id:t.client_id }); }
  for (const d of firmPending(data)) if (d.due_date > today && d.due_date <= end) { const p = ix.policyById.get(d.policy_id); if (p?.status==='In force') out.push({ date:d.due_date, kind:'Premium due', text:`${ix.clientById.get(p.client_id)?.name||''} – policy ${p.policy_no} ₹${Math.round(d.amount).toLocaleString('en-IN')}`, ref:d, client_id:p.client_id }); }
  for (const v of data.visits) if (v.visit_date > today && v.visit_date <= end && !['Cancelled','Collected','Completed','Rescheduled'].includes(v.status)) out.push({ date:v.visit_date, kind:'Visit', text:`${v.purpose} – ${ix.clientById.get(v.client_id)?.name||''}`, ref:v, client_id:v.client_id });
  for (const c of data.claims) if (c.event_date && c.event_date > today && c.event_date <= end && !['Payment Received','Completed'].includes(c.stage)) { const p = ix.policyById.get(c.policy_id); out.push({ date:c.event_date, kind:c.claim_type, text:`${ix.clientById.get(c.client_id)?.name||''} – policy ${p?.policy_no||''}`, ref:c, client_id:c.client_id }); }
  for (const c of data.clients) { for (const [k, label] of [['dob','Birthday'],['anniversary','Anniversary']]) { const n = nextOccurrence(c[k], today); if (n && n > today && n <= end) out.push({ date:n, kind:label, text:c.name, ref:c, client_id:c.id }); } }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** chart series */
export function monthlyCollection(data, today, months = 12) {
  const keys = []; let y = +today.slice(0,4), mo = +today.slice(5,7);
  for (let i = 0; i < months; i++) { keys.unshift(`${y}-${String(mo).padStart(2,'0')}`); mo--; if (mo === 0) { mo = 12; y--; } }
  const sums = Object.fromEntries(keys.map(k => [k, 0]));
  for (const t of data.transactions) if (t.verified) { const k = monthKey(t.paid_on); if (k in sums) sums[k] += Number(t.amount) - Number(t.late_fee||0); }
  return keys.map(k => ({ key:k, label:monthLabel(k).slice(0,3)+" '"+k.slice(2,4), value:Math.round(sums[k]) }));
}
export function countByMonth(rows, dateField, today, months = 12, pred = () => true) {
  const keys = []; let y = +today.slice(0,4), mo = +today.slice(5,7);
  for (let i = 0; i < months; i++) { keys.unshift(`${y}-${String(mo).padStart(2,'0')}`); mo--; if (mo === 0) { mo = 12; y--; } }
  const c = Object.fromEntries(keys.map(k => [k, 0]));
  for (const r of rows) if (pred(r)) { const k = monthKey((r[dateField]||'').slice(0,10)); if (k in c) c[k]++; }
  return keys.map(k => ({ key:k, label:monthLabel(k).slice(0,3)+" '"+k.slice(2,4), value:c[k] }));
}

/* ------------------------------------------------------------------------------------------
   Client engagement score – explainable: base + weighted factors, every weight editable in Settings
   ------------------------------------------------------------------------------------------ */
export function engagementScore(client, data, ix, today, S) {
  const W = S.engagement, parts = [];
  const pols = (ix.policiesByClient.get(client.id) || []).filter(p => ACTIVE_POLICY.includes(p.status));
  const add = (label, pts, detail) => parts.push({ label, pts: Math.round(pts*10)/10, detail });
  add('Starting score', W.base, 'Everyone starts here');
  add('Active policies', Math.min(pols.length * W.w_policies, W.max_policies), `${pols.length} active × ${W.w_policies} (max ${W.max_policies})`);
  const dues = pols.flatMap(p => ix.duesByPolicy.get(p.id) || []);
  const paid = dues.filter(d => d.status === 'paid' && d.paid_on);
  const onTime = paid.filter(d => d.paid_on <= graceEnd(d.due_date, ix.policyById.get(d.policy_id)?.frequency)).length;
  add('Paying on time', paid.length ? W.w_ontime * onTime / paid.length : 0, paid.length ? `${onTime} of ${paid.length} recorded payments within grace` : 'No payments recorded yet');
  const comms = data.communications.filter(c => c.client_id === client.id && c.at).sort((a, b) => b.at.localeCompare(a.at));
  const last = comms[0] ? diffDays(today, comms[0].at.slice(0,10)) : null;
  add('Recent contact', last == null ? 0 : last <= 30 ? W.w_contact : last <= 90 ? W.w_contact / 2 : 0, last == null ? 'No contact logged' : `Last contact ${last} days ago`);
  const reg = client.registered_on ? diffDays(today, client.registered_on) / 365 : 0;
  add('Relationship length', Math.min(reg, 10) / 10 * W.w_tenure, `${reg.toFixed(1)} years with you`);
  const fam = client.family_id ? (ix.clientsByFamily.get(client.family_id) || []).length - 1 : 0;
  add('Family served', fam > 0 ? Math.min(fam, 3) / 3 * W.w_family : 0, `${Math.max(fam,0)} other family member(s) on file`);
  const pend = data.tasks.filter(t => t.client_id === client.id && OPEN_TASK.includes(t.status)).length;
  add('Pending issues', -Math.min(pend, 4) * W.p_pending, `${pend} open task(s) × ${W.p_pending}`);
  const od = dues.filter(d => d.status === 'pending' && d.due_date < today && !d.verify_first).length;
  add('Overdue premiums', -Math.min(od, 3) * W.p_overdue, `${od} overdue installment(s) × ${W.p_overdue}`);
  const score = Math.max(0, Math.min(100, Math.round(parts.reduce((s, p) => s + p.pts, 0))));
  return { score, parts };
}
export function clientSegments(client, data, ix, today) {
  const pols = (ix.policiesByClient.get(client.id) || []);
  const active = pols.filter(p => ACTIVE_POLICY.includes(p.status));
  const tags = [];
  if (client.category === 'VIP') tags.push('VIP');
  if (client.category === 'New' || (client.registered_on && diffDays(today, client.registered_on) <= 180)) tags.push('New');
  if (client.category === 'Dormant' || (active.length === 0)) tags.push('Dormant');
  if (client.high_service_priority) tags.push('High service priority');
  if (active.length >= 3) tags.push('Multiple policies');
  if (pols.some(p => p.maturity_date && ACTIVE_POLICY.includes(p.status) && diffDays(p.maturity_date, today) >= -30 && diffDays(p.maturity_date, today) <= 180)) tags.push('Upcoming maturity');
  return tags;
}

/* ------------------------------------------------------------------------------------------
   Reports – structured so the same object can be shown, exported to Excel and to PDF
   ------------------------------------------------------------------------------------------ */
const rs = n => '₹' + Math.round(n).toLocaleString('en-IN');
export function buildReport(kind, data, ix, today, S) {
  const cname = id => ix.clientById.get(id)?.name || '';
  const fp = firmPending(data).filter(d => ix.policyById.get(d.policy_id)?.status === 'In force');
  const txIn = (from, to) => data.transactions.filter(t => t.verified && t.paid_on >= from && t.paid_on <= to);
  const rep = { kind, title:'', date:today, summary:[], sections:[] };
  if (kind === 'daily') {
    rep.title = 'Daily Report – ' + fmtDate(today);
    const remDue = data.reminders.filter(r => r.scheduled_for === today || (r.status === 'scheduled' && r.scheduled_for <= today));
    const sent = data.reminders.filter(r => r.sent_at && r.sent_at.slice(0,10) === today || (r.status === 'sent' && r.scheduled_for === today));
    const visitsToday = data.visits.filter(v => v.visit_date === today);
    rep.summary = [['Premium reminders due', remDue.filter(r=>r.status==='scheduled').length], ['Reminders sent today', data.reminders.filter(r => (r.sent_at||'').slice(0,10) === today).length],
      ['Clients to call (overdue)', new Set(fp.filter(d=>d.due_date<today).map(d=>ix.policyById.get(d.policy_id).client_id)).size],
      ['Collections scheduled today', visitsToday.length], ['Collections completed today', visitsToday.filter(v=>v.status==='Collected').length],
      ['Receipts pending', data.receipts.filter(r=>['Awaiting Receipt','Receipt Received','Dispatch Pending'].includes(r.status)).length],
      ['Maturity follow-ups open', data.claims.filter(c=>!['Payment Received','Completed'].includes(c.stage) && c.event_date && diffDays(c.event_date,today)<=90).length],
      ['Overdue tasks', data.tasks.filter(t=>OPEN_TASK.includes(t.status)&&t.due_date<today).length]];
    rep.sections.push({ heading:'Today\'s priority tasks', columns:['Priority','Category','Client','Task','Next action'], rows: todaysTasks(data, today).slice(0, 200).map(t => [t.priority, t.category, cname(t.client_id), t.description, t.next_action||'']) });
    rep.sections.push({ heading:'Visits today', columns:['Client','Purpose','Status','Expected'], rows: visitsToday.map(v => [cname(v.client_id), v.purpose, v.status, v.amount_expected ? rs(v.amount_expected) : '']) });
    const tm = addDays(today, 1);
    rep.sections.push({ heading:'Tomorrow\'s planned activities (' + fmtDate(tm) + ')', columns:['Type','Details'],
      rows: [...data.tasks.filter(t=>OPEN_TASK.includes(t.status)&&(t.next_action_date||t.due_date)===tm).map(t=>['Task', `${t.category}: ${t.description}`]),
             ...fp.filter(d=>d.due_date===tm).map(d=>{const p=ix.policyById.get(d.policy_id);return ['Premium due',`${cname(p.client_id)} – ${p.policy_no} ${rs(d.amount)}`];}),
             ...data.visits.filter(v=>v.visit_date===tm&&!['Cancelled'].includes(v.status)).map(v=>['Visit',`${v.purpose} – ${cname(v.client_id)}`])] });
  } else if (kind === 'weekly') {
    const from = startOfWeek(today), to = addDays(from, 6);
    rep.title = `Weekly Report – ${fmtDate(from)} to ${fmtDate(to)}`;
    const tx = txIn(from, to); const coll = tx.reduce((s,t)=>s+Number(t.amount)-Number(t.late_fee||0),0);
    const dueInWeek = data.dues.filter(d => d.due_date >= from && d.due_date <= to && d.status !== 'cancelled' && d.status !== 'waived' && !d.verify_first);
    const paidOfThose = dueInWeek.filter(d => d.status === 'paid').length;
    rep.summary = [['Premiums collected', rs(coll)], ['Collection efficiency (this week\'s dues paid)', dueInWeek.length ? Math.round(100*paidOfThose/dueInWeek.length)+'% ('+paidOfThose+' of '+dueInWeek.length+')' : 'no dues this week'],
      ['Overdue premium portfolio', rs(fp.filter(d=>d.due_date<today).reduce((s,d)=>s+Number(d.amount),0))], ['Pending receipts', data.receipts.filter(r=>['Awaiting Receipt','Receipt Received','Dispatch Pending'].includes(r.status)).length],
      ['Maturity cases open', data.claims.filter(c=>c.claim_type==='Maturity'&&!['Payment Received','Completed'].includes(c.stage)).length], ['New clients', data.clients.filter(c=>c.registered_on>=from&&c.registered_on<=to).length],
      ['New business leads (open)', data.tasks.filter(t=>OPEN_TASK.includes(t.status)&&t.category==='New Business').length],
      ['Unresolved service requests', data.tasks.filter(t=>OPEN_TASK.includes(t.status)&&['Customer Complaint','Policy Correction','Nominee Update','Address Update','Other Service'].includes(t.category)).length]];
    rep.sections.push({ heading:'Payments received', columns:['Date','Client','Policy','Amount','Method','Reference'], rows: tx.map(t=>[fmtDate(t.paid_on), cname(t.client_id), ix.policyById.get(t.policy_id)?.policy_no||'', rs(t.amount), t.method, t.reference||'']) });
    rep.sections.push({ heading:'Overdue installments', columns:['Client','Policy','Due date','Days overdue','Amount'], rows: fp.filter(d=>d.due_date<today).sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,300).map(d=>{const p=ix.policyById.get(d.policy_id);return [cname(p.client_id),p.policy_no,fmtDate(d.due_date),diffDays(today,d.due_date),rs(d.amount)];}) });
  } else {
    const mk = monthKey(today), from = mk + '-01', to = addDays(from.slice(0,8)+'01', 0);
    const last = new Date(Date.UTC(+mk.slice(0,4), +mk.slice(5,7), 0)).getUTCDate(); const toD = mk + '-' + String(last).padStart(2,'0');
    rep.title = 'Monthly Report – ' + monthLabel(mk);
    const tx = txIn(from, toD); const coll = tx.reduce((s,t)=>s+Number(t.amount)-Number(t.late_fee||0),0);
    const dueM = data.dues.filter(d => d.due_date >= from && d.due_date <= toD && !['cancelled','waived'].includes(d.status) && !d.verify_first);
    const paidM = dueM.filter(d => d.status === 'paid');
    const target = Number(S.targets.monthly?.[mk] ?? S.targets.monthly_collection ?? 0);
    rep.summary = [['Total annual premium portfolio', rs(data.policies.reduce((s,p)=>s+annualPremium(p),0))], ['Total collection this month', rs(coll)], ['Collection target', target ? rs(target)+' ('+Math.round(100*coll/target)+'% achieved)' : 'not set'],
      ['New policies', data.policies.filter(p=>(p.created_at||'').slice(0,7)===mk).length], ['Renewal performance (this month\'s dues paid)', dueM.length ? Math.round(100*paidM.length/dueM.length)+'% ('+paidM.length+' of '+dueM.length+')' : 'no dues'],
      ['Policies at lapse risk', new Set(fp.filter(d=>lapseRisk(d,ix.policyById.get(d.policy_id),today)).map(d=>d.policy_id)).size], ['Maturity claims processed', data.claims.filter(c=>c.actual_settlement&&monthKey(c.actual_settlement)===mk).length],
      ['New clients', data.clients.filter(c=>monthKey(c.registered_on)===mk).length], ['Pending service activities', data.tasks.filter(t=>OPEN_TASK.includes(t.status)).length]];
    rep.sections.push({ heading:'Collections by method', columns:['Method','Payments','Amount'], rows: Object.entries(tx.reduce((a,t)=>{(a[t.method]=a[t.method]||{n:0,s:0}).n++;a[t.method].s+=Number(t.amount)-Number(t.late_fee||0);return a;},{})).map(([k,v])=>[k,v.n,rs(v.s)]) });
    rep.sections.push({ heading:'Installments not yet paid for this month', columns:['Client','Policy','Due date','Amount','Status'], rows: dueM.filter(d=>d.status==='pending').map(d=>{const p=ix.policyById.get(d.policy_id);return [cname(p.client_id),p.policy_no,fmtDate(d.due_date),rs(d.amount),dueStatus(d,today,null,S)];}).slice(0,400) });
  }
  return rep;
}
