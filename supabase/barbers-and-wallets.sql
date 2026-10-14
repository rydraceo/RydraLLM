-- ════════════════════════════════════════════════════════════════════════════
-- Rydra: barber <-> client history, and barber wallets.
-- Run once in the Supabase SQL editor. Safe to re-run (everything is "if not exists" / "or replace").
-- Only the server (service role key) can touch these tables: RLS is on with no policies, and the
-- functions are not executable by the anon or authenticated roles.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Part A: who cuts whose hair ─────────────────────────────────────────────

-- One row per completed appointment, imported from Fresha (Sales > Appointments > Export CSV).
create table if not exists barber_visits (
  id            bigserial primary key,
  venue_id      text        not null,
  barber_id     uuid        not null references barbers(id) on delete cascade,
  customer_id   text,                         -- customers.user_id when the client was matched
  visit_date    date        not null,
  service       text,
  revenue_cents integer     not null default 0,
  status        text        not null default 'completed',  -- completed | cancelled | no_show
  source        text        not null default 'fresha_import',
  external_ref  text        not null,         -- Fresha ref, or a hash of date+client+barber+service
  created_at    timestamptz not null default now(),
  unique (venue_id, external_ref)
);
create index if not exists barber_visits_barber_idx   on barber_visits (venue_id, barber_id, visit_date);
create index if not exists barber_visits_customer_idx on barber_visits (venue_id, customer_id);

-- Each client's barbers. is_primary marks "their" barber. Manual assignments always win.
create table if not exists barber_clients (
  venue_id      text        not null,
  customer_id   text        not null,
  barber_id     uuid        not null references barbers(id) on delete cascade,
  source        text        not null default 'import',     -- import | manual
  visits        integer     not null default 0,
  revenue_cents bigint      not null default 0,
  first_visit   date,
  last_visit    date,
  is_primary    boolean     not null default false,
  updated_at    timestamptz not null default now(),
  primary key (venue_id, customer_id, barber_id)
);
create index if not exists barber_clients_primary_idx on barber_clients (venue_id, barber_id) where is_primary;

