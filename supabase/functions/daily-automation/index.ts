// Runs the daily automation on the server (called every morning by pg_cron – see supabase/cron.sql).
// Secrets needed (Supabase Dashboard > Edge Functions > Secrets): CRON_SECRET.  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { makeClient, runDaily } from '../_shared/daily.js';

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });
  try {
    const db = makeClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const summary = await runDaily(db, { trigger: 'cron' });
    return new Response(JSON.stringify({ ok: true, summary }), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
