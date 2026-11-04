// Data layer. Two interchangeable back-ends with the same API:
//   SupabaseStore – real data in your private Supabase project (REST + Auth + Storage, no library needed)
//   DemoStore     – synthetic data kept in memory only, always shown with a "DEMO" banner
import { addDays, addMonths, todayISO } from './dates.js';
import { FREQ_PER_YEAR } from './defaults.js';

export const TABLES = { clients:'clients', families:'families', policies:'policies', dues:'premium_dues', transactions:'premium_transactions', reminders:'premium_reminders',
  visits:'collection_visits', receipts:'receipts', claims:'claims', tasks:'tasks', communications:'communications', documents:'documents', members:'family_members' };
const KEY_OF = Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [v, k]));
const uuid = () => crypto.randomUUID();

class BaseStore {
  constructor() { this.data = Object.fromEntries(Object.keys(TABLES).map(k => [k, []])); this.listeners = new Set(); this.settingsValue = {}; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => f()); }
  rows(table) { return this.data[KEY_OF[table] || table]; }
}

/* ============================================================== Supabase ============================================================== */
export class SupabaseStore extends BaseStore {
  constructor(cfg) { super(); this.cfg = cfg; this.mode = 'live'; this.session = null; this.profile = null; this._load(); }
  _load() { try { this.session = JSON.parse(localStorage.getItem('crm_session') || 'null'); } catch { this.session = null; } }
  _save() { try { this.session ? localStorage.setItem('crm_session', JSON.stringify(this.session)) : localStorage.removeItem('crm_session'); } catch {} }
  get base() { return this.cfg.supabaseUrl.replace(/\/$/, ''); }
  async _fetch(path, opt = {}, retry = true) {
    const headers = { apikey: this.cfg.supabaseAnonKey, 'Content-Type': 'application/json', ...(opt.headers || {}) };
    headers.Authorization = 'Bearer ' + (this.session?.access_token || this.cfg.supabaseAnonKey);
    const r = await fetch(this.base + path, { ...opt, headers });
    if (r.status === 401 && retry && this.session?.refresh_token) { if (await this.refresh()) return this._fetch(path, opt, false); }
    return r;
  }
  async _json(r) { const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; } if (!r.ok) { const e = new Error((j && (j.message || j.msg || j.error_description || j.hint || j.details)) || ('HTTP ' + r.status)); e.status = r.status; e.body = j; throw e; } return j; }
  /* ---- auth ---- */
  async signIn(email, password) {
    const j = await this._json(await fetch(this.base + '/auth/v1/token?grant_type=password', { method:'POST', headers:{ apikey:this.cfg.supabaseAnonKey, 'Content-Type':'application/json' }, body:JSON.stringify({ email, password }) }));
    this.session = j; this._save(); await this.loadProfile(); return this.profile;
  }
  async signUp(email, password, full_name) {
    const j = await this._json(await fetch(this.base + '/auth/v1/signup', { method:'POST', headers:{ apikey:this.cfg.supabaseAnonKey, 'Content-Type':'application/json' }, body:JSON.stringify({ email, password, data:{ full_name } }) }));
    if (j.access_token) { this.session = j; this._save(); await this.loadProfile(); }
    return j;
  }
  async refresh() {
    try { const r = await fetch(this.base + '/auth/v1/token?grant_type=refresh_token', { method:'POST', headers:{ apikey:this.cfg.supabaseAnonKey, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:this.session.refresh_token }) });
      if (!r.ok) { this.session = null; this._save(); return false; } this.session = await r.json(); this._save(); return true; } catch { return false; }
  }
  async signOut() { try { await this._fetch('/auth/v1/logout', { method:'POST' }, false); } catch {} this.session = null; this.profile = null; this._save(); }
  async resetPassword(email) { await this._json(await fetch(this.base + '/auth/v1/recover', { method:'POST', headers:{ apikey:this.cfg.supabaseAnonKey, 'Content-Type':'application/json' }, body:JSON.stringify({ email }) })); }
  get user() { return this.session?.user || null; }
  async loadProfile() {
    if (!this.session) return null;
    const rows = await this._json(await this._fetch(`/rest/v1/profiles?id=eq.${this.session.user.id}&select=*`));
    this.profile = rows[0] || null; return this.profile;
  }
  get role() { return this.profile?.active ? this.profile.role : null; }
  /* ---- data ---- */
  async select(table, query = '') {
    const out = []; const page = 1000;
    for (let from = 0; ; from += page) {
      const r = await this._fetch(`/rest/v1/${table}?${query}`, { headers: { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' } });
      const rows = await this._json(r); out.push(...rows); if (rows.length < page) break;
    }
    return out;
  }
  async loadAll(progress) {
    const keys = Object.keys(TABLES); let i = 0;
    await Promise.all(keys.map(async k => { this.data[k] = await this.select(TABLES[k], 'order=created_at.asc,id.asc'.replace('created_at', k === 'communications' ? 'at' : k === 'documents' ? 'uploaded_at' : 'created_at')); progress?.(++i, keys.length); }));
    const s = await this.select('settings', 'key=eq.app'); this.settingsValue = s[0]?.value || {};
    this.emit();
  }
  async saveSettings(value) {
    await this._json(await this._fetch('/rest/v1/settings?on_conflict=key', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify({ key:'app', value, updated_at:new Date().toISOString(), updated_by:this.user?.id }) }));
    this.settingsValue = value;
  }
  async insert(table, row) { const r = (await this.insertMany(table, [row]))[0]; return r; }
  async insertMany(table, rows, { ignoreDuplicates = false, onConflict } = {}) {
    if (!rows.length) return [];
    const out = [];
    for (let i = 0; i < rows.length; i += 500) {
      const pref = 'return=representation' + (ignoreDuplicates ? ',resolution=ignore-duplicates' : '');
      const q = onConflict ? '?on_conflict=' + onConflict : '';
      const res = await this._json(await this._fetch(`/rest/v1/${table}${q}`, { method:'POST', headers:{ Prefer:pref }, body:JSON.stringify(rows.slice(i, i + 500)) }));
      out.push(...(res || []));
    }
    this.rows(table).push(...out); await this._afterWrite(table, out); this.emit(); return out;
  }
  async update(table, id, patch) {
    const res = await this._json(await this._fetch(`/rest/v1/${table}?id=eq.${id}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(patch) }));
    if (!res?.length) throw new Error('Update was not applied (no permission, or the record no longer exists).');
    const arr = this.rows(table), i = arr.findIndex(r => r.id === id); if (i >= 0) arr[i] = res[0]; else arr.push(res[0]);
    await this._afterWrite(table, res); this.emit(); return res[0];
  }
  async remove(table, id) {
    const res = await this._json(await this._fetch(`/rest/v1/${table}?id=eq.${id}`, { method:'DELETE', headers:{ Prefer:'return=representation' } }));
    if (!res?.length) throw new Error('Delete was not applied (only an admin can delete).');
    const arr = this.rows(table), i = arr.findIndex(r => r.id === id); if (i >= 0) arr.splice(i, 1); this.emit();
  }
  /** triggers in the database change other rows (e.g. a payment updates its due); re-read them so screens stay truthful */
  async _afterWrite(table, rows) {
    if (table === 'premium_transactions') {
      const ids = [...new Set(rows.map(r => r.due_id))];
      if (ids.length) { const fresh = await this.select('premium_dues', `id=in.(${ids.join(',')})`); this._merge('premium_dues', fresh); }
    }
  }
  _merge(table, fresh) { const arr = this.rows(table); for (const f of fresh) { const i = arr.findIndex(r => r.id === f.id); if (i >= 0) arr[i] = f; else arr.push(f); } }
  async refreshTable(table) { this.data[KEY_OF[table]] = await this.select(table, 'order=id.asc'); this.emit(); }
  async audit(limit = 300, filter = '') { const r = await this._fetch(`/rest/v1/audit_logs?order=id.desc&limit=${limit}${filter}`); return this._json(r); }
  async profiles() { return this._json(await this._fetch('/rest/v1/profiles?order=created_at.asc')); }
  async updateProfile(id, patch) { return this._json(await this._fetch(`/rest/v1/profiles?id=eq.${id}`, { method:'PATCH', headers:{ Prefer:'return=representation' }, body:JSON.stringify(patch) })); }
  async logAutomationRun(summary, trigger = 'app') { try { await this._fetch('/rest/v1/automation_runs', { method:'POST', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ trigger, summary }) }); } catch {} }
  async lastAutomationRun() { try { const r = await this._json(await this._fetch('/rest/v1/automation_runs?order=id.desc&limit=1')); return r[0] || null; } catch { return null; } }
  /* ---- files (private bucket "documents"; access through short-lived signed links only) ---- */
  async uploadFile(path, file) {
    const r = await this._fetch(`/storage/v1/object/documents/${path}`, { method:'POST', headers:{ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert':'false' }, body:file });
    await this._json(r); return path;
  }
  async signedUrl(path, seconds = 120) { const j = await this._json(await this._fetch(`/storage/v1/object/sign/documents/${path}`, { method:'POST', body:JSON.stringify({ expiresIn:seconds }) })); return this.base + '/storage/v1' + j.signedURL; }
  async removeFile(path) { await this._fetch(`/storage/v1/object/documents/${path}`, { method:'DELETE' }); }
  /** whole-database JSON backup, downloaded by the browser */
  async backupAll() { const out = { exported_at:new Date().toISOString(), tables:{} }; for (const t of Object.values(TABLES)) out.tables[t] = await this.select(t, 'order=id.asc'); out.tables.settings = await this.select('settings'); return out; }
}

/* ============================================================== Demo ============================================================== */
const FIRST = ['Asha','Bharat','Chirag','Dipti','Ekta','Falguni','Girish','Hetal','Ishan','Jaya','Kiran','Lata','Mehul','Nila','Om','Pooja','Rakesh','Sneha','Tushar','Usha','Vijay','Yash'];
const LAST = ['Mehta','Shah','Patel','Joshi','Desai','Trivedi','Vora','Pandya','Raval','Bhatt','Dave','Gohil'];
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
export function buildDemoData(today = todayISO()) {
  const R = rng(7), pick = a => a[Math.floor(R() * a.length)];
  const d = Object.fromEntries(Object.keys(TABLES).map(k => [k, []]));
  const AREAS = [['Kalawad Road',22.2970,70.7650],['Yagnik Road',22.3000,70.7880],['Univ. Road',22.2850,70.7500],['Mavdi',22.2650,70.7700],['Raiya Road',22.2780,70.7850]];
  let pc = 0, cc = 0;
  for (let f = 0; f < 22; f++) {
    const ln = pick(LAST), area = pick(AREAS), fam = { id:uuid(), family_code:'D' + String(f + 1).padStart(3, '0'), family_name:'DEMO ' + ln + ' family', address:`${1 + f} Demo Society, ${area[0]}, Rajkot`, area_city:'Rajkot', pincode:'360001', created_at:today + 'T00:00:00Z' };
    d.families.push(fam);
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      cc++; const age = 25 + Math.floor(R() * 40), dob = addDays(today, -age * 365 - Math.floor(R() * 300));
      const c = { id:uuid(), client_code:'CL' + String(cc).padStart(5, '0'), family_id:fam.id, salutation:i ? 'Smt' : 'Shri', name:`${pick(FIRST)} ${ln} (demo)`, mobile:'98' + String(10000000 + Math.floor(R() * 89999999)), whatsapp:null, email:null, address:fam.address, area_city:'Rajkot',
        latitude: +(area[1] + (R() - .5) * .01).toFixed(6), longitude: +(area[2] + (R() - .5) * .01).toFixed(6), dob, anniversary: R() < .4 ? addDays(today, Math.floor(R() * 40) - 5 - 3650) : null, category: R() < .15 ? 'VIP' : 'Regular', relationship_status:'Active',
        preferred_contact:'WhatsApp', registered_on:addDays(today, -Math.floor(R() * 2500)), consent_whatsapp:true, consent_family_link:false, high_service_priority:false, archived:false, created_at:today + 'T00:00:00Z' };
      c.whatsapp = c.mobile; d.clients.push(c);
      const np = 1 + Math.floor(R() * 3);
      for (let k = 0; k < np; k++) {
        pc++; const freq = pick(['Monthly','Quarterly','Quarterly','Half-yearly','Yearly']), prem = Math.round((800 + R() * 14000) / 5) * 5, startY = 2005 + Math.floor(R() * 15);
        const matIn = R() < .12 ? Math.floor(R() * 150) : 300 + Math.floor(R() * 4000);
        const p = { id:uuid(), policy_code:'PL' + String(pc).padStart(5, '0'), client_id:c.id, insurance_company:'LIC of India', policy_no:'9' + String(10000000 + pc * 7919), policy_type:pick(['Endowment','Money Back','Life (Traditional)','Unit Linked']), plan_name:'Demo plan', start_date:`${startY}-0${1 + Math.floor(R() * 9)}-1${Math.floor(R() * 9)}`,
          premium:prem, frequency:freq, pay_mode:'Cash/Online', policy_term:20, premium_paying_term:15, maturity_date:addDays(today, matIn), maturity_date_exact:true, sum_assured:prem * 40, nominee:'Demo nominee', status:'In force', archived:false, created_at:today + 'T00:00:00Z' };
        const off = Math.floor(R() * 75) - 22; p.next_due_date = addDays(today, off); d.policies.push(p);
        d.dues.push({ id:uuid(), policy_id:p.id, due_date:p.next_due_date, amount:prem, status:'pending', paid_amount:0, partial_allowed:false, verify_first:false, source_list:'demo', created_at:today + 'T00:00:00Z' });
        if (R() < .5) { const pd = addMonths(p.next_due_date, -(12 / (FREQ_PER_YEAR[freq] || 1)), +p.next_due_date.slice(8)); const did = uuid(); d.dues.push({ id:did, policy_id:p.id, due_date:pd, amount:prem, status:'paid', paid_amount:prem, paid_on:addDays(pd, 2), partial_allowed:false, verify_first:false, source_list:'demo', created_at:today + 'T00:00:00Z' });
          d.transactions.push({ id:uuid(), due_id:did, policy_id:p.id, client_id:c.id, paid_on:addDays(pd, 2), amount:prem, late_fee:0, method:pick(['Cash','UPI','Cheque']), reference:'DEMO', verified:true, created_at:addDays(pd, 2) + 'T10:00:00Z' }); }
        if (matIn < 150) d.claims.push({ id:uuid(), claim_code:'CLM' + String(d.claims.length + 1).padStart(5, '0'), claim_type:'Maturity', policy_id:p.id, client_id:c.id, event_date:p.maturity_date, stage:'Maturity Approaching', expected_amount:prem * 60, required_documents:[], created_at:today + 'T00:00:00Z' });
      }
    }
  }
  return d;
}

export class DemoStore extends BaseStore {
  constructor() { super(); this.mode = 'demo'; this.profile = { id:'demo', full_name:'Demo user', role:'admin', active:true }; this.session = { user:{ id:'demo', email:'demo@example.com' } }; this.seq = { task:0, claim:100, client:1000, policy:1000 }; }
  get user() { return this.session.user; } get role() { return 'admin'; }
  async signIn() { return this.profile; } async signOut() {} async loadProfile() { return this.profile; }
  async loadAll() { this.data = buildDemoData(); this.settingsValue = { business:{ advisor_name:'Demo Advisor', phone:'9800000000', signature:'– Demo Advisor' } }; this.emit(); }
  async saveSettings(v) { this.settingsValue = v; }
  async insert(table, row) { return (await this.insertMany(table, [row]))[0]; }
  async insertMany(table, rows, { ignoreDuplicates = false } = {}) {
    const arr = this.rows(table), out = [];
    for (const r of rows) {
      const row = { id:uuid(), created_at:new Date().toISOString(), ...r };
      if (table === 'tasks') { if (!['Done','Cancelled'].includes(row.status || 'Open') && !(row.next_action && row.next_action_date)) throw new Error('A task needs a next action and a next action date.'); row.task_code ||= 'T' + String(++this.seq.task).padStart(6, '0'); row.status ||= 'Open'; }
      if (table === 'clients') row.client_code ||= 'CL' + String(++this.seq.client).padStart(5, '0');
      if (table === 'policies') row.policy_code ||= 'PL' + String(++this.seq.policy).padStart(5, '0');
      if (table === 'claims') row.claim_code ||= 'CLM' + String(++this.seq.claim).padStart(5, '0');
      if (table === 'premium_reminders' && arr.some(x => x.due_id === row.due_id && x.stage === row.stage)) { if (ignoreDuplicates) continue; throw new Error('duplicate reminder'); }
      if (table === 'premium_transactions') this._txCheck(row);
      if (table === 'tasks' && row.auto_key && arr.some(x => x.auto_key === row.auto_key && ['Open','In Progress','Waiting'].includes(x.status))) { if (ignoreDuplicates) continue; throw new Error('duplicate task'); }
      arr.push(row); out.push(row);
      if (table === 'premium_transactions') this._refreshDue(row.due_id);
    }
    this.emit(); return out;
  }
  _txCheck(t) {
    const due = this.data.dues.find(d => d.id === t.due_id); if (!due) throw new Error('Unknown installment');
    if (due.status !== 'pending') throw new Error('This installment is already ' + due.status);
    if (t.verified && !due.partial_allowed && Number(t.amount) - Number(t.late_fee || 0) < Number(due.amount) - 0.005) throw new Error('Partial payment is not allowed for this installment.');
  }
  _refreshDue(id) { const due = this.data.dues.find(d => d.id === id); if (!due) return; const tx = this.data.transactions.filter(t => t.due_id === id && t.verified); const sum = tx.reduce((s, t) => s + Number(t.amount) - Number(t.late_fee || 0), 0); due.paid_amount = sum; if (!['waived','cancelled'].includes(due.status)) { due.status = sum >= Number(due.amount) - 0.005 ? 'paid' : 'pending'; due.paid_on = due.status === 'paid' ? tx.map(t => t.paid_on).sort().pop() : null; } }
  async update(table, id, patch) {
    const arr = this.rows(table), r = arr.find(x => x.id === id); if (!r) throw new Error('Not found');
    if (table === 'premium_dues' && patch.status === 'paid') throw new Error('An installment becomes paid only through a verified payment.');
    const next = { ...r, ...patch };
    if (table === 'claims' && ['Payment Received','Completed'].includes(next.stage) && !(next.actual_settlement && next.settlement_confirmed_by)) throw new Error('A claim cannot be marked "' + next.stage + '" without an actual settlement date and a confirming user.');
    if (table === 'tasks' && !['Done','Cancelled'].includes(next.status) && !(next.next_action && next.next_action_date)) throw new Error('A task needs a next action and a next action date.');
    Object.assign(r, patch, { updated_at:new Date().toISOString() });
    if (table === 'premium_transactions') this._refreshDue(r.due_id);
    this.emit(); return r;
  }
  async remove(table, id) { const arr = this.rows(table), i = arr.findIndex(x => x.id === id); if (i >= 0) { const [r] = arr.splice(i, 1); if (table === 'premium_transactions') this._refreshDue(r.due_id); } this.emit(); }
  async uploadFile(path) { return path; } async signedUrl() { return null; } async removeFile() {}
  async audit() { return []; } async profiles() { return [{ id:'demo', full_name:'Demo user', role:'admin', active:true }]; } async updateProfile() {}
  async logAutomationRun() {} async lastAutomationRun() { return null; }
  async backupAll() { return { exported_at:new Date().toISOString(), demo:true, tables:Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [t, this.data[k]])) }; }
}
