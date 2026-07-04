-- =========================================================
-- LivingWord Stock + Transfer Audit Patch
-- Purpose:
-- 1. Edit stock with mandatory reason recorded in stock_movements
-- 2. Remove stock with mandatory reason recorded in stock_movements
-- 3. Remove transfer with mandatory reason, reverse stock, and record stock_movements
-- =========================================================

alter table public.stock add column if not exists status text not null default 'ACTIVE';
alter table public.stock add column if not exists removed_at timestamptz;
alter table public.stock add column if not exists removed_by text;
alter table public.stock add column if not exists remove_reason text;

alter table public.transfer_stock add column if not exists status text not null default 'ACTIVE';
alter table public.transfer_stock add column if not exists removed_at timestamptz;
alter table public.transfer_stock add column if not exists removed_by text;
alter table public.transfer_stock add column if not exists remove_reason text;

drop index if exists public.stock_unique_location_sku;

create unique index if not exists stock_unique_location_sku
on public.stock (lower(trim(location)), lower(trim(sku)))
where sku is not null
  and trim(sku) <> ''
  and coalesce(status, 'ACTIVE') = 'ACTIVE';

create or replace function public.edit_stock_item(
  p_stock_id uuid,
  p_location text,
  p_sku text,
  p_product_name text,
  p_qty numeric,
  p_price numeric,
  p_tier1_price numeric,
  p_tier2_price numeric,
  p_tier3_price numeric,
  p_cogs numeric,
  p_edit_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.stock%rowtype;
  v_new_sku text;
  v_qty_delta numeric;
  v_identity_changed boolean;
begin
  if trim(coalesce(p_edit_reason, '')) = '' then
    raise exception 'Edit reason is required.';
  end if;

  select * into v_old
  from public.stock
  where id = p_stock_id
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  for update;

  if v_old.id is null then
    raise exception 'Active stock record not found.';
  end if;

  v_new_sku := upper(trim(p_sku));

  if trim(coalesce(p_location, '')) = '' then raise exception 'Location is required.'; end if;
  if trim(coalesce(v_new_sku, '')) = '' then raise exception 'SKU is required.'; end if;
  if trim(coalesce(p_product_name, '')) = '' then raise exception 'Product Name is required.'; end if;
  if p_qty < 0 then raise exception 'Qty cannot be negative.'; end if;
  if p_price < 0 or p_tier1_price < 0 or p_tier2_price < 0 or p_tier3_price < 0 then raise exception 'Price cannot be negative.'; end if;
  if p_cogs < 0 then raise exception 'COGS cannot be negative.'; end if;

  v_qty_delta := p_qty - v_old.qty;
  v_identity_changed := lower(trim(v_old.location)) <> lower(trim(p_location))
    or lower(trim(v_old.sku)) <> lower(trim(v_new_sku))
    or trim(v_old.product_name) <> trim(p_product_name);

  update public.stock
  set location = trim(p_location),
      sku = v_new_sku,
      product_name = trim(p_product_name),
      qty = p_qty,
      price = p_price,
      tier1_price = p_tier1_price,
      tier2_price = p_tier2_price,
      tier3_price = p_tier3_price,
      cogs = p_cogs,
      updated_at = now()
  where id = p_stock_id;

  if v_identity_changed then
    insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
    values
      ('STOCK_EDIT_BEFORE', trim(v_old.location), upper(trim(v_old.sku)), trim(v_old.product_name), -v_old.qty, 'STOCK', p_stock_id::text, p_edit_reason),
      ('STOCK_EDIT_AFTER', trim(p_location), v_new_sku, trim(p_product_name), p_qty, 'STOCK', p_stock_id::text, p_edit_reason);
    return;
  end if;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values ('STOCK_EDIT', trim(p_location), v_new_sku, trim(p_product_name), v_qty_delta, 'STOCK', p_stock_id::text, p_edit_reason);
end;
$$;

create or replace function public.remove_stock_item(p_stock_id uuid, p_remove_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.stock%rowtype;
begin
  if trim(coalesce(p_remove_reason, '')) = '' then
    raise exception 'Remove reason is required.';
  end if;

  select * into v_stock
  from public.stock
  where id = p_stock_id
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  for update;

  if v_stock.id is null then
    raise exception 'Active stock record not found.';
  end if;

  update public.stock
  set status = 'REMOVED',
      qty = 0,
      removed_at = now(),
      removed_by = auth.email(),
      remove_reason = p_remove_reason,
      updated_at = now()
  where id = p_stock_id;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values ('STOCK_REMOVE', trim(v_stock.location), upper(trim(v_stock.sku)), trim(v_stock.product_name), -v_stock.qty, 'STOCK', p_stock_id::text, p_remove_reason);
end;
$$;

create or replace function public.remove_transfer_transaction(p_transfer_id uuid, p_remove_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.transfer_stock%rowtype;
  v_from_stock public.stock%rowtype;
  v_to_stock public.stock%rowtype;
begin
  if trim(coalesce(p_remove_reason, '')) = '' then
    raise exception 'Remove reason is required.';
  end if;

  select * into v_transfer
  from public.transfer_stock
  where id = p_transfer_id
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  for update;

  if v_transfer.id is null then
    raise exception 'Active transfer record not found.';
  end if;

  select * into v_from_stock
  from public.stock
  where lower(trim(location)) = lower(trim(v_transfer.from_location))
    and lower(trim(sku)) = lower(trim(v_transfer.sku))
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  for update;

  if v_from_stock.id is null then
    raise exception 'Source stock record not found. Transfer cannot be removed safely.';
  end if;

  select * into v_to_stock
  from public.stock
  where lower(trim(location)) = lower(trim(v_transfer.to_location))
    and lower(trim(sku)) = lower(trim(v_transfer.sku))
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  for update;

  if v_to_stock.id is null then
    raise exception 'Destination stock record not found. Transfer cannot be removed safely.';
  end if;

  if v_to_stock.qty < v_transfer.qty then
    raise exception 'Cannot remove transfer because destination stock is lower than transferred qty. Current destination stock: %', v_to_stock.qty;
  end if;

  update public.stock set qty = qty + v_transfer.qty, updated_at = now() where id = v_from_stock.id;
  update public.stock set qty = qty - v_transfer.qty, updated_at = now() where id = v_to_stock.id;

  update public.transfer_stock
  set status = 'REMOVED', removed_at = now(), removed_by = auth.email(), remove_reason = p_remove_reason
  where id = p_transfer_id;

  insert into public.stock_movements (movement_type, location, sku, product_name, qty_change, reference_type, reference_key, remark)
  values
    ('TRANSFER_REMOVE_BACK_TO_SOURCE', trim(v_transfer.from_location), upper(trim(v_transfer.sku)), trim(v_transfer.product_name), v_transfer.qty, 'TRANSFER', p_transfer_id::text, p_remove_reason),
    ('TRANSFER_REMOVE_FROM_DESTINATION', trim(v_transfer.to_location), upper(trim(v_transfer.sku)), trim(v_transfer.product_name), -v_transfer.qty, 'TRANSFER', p_transfer_id::text, p_remove_reason);
end;
$$;

grant execute on function public.edit_stock_item(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.remove_stock_item(uuid, text) to authenticated;
grant execute on function public.remove_transfer_transaction(uuid, text) to authenticated;

notify pgrst, 'reload schema';
