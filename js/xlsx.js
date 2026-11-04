// Minimal dependency-free XLSX reader / writer (enough for imports and report downloads).
const enc = new TextEncoder(), dec = new TextDecoder();
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/* ---------------- ZIP ---------------- */
async function inflateRaw(u8) { const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
export async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a valid .xlsx (zip) file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), start = lo + 30 + lnl + lel, data = u8.subarray(start, start + csize);
    files[name] = { method, data };
  }
  const out = {}; for (const [k, f] of Object.entries(files)) out[k] = async () => f.method === 0 ? f.data : inflateRaw(f.data);
  return out;
}
export function zip(entries) {   // entries: {name: Uint8Array|string}; stored (no compression)
  const parts = [], cd = []; let off = 0;
  const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24];
  for (const [name, c] of Object.entries(entries)) {
    const data = typeof c === 'string' ? enc.encode(c) : c, nm = enc.encode(name), crc = crc32(data);
    const lh = new Uint8Array([0x50,0x4b,3,4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)]);
    parts.push(lh, nm, data);
    cd.push(new Uint8Array([0x50,0x4b,1,2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += lh.length + nm.length + data.length;
  }
  const cdSize = cd.reduce((s, a) => s + a.length, 0), count = Object.keys(entries).length;
  const end = new Uint8Array([0x50,0x4b,5,6, 0,0, 0,0, ...u16(count), ...u16(count), ...u32(cdSize), ...u32(off), 0,0]);
  const all = [...parts, ...cd, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of all) { out.set(a, o); o += a.length; } return out;
}

/* ---------------- reader ---------------- */
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const txt = async (z, name) => z[name] ? dec.decode(await z[name]()) : null;
/** returns [{name, rows:[[cell,...],...]}]. Dates stored as serial numbers are returned as numbers (use excelDate to convert). */
export async function readXlsx(buf) {
  const z = await unzip(buf);
  const wb = await txt(z, 'xl/workbook.xml'); if (!wb) throw new Error('This does not look like an Excel workbook');
  const rels = await txt(z, 'xl/_rels/workbook.xml.rels'); const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1]; if (id) relMap[id] = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
  const ss = []; const sst = await txt(z, 'xl/sharedStrings.xml');
  if (sst) for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) ss.push(unesc([...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')));
  const styles = await txt(z, 'xl/styles.xml'); const dateFmt = new Set();
  if (styles) {
    const custom = {}; for (const m of styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom[m[1]] = m[2];
    const cx = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] || ''; let i = 0;
    for (const x of cx.matchAll(/<xf\b[^>]*numFmtId="(\d+)"/g)) { const id = +x[1], fc = custom[id] || ''; if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]{1,4}[-\/. ][dmy]|yy|dd/i.test(fc.replace(/"[^"]*"/g, ''))) dateFmt.add(i); i++; }
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(/name="([^"]*)"/.exec(m[0])[1]), rid = /r:id="([^"]+)"/.exec(m[0])?.[1], path = relMap[rid]; const xml = path && await txt(z, path); if (!xml) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = +(/r="(\d+)"/.exec(r[0])?.[1] || rows.length + 1), row = []; if (!r[1]) continue;
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = c[1], ref = /r="([A-Z]+\d+)"/.exec(at)?.[1]; if (!ref) continue; const t = /t="(\w+)"/.exec(at)?.[1], s = +(/s="(\d+)"/.exec(at)?.[1] || 0), body = c[2] || '';
        let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]; let val = null;
        if (t === 's') val = ss[+v]; else if (t === 'inlineStr') val = unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')); else if (t === 'str') val = unesc(v ?? ''); else if (t === 'b') val = v === '1'; else if (v !== undefined && v !== '') { val = Number(v); if (dateFmt.has(s)) val = { serial: val }; }
        row[colIdx(ref)] = val;
      }
      while (rows.length < rn - 1) rows.push([]); rows[rn - 1] = row;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
export const excelDate = serial => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000); return d.toISOString().slice(0, 10); };

/* ---------------- writer ---------------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
/** sheets: [{name, columns:[...header], rows:[[...]], widths?:[...]}]. Numbers stay numbers; everything else is text (so mobile numbers / policy numbers never lose digits). */
export function writeXlsx(sheets) {
  const used = new Set(), names = sheets.map(s => { let n = s.name.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || 'Sheet', k = n, i = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 28) + ' ' + i++; used.add(k.toLowerCase()); return k; });
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => {
    const w = s.widths || s.columns.map((c, ci) => Math.min(60, Math.max(10, String(c).length + 2, ...s.rows.slice(0, 200).map(r => String(r[ci] ?? '').length + 2))));
    const cell = (v, r, c, st) => { const ref = colName(c) + r; if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st ? ' s="1"' : ''}><v>${v}</v></c>`; return `<c r="${ref}" t="inlineStr"${st ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`; };
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${w.map((v, k) => `<col min="${k + 1}" max="${k + 1}" width="${v}" customWidth="1"/>`).join('')}</cols><sheetData>`;
    x += `<row r="1">${s.columns.map((c, k) => cell(String(c), 1, k, true)).join('')}</row>`;
    s.rows.forEach((r, ri) => { x += `<row r="${ri + 2}">${s.columns.map((_, k) => cell(r[k], ri + 2, k)).join('')}</row>`; });
    files[`xl/worksheets/sheet${i + 1}.xml`] = x + '</sheetData></worksheet>';
  });
  return zip(files);
}
export const xlsxBlob = sheets => new Blob([writeXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
