import { addDays, addMonths, diffDays, parseISO, toISO, MS_DAY } from './dates.js';
import { FREQ_MONTHS, ACTIVE_POLICY } from './defaults.js';

/* ------------------------------------------------------------------------------------------
   Grace period and late fee
   Grace: up to the same date next month (15 days for monthly mode).  Late fee = premium x rate/12 per month late,
   rounded half-up to a rupee, minimum fee configurable.  The rule was fitted from the LIC outstanding list
   (matches LIC's printed amounts to the rupee for ~87% of cases, within Rs 1 for ~99%); LIC portal shows the final figure.
   ------------------------------------------------------------------------------------------ */
export function graceEnd(dueISO, frequency){
  if (frequency === 'Monthly') return addDays(dueISO, 15);
  return addMonths(dueISO, 1);
}
export function lateMonths(dueISO, frequency, payISO){
  if (payISO <= graceEnd(dueISO, frequency)) return 0;
  const baseDay = +dueISO.slice(8);
  let m = 0; while (addMonths(dueISO, m+1, baseDay) <= payISO) m++;
  const r = diffDays(payISO, addMonths(dueISO, m, baseDay));
  return Math.max(m + (r >= 15 ? 1 : 0), 1);
}
export function lateFeeFor(premium, months, cfg){
  if (months <= 0) return 0;
  const rate10 = Math.round((cfg?.rate_pct ?? 11.2) * 10);   // tenths of a percent, avoids float error
  const base = Math.floor((Math.round(premium) * rate10 * months + 6000) / 12000);
  return Math.max(cfg?.min_fee ?? 6, base);
}
export function amountOn(premium, dueISO, frequency, payISO, cfg){
  const months = lateMonths(dueISO, frequency, payISO);
  const fee = lateFeeFor(premium, months, cfg);
  return { months, fee, total: Math.round(premium) + fee, graceEnd: graceEnd(dueISO, frequency) };
}
/** the next date (after payISO) on which the late fee increases, with the new amount */
export function nextStep(premium, dueISO, frequency, payISO, cfg){
  const k0 = lateMonths(dueISO, frequency, payISO);
  for (let i = 1; i <= 800; i++) {
    const t = addDays(payISO, i);
    if (lateMonths(dueISO, frequency, t) > k0) return { from: t, ...amountOn(premium, dueISO, frequency, t, cfg) };
  }
  return null;
}

/* ------------------------------------------------------------------------------------------
   Premium status – derived from the due date, the verified payments and the receipt
   Upcoming | Due Soon | Due Today | Overdue | Payment Received | Receipt Pending | Completed   (+ Waived / Cancelled)
   ------------------------------------------------------------------------------------------ */
export function dueStatus(due, today, rcpt, settings){
  if (due.status === 'waived') return 'Waived';
  if (due.status === 'cancelled') return 'Cancelled';
  if (due.status === 'paid') {
    if (!rcpt) return 'Payment Received';
    return ['Dispatched','Client Confirmation Pending','Completed'].includes(rcpt.status) ? 'Completed' : 'Receipt Pending';
  }
  const d = diffDays(due.due_date, today);
  const soon = settings?.reminder?.due_soon_days ?? 15;
  if (d < 0) return 'Overdue';
  if (d === 0) return 'Due Today';
  if (d <= soon) return 'Due Soon';
  return 'Upcoming';
}
export const STATUS_TONE = { 'Upcoming':'neutral','Due Soon':'warn','Due Today':'warn','Overdue':'bad','Payment Received':'info','Receipt Pending':'info','Completed':'good','Waived':'neutral','Cancelled':'neutral' };

/** a pending installment past its grace period = the policy may lapse */
export function lapseRisk(due, policy, today){
  if (due.status !== 'pending') return false;
  return today > graceEnd(due.due_date, policy?.frequency);
}
export function graceEnding(due, policy, today, warnDays=5){
  if (due.status !== 'pending') return false;
  const ge = graceEnd(due.due_date, policy?.frequency);
  return today > due.due_date && today <= ge && diffDays(ge, today) <= warnDays;
}

/* ------------------------------------------------------------------------------------------
   Next installment (only when the policy and its terms give enough information – nothing is guessed)
   ------------------------------------------------------------------------------------------ */
export function nextDueDate(policy, afterISO){
  const step = FREQ_MONTHS[policy.frequency];
  if (!step) return null;                                   // Single premium or unknown frequency
  if (!ACTIVE_POLICY.includes(policy.status) || policy.status !== 'In force') return null;
  const day = +(policy.start_date || afterISO).slice(8);
  const nd = addMonths(afterISO, step, day);
  if (policy.maturity_date && nd >= policy.maturity_date) return null;
  if (policy.start_date && policy.premium_paying_term) {
    const lastPremiumDate = addMonths(policy.start_date, policy.premium_paying_term * 12, +policy.start_date.slice(8));
    if (nd >= lastPremiumDate) return null;                  // premium paying term finished
  }
  return nd;
}

/* ------------------------------------------------------------------------------------------
   Recording a payment.  Returns the rows to write; the database trigger decides whether the due becomes "paid".
   A payment is only 'verified' when the user explicitly confirms it – unverified entries never mark anything paid.
   ------------------------------------------------------------------------------------------ */
export function planPayment({ due, policy, client, amount, lateFee=0, paidOn, method, reference, collectedBy, verified, notes, today }) {
  const errors = [];
  amount = Number(amount); lateFee = Number(lateFee || 0);
  if (!(amount > 0)) errors.push('Enter the amount received.');
  if (lateFee < 0 || lateFee > amount) errors.push('Late fee cannot be more than the amount received.');
  if (!paidOn) errors.push('Enter the payment date.');
  else if (today && paidOn > today) errors.push('Payment date cannot be in the future.');
  if (!method) errors.push('Choose the payment method.');
  if (method && method !== 'Cash' && !String(reference||'').trim()) errors.push('Enter the reference (cheque / UTR / UPI / LIC receipt number) so the payment can be verified.');
  if (due.status !== 'pending') errors.push('This installment is already ' + due.status + '.');
  if (errors.length) return { errors };
  const covers = amount - lateFee;
  const wouldComplete = verified && covers >= Number(due.amount) - 0.005;
  const tx = { due_id: due.id, policy_id: policy.id, client_id: client.id, paid_on: paidOn, amount, late_fee: lateFee, method, reference: reference || null, collected_by: collectedBy || null, verified: !!verified, notes: notes || null };
  const out = { errors: [], transaction: tx, willBePaid: wouldComplete, isPartial: !!verified && covers < Number(due.amount) - 0.005 };
  return out;
}
