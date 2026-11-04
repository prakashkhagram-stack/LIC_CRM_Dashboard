// Excel / CSV import: column mapping -> validation -> duplicate detection -> preview -> (confirmed) commit.
// Nothing existing is ever overwritten unless the user ticks that specific row.
import { excelDate } from './xlsx.js';
import { parseDMY } from './dates.js';
import { normalisePhone } from './templates.js';

const FREQ = { m:'Monthly', monthly:'Monthly', mly:'Monthly', q:'Quarterly', quarterly:'Quarterly', qly:'Quarterly', h:'Half-yearly', half:'Half-yearly', 'half-yearly':'Half-yearly', 'half yearly':'Half-yearly', halfyearly:'Half-yearly', hly:'Half-yearly', y:'Yearly', yearly:'Yearly', annual:'Yearly', yly:'Yearly', s:'Single', single:'Single' };
const CLAIM_T = ['Maturity','Survival Benefit','Death','Health','General Insurance','Other'];
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normName = s => String(s ?? '').toLowerCase().replace(/\b(shri|smt|shrimati|mr|mrs|ms|kumari|km|dr)\b\.?/g, '').replace(/[^a-z0-9]/g, '');

export const ENTITIES = {
  families: { label:'Families', table:'families', fields:[
    ['family_code','Family code','text',0,['familycode','code']], ['family_name','Family name','text',1,['familyname','name']], ['address','Address','text',0,['address']], ['area_city','Area / city','text',0,['area','areacity','city']], ['pincode','Pincode','text',0,['pincode','pin']],
    ['primary_mobile','Mobile','phone',0,['mobile','phone','primarymobile']], ['alt_mobile','Alternate mobile','phone',0,['alternatemobile','altmobile']], ['email','Email','email',0,['email','emailid']] ] },
  clients: { label:'Clients', table:'clients', fields:[
    ['import_key','Client key (unique id from file)','text',0,['clientkey','key','importkey']], ['family_code','Family code','text',0,['familycode']], ['salutation','Salutation','text',0,['salutation','title']], ['name','Client name','text',1,['clientname','name','fullname']],
    ['dob','Date of birth','date',0,['dateofbirth','dob','birthdate']], ['anniversary','Wedding anniversary','date',0,['anniversary','weddinganniversary']], ['mobile','Mobile','phone',0,['mobile','phone','mobileno','contact']], ['alt_mobile','Alternate mobile','phone',0,['alternatemobile','altmobile']],
    ['whatsapp','WhatsApp number','phone',0,['whatsappnumber','whatsapp']], ['email','Email','email',0,['email','emailid']], ['address','Address','text',0,['address']], ['area_city','Area / city','text',0,['areacity','area','city']], ['occupation','Occupation','text',0,['occupation']], ['notes','Notes','text',0,['notes','remarks']] ] },
  policies: { label:'Policies', table:'policies', fields:[
    ['client_key','Client key (links to client)','text',0,['clientkey']], ['client_name','Client name (if no key)','text',0,['clientname']], ['client_mobile','Client mobile (if no key)','phone',0,['clientmobile']],
    ['insurance_company','Insurance company','text',0,['insurancecompany','company','insurer']], ['policy_no','Policy number','text',1,['policynumber','policyno','policy']], ['policy_type','Policy type','text',0,['policytype','type']], ['plan_name','Plan name','text',0,['planname','plan']], ['plan_code','Plan code','text',0,['plancode']],
    ['start_date','Policy start date','date',0,['policystartdate','startdate','doc','commencement']], ['premium','Premium amount','number',0,['premiumamount','premium']], ['frequency','Premium frequency','freq',0,['premiumfrequency','frequency','mode']], ['pay_mode','Payment mode','text',0,['premiumpaymentmode','paymode']],
    ['next_due_date','Next due date','date',0,['nextduedate','duedate','fup']], ['policy_term','Policy term (years)','int',0,['policyterm','term']], ['premium_paying_term','Premium paying term','int',0,['premiumpayingterm','ppt']], ['maturity_date','Maturity date','date',0,['maturitydate']], ['maturity_date_exact','Maturity date is exact (Yes/No)','boolnull',0,['maturitydateisexactyesno','maturitydateexact','exact']],
    ['sum_assured','Sum assured','number',0,['sumassured','sa']], ['nominee','Nominee','text',0,['nominee','nomineename']], ['status','Status','text',0,['status','policystatus']], ['agency_code','Agency code','text',0,['agencycode']], ['branch','Branch','text',0,['branch']] ] },
  dues: { label:'Premium installments', table:'premium_dues', fields:[
    ['policy_no','Policy number','text',1,['policynumber','policyno']], ['due_date','Due date','date',1,['duedate']], ['amount','Amount','number',1,['amount','premium','premiumamount']], ['verify_first','Verify first (yes/no)','bool',0,['verifyfirst']], ['verify_note','Note','text',0,['note','remarks']], ['source_list','Source','text',0,['source']] ] },
  claims: { label:'Maturity / claims', table:'claims', fields:[
    ['policy_no','Policy number','text',1,['policynumber','policyno']], ['claim_type','Claim type','claimtype',1,['claimtype','type']], ['event_date','Maturity / benefit date','date',0,['maturitybenefitdate','maturitydate','eventdate','date']], ['expected_amount','Expected amount','number',0,['expectedamount','amount']], ['remarks','Remarks','text',0,['remarks','notes']] ] },
};

