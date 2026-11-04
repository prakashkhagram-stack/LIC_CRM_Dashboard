// Tiny PDF writer: A4, Helvetica, Latin text only. Non-Latin characters (e.g. Gujarati) are replaced with "?" – use Excel export for those.
const enc = new TextEncoder();
const clean = s => String(s ?? '').replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e]/g, '?');
const pdfEsc = s => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const W = { ' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015 };
function cw(ch, bold) { if (W[ch]) return W[ch]; if (/[0-9]/.test(ch)) return 556; if (/[A-Z]/.test(ch)) return ({I:278,J:500,M:833,W:944,L:556,F:611,i:222}[ch] || 667) * (bold ? 1.05 : 1); if (/[a-z]/.test(ch)) return ({i:222,j:222,l:222,t:278,f:278,r:333,m:833,w:722,s:500,c:500,k:500,v:500,x:500,y:500,z:500}[ch] || 556) * (bold ? 1.05 : 1); return 556; }
export const textWidth = (s, size, bold) => [...clean(s)].reduce((a, ch) => a + cw(ch, bold), 0) * size / 1000;
function fit(s, size, maxW, bold) { s = clean(s); if (textWidth(s, size, bold) <= maxW) return s; while (s.length > 1 && textWidth(s + '..', size, bold) > maxW) s = s.slice(0, -1); return s + '..'; }

/** report: {title, summary:[[label,value]], sections:[{heading, columns, rows}]} */
export function reportPdf(report, { business = '', footer = '' } = {}) {
  const PW = 595, PH = 842, M = 36, pages = []; let ops = [], y = 0;
  const newPage = () => { if (ops.length) pages.push(ops.join('\n')); ops = []; y = PH - M; };
  const text = (s, x, yy, size = 9, bold = false) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfEsc(s)}) Tj ET`);
  const line = (x1, y1, x2, y2, g = .75) => ops.push(`${g} G ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x, yy, w, h, g) => ops.push(`${g} g ${x} ${yy} ${w} ${h} re f 0 g`);
  newPage();
  if (business) { text(business, M, y, 9); y -= 14; }
  text(report.title, M, y - 4, 16, true); y -= 26; line(M, y, PW - M, y); y -= 16;
  for (const [k, v] of report.summary || []) { if (y < M + 30) newPage(); text(k, M, y, 9.5); text(String(v), M + 300, y, 9.5, true); y -= 14; }
  for (const sec of report.sections || []) {
    y -= 12; if (y < M + 60) newPage(); text(sec.heading, M, y, 11.5, true); y -= 8;
    if (!sec.rows.length) { y -= 12; text('None', M, y, 9); y -= 6; continue; }
    const n = sec.columns.length, avail = PW - 2 * M, widths = sec.columns.map((c, i) => Math.max(textWidth(c, 8, true), ...sec.rows.slice(0, 80).map(r => Math.min(textWidth(r[i], 8.5), 170))) + 8);
    const sum = widths.reduce((a, b) => a + b, 0), k = sum > avail ? avail / sum : 1, cols = widths.map(w => w * k);
    const head = () => { y -= 14; rect(M, y - 3, avail, 13, .88); let x = M + 2; sec.columns.forEach((c, i) => { text(fit(c, 8, cols[i] - 4, true), x, y, 8, true); x += cols[i]; }); y -= 4; };
    head();
    for (const r of sec.rows) {
      if (y < M + 24) { newPage(); head(); }
      y -= 12; let x = M + 2; r.forEach((v, i) => { text(fit(String(v ?? ''), 8.5, cols[i] - 4), x, y, 8.5); x += cols[i]; }); line(M, y - 3, PW - M, y - 3, .92);
    }
  }
  newPage();
  const objs = []; const add = s => (objs.push(s), objs.length);
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((c, i) => {
    const foot = `BT /F1 7.5 Tf ${M} 20 Td (${pdfEsc((footer ? footer + '   ' : '') + 'Page ' + (i + 1) + ' of ' + pages.length)}) Tj ET`;
    const body = c + '\n' + foot, cid = add(`<< /Length ${enc.encode(body).length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`));
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(enc.encode(out).length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xr = enc.encode(out).length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
  return enc.encode(out);
}
export const pdfBlob = (report, opt) => new Blob([reportPdf(report, opt)], { type: 'application/pdf' });
