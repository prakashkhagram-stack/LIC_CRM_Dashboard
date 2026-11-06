import { esc, D, DT, badge, dataTable, $, $$, toast, confirmBox, download, csv, modal } from '../ui.js';
import { readXlsx } from '../xlsx.js';
import { xlsxBlob } from '../xlsx.js';
import * as I from '../import-core.js';
import { fmtDate } from '../dates.js';
import { runAutomation } from '../actions.js';
import { annualPremium } from '../metrics.js';

const ORDER = ['families', 'clients', 'policies', 'dues', 'claims'], SHEETNAME = { families: /famil/i, clients: /^clients?$/i, policies: /polic/i, dues: /due|premium|install/i, claims: /claim|maturity/i };
const st = { sheets: null, file: '', entity: 'families', sheet: 0, map: {}, preview: null, upd: new Set(), possible: false, header: 0 };

function parseCsv(text) { const rows = []; let row = [], cur = '', q = false; text = text.replace(/^﻿/, ''); for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; }

export async function render(app, el) {
  el.innerHTML = `<div class="head"><div class="grow"><h1>Import / export</h1><div class="sub">Bring data in from Excel or CSV with a preview – nothing existing is overwritten unless you tick it</div></div></div>
   <div class="grid g12"><div><div class="card" id="imp"></div></div><div>
   <div class="card"><h2>Export</h2><p class="mut sm">Excel files open in Excel / Google Sheets. Phone and policy numbers are kept as text.</p><div class="list" id="ex"></div></div>
   <div class="card"><h2>Backup</h2><p class="mut sm">A full JSON copy of every table. Keep it somewhere safe – it contains personal data. Supabase also keeps its own daily backups (see SETUP.md).</p><button id="bk" class="primary">⬇ Download full backup</button></div>
   <div class="card"><h2>Housekeeping</h2><button id="dup">Find possible duplicate clients</button> <button id="arc">Archived records</button><div id="hk" style="margin-top:10px"></div></div></div></div>`;
  drawImport(app, $('#imp', el)); drawExport(app, $('#ex', el));
  $('#bk', el).onclick = async () => { const b = await app.store.backupAll(); download(JSON.stringify(b), `crm_backup_${app.today}.json`, 'application/json'); toast('Backup downloaded', 'good'); };
  $('#dup', el).onclick = () => dupes(app, $('#hk', el)); $('#arc', el).onclick = () => archived(app, $('#hk', el));
}

