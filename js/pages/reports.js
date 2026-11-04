import { esc, D, $, $$, download, toast, chips } from '../ui.js';
import { buildReport } from '../metrics.js';
import { xlsxBlob } from '../xlsx.js';
import { pdfBlob } from '../pdf.js';

let kind = 'daily';
export async function render(app, el) {
  const rep = buildReport(kind, app.data, app.ix, app.today, app.settings), slug = `${kind}_report_${app.today}`;
  el.innerHTML = `<div class="head"><div class="grow"><h1>Reports</h1><div class="sub">Calculated live from your data. Download as Excel or PDF, or print.</div></div><div class="row no-print"><button id="xl">⬇ Excel</button><button id="pd">⬇ PDF</button><button id="pr">🖨 Print</button></div></div>
   <div class="no-print">${chips([['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], kind, 'data-k')}</div>
   <div class="card" style="margin-top:12px"><h2>${esc(rep.title)}</h2><dl class="kv">${rep.summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd><b>${esc(v)}</b></dd>`).join('')}</dl></div>
   ${rep.sections.map(s => `<div class="card"><h2>${esc(s.heading)} <span class="mut sm">(${s.rows.length})</span></h2>${s.rows.length ? `<div class="tw"><table><thead><tr>${s.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(0, 150).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${s.rows.length > 150 ? `<div class="mut sm">Showing first 150 of ${s.rows.length}. The downloads contain everything.</div>` : ''}` : '<div class="mut">None</div>'}</div>`).join('')}`;
  $$('[data-k]', el).forEach(b => b.onclick = () => { kind = b.dataset.k; app.rerender(); });
  $('#xl', el).onclick = () => download(xlsxBlob([{ name: 'Summary', columns: ['Item', 'Value'], rows: rep.summary.map(([k, v]) => [k, typeof v === 'number' ? v : String(v)]) }, ...rep.sections.map(s => ({ name: s.heading.slice(0, 28), columns: s.columns, rows: s.rows }))]), slug + '.xlsx');
  $('#pd', el).onclick = () => { download(pdfBlob(rep, { business: app.settings.business.business_name || app.settings.business.advisor_name || '', footer: 'Generated ' + D(app.today) }), slug + '.pdf'); toast('PDF contains English/numbers only – Gujarati text appears as ?; use Excel for that.'); };
  $('#pr', el).onclick = () => print();
}
