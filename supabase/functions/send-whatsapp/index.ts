// OFFICIAL WhatsApp Business Cloud API sender. Only works after you have completed Meta's setup (see SETUP.md, section 7).
// Secrets: WHATSAPP_TOKEN (permanent system-user token), WHATSAPP_PHONE_ID.  Only signed-in staff/admin users may call it.
// Honesty rules: a message is recorded as "sent" only when Meta accepts it, and as "delivered"/"read" only when Meta's webhook says so.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, token = Deno.env.get('WHATSAPP_TOKEN'), phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return json({ ok: false, error: 'WhatsApp API is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID missing).' }, 501);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const u = await fetch(url + '/auth/v1/user', { headers: { apikey: svc, Authorization: 'Bearer ' + jwt } });
  if (!u.ok) return json({ ok: false, error: 'not signed in' }, 401);
  const user = await u.json();
  const prof = await (await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role,active`, { headers: { apikey: svc, Authorization: 'Bearer ' + svc } })).json();
  if (!prof[0]?.active || !['admin', 'staff'].includes(prof[0].role)) return json({ ok: false, error: 'not allowed' }, 403);

  const { client_id, policy_id, due_id, to, template, language, params } = await req.json();   // template = name of a Meta-APPROVED template; params = array of strings
  if (!to || !template) return json({ ok: false, error: 'to and template are required' }, 400);
  const phone = String(to).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');
  const body = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: template, language: { code: language || 'en' }, components: params?.length ? [{ type: 'body', parameters: params.map((t: string) => ({ type: 'text', text: String(t) })) }] : [] } };
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json();
  const ok = r.ok && out.messages?.[0]?.id;
  await fetch(url + '/rest/v1/communications', { method: 'POST', headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ client_id, policy_id, due_id, direction: 'out', channel: 'WhatsApp', template_key: template, language, message: JSON.stringify(params || []), status: ok ? 'sent' : 'failed', provider_message_id: ok || null, created_by: user.id }) });
  return json({ ok: !!ok, provider_response: out }, ok ? 200 : 502);
});
