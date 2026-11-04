// Receives delivery receipts from Meta and updates the message log. Set this function's URL as the webhook in the Meta developer console.
// Secrets: WA_VERIFY_TOKEN (any string you choose, also typed into Meta), WA_APP_SECRET (Meta app secret – used to verify signatures).
// Deploy with:  supabase functions deploy wa-webhook --no-verify-jwt
const enc = new TextEncoder();
async function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === header.slice(7);
}
Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  if (req.method === 'GET') {   // Meta's one-time verification
    return (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN')) ? new Response(u.searchParams.get('hub.challenge')) : new Response('forbidden', { status: 403 });
  }
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256'), Deno.env.get('WA_APP_SECRET') || ''))) return new Response('bad signature', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const map: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
  for (const e of JSON.parse(raw).entry || []) for (const c of e.changes || []) for (const s of c.value?.statuses || []) {
    const status = map[s.status]; if (!status || !s.id) continue;
    await fetch(`${url}/rest/v1/communications?provider_message_id=eq.${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status }) });
  }
  return new Response('ok');
});