export function suggestMapping(entity, headers) {
  const map = {}; const used = new Set(); const H = headers.map(norm);
  for (const [key, , , , aliases] of ENTITIES[entity].fields) {
    let idx = -1; for (const a of aliases) { const i = H.findIndex((h, j) => h === a && !used.has(j)); if (i >= 0) { idx = i; break; } }
    if (idx >= 0) { map[key] = idx; used.add(idx); }
  }
  return map;
}
function toDate(v) {
  if (v === null || v === undefined || v === '') return { v:null };
  if (typeof v === 'object' && v.serial !== undefined) return { v:excelDate(v.serial) };
  if (typeof v === 'number') return v > 20000 && v < 80000 ? { v:excelDate(v) } : { err:'not a date' };
  const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const iso = s.slice(0, 10); return isNaN(Date.parse(iso)) ? { err:'invalid date' } : { v:iso }; }
  const m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/.exec(s); if (m) { const y = m[3].length === 2 ? (+m[3] > 40 ? 1900 : 2000) + +m[3] : +m[3]; const iso = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() === +m[1] && d.getUTCMonth() + 1 === +m[2] ? { v:iso } : { err:'invalid date' }; }
  return { err:`cannot read date "${s}" (use DD-MM-YYYY)` };
}
function conv(type, raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { v:null };
  switch (type) {
    case 'date': return toDate(raw);
    case 'number': { const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[₹,\s]/g, '')); return isFinite(n) ? { v:n } : { err:`"${raw}" is not a number` }; }
    case 'int': { const n = Math.round(Number(raw)); return isFinite(n) ? { v:n } : { err:`"${raw}" is not a number` }; }
    case 'phone': { const d = String(typeof raw === 'number' ? Math.round(raw) : raw).replace(/\D/g, ''); if (!d) return { v:null }; const p = normalisePhone(d); return p ? { v:p.slice(2) } : { warn:`mobile "${raw}" not a valid 10-digit number – left blank` , v:null }; }
    case 'email': { const s = String(raw).trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? { v:s.toLowerCase() } : { warn:`email "${s}" looks invalid – left blank`, v:null }; }
    case 'freq': { const f = FREQ[String(raw).trim().toLowerCase()]; return f ? { v:f } : { err:`unknown frequency "${raw}"` }; }
    case 'claimtype': { const t = CLAIM_T.find(x => x.toLowerCase() === String(raw).trim().toLowerCase()); return t ? { v:t } : { err:`unknown claim type "${raw}"` }; }
    case 'boolnull': return { v:/^(y|yes|true|1)$/i.test(String(raw).trim()) };
    case 'bool': return { v:/^(y|yes|true|1)$/i.test(String(raw).trim()) };
    default: return { v:typeof raw === 'number' ? String(raw) : String(raw).trim() };
  }
}

