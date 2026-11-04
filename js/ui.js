// Small UI toolkit: escaping, formatting, toasts, modals, forms and an interactive data table.
import { fmtDate } from './dates.js';
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const inr = n => n === null || n === undefined || n === '' || isNaN(n) ? '–' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const inr0 = n => n === null || n === undefined || isNaN(n) ? '–' : '₹' + Math.round(Number(n)).toLocaleString('en-IN');
export const D = iso => iso ? fmtDate(String(iso).slice(0, 10)) : '–';
export const DT = ts => { if (!ts) return '–'; const d = new Date(ts); return isNaN(d) ? '–' : fmtDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)) + ' ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
export const badge = (text, tone = 'neutral') => `<span class="badge ${tone}">${esc(text)}</span>`;
export const TONE = { 'Upcoming':'neutral','Due Soon':'warn','Due Today':'warn','Overdue':'bad','Payment Received':'info','Receipt Pending':'info','Completed':'good','Waived':'neutral','Cancelled':'neutral' };
export function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500); }
export function download(blobOrText, name, type = 'text/plain') { const b = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export function csv(rows) { return '﻿' + rows.map(r => r.map(v => { v = v ?? ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }

/** Modal. body is an HTML string or element. actions: [{label, kind, onClick(close, modalEl) -> may return false to keep open}] */
export function modal({ title, body, actions = [], wide = false, onOpen, closeLabel = 'Close' }) {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><header><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="Close">✕</button></header><div class="body"></div><footer></footer></div>`;
  const bodyEl = $('.body', ov); if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
  const foot = $('footer', ov); const close = () => { ov.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', esc_);
  const cb = document.createElement('button'); cb.textContent = actions.length ? 'Cancel' : closeLabel; cb.onclick = close; foot.append(cb);
  for (const a of actions) { const b = document.createElement('button'); b.className = a.kind || ''; b.innerHTML = a.label; b.onclick = async () => { b.disabled = true; try { if ((await a.onClick(close, ov)) === false) b.disabled = false; } catch (e) { toast(e.message || String(e), 'bad'); b.disabled = false; } }; foot.append(b); }
  $('[data-x]', ov).onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) ov._down = true; }); ov.addEventListener('mouseup', e => { if (e.target === ov && ov._down) close(); ov._down = false; });
  document.body.append(ov); onOpen?.(ov, close); const f = $('input:not([type=hidden]),select,textarea', ov); if (f && matchMedia('(pointer:fine)').matches) f.focus(); return { close, el: ov };
}
export const confirmBox = (message, { yes = 'Yes, continue', kind = 'primary', title = 'Please confirm' } = {}) => new Promise(res => { let done = false; const m = modal({ title, body: `<p>${message}</p>`, actions: [{ label: yes, kind, onClick: close => { done = true; res(true); close(); } }] }); const o = m.el; new MutationObserver(() => { if (!document.body.contains(o) && !done) { done = true; res(false); } }).observe(document.body, { childList: true }); });

/** Field spec: {name,label,type,options,required,hint,full,value,placeholder,rows}. Returns HTML. */
export function fieldHtml(f, v) {
  const val = v ?? f.value ?? ''; const req = f.required ? '<span class="req"> *</span>' : ''; const id = 'f_' + f.name;
  let inp;
  if (f.type === 'select') inp = `<select id="${id}" name="${f.name}" ${f.required ? 'required' : ''}>${f.blank !== false ? '<option value="">' + esc(f.blankLabel || '— select —') + '</option>' : ''}${(f.options || []).map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea') inp = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
  else if (f.type === 'checkbox') return `<label class="f ${f.full ? 'full' : ''}"><span style="display:flex;gap:8px;align-items:center;font-size:13.5px;color:var(--ink)"><input type="checkbox" id="${id}" name="${f.name}" ${val === true || val === 'true' ? 'checked' : ''}> ${esc(f.label)}</span>${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</label>`;
  else inp = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? `step="${f.step || 'any'}" inputmode="decimal"` : ''} ${f.required ? 'required' : ''} value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'tel' ? 'inputmode="tel"' : ''} ${f.max ? `max="${f.max}"` : ''} ${f.min ? `min="${f.min}"` : ''}>`;
  return `<label class="f ${f.full ? 'full' : ''}"><span>${esc(f.label)}${req}</span>${inp}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</label>`;
}
export function readForm(root, fields) {
  const out = {}; for (const f of fields) { const el = $(`[name="${f.name}"]`, root); if (!el) continue; if (f.type === 'checkbox') out[f.name] = el.checked; else { let v = el.value.trim(); out[f.name] = v === '' ? null : f.type === 'number' ? Number(v) : v; } } return out;
}
/** Form modal. onSubmit(values, close) may throw to show the message. */
export function formModal({ title, fields, values = {}, submit = 'Save', onSubmit, wide = false, intro = '', extra }) {
  const body = document.createElement('form'); body.innerHTML = (intro ? `<p class="mut">${intro}</p>` : '') + `<div class="fgrid">${fields.map(f => fieldHtml(f, values[f.name])).join('')}</div>`;
  body.addEventListener('submit', e => e.preventDefault());
  return modal({ title, body, wide, onOpen: (ov) => extra?.(ov), actions: [{ label: submit, kind: 'primary', onClick: async (close, ov) => { if (!body.reportValidity()) return false; await onSubmit(readForm(body, fields), close, ov); close(); } }] });
}

/** Interactive table: search box, column sort, paging. cols: [{key,label,render(row)->html,sort(row)->value,num,cls,hideSm}] */
export function dataTable(el, { cols, rows, pageSize = 50, search, onRow, empty = 'Nothing to show.', rowClass, sortKey, sortDir = 1, toolbar = '' }) {
  let q = '', page = 0, sk = sortKey, sd = sortDir, shown = rows;
  const api = { setRows(r) { rows = r; page = 0; draw(); }, get count() { return shown.length; } };
  function draw() {
    let list = rows; if (q && search) { const t = q.toLowerCase().split(/\s+/); list = rows.filter(r => { const hay = search(r).toLowerCase(); return t.every(w => hay.includes(w)); }); }
    if (sk) { const c = cols.find(c => c.key === sk); if (c) { const f = c.sort || (r => r[c.key]); list = [...list].sort((a, b) => { const x = f(a), y = f(b); return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sd; }); } }
    shown = list; const pages = Math.max(1, Math.ceil(list.length / pageSize)); page = Math.min(page, pages - 1); const slice = list.slice(page * pageSize, page * pageSize + pageSize);
    el.innerHTML = `<div class="row" style="margin-bottom:8px">${search ? `<input class="grow" data-q type="search" placeholder="Search…" value="${esc(q)}" style="max-width:340px">` : ''}${toolbar}<span class="mut sm">${list.length.toLocaleString('en-IN')} row${list.length === 1 ? '' : 's'}</span></div>
    <div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.sort || c.key ? 's' : ''} ${c.hideSm ? 'hide-sm' : ''}" data-k="${c.key}">${esc(c.label)}${sk === c.key ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${slice.length ? slice.map((r, i) => `<tr data-i="${page * pageSize + i}" class="${onRow ? 'clk' : ''} ${rowClass?.(r) || ''}">${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls || ''} ${c.hideSm ? 'hide-sm' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>
    ${pages > 1 ? `<div class="pager"><span>Page ${page + 1} of ${pages}</span><span class="row"><button class="sm" data-p="-1" ${page === 0 ? 'disabled' : ''}>‹ Prev</button><button class="sm" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>Next ›</button></span></div>` : ''}`;
    const qi = el.querySelector('[data-q]'); if (qi) { qi.oninput = debounce(() => { q = qi.value; page = 0; const pos = qi.selectionStart; draw(); const n = el.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); }, 180); }
    el.querySelectorAll('th.s').forEach(th => th.onclick = () => { const k = th.dataset.k; if (sk === k) sd = -sd; else { sk = k; sd = 1; } draw(); });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { page += +b.dataset.p; draw(); el.scrollIntoView({ block: 'nearest' }); });
    if (onRow) el.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = e => { if (e.target.closest('a,button,input,select,label')) return; onRow(shown[+tr.dataset.i], e); });
  }
  draw(); return api;
}
export const chips = (opts, current, attr = 'data-f') => `<div class="chips">${opts.map(([v, l, n]) => `<button class="chip ${v === current ? 'on' : ''}" ${attr}="${esc(v)}">${esc(l)}${n !== undefined ? ` (${n})` : ''}</button>`).join('')}</div>`;
