// WhatsApp / message templates (English + Gujarati). Editable in Settings (overrides stored in settings.templates).
export const TEMPLATE_DEFS = [
 { key:'premium_due', label:'Premium due reminder',
   en:'Dear {client_name},\nGreetings from {advisor_name}. Your LIC premium of ₹{amount} for policy {policy_no} is due on {due_date}. Kindly arrange the payment on time to keep your policy in force.\nThank you.\n{signature}',
   gu:'પ્રિય {client_name},\n{advisor_name} તરફથી નમસ્કાર. તમારી LIC પોલિસી {policy_no} નું પ્રીમિયમ ₹{amount} તા. {due_date} ના રોજ ભરવાનું છે. પોલિસી ચાલુ રાખવા માટે કૃપા કરી સમયસર પ્રીમિયમ ભરશો.\nધન્યવાદ.\n{signature}' },
 { key:'friendly_followup', label:'Friendly follow-up',
   en:'Hello {client_name}, this is a gentle reminder from {advisor_name} regarding the premium of ₹{amount} for policy {policy_no} (due {due_date}). Please let me know a convenient time for payment or collection.\n{signature}',
   gu:'નમસ્તે {client_name}, {advisor_name} તરફથી પોલિસી {policy_no} ના પ્રીમિયમ ₹{amount} (તા. {due_date}) અંગે નમ્ર યાદ. ચુકવણી અથવા કલેક્શન માટે અનુકૂળ સમય જણાવશો.\n{signature}' },
 { key:'overdue', label:'Overdue premium reminder',
   en:'Dear {client_name}, the premium of ₹{amount} for policy {policy_no} was due on {due_date} and is still pending ({days_overdue} days). Please pay at the earliest to avoid lapse and late fee. For help, contact {advisor_name} on {advisor_phone}.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} નું ₹{amount} પ્રીમિયમ તા. {due_date} ના રોજ બાકી હતું અને હજી ભરાયું નથી ({days_overdue} દિવસ). લેપ્સ અને લેટ ફી ટાળવા વહેલી તકે ભરશો. મદદ માટે {advisor_name}: {advisor_phone}.\n{signature}' },
 { key:'collection_appointment', label:'Collection appointment confirmation',
   en:'Dear {client_name}, confirming my visit on {visit_date} {visit_time} at {address} to collect the premium of ₹{amount} for policy {policy_no}. Please keep the payment ready.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} ના ₹{amount} પ્રીમિયમ કલેક્શન માટે તા. {visit_date} {visit_time} એ {address} પર આવવાનું નક્કી છે. કૃપા કરી ચુકવણી તૈયાર રાખશો.\n{signature}' },
 { key:'payment_ack', label:'Payment received acknowledgment',
   en:'Dear {client_name}, we have received ₹{amount} on {paid_on} ({method}) towards policy {policy_no}. This is an acknowledgment from {advisor_name}; the official LIC receipt will be shared once issued.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} માટે ₹{amount} તા. {paid_on} ના રોજ ({method}) મળ્યા છે. આ {advisor_name} તરફથી પહોંચ સ્વીકાર છે; LIC ની સત્તાવાર રસીદ મળતાં જ મોકલીશ.\n{signature}' },
 { key:'receipt_dispatch', label:'Receipt dispatch message',
   en:'Dear {client_name}, please find the LIC premium receipt for policy {policy_no} (₹{amount}, paid {paid_on}). Kindly acknowledge receipt.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} (₹{amount}, તા. {paid_on}) ની LIC પ્રીમિયમ રસીદ મોકલું છું. કૃપા કરી મળ્યાની જાણ કરશો.\n{signature}' },
 { key:'maturity_approaching', label:'Maturity approaching',
   en:'Dear {client_name}, your policy {policy_no} is due for {claim_type} on {event_date} (about {days_left} days). Please contact {advisor_name} on {advisor_phone} so that we can prepare the paperwork in time.\n{signature}',
   gu:'પ્રિય {client_name}, તમારી પોલિસી {policy_no} ની {claim_type} તા. {event_date} ના રોજ આવે છે (લગભગ {days_left} દિવસ). સમયસર કાગળો તૈયાર કરવા {advisor_name} નો સંપર્ક કરશો: {advisor_phone}.\n{signature}' },
 { key:'maturity_docs', label:'Maturity document requirements',
   en:'Dear {client_name}, for your policy {policy_no} {claim_type} please keep these ready: {documents}. I will help with the forms.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} ની {claim_type} માટે કૃપા કરી આ દસ્તાવેજો તૈયાર રાખશો: {documents}. ફોર્મમાં હું મદદ કરીશ.\n{signature}' },
 { key:'claim_status', label:'Claim status update',
   en:'Dear {client_name}, update on your policy {policy_no}: current status is "{stage}". Next step: {next_action}.\n{signature}',
   gu:'પ્રિય {client_name}, પોલિસી {policy_no} અંગે અપડેટ: હાલની સ્થિતિ "{stage}". આગળનું પગલું: {next_action}.\n{signature}' },
 { key:'birthday', label:'Birthday greeting',
   en:'Happy Birthday {client_name}! Wishing you good health, happiness and prosperity. – {advisor_name}',
   gu:'જન્મદિવસની હાર્દિક શુભેચ્છાઓ {client_name}! સ્વસ્થ, સુખી અને સમૃદ્ધ જીવનની શુભકામનાઓ. – {advisor_name}' },
 { key:'anniversary', label:'Wedding anniversary greeting',
   en:'Happy Anniversary {client_name}! Wishing you many more years of togetherness. – {advisor_name}',
   gu:'લગ્નતિથિની હાર્દિક શુભેચ્છાઓ {client_name}! તમારો સાથ સદા સુખી રહે. – {advisor_name}' },
 { key:'policy_anniversary', label:'Policy anniversary greeting',
   en:'Dear {client_name}, congratulations on {years} year(s) with your policy {policy_no}. Thank you for your trust. – {advisor_name}',
   gu:'પ્રિય {client_name}, તમારી પોલિસી {policy_no} ને {years} વર્ષ પૂર્ણ થયા તે બદલ અભિનંદન. વિશ્વાસ બદલ આભાર. – {advisor_name}' },
 { key:'general', label:'General service message',
   en:'Dear {client_name}, {message}\n{signature}',
   gu:'પ્રિય {client_name}, {message}\n{signature}' },
];

