-- Supabase SQL Editor에서 실행하세요. 기존 테이블이 있어도 다시 실행할 수 있습니다.
-- 주문 저장 전에 Supabase 로그인 또는 익명 인증이 필요합니다.
-- 익명 인증: Anonymous Sign-Ins 활성화 후 signInAnonymously() 호출.
-- 아래 주문 열 이름은 script.js에서 저장하는 열 이름과 같습니다.

begin;

create table if not exists public.orders (
  -- DB 주문 번호는 자동으로 만듭니다. 화면의 임시 주문 번호와는 별개입니다.
  id bigint generated always as identity primary key,

  -- 인증된 사용자의 ID가 자동 저장됩니다.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  customer_name text not null
    check (length(btrim(customer_name)) > 0),
  -- 전화번호는 앞자리 0과 하이픈을 보존하도록 문자열로 저장합니다.
  phone text,
  drink text not null
    check (length(btrim(drink)) > 0),
  -- 선택한 음료의 기본 가격입니다. 원 단위 정수로 저장합니다.
  drink_price integer not null
    check (drink_price >= 0),
  size text not null default 'M'
    check (size in ('S', 'M', 'L')),
  -- 예: ARRAY['샷 추가', '시럽 추가']. 옵션이 없으면 빈 배열입니다.
  options text[] not null default '{}'::text[],
  quantity integer not null default 1
    check (quantity between 1 and 10),
  request text not null default '',
  -- 원 단위 정수입니다. 현재 script.js에서 계산한 주문 총액을 저장합니다.
  total_price integer not null
    check (total_price >= 0),
  ordered_at timestamptz not null default now()
);

-- 예전 SQL로 만든 테이블은 데이터를 지우지 않고 열 이름만 바꿉니다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_phone'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'phone'
  ) then
    alter table public.orders rename column customer_phone to phone;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'requests'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'request'
  ) then
    alter table public.orders rename column requests to request;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'total'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'total_price'
  ) then
    alter table public.orders rename column total to total_price;
  end if;
end;
$$;

-- 예전 주문에는 음료 기본 가격이 없으므로 0으로 채웁니다.
-- 새 주문의 drink_price는 script.js에서 선택한 음료 가격으로 저장합니다.
alter table public.orders
  add column if not exists drink_price integer not null default 0
    check (drink_price >= 0);

-- CREATE TABLE IF NOT EXISTS는 기존 테이블에 새 열을 추가하지 않습니다.
-- 오래된 테이블도 인덱스와 사용자별 정책에 필요한 열을 갖도록 보완합니다.
-- 기존 주문의 주인을 알 수 없다면 user_id를 NULL로 유지합니다.
-- 아래 사용자별 정책은 user_id가 NULL인 주문의 접근을 허용하지 않습니다.
alter table public.orders
  add column if not exists user_id uuid
    references auth.users (id) on delete cascade,
  add column if not exists ordered_at timestamptz not null default now();

-- 기존 user_id 열에도 기본값을 지정해 새 주문에 로그인한 사용자를 저장합니다.
-- 이미 저장된 주문의 user_id 값은 바뀌지 않습니다.
alter table public.orders
  alter column user_id set default auth.uid();

-- 사용자별 주문 내역을 최신순으로 조회할 때 사용하는 인덱스입니다.
create index if not exists orders_user_ordered_at_idx
  on public.orders (user_id, ordered_at desc, id desc);

-- 이름과 전화번호를 포함한 주문 정보는 해당 사용자만 접근합니다.
alter table public.orders enable row level security;

revoke all on table public.orders from public, anon, authenticated;
grant select, insert, delete on table public.orders to authenticated;

-- 기존 테이블의 ID 시퀀스 이름이 달라도 실제 연결된 시퀀스에 권한을 줍니다.
-- UUID 등 시퀀스를 사용하지 않는 ID라면 이 단계는 건너뜁니다.
do $$
declare
  id_sequence text := pg_get_serial_sequence('public.orders', 'id');
begin
  if id_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', id_sequence);
    execute format('grant usage on sequence %s to authenticated', id_sequence);
  end if;
end;
$$;

-- 다시 실행할 때 같은 이름의 정책이 중복되지 않도록 교체합니다.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own
  on public.orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own
  on public.orders
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- DB에서 주문을 삭제할 때도 본인의 주문만 삭제할 수 있습니다.
drop policy if exists orders_delete_own on public.orders;
create policy orders_delete_own
  on public.orders
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
