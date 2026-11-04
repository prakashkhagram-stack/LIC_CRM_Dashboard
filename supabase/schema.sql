-- =====================================================================================
--  Insurance Advisor CRM  –  database schema for Supabase (PostgreSQL 15+)
--  Run this whole file once in:  Supabase dashboard > SQL Editor > New query > Run
--  It is safe to run again (uses IF NOT EXISTS / CREATE OR REPLACE where possible).
-- =====================================================================================

-- ---------- helper: updated_at ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- users / roles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer' check (role in ('admin','staff','viewer')),
  active      boolean not null default false,
  phone       text,
  created_at  timestamptz not null default now()
);

-- Role of the logged-in user (NULL when not logged in or deactivated). SECURITY DEFINER so RLS policies can call it.
create or replace function public.app_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

-- The very first user who signs up becomes the active administrator. Everyone else starts inactive (an admin must approve).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when first_user then 'admin' else 'viewer' end, first_user)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- application settings (key/value) ----------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------- audit trail ----------
create table if not exists public.audit_logs (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists audit_logs_table_idx on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_at_idx on public.audit_logs (at desc);

create or replace function public.audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); n := null; rid := o->>'id';
  elsif tg_op = 'INSERT' then o := null; n := to_jsonb(new); rid := n->>'id';
  else o := to_jsonb(old); n := to_jsonb(new); rid := n->>'id';
       if o = n then return new; end if;
  end if;
  insert into public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, rid, tg_op, o, n);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------- families & clients ----------
