import { esc, D, badge, dataTable, chips, $, $$, toast, confirmBox } from '../ui.js';
import { taskForm, completeTask, snoozeTask } from '../actions.js';
import { OPEN_TASK, PRIORITY_RANK } from '../defaults.js';
import { addDays } from '../dates.js';

export async function render(app, el) {
  const { data, ix, today } = app; let f = app.route.q.f || 'open', cat = '';
  const open = t => OPEN_TASK.includes(t.status), nd = t => t.next_action_date || t.due_date;
  const F = { open, today: t => open(t) && nd(t) <= today, overdue: t => open(t) && nd(t) < today, week: t => open(t) && nd(t) <= addDays(today, 7), leads: t => open(t) && t.category === 'New Business', auto: t => open(t) && t.source === 'automation', done: t => t.status === 'Done', all: () => true };
  const cats = [...new Set(data.tasks.map(t => t.category))].sort();
  el.innerHTML = `<div class="head"><div class="grow"><h1>Tasks</h1><div class="sub">Every open task has a next action and a date. Overdue items are highlighted.</div></div>${app.can('write') ? '<button class="primary" id="nt">＋ New task</button>' : ''}</div>
   ${chips([['open', 'All open', data.tasks.filter(F.open).length], ['today', 'Due today / earlier', data.tasks.filter(F.today).length], ['overdue', 'Overdue', data.tasks.filter(F.overdue).length], ['week', 'Next 7 days', data.tasks.filter(F.week).length], ['leads', 'New business', data.tasks.filter(F.leads).length], ['auto', 'Automatic', data.tasks.filter(F.auto).length], ['done', 'Done', data.tasks.filter(F.done).length], ['all', 'All', data.tasks.length]], f)}
   <div class="row" style="margin:10px 0"><select id="cat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div id="t"></div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => app.go('#/tasks?f=' + b.dataset.f)); $('#nt', el)?.addEventListener('click', () => taskForm());
  const tbl = dataTable($('#t', el), { rows: data.tasks.filter(F[f]), sortKey: 'pri', pageSize: 40, search: t => `${t.description} ${t.category} ${ix.clientById.get(t.client_id)?.name || ''} ${t.task_code}`, rowClass: t => open(t) && nd(t) < today ? 'overdue-row' : '',
    cols: [{ key: 'pri', label: 'Priority', sort: t => PRIORITY_RANK[t.priority] * 1e9 + Date.parse(nd(t) || 0) / 1e3, render: t => badge(t.priority, t.priority === 'Critical' ? 'bad' : t.priority === 'High' ? 'warn' : '') },
      { key: 'd', label: 'Task', render: t => `<b>${esc(t.description)}</b><div class="sm mut">${t.client_id ? `<a href="#/clients/${t.client_id}">${esc(ix.clientById.get(t.client_id)?.name || '')}</a> · ` : ''}${esc(t.category)} · ${esc(t.task_code)}${t.source === 'automation' ? ' · auto' : ''}</div>` },
      { key: 'next', label: 'Next action', hideSm: true, sort: t => nd(t) || '', render: t => t.status === 'Done' ? `<span class="mut">done ${D(t.completed_on)}${t.last_action ? ' – ' + esc(t.last_action) : ''}</span>` : `${esc(t.next_action || '')}<div class="sm ${nd(t) < today ? '' : 'mut'}" style="${nd(t) < today ? 'color:var(--bad)' : ''}">${D(nd(t))}</div>` },
      { key: 'status', label: 'Status', render: t => badge(t.status, t.status === 'Done' ? 'good' : '') },
      { key: 'a', label: '', render: t => open(t) && app.can('write') ? `<span class="nowrap"><button class="sm primary" data-d="${t.id}">Done</button> <button class="sm" data-s="${t.id}" title="Tomorrow">+1d</button> <button class="sm" data-e="${t.id}">Edit</button></span>` : app.can('write') ? `<button class="sm" data-e="${t.id}">Edit</button>` : '' }] });
  $('#cat', el).onchange = e => tbl.setRows(data.tasks.filter(F[f]).filter(t => !e.target.value || t.category === e.target.value));
  el.onclick = e => { const b = e.target.closest('[data-d],[data-s],[data-e]'); if (!b) return; const t = data.tasks.find(x => x.id === (b.dataset.d || b.dataset.s || b.dataset.e)); if (b.dataset.d) completeTask(t); else if (b.dataset.s) snoozeTask(t, 1); else taskForm(t); };
}
