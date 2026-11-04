import { computeMetrics, computeAlerts, todaysTasks, upcomingActivities, monthlyCollection, firmPending } from '../metrics.js';
import { esc, inr0, inr, D, badge, chips, $, $$, DT } from '../ui.js';
import { barChart, donut, legend } from '../charts.js';
import { runAutomation, completeTask, snoozeTask } from '../actions.js';
import { dueStatus } from '../premium.js';
import { diffDays, monthKey, monthLabel } from '../dates.js';
import { OPEN_TASK } from '../defaults.js';

let span = 7;
export async function render(app, el) {
  const { data, ix, today, settings: S } = app, m = computeMetrics(data, ix, today, S), alerts = computeAlerts(data, ix, today, S);
  const last = await app.store.lastAutomationRun();
  const greet = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }) < 12 ? 'Good morning' : new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }) < 17 ? 'Good afternoon' : 'Good evening';
  const stat = (label, val, link, tone = '', sub = '') => `<a class="stat ${tone}" href="${link}"><div class="l">${label}</div><div class="v">${val}</div><div class="d">${sub || '&nbsp;'}</div></a>`;
  const sum = rows => inr0(rows.reduce((s, d) => s + Number(d.amount), 0));
  if (!data.clients.length) { el.innerHTML = `<div class="card"><h1>Welcome 👋</h1><p>Your CRM is empty. Start by importing your client and policy data from Excel (the prepared <b>LIC_Import_Nov2026.xlsx</b> works directly), or add clients manually.</p><p><a class="btn primary" href="#/data">Import from Excel</a> <a class="btn" href="#/clients">Add a client</a></p></div>`; return; }
  el.innerHTML = `<div class="head"><div class="grow"><h1>${greet}${S.business.advisor_name ? ', ' + esc(S.business.advisor_name.split(' ')[0]) : ''}</h1><div class="sub">${D(today)} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Kolkata' })}</div></div>
   ${app.can('write') ? '<button id="ra">⚙ Run daily automation</button>' : ''}</div>
   <div class="mut sm" style="margin:-8px 0 12px">Last automation run: ${last ? DT(last.ran_at) + ' (' + esc(last.trigger) + ')' : 'not run yet'}</div>
   <div class="grid g4" style="margin-bottom:14px">
    ${stat('Total clients', m.clients.toLocaleString('en-IN'), '#/clients')}
    ${stat('Active policies', m.activePolicies.toLocaleString('en-IN'), '#/policies?f=active')}
    ${stat('Annual premium portfolio', inr0(m.annualPremium), '#/policies?f=active', '', 'in-force policies, premium × installments per year')}
    ${stat('Premiums due today', m.dueToday.length, '#/premiums?f=today', m.dueToday.length ? 'warn' : '', sum(m.dueToday))}
    ${stat('Due in next 7 days', m.due7.length, '#/premiums?f=week', '', sum(m.due7))}
    ${stat('Overdue premiums', m.overdue.length, '#/premiums?f=overdue', m.overdue.length ? 'bad' : 'good', sum(m.overdue))}
    ${stat('Collected this month', inr0(m.collectedMonth), '#/premiums?f=paid', 'good', monthLabel(monthKey(today)) + ' · verified payments')}
    ${stat('Receipts pending', m.receiptsPending.length, '#/receipts', m.receiptsPending.length ? 'warn' : '')}
    ${stat('Upcoming maturity claims', m.maturityUpcoming.length, '#/claims', '', 'within 90 days or already due')}
    ${stat('Pending follow-ups', m.followups.length, '#/tasks?f=today', m.followups.length ? 'warn' : '', 'next-action date reached')}
    ${stat('New business leads', m.leads, '#/tasks?f=leads', '', 'prospects + open new-business tasks')}
    ${stat('Lapse-risk policies', m.atRisk.size, '#/premiums?f=lapse', m.atRisk.size ? 'bad' : 'good', 'past grace period, unpaid')}
   </div>
   <div class="grid g12">
    <div>
     <div class="card"><div class="row"><h2 class="grow" style="margin:0">Today's priority tasks</h2><a href="#/tasks">All tasks →</a></div><div id="tt"></div></div>
     <div class="card"><div class="row"><h2 class="grow" style="margin:0">Upcoming</h2>${chips([['7', 'Next 7 days'], ['15', '15 days'], ['30', '30 days']], String(span), 'data-sp')}</div><div id="up"></div></div>
    </div>
    <div>
     <div class="card"><h2>Alerts</h2>${alerts.length ? alerts.map(a => `<a href="${a.link}" class="banner ${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : 'info'}" style="display:block;color:inherit">${esc(a.text)}</a>`).join('') : '<div class="empty">All clear 🎉</div>'}</div>
    </div>
   </div>
   ${S.dashboard.show_charts ? `<div class="grid g2" id="charts"></div>` : ''}`;
  // priority tasks
  const tasks = todaysTasks(data, today).slice(0, 10);
  $('#tt', el).innerHTML = tasks.length ? `<div class="list">${tasks.map(t => `<div class="pri-${t.priority}" style="padding-left:10px"><div class="grow"><b>${esc(t.description)}</b><div class="sm mut">${t.client_id ? `<a href="#/clients/${t.client_id}">${esc(ix.clientById.get(t.client_id)?.name || '')}</a> · ` : ''}${esc(t.category)} · ${badge(t.priority, t.priority === 'Critical' ? 'bad' : t.priority === 'High' ? 'warn' : '')} · next: ${esc(t.next_action || '')} (${D(t.next_action_date)})</div></div>${app.can('write') ? `<button class="sm" data-done="${t.id}">Done</button><button class="sm" data-snz="${t.id}" title="Tomorrow">+1d</button>` : ''}</div>`).join('')}</div>` : '<div class="empty">No pending tasks for today ✔</div>';
  $$('[data-done]', el).forEach(b => b.onclick = () => completeTask(data.tasks.find(t => t.id === b.dataset.done)));
  $$('[data-snz]', el).forEach(b => b.onclick = () => snoozeTask(data.tasks.find(t => t.id === b.dataset.snz), 1));
  const upd = () => { const list = upcomingActivities(data, ix, today, span).slice(0, 40); $('#up', el).innerHTML = list.length ? `<div class="list">${list.map(a => `<div><span class="nowrap b" style="width:84px">${D(a.date)}</span><span class="grow">${badge(a.kind, a.kind === 'Premium due' ? 'warn' : a.kind === 'Birthday' || a.kind === 'Anniversary' ? 'good' : 'info')} ${a.client_id ? `<a href="#/clients/${a.client_id}">${esc(a.text)}</a>` : esc(a.text)}</span></div>`).join('')}</div>` : '<div class="empty">Nothing scheduled</div>'; };
  upd(); $$('[data-sp]', el).forEach(b => b.onclick = () => { span = +b.dataset.sp; $$('[data-sp]', el).forEach(x => x.classList.toggle('on', x === b)); upd(); });
  $('#ra', el)?.addEventListener('click', async (e) => { e.target.disabled = true; try { await runAutomation(); app.rerender(); } catch (x) { import('../ui.js').then(u => u.toast(x.message, 'bad')); e.target.disabled = false; } });
  // charts
  if (S.dashboard.show_charts) {
    const mc = monthlyCollection(data, today, 12), fp = firmPending(data).filter(d => ix.policyById.get(d.policy_id)?.status === 'In force');
    const st = {}; fp.forEach(d => { const s = dueStatus(d, today, null, S); st[s] = (st[s] || 0) + 1; });
    const parts = [['Overdue', 'var(--c4)'], ['Due Today', 'var(--c3)'], ['Due Soon', '#e8c45a'], ['Upcoming', 'var(--c1)']].map(([l, c]) => ({ label: l, value: st[l] || 0, color: c }));
    const tp = ['Critical', 'High', 'Medium', 'Low'].map((p, i) => ({ label: p, value: data.tasks.filter(t => OPEN_TASK.includes(t.status) && t.priority === p).length, color: ['var(--c4)', 'var(--c3)', 'var(--c1)', 'var(--c2)'][i] }));
    const mats = {}; for (let i = 0; i < 12; i++) { const k = monthKey(today.slice(0, 7) + '-01'); } const keys = []; let y = +today.slice(0, 4), mo = +today.slice(5, 7); for (let i = 0; i < 12; i++) { keys.push(`${y}-${String(mo).padStart(2, '0')}`); mo++; if (mo > 12) { mo = 1; y++; } }
    const mm = keys.map(k => ({ key: k, label: monthLabel(k).slice(0, 3) + " '" + k.slice(2, 4), value: data.claims.filter(c => c.event_date && monthKey(c.event_date) === k && !['Payment Received', 'Completed'].includes(c.stage)).length }));
    $('#charts', el).innerHTML = `<div class="card"><h2>Premium collected – last 12 months</h2>${barChart(mc, { money: true })}</div>
      <div class="card"><h2>Maturity / benefit dates – next 12 months</h2>${barChart(mm, { color: 'var(--c3)' })}</div>
      <div class="card"><h2>Unpaid installments by status</h2><div class="row">${donut(parts)}<div class="grow">${legend(parts)}</div></div></div>
      <div class="card"><h2>Open tasks by priority</h2><div class="row">${donut(tp)}<div class="grow">${legend(tp)}</div></div></div>`;
  }
}
