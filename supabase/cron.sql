-- =====================================================================================
--  OPTIONAL – run the automations every morning and evening even when nobody has the app open
--  Requires: (1) the Edge Function "daily-automation" deployed (see SETUP.md), (2) the pg_cron and pg_net extensions
--  (Supabase dashboard > Database > Extensions > enable "pg_cron" and "pg_net").
--  Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running.  Times below are UTC (IST = UTC + 5:30):
--  01:30 UTC = 07:00 IST (morning),  13:30 UTC = 19:00 IST (evening)
-- =====================================================================================
select cron.schedule('crm-morning', '30 1 * * *', $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-automation',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('trigger','cron-morning'));
$$);
select cron.schedule('crm-evening', '30 13 * * *', $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-automation',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('trigger','cron-evening'));
$$);
-- To stop:  select cron.unschedule('crm-morning'); select cron.unschedule('crm-evening');