create or replace function rydra_refresh_barber_clients(p_venue text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- Rebuild imported stats from visits; manual rows keep their source but get fresh stats.
  delete from barber_clients where venue_id = p_venue and source = 'import';
  insert into barber_clients (venue_id, customer_id, barber_id, source, visits, revenue_cents, first_visit, last_visit)
  select venue_id, customer_id, barber_id, 'import', count(*), coalesce(sum(revenue_cents), 0), min(visit_date), max(visit_date)
    from barber_visits
   where venue_id = p_venue and customer_id is not null and status = 'completed'
   group by venue_id, customer_id, barber_id
  on conflict (venue_id, customer_id, barber_id) do update
     set visits = excluded.visits, revenue_cents = excluded.revenue_cents,
         first_visit = excluded.first_visit, last_visit = excluded.last_visit, updated_at = now();

  update barber_clients set is_primary = false where venue_id = p_venue and is_primary;
  update barber_clients bc set is_primary = true
    from (select distinct on (customer_id) customer_id, barber_id
            from barber_clients where venue_id = p_venue
           order by customer_id, (source = 'manual') desc, visits desc, last_visit desc nulls last) p
   where bc.venue_id = p_venue and bc.customer_id = p.customer_id and bc.barber_id = p.barber_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Assign (or clear, with p_barber = null) a client's barber by hand.
create or replace function rydra_assign_barber(p_venue text, p_customer text, p_barber uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from barber_clients where venue_id = p_venue and customer_id = p_customer and source = 'manual';
  update barber_clients set is_primary = false where venue_id = p_venue and customer_id = p_customer;
  if p_barber is not null then
    insert into barber_clients (venue_id, customer_id, barber_id, source, is_primary)
    values (p_venue, p_customer, p_barber, 'manual', true)
    on conflict (venue_id, customer_id, barber_id) do update set source = 'manual', is_primary = true, updated_at = now();
  else
    update barber_clients bc set is_primary = true
      from (select barber_id from barber_clients where venue_id = p_venue and customer_id = p_customer
             order by visits desc, last_visit desc nulls last limit 1) p
     where bc.venue_id = p_venue and bc.customer_id = p_customer and bc.barber_id = p.barber_id;
  end if;
end $$;

-- ── Part B: wallets ──────────────────────────────────────────────────────────

-- Pay settings and (encrypted) bank details per barber. Bank numbers are AES-256-GCM encrypted by the
-- app before they reach the database; only masked versions are stored in plain text.
create table if not exists barber_wallets (
  barber_id               uuid primary key references barbers(id) on delete cascade,
  venue_id                text        not null,
  employment              text        not null default 'contractor' check (employment in ('contractor', 'employee')),
  pay_model               text        not null default 'commission' check (pay_model in ('commission', 'chair_rent', 'owner')),
  service_pct             numeric(5,2) not null default 50  check (service_pct between 0 and 100),
  product_pct             numeric(5,2) not null default 10  check (product_pct between 0 and 100),
  tips_pct                numeric(5,2) not null default 100 check (tips_pct between 0 and 100),
  chair_rent_weekly_cents integer     not null default 0 check (chair_rent_weekly_cents >= 0),
  gst_registered          boolean     not null default false,
  abn                     text,
  tax_reserve_pct         numeric(5,2) check (tax_reserve_pct is null or tax_reserve_pct between 0 and 60),
  expenses_annual_cents   integer     not null default 0 check (expenses_annual_cents >= 0),
  bank_account_name       text,
  bank_bsb_enc            text,
  bank_account_enc        text,
  bank_bsb_masked         text,
  bank_last4              text,
  bank_verified           boolean     not null default false,
  bank_updated_at         timestamptz,
  updated_at              timestamptz not null default now()
);

-- Append-only money ledger. Balance = sum(amount_cents). tax_pot = the part of the balance put aside for tax.
create table if not exists wallet_ledger (
  id              bigserial primary key,
  venue_id        text        not null,
  barber_id       uuid        not null references barbers(id),
  kind            text        not null check (kind in ('earning', 'adjustment', 'payout', 'payout_reversal', 'tax_reserve')),
  amount_cents    bigint      not null,
  tax_pot_cents   bigint      not null default 0,
  memo            text,
  period_start    date,
  period_end      date,
  payrun_id       uuid,
  payout_id       uuid,
  created_by      text        not null default 'owner',
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index if not exists wallet_ledger_barber_idx on wallet_ledger (barber_id, created_at desc);

create or replace function wallet_ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'wallet_ledger is append-only. Post a reversal or adjustment instead.'; end $$;
drop trigger if exists wallet_ledger_no_change on wallet_ledger;
create trigger wallet_ledger_no_change before update or delete on wallet_ledger
  for each row execute function wallet_ledger_immutable();

create table if not exists wallet_payruns (
  id           uuid primary key default gen_random_uuid(),
  venue_id     text        not null,
  period_start date        not null,
  period_end   date        not null,
  status       text        not null default 'posted' check (status in ('posted')),
  lines        jsonb       not null,
  totals       jsonb,
  source       text,
  created_by   text        not null default 'owner',
  created_at   timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index if not exists wallet_payruns_period_uidx on wallet_payruns (venue_id, period_start, period_end);

create table if not exists wallet_payouts (
  id            uuid primary key default gen_random_uuid(),
  venue_id      text        not null,
  barber_id     uuid        not null references barbers(id),
  amount_cents  bigint      not null check (amount_cents > 0),
  from_tax_pot  boolean     not null default false,
  status        text        not null default 'requested' check (status in ('requested', 'approved', 'exported', 'paid', 'cancelled', 'failed')),
  requested_by  text        not null default 'owner',
  note          text,
  batch_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists wallet_payouts_status_idx on wallet_payouts (venue_id, status);

create table if not exists wallet_batches (
  id          uuid primary key default gen_random_uuid(),
  venue_id    text        not null,
  file_name   text        not null,
  total_cents bigint      not null,
  count       integer     not null,
  created_by  text        not null default 'owner',
  created_at  timestamptz not null default now()
);

-- The business account the money comes FROM (needed for the bank file). Numbers encrypted by the app.
create table if not exists wallet_venue_settings (
  venue_id       text primary key,
  remitter_name  text,
  bank_abbrev    text,
  apca_user_id   text,
  bsb_enc        text,
  account_enc    text,
  bsb_masked     text,
  account_last4  text,
  description    text        not null default 'BARBER PAY',
  balance_record boolean     not null default false,
  updated_at     timestamptz not null default now()
);

create table if not exists wallet_audit (
  id         bigserial primary key,
  venue_id   text        not null,
  barber_id  uuid,
  actor      text        not null default 'owner',
  action     text        not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_audit_venue_idx on wallet_audit (venue_id, created_at desc);

-- ── Wallet functions (all money movement goes through these, inside one transaction each) ──

create or replace function wallet_balances(p_venue text)
returns table (barber_id uuid, balance_cents bigint, tax_pot_cents bigint)
language sql stable security definer set search_path = public as $$
  select l.barber_id, coalesce(sum(l.amount_cents), 0)::bigint, coalesce(sum(l.tax_pot_cents), 0)::bigint
    from wallet_ledger l where l.venue_id = p_venue group by l.barber_id;
$$;

-- Post a pay run. p_lines: [{barber_id, earning_cents, reserve_cents, memo}]. One pay run per period, ever.
create or replace function wallet_post_payrun(p_venue text, p_start date, p_end date, p_lines jsonb, p_totals jsonb, p_source text, p_actor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb; v_barber uuid; v_earn bigint; v_res bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('payrun:' || p_venue, 0));
  if exists (select 1 from wallet_payruns where venue_id = p_venue and period_start = p_start and period_end = p_end) then
    raise exception 'PERIOD_ALREADY_POSTED';
  end if;
  if exists (select 1 from wallet_payruns where venue_id = p_venue and daterange(period_start, period_end, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'PERIOD_OVERLAPS';
  end if;
  insert into wallet_payruns (venue_id, period_start, period_end, lines, totals, source, created_by)
  values (p_venue, p_start, p_end, p_lines, p_totals, p_source, coalesce(p_actor, 'owner')) returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_barber := (l->>'barber_id')::uuid;
    v_earn   := round((l->>'earning_cents')::numeric)::bigint;
    v_res    := greatest(0, round(coalesce((l->>'reserve_cents')::numeric, 0))::bigint);
    if not exists (select 1 from barbers where id = v_barber and venue_id = p_venue) then raise exception 'UNKNOWN_BARBER'; end if;
    if v_earn <> 0 then
      insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, memo, period_start, period_end, payrun_id, created_by, idempotency_key)
      values (p_venue, v_barber, 'earning', v_earn, l->>'memo', p_start, p_end, v_id, coalesce(p_actor, 'owner'), 'payrun:' || v_id || ':' || v_barber || ':earning');
    end if;
    if v_res > 0 and v_earn > 0 then
      insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, tax_pot_cents, memo, period_start, period_end, payrun_id, created_by, idempotency_key)
      values (p_venue, v_barber, 'tax_reserve', 0, least(v_res, v_earn), 'Put aside for tax', p_start, p_end, v_id, coalesce(p_actor, 'owner'), 'payrun:' || v_id || ':' || v_barber || ':reserve');
    end if;
  end loop;
  insert into wallet_audit (venue_id, actor, action, detail) values (p_venue, coalesce(p_actor, 'owner'), 'payrun_posted', jsonb_build_object('payrun_id', v_id, 'start', p_start, 'end', p_end, 'totals', p_totals));
  return v_id;
end $$;

-- Create a payout. Fails with INSUFFICIENT_FUNDS rather than ever overdrawing. Debits the ledger straight away.
create or replace function wallet_create_payout(p_venue text, p_barber uuid, p_amount bigint, p_from_tax_pot boolean, p_by text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_bal bigint; v_pot bigint; v_avail bigint; v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from barbers where id = p_barber and venue_id = p_venue) then raise exception 'UNKNOWN_BARBER'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_barber::text, 0));
  select coalesce(sum(amount_cents), 0), coalesce(sum(tax_pot_cents), 0) into v_bal, v_pot from wallet_ledger where barber_id = p_barber and venue_id = p_venue;
  v_avail := case when p_from_tax_pot then least(v_pot, v_bal) else v_bal - v_pot end;
  if p_amount > v_avail then raise exception 'INSUFFICIENT_FUNDS'; end if;
  insert into wallet_payouts (venue_id, barber_id, amount_cents, from_tax_pot, status, requested_by, note)
  values (p_venue, p_barber, p_amount, coalesce(p_from_tax_pot, false), case when p_by = 'owner' then 'approved' else 'requested' end, coalesce(p_by, 'owner'), p_note)
  returning id into v_id;
  insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, tax_pot_cents, memo, payout_id, created_by, idempotency_key)
  values (p_venue, p_barber, 'payout', -p_amount, case when p_from_tax_pot then -p_amount else 0 end,
          case when p_from_tax_pot then 'Withdrawal from tax pot' else 'Withdrawal' end, v_id, coalesce(p_by, 'owner'), 'payout:' || v_id);
  insert into wallet_audit (venue_id, barber_id, actor, action, detail) values (p_venue, p_barber, coalesce(p_by, 'owner'), 'payout_created', jsonb_build_object('payout_id', v_id, 'amount_cents', p_amount, 'from_tax_pot', p_from_tax_pot));
  return v_id;
end $$;

-- Approve a barber's request.
create or replace function wallet_approve_payout(p_venue text, p_payout uuid, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update wallet_payouts set status = 'approved', updated_at = now() where id = p_payout and venue_id = p_venue and status = 'requested';
  if not found then raise exception 'NOT_APPROVABLE'; end if;
  insert into wallet_audit (venue_id, actor, action, detail) values (p_venue, coalesce(p_actor, 'owner'), 'payout_approved', jsonb_build_object('payout_id', p_payout));
end $$;

-- Cancel (before it reaches the bank) or mark failed (the bank rejected it). Money goes back into the wallet.
create or replace function wallet_reverse_payout(p_venue text, p_payout uuid, p_status text, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
declare p wallet_payouts%rowtype;
begin
  if p_status not in ('cancelled', 'failed') then raise exception 'INVALID_STATUS'; end if;
  select * into p from wallet_payouts where id = p_payout and venue_id = p_venue for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_status = 'cancelled' and p.status not in ('requested', 'approved') then raise exception 'NOT_CANCELLABLE'; end if;
  if p_status = 'failed' and p.status not in ('exported', 'paid') then raise exception 'NOT_FAILABLE'; end if;
  update wallet_payouts set status = p_status, updated_at = now() where id = p_payout;
  insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, tax_pot_cents, memo, payout_id, created_by, idempotency_key)
  values (p_venue, p.barber_id, 'payout_reversal', p.amount_cents, case when p.from_tax_pot then p.amount_cents else 0 end,
          case when p_status = 'failed' then 'Bank payment failed, returned to wallet' else 'Withdrawal cancelled' end, p_payout, coalesce(p_actor, 'owner'), 'reversal:' || p_payout);
  insert into wallet_audit (venue_id, barber_id, actor, action, detail) values (p_venue, p.barber_id, coalesce(p_actor, 'owner'), 'payout_' || p_status, jsonb_build_object('payout_id', p_payout, 'amount_cents', p.amount_cents));
end $$;

-- Move money between "available" and "tax pot" (positive = put more aside).
create or replace function wallet_move_pot(p_venue text, p_barber uuid, p_delta bigint, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bal bigint; v_pot bigint;
begin
  if p_delta = 0 then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_barber::text, 0));
  select coalesce(sum(amount_cents), 0), coalesce(sum(tax_pot_cents), 0) into v_bal, v_pot from wallet_ledger where barber_id = p_barber and venue_id = p_venue;
  if v_pot + p_delta < 0 or v_pot + p_delta > v_bal then raise exception 'INVALID_POT_MOVE'; end if;
  insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, tax_pot_cents, memo, created_by)
  values (p_venue, p_barber, 'tax_reserve', 0, p_delta, case when p_delta > 0 then 'Moved into tax pot' else 'Released from tax pot' end, coalesce(p_actor, 'owner'));
end $$;

-- Manual credit/debit with a reason (bonus, correction). Debits can't take "available" below zero.
create or replace function wallet_adjust(p_venue text, p_barber uuid, p_amount bigint, p_memo text, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bal bigint; v_pot bigint;
begin
  if p_amount = 0 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(trim(p_memo), '') = '' then raise exception 'MEMO_REQUIRED'; end if;
  if not exists (select 1 from barbers where id = p_barber and venue_id = p_venue) then raise exception 'UNKNOWN_BARBER'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_barber::text, 0));
  select coalesce(sum(amount_cents), 0), coalesce(sum(tax_pot_cents), 0) into v_bal, v_pot from wallet_ledger where barber_id = p_barber and venue_id = p_venue;
  if p_amount < 0 and v_bal + p_amount < v_pot then raise exception 'INSUFFICIENT_FUNDS'; end if;
  insert into wallet_ledger (venue_id, barber_id, kind, amount_cents, memo, created_by) values (p_venue, p_barber, 'adjustment', p_amount, p_memo, coalesce(p_actor, 'owner'));
  insert into wallet_audit (venue_id, barber_id, actor, action, detail) values (p_venue, p_barber, coalesce(p_actor, 'owner'), 'adjustment', jsonb_build_object('amount_cents', p_amount, 'memo', p_memo));
end $$;

-- ── Lock it down ─────────────────────────────────────────────────────────────
alter table barber_visits         enable row level security;
alter table barber_clients        enable row level security;
alter table barber_wallets        enable row level security;
alter table wallet_ledger         enable row level security;
alter table wallet_payruns        enable row level security;
alter table wallet_payouts        enable row level security;
alter table wallet_batches        enable row level security;
alter table wallet_venue_settings enable row level security;
alter table wallet_audit          enable row level security;

do $$
declare f text;
begin
  foreach f in array array[
    'rydra_refresh_barber_clients(text)', 'rydra_assign_barber(text,text,uuid)', 'wallet_balances(text)',
    'wallet_post_payrun(text,date,date,jsonb,jsonb,text,text)', 'wallet_create_payout(text,uuid,bigint,boolean,text,text)',
    'wallet_approve_payout(text,uuid,text)', 'wallet_reverse_payout(text,uuid,text,text)', 'wallet_move_pot(text,uuid,bigint,text)',
    'wallet_adjust(text,uuid,bigint,text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
