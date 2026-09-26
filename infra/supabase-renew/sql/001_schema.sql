-- Renew Subastas — esquema relacional de la copia de PRUEBAS (Supabase).
-- Diseño: docs/superpowers/specs/2026-09-26-servidor-propio-design.md §5.
--
-- Idempotente: se puede correr las veces que haga falta.
--
-- Seguridad: la base tiene datos personales reales. Todas las tablas tienen
-- RLS activado y SIN políticas, y se les quita todo permiso a anon y
-- authenticated: por ahora solo service_role (y el dueño) las leen. Las
-- políticas que reproducen firestore.rules llegan con la web de prueba.

create extension if not exists "uuid-ossp" with schema extensions;

-- Tipos -----------------------------------------------------------------
do $$
begin
  create type public.app_role as enum ('admin', 'staff', 'finanzas', 'buyer');
exception when duplicate_object then null;
end $$;
do $$ begin create type public.user_status as enum ('active', 'disabled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.audience as enum ('retail', 'wholesale'); exception when duplicate_object then null; end $$;
do $$ begin create type public.vehicle_status as enum ('draft', 'ready', 'in_auction', 'sold', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.transmission as enum ('manual', 'automatic', 'cvt'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fuel_type as enum ('gasoline', 'diesel', 'hybrid', 'electric'); exception when duplicate_object then null; end $$;
do $$ begin create type public.vehicle_condition as enum ('new', 'used', 'damaged'); exception when duplicate_object then null; end $$;
do $$ begin create type public.auction_status as enum ('scheduled', 'live', 'ended', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.auction_outcome as enum ('sold', 'reserve_not_met', 'no_bids', 'sold_offline'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('pending_payment', 'paid', 'forfeited'); exception when duplicate_object then null; end $$;
do $$ begin create type public.bid_status as enum ('valid', 'outbid', 'winning', 'rejected'); exception when duplicate_object then null; end $$;

-- Personas ----------------------------------------------------------------
-- id: el de auth.users cuando se importen las cuentas (mismo UUID
-- determinista, ver legacy.uid()); firebase_uid queda para trazabilidad.
create table if not exists public.profiles (
  id uuid primary key,
  firebase_uid text not null unique,
  email text,
  role public.app_role not null,
  status public.user_status not null,
  audience public.audience,
  first_name text,
  last_name text,
  phone text,
  address text,
  document_type text,
  document_number text,
  provider text,
  preferences jsonb not null default '{}'::jsonb,
  created_by_firebase_uid text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz
);

-- Inventario --------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key,
  legacy_id text not null unique,
  make text not null,
  model text not null,
  year int not null,
  vin text,
  mileage int,
  transmission public.transmission,
  fuel_type public.fuel_type,
  condition public.vehicle_condition,
  color text,
  license_plate text,
  audience public.audience,
  description_es text,
  description_en text,
  status public.vehicle_status not null,
  created_by uuid references public.profiles (id) on delete set null,
  first_listed_at timestamptz,
  unsold_alert_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists public.vehicle_images (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  position int not null,
  url text not null,
  thumbnail_url text,
  storage_path text,
  primary key (vehicle_id, position)
);

-- Subastas ----------------------------------------------------------------
create table if not exists public.auctions (
  id uuid primary key,
  legacy_id text not null unique,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  audience public.audience not null,
  starting_price numeric(12, 2) not null,
  bid_increment numeric(12, 2) not null,
  buy_now_price numeric(12, 2),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hard_ends_at timestamptz,
  status public.auction_status not null,
  outcome public.auction_outcome,
  current_bid numeric(12, 2) not null default 0,
  current_bidder_id uuid references public.profiles (id) on delete set null,
  bid_count int not null default 0,
  winner_id uuid references public.profiles (id) on delete set null,
  final_price numeric(12, 2),
  payment_status public.payment_status,
  payment_deposit_usd numeric(12, 2),
  payment_deposit_percent numeric(6, 4),
  payment_deadline timestamptz,
  payment_note text,
  payment_proof_path text,
  payment_proof_url text,
  payment_proof_submitted_at timestamptz,
  payment_status_updated_at timestamptz,
  payment_status_updated_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  view_total int not null default 0,
  view_unique int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz
);
-- The Firebase uid survives even when that account was deleted and the uuid
-- reference has to be null (one sold auction's winner, 26/9) — same idea as
-- bids.bidder_firebase_uid.
alter table public.auctions add column if not exists winner_firebase_uid text;
alter table public.auctions add column if not exists current_bidder_firebase_uid text;
create index if not exists auctions_status_ends_at on public.auctions (status, ends_at);
create index if not exists auctions_audience_status on public.auctions (audience, status);

-- Montos que el comprador no debe ver (reserva) y venta en salón.
create table if not exists public.auction_private (
  auction_id uuid primary key references public.auctions (id) on delete cascade,
  reserve_price numeric(12, 2),
  sold_offline_price_usd numeric(12, 2),
  sold_offline_at timestamptz,
  sold_offline_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.bids (
  id uuid primary key,
  legacy_id text not null unique,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  bidder_id uuid references public.profiles (id) on delete set null,
  bidder_firebase_uid text not null,
  amount numeric(12, 2) not null,
  status public.bid_status not null,
  displaced_bidder_id uuid references public.profiles (id) on delete set null,
  displaced_amount numeric(12, 2),
  buyer_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);
create index if not exists bids_auction_amount on public.bids (auction_id, amount desc);

create table if not exists public.auction_viewers (
  auction_id uuid not null references public.auctions (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  first_name text,
  last_initial text,
  first_view_at timestamptz,
  last_view_at timestamptz,
  view_count int not null default 0,
  primary key (auction_id, viewer_id)
);

create table if not exists public.price_changes (
  id uuid primary key,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  field text not null,
  from_value numeric(12, 2),
  to_value numeric(12, 2),
  is_reduction boolean,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  at timestamptz
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  primary key (user_id, auction_id)
);

-- Operación ---------------------------------------------------------------
create table if not exists public.app_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz,
  updated_by_firebase_uid text
);

create table if not exists public.audit_logs (
  id uuid primary key,
  legacy_id text not null unique,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_firebase_uid text,
  action text not null,
  resource_type text,
  resource_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null
);
create index if not exists audit_logs_created_at on public.audit_logs (created_at desc);

create table if not exists public.notifications (
  id uuid primary key,
  legacy_id text not null unique,
  type text not null,
  to_user_id uuid references public.profiles (id) on delete set null,
  to_email text,
  auction_id uuid references public.auctions (id) on delete set null,
  bid_legacy_id text,
  status text not null,
  reason text,
  resend_id text,
  created_at timestamptz not null
);

create table if not exists public.password_reset_requests (
  id uuid primary key,
  legacy_id text not null unique,
  user_id uuid references public.profiles (id) on delete set null,
  email text,
  first_name text,
  last_name text,
  request_count int not null default 1,
  status text not null,
  requested_at timestamptz,
  resolved_at timestamptz
);

create table if not exists public.page_views (
  id uuid primary key,
  legacy_id text not null unique,
  at timestamptz not null,
  path_kind text not null,
  source text,
  session_id text,
  auction_id uuid references public.auctions (id) on delete set null
);
create index if not exists page_views_at on public.page_views (at);

create table if not exists public.traffic_daily (
  date date primary key,
  total_views int not null default 0,
  unique_sessions int not null default 0,
  by_path_kind jsonb not null default '{}'::jsonb,
  by_source jsonb not null default '{}'::jsonb,
  funnel jsonb not null default '{}'::jsonb,
  updated_at timestamptz
);

-- Candado: RLS en todo y nada para anon/authenticated (ver encabezado).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'vehicles', 'vehicle_images', 'auctions', 'auction_private', 'bids',
    'auction_viewers', 'price_changes', 'favorites', 'app_config', 'audit_logs',
    'notifications', 'password_reset_requests', 'page_views', 'traffic_daily'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
