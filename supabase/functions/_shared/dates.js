// Date helpers. All dates in the app are plain ISO strings "YYYY-MM-DD" (no time zone surprises).
// Display format is DD-MM-YYYY, business time zone is Asia/Kolkata.
export const MS_DAY = 86400000;
export function parseISO(s){ if(!s) return NaN; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN; }
export function toISO(ms){ const d=new Date(ms); return d.getUTCFullYear().toString().padStart(4,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
export function todayISO(tz='Asia/Kolkata', now=new Date()){ return now.toLocaleDateString('en-CA',{timeZone:tz}); }
export function addDays(iso,n){ return toISO(parseISO(iso)+n*MS_DAY); }
export function diffDays(a,b){ return Math.round((parseISO(a)-parseISO(b))/MS_DAY); }   // a - b in days
export function daysInMonth(y,m){ return new Date(Date.UTC(y,m,0)).getUTCDate(); }       // m = 1..12
/** Add n calendar months keeping the day-of-month of `baseDay` (default: the day of `iso`), clamped to month length. */
export function addMonths(iso,n,baseDay){
  const d=new Date(parseISO(iso)); const day=baseDay||d.getUTCDate();
  const total=d.getUTCFullYear()*12+d.getUTCMonth()+n; const y=Math.floor(total/12), m=total%12;
  return toISO(Date.UTC(y,m,Math.min(day,daysInMonth(y,m+1))));
}
export function fmtDate(iso){ if(!iso) return '—'; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m?`${m[3]}-${m[2]}-${m[1]}`:iso; }
export function fmtDM(iso){ if(!iso) return ''; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m?`${m[3]}-${m[2]}`:iso; }
export function parseDMY(s){            // accepts DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, D-M-YY, also ISO
  if(s==null||s==='') return null; s=String(s).trim();
  let m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if(m) return check(+m[1],+m[2],+m[3]);
  m=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s); if(!m) return null;
  let y=+m[3]; if(y<100) y+= y>=50?1900:2000; return check(y,+m[2],+m[1]);
}
function check(y,mo,d){ if(mo<1||mo>12||d<1||d>daysInMonth(y,mo)||y<1900||y>2200) return null; return toISO(Date.UTC(y,mo-1,d)); }
export function monthKey(iso){ return iso?iso.slice(0,7):''; }
export function monthLabel(key){ const [y,m]=key.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+y; }
export function startOfWeek(iso){ const d=new Date(parseISO(iso)); const dow=(d.getUTCDay()+6)%7; return addDays(iso,-dow); }  // Monday
export function ageYears(dob,today){ if(!dob) return null; let a=+today.slice(0,4)-+dob.slice(0,4); if(today.slice(5)<dob.slice(5)) a--; return a; }
/** next occurrence (>= today) of a yearly date such as birthday / anniversary */
export function nextOccurrence(iso,today){
  if(!iso) return null; const md=iso.slice(5); let y=+today.slice(0,4); let cand=y+'-'+md;
  if(md==='02-29' && daysInMonth(y,2)===28) cand=y+'-02-28';
  if(cand<today){ y++; cand=y+'-'+(md==='02-29'&&daysInMonth(y,2)===28?'02-28':md); }
  return cand;
}
