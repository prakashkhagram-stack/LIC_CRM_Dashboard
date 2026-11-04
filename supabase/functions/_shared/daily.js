// Server-side daily run. Uses the SAME planner as the browser (copied into this folder by tools/sync_shared.sh) so results are identical.
// All network access goes through the injected `fetchImpl`, which makes it testable without a live database.
import { planAutomations } from './automation.js';
import { mergeSettings } from './defaults.js';
import { todayISO } from './dates.js';

const TABLES = { clients:'clients', policies:'policies', dues:'premium_dues', transactions:'premium_transactions', reminders:'premium_reminders', visits:'collection_visits', receipts:'receipts', claims:'claims', tasks:'tasks', communications:'communications' };

export function makeClient(url, serviceKey, fetchImpl = fetch) {
  const base = url.replace(/\/$/, '') + '/rest/v1/';
  const H = (extra = {}) => ({ apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', ...extra });
  const check = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r; };
  return {
    async select(table, query = '') { const out = []; for (let from = 0; ; from += 1000) { const r = await check(await fetchImpl(`${base}${table}?${query}`, { headers: H({ Range: `${from}-${from + 999}`, 'Range-Unit': 'items' }) })); const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break; } return out; },
    async insertMany(table, rows) { let n = 0; for (let i = 0; i < rows.length; i += 500) { const r = await check(await fetchImpl(`${base}${table}`, { method: 'POST', headers: H({ Prefer: 'return=representation,resolution=ignore-duplicates' }), body: JSON.stringify(rows.slice(i, i + 500)) })); n += (await r.json()).length; } return n; },
    async patch(table, id, patch) { await check(await fetchImpl(`${base}${table}?id=eq.${id}`, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(patch) })); },
  };
}

export async function runDaily(db, { trigger = 'cron', now = new Date() } = {}) {
  const sRows = await db.select('settings', 'key=eq.app'); const settings = mergeSettings(sRows[0]?.value || {});
  const today = todayISO(settings.business?.timezone || 'Asia/Kolkata', now);
  const data = {}; for (const [k, t] of Object.entries(TABLES)) data[k] = await db.select(t, 'order=id.asc');
  const plan = planAutomations(data, today, settings);
  const counts = {};
  for (const t of ['premium_dues', 'claims', 'receipts', 'premium_reminders', 'tasks']) { const rows = plan.inserts[t]; if (rows?.length) counts[t] = await db.insertMany(t, rows); }
  for (const { id, patch } of plan.patches.tasks) await db.patch('tasks', id, patch);
  for (const { id, patch } of plan.patches.claims) await db.patch('claims', id, patch);
  const summary = { date: today, ...plan.summary, inserted: counts };
  await db.insertMany('automation_runs', [{ trigger, summary }]);
  return summary;
}