function drawImport(app, el) {
  if (!app.can('write')) { el.innerHTML = '<h2>Import</h2><div class="mut">Your role is read-only.</div>'; return; }
  const E = I.ENTITIES[st.entity];
  el.innerHTML = `<h2>Import</h2><p class="mut sm">Prepared LIC file: use <b>LIC_Import_Nov2026.xlsx</b> and import in this order: ${ORDER.map(k => I.ENTITIES[k].label).join(' → ')}.</p>
   <label class="f"><span>Excel (.xlsx) or CSV file</span><input type="file" id="fl" accept=".xlsx,.csv"></label>
   ${st.sheets ? `<div class="fgrid"><label class="f"><span>What are you importing?</span><select id="en">${ORDER.map(k => `<option value="${k}" ${k === st.entity ? 'selected' : ''}>${I.ENTITIES[k].label}</option>`).join('')}</select></label><label class="f"><span>Sheet</span><select id="sh">${st.sheets.map((s, i) => `<option value="${i}" ${i === st.sheet ? 'selected' : ''}>${esc(s.name)} (${s.rows.length - 1} rows)</option>`).join('')}</select></label></div>
   <h3>Match columns</h3><div class="fgrid">${E.fields.map(([k, label, , req]) => `<label class="f"><span>${esc(label)}${req ? '<span class="req"> *</span>' : ''}</span><select data-m="${k}"><option value="">— not in file —</option>${(st.sheets[st.sheet].rows[st.header] || []).map((h, i) => h === undefined ? '' : `<option value="${i}" ${st.map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
   <div class="row"><button id="pv" class="primary">Preview</button></div><div id="pvo"></div>` : ''}`;
  $('#fl', el).onchange = async e => {
    const f = e.target.files[0]; if (!f) return; try { st.file = f.name; if (/\.csv$/i.test(f.name)) st.sheets = [{ name: f.name, rows: parseCsv(await f.text()) }]; else st.sheets = await readXlsx(await f.arrayBuffer()); st.sheets = st.sheets.filter(s => s.rows.length > 1);
      st.header = 0; const guess = ORDER.find(k => st.sheets.some(s => SHEETNAME[k].test(s.name))) || 'clients'; st.entity = guess; st.sheet = Math.max(0, st.sheets.findIndex(s => SHEETNAME[guess].test(s.name))); st.map = I.suggestMapping(st.entity, st.sheets[st.sheet].rows[0] || []); st.preview = null; drawImport(app, el); } catch (x) { toast(x.message, 'bad'); }
  };
  if (!st.sheets) return;
  $('#en', el).onchange = e => { st.entity = e.target.value; const i = st.sheets.findIndex(s => SHEETNAME[st.entity].test(s.name)); if (i >= 0) st.sheet = i; st.map = I.suggestMapping(st.entity, st.sheets[st.sheet].rows[0] || []); st.preview = null; drawImport(app, el); };
  $('#sh', el).onchange = e => { st.sheet = +e.target.value; st.map = I.suggestMapping(st.entity, st.sheets[st.sheet].rows[0] || []); st.preview = null; drawImport(app, el); };
  $$('[data-m]', el).forEach(s => s.onchange = () => { st.map[s.dataset.m] = s.value === '' ? undefined : +s.value; st.preview = null; });
  $('#pv', el).onclick = () => { const miss = E.fields.filter(f => f[3] && st.map[f[0]] === undefined); if (miss.length) return toast('Match the required column(s): ' + miss.map(m => m[1]).join(', '), 'bad'); st.preview = I.buildPreview(st.entity, st.sheets[st.sheet].rows, st.map, app.store); st.upd = new Set(); showPreview(app, el); };
  if (st.preview) showPreview(app, el);
}
function showPreview(app, el) {
  const pv = st.preview, c = s => pv.filter(p => p.status === s).length, out = $('#pvo', el), E = I.ENTITIES[st.entity];
  out.innerHTML = `<div class="grid g4" style="margin:12px 0"><div class="stat good"><div class="l">New – will be added</div><div class="v">${c('new')}</div></div><div class="stat"><div class="l">Already exist – skipped</div><div class="v">${c('duplicate')}</div></div><div class="stat warn"><div class="l">Possible duplicate</div><div class="v">${c('possible')}</div></div><div class="stat bad"><div class="l">Errors – skipped</div><div class="v">${c('invalid')}</div></div></div>
   ${c('possible') ? `<label class="f"><span style="display:flex;gap:8px;color:var(--ink)"><input type="checkbox" id="ip" ${st.possible ? 'checked' : ''}> Also import the ${c('possible')} “possible duplicate” rows (same mobile as an existing client)</span></label>` : ''}
   ${pv.some(p => p.status === 'duplicate' && p.changes.length) ? `<label class="f"><span style="display:flex;gap:8px;color:var(--ink)"><input type="checkbox" id="ua" ${pv.filter(p => p.status === 'duplicate' && p.changes.length).every(p => st.upd.has(p.n)) ? 'checked' : ''}> Update ALL ${pv.filter(p => p.status === 'duplicate' && p.changes.length).length} existing rows that differ from the file (you will be asked to confirm)</span></label>` : ''}
   <div class="tw" style="max-height:340px"><table><thead><tr><th>Row</th><th>Result</th><th>${E.fields[1][1]}</th><th>Details</th></tr></thead><tbody>${[...pv].sort((a, b) => ({ invalid: 0, possible: 1, duplicate: 2, new: 3 }[a.status] - { invalid: 0, possible: 1, duplicate: 2, new: 3 }[b.status])).slice(0, 120).map(p => `<tr><td>${p.n}</td><td>${badge(p.status === 'new' ? 'New' : p.status === 'duplicate' ? 'Exists' : p.status === 'possible' ? 'Possible dup.' : 'Error', p.status === 'new' ? 'good' : p.status === 'invalid' ? 'bad' : p.status === 'possible' ? 'warn' : '')}</td><td>${esc(p.rec.name || p.rec.family_name || p.rec.policy_no || '')}${st.entity === 'dues' || st.entity === 'claims' ? ' · ' + esc(p.rec.policy_no) : ''}</td><td class="sm">${[...p.errors.map(e => '<span style="color:var(--bad)">' + esc(e) + '</span>'), ...p.warns.map(esc), ...(p.status === 'duplicate' && p.changes.length ? [`<label><input type="checkbox" data-u="${p.n}" ${st.upd.has(p.n) ? 'checked' : ''}> update ${p.changes.length} field(s): ${p.changes.slice(0, 4).map(x => esc(x.label) + ' ' + esc(x.from ?? '∅') + ' → <b>' + esc(x.to) + '</b>').join('; ')}</label>`] : [])].join('<br>')}</td></tr>`).join('')}</tbody></table></div><div class="mut sm">Showing up to 120 rows, errors first.</div>
   <div class="row" style="margin-top:10px"><button class="primary" id="go" ${c('new') + (st.possible ? c('possible') : 0) + st.upd.size ? '' : 'disabled'}>Import ${c('new') + (st.possible ? c('possible') : 0)} row(s)${st.upd.size ? ` and update ${st.upd.size}` : ''}</button></div><div id="prog" class="mut sm"></div>`;
  $('#ua', out)?.addEventListener('change', e => { const rows = pv.filter(p => p.status === 'duplicate' && p.changes.length); rows.forEach(p => e.target.checked ? st.upd.add(p.n) : st.upd.delete(p.n)); showPreview(app, el); });
  $('#ip', out)?.addEventListener('change', e => { st.possible = e.target.checked; showPreview(app, el); }); $$('[data-u]', out).forEach(x => x.onchange = () => { x.checked ? st.upd.add(+x.dataset.u) : st.upd.delete(+x.dataset.u); showPreview(app, el); });
  $('#go', out).onclick = async (e) => {
    if (st.upd.size && !await confirmBox(`You ticked ${st.upd.size} existing record(s) to be OVERWRITTEN with the file's values. Continue?`, { kind: 'danger', yes: 'Yes, overwrite those' })) return; e.target.disabled = true;
    try { const r = await I.commitImport(app.store, st.entity, pv, { includePossible: st.possible, updateRows: st.upd, progress: (n, t) => $('#prog', out).textContent = `Importing… ${n}/${t}` }); app.reindex(); if (st.entity === 'claims' && r.inserted) { $('#prog', out).textContent = 'Creating reminders and tasks…'; await runAutomation({ silent: true, trigger: 'import' }); }
      modal({ title: 'Import finished', body: `<p><b>${r.inserted}</b> added · <b>${r.updated}</b> updated · <b>${r.skipped}</b> skipped${r.failed.length ? ` · <b style="color:var(--bad)">${r.failed.length} failed</b>` : ''}</p>${r.failed.length ? `<div class="sm">${r.failed.slice(0, 12).map(f => `Row ${f.n}: ${esc(f.error)}`).join('<br>')}</div>` : ''}` });
      const nx = ORDER[ORDER.indexOf(st.entity) + 1]; st.preview = null; if (nx && st.sheets.some(s => SHEETNAME[nx].test(s.name))) { st.entity = nx; st.sheet = st.sheets.findIndex(s => SHEETNAME[nx].test(s.name)); st.map = I.suggestMapping(nx, st.sheets[st.sheet].rows[0] || []); toast('Next: ' + I.ENTITIES[nx].label); } drawImport(app, el);
    } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
  };
}

function drawExport(app, el) {
  const { data, ix } = app, cn = id => ix.clientById.get(id)?.name || '', pn = id => ix.policyById.get(id)?.policy_no || '';
  const X = {
    Clients: { cols: ['Client ID', 'Name', 'Mobile', 'WhatsApp', 'Email', 'Address', 'Area', 'DOB', 'Category', 'Status', 'Family'], rows: () => data.clients.map(c => [c.client_code, c.name, c.mobile || '', c.whatsapp || '', c.email || '', c.address || '', c.area_city || '', c.dob || '', c.category, c.relationship_status, ix.familyById.get(c.family_id)?.family_name || '']) },
    Policies: { cols: ['Policy ID', 'Policy no.', 'Client', 'Plan', 'Type', 'Status', 'Premium', 'Frequency', 'Next due', 'Maturity', 'Sum assured', 'Nominee'], rows: () => data.policies.map(p => [p.policy_code, p.policy_no, cn(p.client_id), p.plan_name || '', p.policy_type || '', p.status, p.premium == null ? '' : Number(p.premium), p.frequency || '', p.next_due_date || '', p.maturity_date || '', p.sum_assured == null ? '' : Number(p.sum_assured), p.nominee || '']) },
    Installments: { cols: ['Policy no.', 'Client', 'Due date', 'Amount', 'Status', 'Paid on'], rows: () => data.dues.map(d => [pn(d.policy_id), cn(ix.policyById.get(d.policy_id)?.client_id), d.due_date, Number(d.amount), d.status, d.paid_on || '']) },
    Payments: { cols: ['Date', 'Client', 'Policy no.', 'Amount', 'Late fee', 'Method', 'Reference', 'Verified'], rows: () => data.transactions.map(t => [t.paid_on, cn(t.client_id), pn(t.policy_id), Number(t.amount), Number(t.late_fee), t.method, t.reference || '', t.verified ? 'Yes' : 'No']) },
    Receipts: { cols: ['Payment date', 'Client', 'Policy no.', 'Amount', 'LIC receipt no.', 'Status', 'Dispatch'], rows: () => data.receipts.map(r => [r.payment_date, cn(r.client_id), pn(r.policy_id), Number(r.amount), r.receipt_no || '', r.status, r.dispatch_method || '']) },
    Claims: { cols: ['Claim ID', 'Client', 'Policy no.', 'Type', 'Date', 'Stage', 'Expected', 'Settled on', 'Settled amount'], rows: () => data.claims.map(k => [k.claim_code, cn(k.client_id), pn(k.policy_id), k.claim_type, k.event_date || '', k.stage, k.expected_amount == null ? '' : Number(k.expected_amount), k.actual_settlement || '', k.settled_amount == null ? '' : Number(k.settled_amount)]) },
    Tasks: { cols: ['Task ID', 'Client', 'Category', 'Description', 'Priority', 'Status', 'Due', 'Next action', 'Next action date'], rows: () => data.tasks.map(t => [t.task_code, cn(t.client_id), t.category, t.description, t.priority, t.status, t.due_date, t.next_action || '', t.next_action_date || '']) } };
  el.innerHTML = Object.keys(X).map(k => `<div><div class="grow">${k} <span class="mut sm">(${X[k].rows().length})</span></div><button class="sm" data-x="${k}">Excel</button><button class="sm" data-c="${k}">CSV</button></div>`).join('');
  el.onclick = e => { const b = e.target.closest('[data-x],[data-c]'); if (!b) return; const k = b.dataset.x || b.dataset.c, x = X[k]; if (b.dataset.x) download(xlsxBlob([{ name: k, columns: x.cols, rows: x.rows() }]), `${k.toLowerCase()}_${app.today}.xlsx`); else download(csv([x.cols, ...x.rows()]), `${k.toLowerCase()}_${app.today}.csv`, 'text/csv'); };
}

function dupes(app, el) {
  const { data } = app, by = (keyf) => { const m = new Map(); for (const c of data.clients) { if (c.archived) continue; const k = keyf(c); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(c); } return [...m.values()].filter(g => g.length > 1); };
  const nk = c => c.name.toLowerCase().replace(/\b(shri|smt|kum|dr|mr|mrs)\b\.?/g, '').replace(/[^a-z0-9]/g, ''), groups = [...by(c => c.mobile && nk(c) + '|' + c.mobile).map(g => ['Same name and mobile', g]), ...by(c => nk(c)).filter(g => new Set(g.map(c => c.mobile)).size > 1 || g.some(c => !c.mobile)).map(g => ['Same name', g])];
  el.innerHTML = groups.length ? `<div class="mut sm">${groups.length} group(s). Open each client to review; records are never merged automatically.</div>` + groups.slice(0, 60).map(([why, g]) => `<div class="card" style="padding:8px 12px"><span class="badge warn">${why}</span> ${g.map(c => `<a href="#/clients/${c.id}">${esc(c.name)} (${esc(c.client_code)}, ${esc(c.mobile || 'no mobile')})</a>`).join(' · ')}</div>`).join('') : '<div class="mut">No duplicates found 🎉</div>';
}
function archived(app, el) {
  const { data } = app, cl = data.clients.filter(c => c.archived), po = data.policies.filter(p => p.archived);
  el.innerHTML = (cl.length || po.length) ? [...cl.map(c => `<div class="row"><span class="grow">Client: ${esc(c.name)}</span>${app.can('write') ? `<button class="sm" data-rc="${c.id}">Restore</button>` : ''}</div>`), ...po.map(p => `<div class="row"><span class="grow">Policy: ${esc(p.policy_no)}</span>${app.can('write') ? `<button class="sm" data-rp="${p.id}">Restore</button>` : ''}</div>`)].join('') : '<div class="mut">Nothing archived. Archive a client or policy from its own page.</div>';
  el.onclick = async e => { const b = e.target.closest('[data-rc],[data-rp]'); if (!b) return; await app.store.update(b.dataset.rc ? 'clients' : 'policies', b.dataset.rc || b.dataset.rp, { archived: false }); app.reindex(); toast('Restored', 'good'); archived(app, el); };
}