create sequence if not exists public.seq_client_code;
create table if not exists public.families (
  id            uuid primary key default gen_random_uuid(),
  family_code   text unique,
  family_name   text not null,
  address       text,
  area_city     text,
  pincode       text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  primary_mobile text,
  alt_mobile    text,
  email         text,
  notes         text,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.clients (
  id                  uuid primary key default gen_random_uuid(),
  client_code         text unique not null default ('CL' || lpad(nextval('public.seq_client_code')::text, 5, '0')),
  family_id           uuid references public.families(id) on delete set null,
  salutation          text,
  name                text not null,
  mobile              text,
  alt_mobile          text,
  whatsapp            text,
  email               text,
  address             text,
  area_city           text,
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  dob                 date,
  anniversary         date,
  occupation          text,
  business_name       text,
  notes               text,
  preferred_contact   text check (preferred_contact in ('WhatsApp','Call','Email','Visit','SMS')),
  category            text not null default 'Regular' check (category in ('VIP','Regular','New','Dormant')),
  relationship_status text not null default 'Active' check (relationship_status in ('Active','Needs attention','Prospect','Inactive')),
  registered_on       date not null default current_date,
  consent_whatsapp    boolean not null default true,
  consent_family_link boolean not null default false,
  high_service_priority boolean not null default false,
  archived            boolean not null default false,
  import_key          text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists clients_family_idx on public.clients (family_id);
create index if not exists clients_mobile_idx on public.clients (mobile);
create index if not exists clients_name_idx on public.clients (lower(name));

create table if not exists public.family_members (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid references public.families(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  related_client_id uuid not null references public.clients(id) on delete cascade,
  relation          text not null,
  consent           boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (client_id, related_client_id),
  check (client_id <> related_client_id)
);

-- ---------- policies ----------
create sequence if not exists public.seq_policy_code;
create table if not exists public.policies (
  id                  uuid primary key default gen_random_uuid(),
  policy_code         text unique not null default ('PL' || lpad(nextval('public.seq_policy_code')::text, 5, '0')),
  client_id           uuid not null references public.clients(id) on delete restrict,
  insurance_company   text not null default 'LIC of India',
  policy_no           text not null,
  policy_type         text,
  plan_name           text,
  plan_code           text,
  start_date          date,
  premium             numeric(12,2) check (premium >= 0),
  frequency           text check (frequency in ('Monthly','Quarterly','Half-yearly','Yearly','Single')),
  pay_mode            text,
  next_due_date       date,
  policy_term         int,
  premium_paying_term int,
  maturity_date       date,
  maturity_date_exact boolean not null default false,
  sum_assured         numeric(14,2),
  nominee             text,
  status              text not null default 'In force',
  agency_code         text,
  branch              text,
  advisor_notes       text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (insurance_company, policy_no)
);
create index if not exists policies_client_idx on public.policies (client_id);
create index if not exists policies_status_idx on public.policies (status);
create index if not exists policies_next_due_idx on public.policies (next_due_date);
create index if not exists policies_maturity_idx on public.policies (maturity_date);

-- ---------- premium installments ----------
create table if not exists public.premium_dues (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references public.policies(id) on delete cascade,
  due_date        date not null,
  amount          numeric(12,2) not null check (amount >= 0),
  status          text not null default 'pending' check (status in ('pending','paid','waived','cancelled')),
  paid_amount     numeric(12,2) not null default 0,
  paid_on         date,
  partial_allowed boolean not null default false,
  verify_first    boolean not null default false,
  verify_note     text,
  source_list     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (policy_id, due_date)
);
create index if not exists premium_dues_due_idx on public.premium_dues (due_date);
create index if not exists premium_dues_status_idx on public.premium_dues (status);

create table if not exists public.premium_transactions (
  id            uuid primary key default gen_random_uuid(),
  due_id        uuid not null references public.premium_dues(id) on delete restrict,
  policy_id     uuid not null references public.policies(id) on delete restrict,
  client_id     uuid not null references public.clients(id) on delete restrict,
  paid_on       date not null,
  amount        numeric(12,2) not null check (amount > 0),          -- total money received (premium + any late fee)
  late_fee      numeric(12,2) not null default 0 check (late_fee >= 0),  -- the late-fee part of 'amount'; premium covered = amount - late_fee
  method        text not null check (method in ('Cash','Cheque','Bank Transfer','UPI','Online (LIC portal)','Other')),
  reference     text,
  collected_by  text,
  verified      boolean not null default false,
  verified_by   uuid,
  verified_on   timestamptz,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists premium_tx_due_idx on public.premium_transactions (due_id);
create index if not exists premium_tx_paid_on_idx on public.premium_transactions (paid_on);

create table if not exists public.premium_reminders (
  id              uuid primary key default gen_random_uuid(),
  due_id          uuid not null references public.premium_dues(id) on delete cascade,
  policy_id       uuid not null references public.policies(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  stage           text not null,
  scheduled_for   date not null,
  channel         text not null default 'WhatsApp' check (channel in ('WhatsApp','Call','SMS','Email','Visit')),
  status          text not null default 'scheduled' check (status in ('scheduled','sent','delivered','read','failed','skipped')),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  client_response text,
  next_followup   date,
  remarks         text,
  message_text    text,
  provider_message_id text,
  created_at      timestamptz not null default now(),
  unique (due_id, stage)
);
create index if not exists premium_reminders_sched_idx on public.premium_reminders (scheduled_for, status);

-- ---------- collection & field visits ----------
create table if not exists public.collection_visits (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  policy_id        uuid references public.policies(id) on delete set null,
  due_id           uuid references public.premium_dues(id) on delete set null,
  purpose          text not null default 'Premium collection' check (purpose in ('Premium collection','Document collection','Service visit','Claim documents','Client meeting','Other')),
  visit_date       date not null,
  method           text check (method in ('Cash','Cheque','Bank Transfer','UPI','Other')),
  status           text not null default 'Scheduled' check (status in ('Scheduled','Client Confirmed','Visit Pending','Collected','Payment Not Received','Rescheduled','Cancelled','Completed','Not Met')),
  amount_expected  numeric(12,2),
  amount_collected numeric(12,2),
  route_order      int,
  outcome          text,
  remarks          text,
  rescheduled_to   date,
  transaction_id   uuid references public.premium_transactions(id) on delete set null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists visits_date_idx on public.collection_visits (visit_date);

-- ---------- receipts ----------
create table if not exists public.receipts (
  id               uuid primary key default gen_random_uuid(),
  transaction_id   uuid references public.premium_transactions(id) on delete set null,
  due_id           uuid references public.premium_dues(id) on delete set null,
  policy_id        uuid not null references public.policies(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  receipt_no       text,
  payment_date     date not null,
  amount           numeric(12,2) not null,
  payment_reference text,
  document_path    text,
  dispatch_method  text check (dispatch_method in ('WhatsApp','Email','Physical Delivery')),
  dispatch_date    date,
  status           text not null default 'Awaiting Receipt' check (status in ('Awaiting Receipt','Receipt Received','Dispatch Pending','Dispatched','Client Confirmation Pending','Completed')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists receipts_status_idx on public.receipts (status);

-- ---------- claims ----------
create sequence if not exists public.seq_claim_code;
create table if not exists public.claims (
  id                   uuid primary key default gen_random_uuid(),
  claim_code           text unique not null default ('CLM' || lpad(nextval('public.seq_claim_code')::text, 5, '0')),
  claim_type           text not null check (claim_type in ('Maturity','Survival Benefit','Death','Health','General Insurance','Other')),
  policy_id            uuid not null references public.policies(id) on delete cascade,
  client_id            uuid not null references public.clients(id) on delete cascade,
  event_date           date,
  stage                text not null default 'Maturity Approaching' check (stage in ('Maturity Approaching','Client Informed','Documents Required','Documents Collected','Claim Submitted','Claim Under Process','Payment Received','Completed')),
  expected_amount      numeric(14,2),
  required_documents   jsonb not null default '[]'::jsonb,
  submission_date      date,
  claim_reference      text,
  expected_settlement  date,
  actual_settlement    date,
  settled_amount       numeric(14,2),
  settlement_confirmed_by uuid,
  remarks              text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (policy_id, claim_type, event_date)
);
create index if not exists claims_event_idx on public.claims (event_date);

-- a claim can only be marked paid/completed once the settlement has actually been confirmed
create or replace function public.claims_guard() returns trigger language plpgsql as $$
begin
  if new.stage in ('Payment Received','Completed') then
    if new.actual_settlement is null or new.settlement_confirmed_by is null then
      raise exception 'A claim cannot be marked "%" without an actual settlement date and a confirming user.', new.stage using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists claims_guard_trg on public.claims;
create trigger claims_guard_trg before insert or update on public.claims for each row execute function public.claims_guard();

-- ---------- tasks ----------
create sequence if not exists public.seq_task_code;
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  task_code        text unique not null default ('T' || lpad(nextval('public.seq_task_code')::text, 6, '0')),
  client_id        uuid references public.clients(id) on delete cascade,
  policy_id        uuid references public.policies(id) on delete cascade,
  category         text not null,
  description      text not null,
  created_on       date not null default current_date,
  due_date         date not null,
  priority         text not null default 'Medium' check (priority in ('Critical','High','Medium','Low')),
  assigned_to      text,
  status           text not null default 'Open' check (status in ('Open','In Progress','Waiting','Done','Cancelled')),
  last_action      text,
  next_action      text,
  next_action_date date,
  completed_on     date,
  source           text not null default 'manual' check (source in ('manual','automation')),
  auto_key         text,
  ref_table        text,
  ref_id           uuid,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- every pending activity must say what happens next and when
  constraint tasks_next_action_required check (status in ('Done','Cancelled') or (next_action is not null and length(trim(next_action)) > 0 and next_action_date is not null))
);
create index if not exists tasks_due_idx on public.tasks (due_date, status);
create index if not exists tasks_client_idx on public.tasks (client_id);
-- an automation never creates a second OPEN task for the same key (re-running the automations is always safe)
create unique index if not exists tasks_auto_key_open_uq on public.tasks (auto_key) where auto_key is not null and status not in ('Done','Cancelled');

-- ---------- communications ----------
create table if not exists public.communications (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references public.clients(id) on delete cascade,
  policy_id           uuid references public.policies(id) on delete set null,
  due_id              uuid references public.premium_dues(id) on delete set null,
  direction           text not null default 'out' check (direction in ('out','in')),
  channel             text not null check (channel in ('WhatsApp','Call','SMS','Email','Visit','Note')),
  template_key        text,
  language            text,
  message             text,
  status              text not null default 'prepared' check (status in ('prepared','opened','sent','delivered','read','failed','received','logged')),
  provider_message_id text,
  created_by          uuid default auth.uid(),
  at                  timestamptz not null default now()
);
create index if not exists comms_client_idx on public.communications (client_id, at desc);
create index if not exists comms_provider_idx on public.communications (provider_message_id);

-- ---------- documents ----------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete cascade,
  policy_id     uuid references public.policies(id) on delete set null,
  claim_id      uuid references public.claims(id) on delete set null,
  receipt_id    uuid references public.receipts(id) on delete set null,
  doc_type      text,
  file_name     text not null,
  storage_path  text not null unique,
  mime          text,
  size_bytes    bigint,
  confidential  boolean not null default true,
  uploaded_by   uuid default auth.uid(),
  uploaded_at   timestamptz not null default now()
);

-- ---------- automation log ----------
create table if not exists public.automation_runs (
  id        bigserial primary key,
  ran_at    timestamptz not null default now(),
  trigger   text not null default 'manual',
  summary   jsonb
);

-- =====================================================================================
--  Payment integrity: a due is "paid" ONLY when verified payments cover the full amount
-- =====================================================================================
create or replace function public.refresh_due(p_due uuid) returns void language plpgsql as $$
declare v_amount numeric; v_sum numeric; v_last date; v_status text; v_cur text;
begin
  select amount, status into v_amount, v_cur from public.premium_dues where id = p_due;
  if not found then return; end if;
  select coalesce(sum(amount - late_fee),0), max(paid_on) into v_sum, v_last from public.premium_transactions where due_id = p_due and verified;
  if v_cur in ('waived','cancelled') then v_status := v_cur;
  elsif v_sum >= v_amount - 0.005 and v_amount > 0 then v_status := 'paid';
  else v_status := 'pending'; end if;
  update public.premium_dues
     set paid_amount = v_sum, status = v_status,
         paid_on = case when v_status = 'paid' then v_last else null end
   where id = p_due and (paid_amount is distinct from v_sum or status is distinct from v_status);
end $$;

create or replace function public.tx_after_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform public.refresh_due(old.due_id); return old; end if;
  perform public.refresh_due(new.due_id);
  if tg_op = 'UPDATE' and old.due_id is distinct from new.due_id then perform public.refresh_due(old.due_id); end if;
  return new;
end $$;
drop trigger if exists tx_after_change_trg on public.premium_transactions;
create trigger tx_after_change_trg after insert or update or delete on public.premium_transactions for each row execute function public.tx_after_change();

-- stamp verifier, and refuse partial payments unless the installment explicitly allows them
create or replace function public.tx_before_change() returns trigger language plpgsql as $$
declare v_amount numeric; v_partial boolean; v_prior numeric;
begin
  if new.verified and (tg_op = 'INSERT' or not old.verified) then
    new.verified_by := coalesce(new.verified_by, auth.uid()); new.verified_on := coalesce(new.verified_on, now());
  end if;
  select amount, partial_allowed into v_amount, v_partial from public.premium_dues where id = new.due_id;
  if new.late_fee > new.amount then raise exception 'Late fee cannot exceed the amount received.' using errcode = '23514'; end if;
  select coalesce(sum(amount - late_fee),0) into v_prior from public.premium_transactions
   where due_id = new.due_id and verified and (tg_op = 'INSERT' or id <> new.id);
  if new.verified and not coalesce(v_partial,false) and (v_prior + new.amount - new.late_fee) < v_amount - 0.005 then
    raise exception 'Partial payment (% of %) is not allowed for this installment. Enable "partial payment allowed" on the due first.', new.amount - new.late_fee, v_amount using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists tx_before_change_trg on public.premium_transactions;
create trigger tx_before_change_trg before insert or update on public.premium_transactions for each row execute function public.tx_before_change();

-- direct edits to a due can never mark it paid without verified payments
create or replace function public.due_guard() returns trigger language plpgsql as $$
declare v_sum numeric;
begin
  if new.status = 'paid' then
    select coalesce(sum(amount - late_fee),0) into v_sum from public.premium_transactions where due_id = new.id and verified;
    if v_sum < new.amount - 0.005 then
      raise exception 'Installment cannot be marked paid: verified payments (%) do not cover the amount (%).', v_sum, new.amount using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists due_guard_trg on public.premium_dues;
create trigger due_guard_trg before update on public.premium_dues for each row
  when (new.status = 'paid' and old.status is distinct from 'paid') execute function public.due_guard();

-- =====================================================================================
--  updated_at + audit triggers
-- =====================================================================================
do $$
declare t text;
begin
  foreach t in array array['families','clients','policies','premium_dues','collection_visits','receipts','claims','tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t||'_updated_at', t);
  end loop;
  foreach t in array array['families','clients','family_members','policies','premium_dues','premium_transactions','premium_reminders','collection_visits','receipts','claims','tasks','communications','documents','settings','profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t||'_audit', t);
  end loop;
end $$;

-- =====================================================================================
--  Row level security: admin = everything, staff = work with data (no settings/users, no hard delete), viewer = read only
-- =====================================================================================
do $$
declare t text;
begin
  foreach t in array array['families','clients','family_members','policies','premium_dues','premium_transactions','premium_reminders','collection_visits','receipts','claims','tasks','communications','documents','automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() is not null)', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.app_role() in (''admin'',''staff''))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.app_role() in (''admin'',''staff'')) with check (public.app_role() in (''admin'',''staff''))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.app_role() = ''admin'')', t||'_delete', t);
  end loop;
end $$;

-- settings: everyone signed-in can read, only admin can change
alter table public.settings enable row level security;
drop policy if exists settings_select on public.settings; drop policy if exists settings_write on public.settings;
create policy settings_select on public.settings for select to authenticated using (public.app_role() is not null);
create policy settings_write  on public.settings for all    to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- profiles: you can read your own row; admins manage all
alter table public.profiles enable row level security;
drop policy if exists profiles_self on public.profiles; drop policy if exists profiles_admin on public.profiles;
create policy profiles_self  on public.profiles for select to authenticated using (id = auth.uid() or public.app_role() is not null);
create policy profiles_admin on public.profiles for all    to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- audit log: admins read; nobody writes directly (triggers are SECURITY DEFINER)
alter table public.audit_logs enable row level security;
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (public.app_role() = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