/** Build a preview. `store` provides existing rows for duplicate detection and reference lookups. */
export function buildPreview(entity, sheetRows, mapping, store, { headerRow = 0 } = {}) {
  const E = ENTITIES[entity], d = store.data, out = [];
  const famByCode = new Map(d.families.map(f => [f.family_code, f])), cliByKey = new Map(d.clients.filter(c => c.import_key).map(c => [c.import_key, c]));
  const polByNo = new Map(d.policies.map(p => [p.policy_no, p])), cliByMobile = new Map(), cliByName = new Map();
  for (const c of d.clients) { for (const m of [c.mobile, c.whatsapp]) if (m) { if (!cliByMobile.has(m)) cliByMobile.set(m, []); cliByMobile.get(m).push(c); } const k = normName(c.name); if (!cliByName.has(k)) cliByName.set(k, []); cliByName.get(k).push(c); }
  const dueKeys = new Map(d.dues.map(x => [x.policy_id + '|' + x.due_date, x])), claimKeys = new Map(d.claims.map(x => [x.policy_id + '|' + x.claim_type + '|' + (x.event_date || ''), x]));
  const seen = new Set();
  for (let i = headerRow + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i]; if (!row || row.every(v => v === null || v === undefined || v === '')) continue;
    const rec = {}, errors = [], warns = [];
    for (const [key, label, type, req] of E.fields) {
      const col = mapping[key]; const raw = col === undefined || col === null || col === '' ? null : row[col];
      const r = conv(type, raw); if (r.err) errors.push(`${label}: ${r.err}`); if (r.warn) warns.push(r.warn); rec[key] = r.v ?? null;
      if (req && (rec[key] === null || rec[key] === '')) errors.push(`${label} is required`);
    }
    let status = 'new', existing = null, link = {};
    if (!errors.length) {
      if (entity === 'families') { existing = famByCode.get(rec.family_code); const k = 'f' + rec.family_code; if (rec.family_code && seen.has(k)) { status = 'duplicate'; } seen.add(k); if (existing) status = 'duplicate'; }
      else if (entity === 'clients') {
        if (rec.family_code) { const f = famByCode.get(rec.family_code); if (f) link.family_id = f.id; else warns.push(`family code ${rec.family_code} not found – client imported without a family`); }
        if (rec.import_key && cliByKey.has(rec.import_key)) { existing = cliByKey.get(rec.import_key); status = 'duplicate'; }
        else { const nk = normName(rec.name); const byM = (rec.mobile && cliByMobile.get(rec.mobile)) || []; const same = byM.find(c => normName(c.name) === nk) || (cliByName.get(nk) || []).find(c => !rec.mobile || !c.mobile || c.mobile === rec.mobile);
          if (same) { existing = same; status = 'duplicate'; } else if (byM.length && !rec.family_code) { existing = byM[0]; status = 'possible'; warns.push('same mobile as ' + byM[0].name + ' (' + byM[0].client_code + ')'); } }
        const sk = 'c' + (rec.import_key || normName(rec.name) + '|' + rec.mobile); if (seen.has(sk)) status = 'duplicate'; seen.add(sk);
      } else if (entity === 'policies') {
        let cli = rec.client_key ? cliByKey.get(rec.client_key) : null;
        if (!cli && rec.client_mobile && rec.client_name) cli = (cliByMobile.get(rec.client_mobile) || []).find(c => normName(c.name) === normName(rec.client_name));
        if (!cli && rec.client_name && !rec.client_key) { const cs = cliByName.get(normName(rec.client_name)) || []; if (cs.length === 1) cli = cs[0]; else if (cs.length > 1) errors.push('Several clients have this name – map the client key or mobile'); }
        if (!cli && !errors.length) errors.push(rec.client_key ? `Client key "${rec.client_key}" not found – import Clients first` : 'Client not found – map the client key, or name + mobile');
        else if (cli) link.client_id = cli.id;
        existing = polByNo.get(rec.policy_no); if (existing) status = 'duplicate'; if (seen.has('p' + rec.policy_no)) status = 'duplicate'; seen.add('p' + rec.policy_no);
        if (!errors.length && !rec.premium) warns.push('premium is blank – the policy will be saved without a premium (nothing is assumed)');
        if (!errors.length && !rec.frequency) warns.push('frequency is blank – no installments will be generated for it');
      } else if (entity === 'dues') {
        const p = polByNo.get(rec.policy_no); if (!p) errors.push(`Policy ${rec.policy_no} not found – import Policies first`); else { link.policy_id = p.id; existing = dueKeys.get(p.id + '|' + rec.due_date); if (existing) status = 'duplicate'; }
        const sk = 'd' + rec.policy_no + rec.due_date; if (seen.has(sk)) status = 'duplicate'; seen.add(sk);
      } else if (entity === 'claims') {
        const p = polByNo.get(rec.policy_no); if (!p) errors.push(`Policy ${rec.policy_no} not found – import Policies first`); else { link.policy_id = p.id; link.client_id = p.client_id; existing = claimKeys.get(p.id + '|' + rec.claim_type + '|' + (rec.event_date || '')); if (existing) status = 'duplicate'; }
        const sk = 'm' + rec.policy_no + rec.claim_type + rec.event_date; if (seen.has(sk)) status = 'duplicate'; seen.add(sk);
      }
    }
    if (errors.length) status = 'invalid';
    // fields that would change if the user chooses "update this row"
    const changes = [];
    if (existing && status === 'duplicate') for (const [key, label] of E.fields.map(f => [f[0], f[1]])) { if (!(key in existing) || rec[key] === null) continue; const a = existing[key] ?? null, b = rec[key]; if (String(a) !== String(b) && !(typeof a === 'number' && Number(b) === a)) changes.push({ key, label, from:a, to:b }); }
    out.push({ n:i + 1, rec, link, status, existing, errors, warns, changes });
  }
  return out;
}

