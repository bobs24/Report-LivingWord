-- Sales & Stock Control - Supabase Database Schema v12
-- Corrected for allowed-user access control.
-- Replace user1@gmail.com ... user4@gmail.com with your real 4 allowed emails before running.

create extension if not exists pgcrypto;

-- =========================================================
-- 0. OPTIONAL CLEANUP OF OLD RPC SIGNATURES
-- =========================================================

drop function if exists public.add_sales_transaction(date,text,text,text,text,text,text,numeric,numeric,numeric,text);
drop function if exists public.add_sales_transaction(date,text,text,text,text,text,text,numeric,numeric,text,numeric,text);
drop function if exists public.upsert_stock_item(text,text,numeric,numeric);
drop function if exists public.transfer_stock_transaction(date,text,text,text,numeric,text);

-- =========================================================
-- 1. SALES TABLE
-- =========================================================

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null default auth.email(),
  sale_date date not null,
  location text,
  category text not null,
  channel text not null,
  sku text,
  order_number text,
  product_name text not null,
  qty numeric not null check (qty > 0),
  price numeric not null check (price >= 0),
  discount numeric not null default 0 check (discount >= 0),
  discount_type text not null default 'AMOUNT',
  discount_value numeric not null default 0,
  total_price numeric generated always as ((qty * price) - discount) stored,
  remark text,
  status text not null default 'ACTIVE',
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text
);

alter table public.sales add column if not exists sku text;
alter table public.sales add column if not exists order_number text;
alter table public.sales add column if not exists location text;
alter table public.sales add column if not exists discount_type text not null default 'AMOUNT';
alter table public.sales add column if not exists discount_value numeric not null default 0;
alter table public.sales add column if not exists status text not null default 'ACTIVE';
alter table public.sales add column if not exists revoked_at timestamptz;
alter table public.sales add column if not exists revoked_by text;
alter table public.sales add column if not exists revoke_reason text;