export function getTemplate(key, lang, settings) {
  const def = TEMPLATE_DEFS.find(t => t.key === key); if (!def) return '';
  return settings?.templates?.[key]?.[lang] || def[lang] || def.en;
}
export function placeholders(text) { return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]))]; }

/** Fill placeholders. Missing values are NOT invented: they are returned in `missing` and left as {name} so the user sees the gap. */
export function renderTemplate(text, vars) {
  const missing = [];
  const out = text.replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    if (v === undefined || v === null || v === '') { if (!missing.includes(k)) missing.push(k); return m; }
    return String(v);
  });
  return { text: out, missing };
}

export function normalisePhone(raw, cc = '91') {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return cc + d;
  if (d.length === 12 && d.startsWith(cc)) return d;
  if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d[1])) return cc + d.slice(1);
  return null;
}
/** wa.me link. Very long texts are cut at a line boundary (browsers/WhatsApp reject huge URLs). */
export function waLink(phone, text) {
  const p = normalisePhone(phone); if (!p) return null;
  let t = text, truncated = false;
  if (encodeURIComponent(t).length > 3500) { truncated = true; while (encodeURIComponent(t).length > 3400) t = t.slice(0, t.lastIndexOf('\n') > 200 ? t.lastIndexOf('\n') : t.length - 100); }
  return { url: `https://wa.me/${p}?text=${encodeURIComponent(t)}`, truncated };
}
export const mailLink = (email, subject, body) => email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
export const telLink = phone => { const p = normalisePhone(phone); return p ? 'tel:+' + p : null; };