/** Build the insert row for the database from a preview row */
export function toDbRow(entity, p) {
  const r = { ...p.rec };
  if (entity === 'families') return r;
  if (entity === 'clients') { delete r.family_code; if (p.link.family_id) r.family_id = p.link.family_id; if (!r.whatsapp && r.mobile) r.whatsapp = r.mobile; return r; }
  if (entity === 'policies') { delete r.client_key; delete r.client_name; delete r.client_mobile; r.client_id = p.link.client_id; r.insurance_company ||= 'LIC of India'; r.status ||= 'In force'; r.maturity_date_exact = !!(r.maturity_date && r.maturity_date_exact); return r; }
  if (entity === 'dues') { r.policy_id = p.link.policy_id; r.status = 'pending'; delete r.policy_no; r.source_list ||= 'import'; return r; }
  if (entity === 'claims') { r.policy_id = p.link.policy_id; r.client_id = p.link.client_id; delete r.policy_no; r.stage = 'Maturity Approaching'; return r; }
}
export function updatePatch(p) { const patch = {}; for (const c of p.changes) patch[c.key] = c.to; return patch; }

/** Commit: rows with status new (and "possible" if included) are inserted; duplicates only when listed in `updateIds` (explicitly ticked). */
export async function commitImport(store, entity, preview, { includePossible = false, updateRows = new Set(), progress } = {}) {
  const E = ENTITIES[entity]; const toInsert = preview.filter(p => p.status === 'new' || (p.status === 'possible' && includePossible));
  const res = { inserted:0, updated:0, skipped:preview.length - toInsert.length, failed:[] };
  const batch = 200;
  for (let i = 0; i < toInsert.length; i += batch) {
    const slice = toInsert.slice(i, i + batch);
    try { const rows = await store.insertMany(E.table, slice.map(p => toDbRow(entity, p))); res.inserted += rows.length; }
    catch (e) { for (const p of slice) { try { await store.insertMany(E.table, [toDbRow(entity, p)]); res.inserted++; } catch (e2) { res.failed.push({ n:p.n, error:e2.message }); } } }
    progress?.(Math.min(i + batch, toInsert.length), toInsert.length);
  }
  for (const p of preview) if (p.status === 'duplicate' && updateRows.has(p.n) && p.existing && p.changes.length) {
    try { await store.update(E.table, p.existing.id, updatePatch(p)); res.updated++; res.skipped--; } catch (e) { res.failed.push({ n:p.n, error:e.message }); }
  }
  return res;
}