-- If upgrading from old schema that used item_code, copy old item_code to sku.
-- Correct: no assert_allowed_user() inside migration blocks.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales'
      and column_name = 'item_code'
  ) then
    execute '
      update public.sales
      set sku = upper(trim(item_code))
      where sku is null
        and item_code is not null
        and trim(item_code) <> ''''
    ';
  end if;
end;
$$;

-- =========================================================
-- 2. STOCK TABLE
-- =========================================================

create table if not exists public.stock (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  location text not null,
  sku text,
  product_name text not null,
  qty numeric not null check (qty >= 0),
  price numeric not null default 0 check (price >= 0),
  tier1_price numeric not null default 0 check (tier1_price >= 0),
  tier2_price numeric not null default 0 check (tier2_price >= 0),
  tier3_price numeric not null default 0 check (tier3_price >= 0),
  cogs numeric not null check (cogs >= 0)
);

alter table public.stock add column if not exists sku text;
alter table public.stock add column if not exists price numeric not null default 0;
alter table public.stock add column if not exists tier1_price numeric not null default 0;
alter table public.stock add column if not exists tier2_price numeric not null default 0;
alter table public.stock add column if not exists tier3_price numeric not null default 0;

alter table public.stock drop constraint if exists stock_location_product_unique;

create unique index if not exists stock_unique_location_sku
on public.stock (lower(trim(location)), lower(trim(sku)))
where sku is not null and trim(sku) <> '';

-- =========================================================
-- 3. TRANSFER STOCK TABLE
-- =========================================================

create table if not exists public.transfer_stock (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null default auth.email(),
  transfer_date date not null,
  sku text,
  product_name text not null,
  from_location text not null,
  to_location text not null,
  qty numeric not null check (qty > 0),
  remark text,
  constraint transfer_different_location check (lower(trim(from_location)) <> lower(trim(to_location)))
);

alter table public.transfer_stock add column if not exists sku text;

-- =========================================================
-- 4. STOCK MOVEMENTS TABLE
-- =========================================================

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null default auth.email(),
  movement_type text not null,
  location text not null,
  sku text,
  product_name text not null,
  qty_change numeric not null,
  reference_type text,
  reference_key text,
  remark text
);

alter table public.stock_movements add column if not exists sku text;

-- =========================================================
-- 5. DUPLICATE ORDER PROTECTION
-- =========================================================

create unique index if not exists sales_unique_channel_order_sku
on public.sales (lower(trim(channel)), lower(trim(order_number)), lower(trim(sku)))
where order_number is not null
  and trim(order_number) <> ''
  and sku is not null
  and trim(sku) <> '';

-- =========================================================
-- 6. UPDATED_AT TRIGGER
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_updated_at on public.stock;

create trigger trg_stock_updated_at
before update on public.stock
for each row
execute function public.set_updated_at();

-- =========================================================
-- 6A. ACCESS CONTROL
-- =========================================================

create table if not exists public.allowed_users (
  email text primary key,
  is_active boolean not null default true,
  role text not null default 'USER',
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

drop policy if exists allowed_users_select_self on public.allowed_users;

create policy allowed_users_select_self
on public.allowed_users
for select
to authenticated
using (lower(trim(email)) = lower(trim(auth.email())));

-- Keep only these 4 users active. Replace with your real emails.
update public.allowed_users
set is_active = false;

insert into public.allowed_users (email, role, is_active)
values
  ('bobsebastian1997@gmail.com', 'ADMIN', true),
  ('anthony@livingword.id', 'USER', true),
  ('devin@livingword.id', 'USER', true),
  ('mavelynphoebe.work@gmail.com', 'USER', true),
  ('finance@livingword.id', 'USER', true)
on conflict (email)
do update set
  is_active = true,
  role = excluded.role;

create or replace function public.is_allowed_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_users au
    where lower(trim(au.email)) = lower(trim(auth.email()))
      and au.is_active = true
  );
$$;

create or replace function public.assert_allowed_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_allowed_user() then
    raise exception 'Access denied. This email is not allowed to use this application.';
  end if;
end;
$$;

-- =========================================================
-- 7. ADD / UPDATE STOCK FUNCTION
-- =========================================================

create or replace function public.upsert_stock_item(
  p_location text,
  p_sku text,
  p_product_name text,
  p_qty numeric,
  p_price numeric,
  p_tier1_price numeric,
  p_tier2_price numeric,
  p_tier3_price numeric,
  p_cogs numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_qty numeric;
begin
  perform public.assert_allowed_user();

  p_sku := upper(trim(p_sku));

  if trim(coalesce(p_location, '')) = '' then
    raise exception 'Location is required.';
  end if;

  if trim(coalesce(p_sku, '')) = '' then
    raise exception 'SKU is required.';
  end if;

  if trim(coalesce(p_product_name, '')) = '' then
    raise exception 'Product Name is required.';
  end if;

  if p_qty < 0 then
    raise exception 'Qty cannot be negative.';
  end if;

  if p_price < 0 or p_tier1_price < 0 or p_tier2_price < 0 or p_tier3_price < 0 then
    raise exception 'Price cannot be negative.';
  end if;

  if p_cogs < 0 then
    raise exception 'COGS cannot be negative.';
  end if;

  select qty
    into v_current_qty
  from public.stock
  where lower(trim(location)) = lower(trim(p_location))
    and lower(trim(sku)) = lower(trim(p_sku))
  for update;

  if v_current_qty is null then
    insert into public.stock (location, sku, product_name, qty, price, tier1_price, tier2_price, tier3_price, cogs)
    values (trim(p_location), p_sku, trim(p_product_name), p_qty, p_price, p_tier1_price, p_tier2_price, p_tier3_price, p_cogs);
  else
    update public.stock
    set product_name = trim(p_product_name),
        qty = qty + p_qty,
        price = p_price,
        tier1_price = p_tier1_price,
        tier2_price = p_tier2_price,
        tier3_price = p_tier3_price,
        cogs = case
          when qty + p_qty = 0 then p_cogs
          else ((qty * cogs) + (p_qty * p_cogs)) / (qty + p_qty)
        end
    where lower(trim(location)) = lower(trim(p_location))
      and lower(trim(sku)) = lower(trim(p_sku));
  end if;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values ('IN', trim(p_location), p_sku, trim(p_product_name), p_qty, 'STOCK_ADD', null, 'Added stock');
end;
$$;

-- =========================================================
-- 8. ADD SALES ORDER FUNCTION
-- =========================================================

create or replace function public.add_sales_order(
  p_header jsonb,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_sale_id uuid;
  v_source_qty numeric;
  v_required_qty numeric;
  v_gross numeric;
  v_discount numeric;
  v_type text;
  v_sku text;
  v_order text;
  v_category text;
  v_channel text;
begin
  perform public.assert_allowed_user();

  if p_header is null then
    raise exception 'Order header is required.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Order lines must be an array.';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'Order must contain at least one product.';
  end if;

  v_category := trim(coalesce(p_header ->> 'category', ''));
  v_channel := trim(coalesce(p_header ->> 'channel', ''));

  if trim(coalesce(p_header ->> 'sale_date', '')) = '' then
    raise exception 'Sale Date is required.';
  end if;

  if trim(coalesce(p_header ->> 'location', '')) = '' then
    raise exception 'Stock Location is required.';
  end if;

  if v_category = '' then
    raise exception 'Category is required.';
  end if;

  if v_category in ('Tier 1', 'Tier 2', 'Tier 3') then
    v_channel := 'WA Order';
  end if;

  if v_channel = '' then
    raise exception 'Channel is required.';
  end if;

  if exists (
    select 1
    from (
      select upper(trim(value ->> 'sku')) as sku_key,
             count(*) as sku_count
      from jsonb_array_elements(p_lines)
      group by upper(trim(value ->> 'sku'))
    ) x
    where x.sku_key <> ''
      and x.sku_count > 1
  ) then
    raise exception 'Duplicate SKU found inside this draft order. Please keep one line per SKU.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku := upper(trim(v_line ->> 'sku'));
    v_order := upper(trim(coalesce(p_header ->> 'order_number', '')));
    v_type := upper(trim(coalesce(v_line ->> 'discount_type', 'AMOUNT')));

    if v_type not in ('AMOUNT', 'PERCENT') then
      raise exception 'Discount Type must be AMOUNT or PERCENT.';
    end if;

    if v_sku = '' then
      raise exception 'SKU is required.';
    end if;

    if trim(coalesce(v_line ->> 'product_name', '')) = '' then
      raise exception 'Product Name is required for SKU %.', v_sku;
    end if;

    if (v_line ->> 'qty')::numeric <= 0 then
      raise exception 'Qty must be greater than zero for SKU %.', v_sku;
    end if;

    if (v_line ->> 'price')::numeric < 0 then
      raise exception 'Price cannot be negative for SKU %.', v_sku;
    end if;

    if coalesce((v_line ->> 'discount_value')::numeric, 0) < 0 then
      raise exception 'Discount cannot be negative for SKU %.', v_sku;
    end if;

    if v_type = 'PERCENT' and coalesce((v_line ->> 'discount_value')::numeric, 0) > 100 then
      raise exception 'Discount percent cannot be greater than 100 for SKU %.', v_sku;
    end if;

    v_gross := (v_line ->> 'qty')::numeric * (v_line ->> 'price')::numeric;

    if v_type = 'PERCENT' then
      v_discount := v_gross * coalesce((v_line ->> 'discount_value')::numeric, 0) / 100;
    else
      v_discount := coalesce((v_line ->> 'discount_value')::numeric, 0);
    end if;

    if v_discount > v_gross then
      raise exception 'Discount cannot be greater than gross amount for SKU %.', v_sku;
    end if;

    if v_order <> '' and exists (
      select 1
      from public.sales
      where lower(trim(channel)) = lower(trim(v_channel))
        and lower(trim(order_number)) = lower(trim(v_order))
        and lower(trim(sku)) = lower(trim(v_sku))
    ) then
      raise exception 'Duplicate SKU % for this order/channel.', v_sku;
    end if;

    select qty
      into v_source_qty
    from public.stock
    where lower(trim(location)) = lower(trim(p_header ->> 'location'))
      and lower(trim(sku)) = lower(trim(v_sku))
    for update;

    if v_source_qty is null then
      raise exception 'Stock does not exist for SKU % and selected location.', v_sku;
    end if;

    v_required_qty := (v_line ->> 'qty')::numeric;

    if v_source_qty < v_required_qty then
      raise exception 'Not enough stock for SKU %. Available: %', v_sku, v_source_qty;
    end if;
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku := upper(trim(v_line ->> 'sku'));
    v_order := upper(trim(coalesce(p_header ->> 'order_number', '')));
    v_type := upper(trim(coalesce(v_line ->> 'discount_type', 'AMOUNT')));
    v_gross := (v_line ->> 'qty')::numeric * (v_line ->> 'price')::numeric;

    if v_type = 'PERCENT' then
      v_discount := v_gross * coalesce((v_line ->> 'discount_value')::numeric, 0) / 100;
    else
      v_discount := coalesce((v_line ->> 'discount_value')::numeric, 0);
    end if;

    update public.stock
    set qty = qty - (v_line ->> 'qty')::numeric
    where lower(trim(location)) = lower(trim(p_header ->> 'location'))
      and lower(trim(sku)) = lower(trim(v_sku));

    insert into public.sales (
      created_by, sale_date, location, category, channel, sku, order_number,
      product_name, qty, price, discount, discount_type, discount_value, remark, status
    )
    values (
      auth.email(),
      (p_header ->> 'sale_date')::date,
      trim(p_header ->> 'location'),
      v_category,
      v_channel,
      v_sku,
      v_order,
      trim(v_line ->> 'product_name'),
      (v_line ->> 'qty')::numeric,
      (v_line ->> 'price')::numeric,
      v_discount,
      v_type,
      coalesce((v_line ->> 'discount_value')::numeric, 0),
      v_line ->> 'remark',
      'ACTIVE'
    ) returning id into v_sale_id;

    insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
    values ('OUT_SALES', trim(p_header ->> 'location'), v_sku, trim(v_line ->> 'product_name'), -(v_line ->> 'qty')::numeric, 'SALES', v_sale_id::text, v_line ->> 'remark');
  end loop;
end;
$$;

-- =========================================================
-- 9. REVOKE SALES FUNCTION
-- =========================================================

create or replace function public.revoke_sales_transaction(
  p_sales_id uuid,
  p_revoke_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales public.sales%rowtype;
begin
  perform public.assert_allowed_user();

  select *
    into v_sales
  from public.sales
  where id = p_sales_id
  for update;

  if v_sales.id is null then
    raise exception 'Sales record not found.';
  end if;

  if coalesce(v_sales.status, 'ACTIVE') <> 'ACTIVE' then
    raise exception 'This sales record is already revoked.';
  end if;

  update public.stock
  set qty = qty + v_sales.qty
  where lower(trim(location)) = lower(trim(v_sales.location))
    and lower(trim(sku)) = lower(trim(v_sales.sku));

  update public.sales
  set status = 'REVOKED',
      revoked_at = now(),
      revoked_by = auth.email(),
      revoke_reason = p_revoke_reason
  where id = p_sales_id;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values ('SALES_REVOKE', trim(v_sales.location), upper(trim(v_sales.sku)), trim(v_sales.product_name), v_sales.qty, 'SALES', p_sales_id::text, p_revoke_reason);
end;
$$;

-- =========================================================
-- 10. TRANSFER STOCK FUNCTION
-- =========================================================

create or replace function public.transfer_stock_transaction(
  p_transfer_date date,
  p_sku text,
  p_product_name text,
  p_from_location text,
  p_to_location text,
  p_qty numeric,
  p_remark text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
  v_destination_qty numeric;
  v_transfer_id uuid;
begin
  perform public.assert_allowed_user();

  p_sku := upper(trim(p_sku));

  if trim(coalesce(p_sku, '')) = '' then
    raise exception 'SKU is required.';
  end if;

  if p_qty <= 0 then
    raise exception 'Qty must be greater than zero.';
  end if;

  if lower(trim(p_from_location)) = lower(trim(p_to_location)) then
    raise exception 'From and To location cannot be the same.';
  end if;

  select *
    into v_source
  from public.stock
  where lower(trim(location)) = lower(trim(p_from_location))
    and lower(trim(sku)) = lower(trim(p_sku))
  for update;

  if v_source.id is null then
    raise exception 'Source stock does not exist.';
  end if;

  if v_source.qty < p_qty then
    raise exception 'Not enough stock in source location. Available: %', v_source.qty;
  end if;

  update public.stock
  set qty = qty - p_qty
  where id = v_source.id;

  select qty
    into v_destination_qty
  from public.stock
  where lower(trim(location)) = lower(trim(p_to_location))
    and lower(trim(sku)) = lower(trim(p_sku))
  for update;

  if v_destination_qty is null then
    insert into public.stock (location, sku, product_name, qty, price, tier1_price, tier2_price, tier3_price, cogs)
    values (trim(p_to_location), p_sku, trim(p_product_name), p_qty, v_source.price, v_source.tier1_price, v_source.tier2_price, v_source.tier3_price, v_source.cogs);
  else
    update public.stock
    set qty = qty + p_qty,
        product_name = trim(p_product_name),
        price = v_source.price,
        tier1_price = v_source.tier1_price,
        tier2_price = v_source.tier2_price,
        tier3_price = v_source.tier3_price,
        cogs = v_source.cogs
    where lower(trim(location)) = lower(trim(p_to_location))
      and lower(trim(sku)) = lower(trim(p_sku));
  end if;

  insert into public.transfer_stock (created_by, transfer_date, sku, product_name, from_location, to_location, qty, remark)
  values (auth.email(), p_transfer_date, p_sku, trim(p_product_name), trim(p_from_location), trim(p_to_location), p_qty, p_remark)
  returning id into v_transfer_id;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values
    ('TRANSFER_OUT', trim(p_from_location), p_sku, trim(p_product_name), -p_qty, 'TRANSFER', v_transfer_id::text, p_remark),
    ('TRANSFER_IN', trim(p_to_location), p_sku, trim(p_product_name), p_qty, 'TRANSFER', v_transfer_id::text, p_remark);
end;
$$;

-- =========================================================
-- 11. ROW LEVEL SECURITY
-- =========================================================

alter table public.sales enable row level security;
alter table public.stock enable row level security;
alter table public.transfer_stock enable row level security;
alter table public.stock_movements enable row level security;

-- Remove old broad policies.
drop policy if exists sales_select_authenticated on public.sales;
drop policy if exists sales_insert_authenticated on public.sales;
drop policy if exists stock_select_authenticated on public.stock;
drop policy if exists transfer_select_authenticated on public.transfer_stock;
drop policy if exists movements_select_authenticated on public.stock_movements;

-- Remove allowlist policies if re-running.
drop policy if exists sales_select_allowed_users on public.sales;
drop policy if exists sales_insert_allowed_users on public.sales;
drop policy if exists stock_select_allowed_users on public.stock;
drop policy if exists transfer_select_allowed_users on public.transfer_stock;
drop policy if exists movements_select_allowed_users on public.stock_movements;

create policy sales_select_allowed_users
on public.sales
for select
to authenticated
using (public.is_allowed_user());

create policy sales_insert_allowed_users
on public.sales
for insert
to authenticated
with check (public.is_allowed_user());

create policy stock_select_allowed_users
on public.stock
for select
to authenticated
using (public.is_allowed_user());

create policy transfer_select_allowed_users
on public.transfer_stock
for select
to authenticated
using (public.is_allowed_user());

create policy movements_select_allowed_users
on public.stock_movements
for select
to authenticated
using (public.is_allowed_user());

-- =========================================================
-- 12. GRANTS
-- =========================================================

grant usage on schema public to anon, authenticated;

grant select on public.sales to authenticated;
grant insert on public.sales to authenticated;
grant select on public.stock to authenticated;
grant select on public.transfer_stock to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.allowed_users to authenticated;

grant execute on function public.is_allowed_user() to authenticated;
grant execute on function public.assert_allowed_user() to authenticated;

grant execute on function public.upsert_stock_item(text,text,text,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.add_sales_order(jsonb,jsonb) to authenticated;
grant execute on function public.revoke_sales_transaction(uuid,text) to authenticated;
grant execute on function public.transfer_stock_transaction(date,text,text,text,text,numeric,text) to authenticated;

notify pgrst, 'reload schema';
