-- Transforma legacy.fs_documents (Firestore crudo) en las tablas de public.
-- Upserts por id determinista: repetible, y las filas que se crearon durante
-- las pruebas no se tocan. Para una copia exacta de producción, el runner
-- vacía las tablas antes (RESET=1).
--
-- Orden: primero lo que otros referencian (perfiles, vehículos, subastas).
begin;

-- Perfiles (users/{uid}) ------------------------------------------------
insert into public.profiles as p (
  id, firebase_uid, email, role, status, audience, first_name, last_name, phone, address,
  document_type, document_number, provider, preferences, created_by_firebase_uid,
  created_at, updated_at, deleted_at
)
select
  legacy.uid(d.doc_id),
  d.doc_id,
  d.data ->> 'email',
  (d.data ->> 'role')::public.app_role,
  coalesce(nullif(d.data ->> 'status', ''), 'active')::public.user_status,
  nullif(d.data -> 'profile' ->> 'audience', '')::public.audience,
  d.data -> 'profile' ->> 'firstName',
  d.data -> 'profile' ->> 'lastName',
  d.data -> 'profile' ->> 'phone',
  d.data -> 'profile' ->> 'address',
  nullif(d.data -> 'profile' ->> 'documentType', ''),
  nullif(d.data -> 'profile' ->> 'documentNumber', ''),
  d.data ->> 'provider',
  coalesce(d.data -> 'preferences', '{}'::jsonb),
  d.data ->> 'createdBy',
  legacy.ts(d.data -> 'createdAt'),
  legacy.ts(d.data -> 'updatedAt'),
  legacy.ts(d.data -> 'deletedAt')
from legacy.fs_documents d
where d.collection = 'users' and d.path = 'users/' || d.doc_id
on conflict (id) do update set
  email = excluded.email, role = excluded.role, status = excluded.status,
  audience = excluded.audience, first_name = excluded.first_name, last_name = excluded.last_name,
  phone = excluded.phone, address = excluded.address, document_type = excluded.document_type,
  document_number = excluded.document_number, provider = excluded.provider,
  preferences = excluded.preferences, created_by_firebase_uid = excluded.created_by_firebase_uid,
  created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at;

-- Vehículos -------------------------------------------------------------
insert into public.vehicles as v (
  id, legacy_id, make, model, year, vin, mileage, transmission, fuel_type, condition, color,
  license_plate, audience, description_es, description_en, status, created_by,
  first_listed_at, unsold_alert_at, created_at, updated_at
)
select
  legacy.id('vehicle', d.doc_id),
  d.doc_id,
  d.data ->> 'make',
  d.data ->> 'model',
  (d.data ->> 'year')::numeric::int,
  nullif(d.data ->> 'vin', ''),
  (d.data ->> 'mileage')::numeric::int,
  nullif(d.data ->> 'transmission', '')::public.transmission,
  nullif(d.data ->> 'fuelType', '')::public.fuel_type,
  nullif(d.data ->> 'condition', '')::public.vehicle_condition,
  d.data ->> 'color',
  d.data ->> 'licensePlate',
  nullif(d.data ->> 'audience', '')::public.audience,
  d.data -> 'description' ->> 'es',
  d.data -> 'description' ->> 'en',
  (d.data ->> 'status')::public.vehicle_status,
  legacy.profile(d.data ->> 'createdBy'),
  legacy.ts(d.data -> 'firstListedAt'),
  legacy.ts(d.data -> 'unsoldAlertAt'),
  legacy.ts(d.data -> 'createdAt'),
  legacy.ts(d.data -> 'updatedAt')
from legacy.fs_documents d
where d.collection = 'vehicles' and d.path = 'vehicles/' || d.doc_id
on conflict (id) do update set
  make = excluded.make, model = excluded.model, year = excluded.year, vin = excluded.vin,
  mileage = excluded.mileage, transmission = excluded.transmission, fuel_type = excluded.fuel_type,
  condition = excluded.condition, color = excluded.color, license_plate = excluded.license_plate,
  audience = excluded.audience, description_es = excluded.description_es,
  description_en = excluded.description_en, status = excluded.status,
  created_by = excluded.created_by, first_listed_at = excluded.first_listed_at,
  unsold_alert_at = excluded.unsold_alert_at, created_at = excluded.created_at,
  updated_at = excluded.updated_at;

-- Fotos: posición = orden en el array (el campo `order` puede repetirse).
delete from public.vehicle_images vi
using legacy.fs_documents d
where d.collection = 'vehicles' and vi.vehicle_id = legacy.id('vehicle', d.doc_id);
insert into public.vehicle_images (vehicle_id, position, url, thumbnail_url)
select legacy.id('vehicle', d.doc_id), t.ord - 1, t.img ->> 'url', t.img ->> 'thumbnailUrl'
from legacy.fs_documents d
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(d.data -> 'images') = 'array' then d.data -> 'images' else '[]'::jsonb end
) with ordinality as t(img, ord)
where d.collection = 'vehicles' and d.path = 'vehicles/' || d.doc_id and t.img ->> 'url' is not null;

-- Subastas --------------------------------------------------------------
insert into public.auctions as a (
  id, legacy_id, vehicle_id, audience, starting_price, bid_increment, buy_now_price,
  starts_at, ends_at, hard_ends_at, status, outcome, current_bid, current_bidder_id, bid_count,
  winner_id, final_price, payment_status, payment_deposit_usd, payment_deposit_percent,
  payment_deadline, payment_note, payment_proof_path, payment_proof_url,
  payment_proof_submitted_at, payment_status_updated_at, payment_status_updated_by,
  cancelled_at, cancelled_by, vehicle_snapshot, view_total, view_unique, created_by,
  created_at, updated_at, winner_firebase_uid, current_bidder_firebase_uid
)
select
  legacy.id('auction', d.doc_id),
  d.doc_id,
  (select v.id from public.vehicles v where v.legacy_id = d.data ->> 'vehicleId'),
  (d.data ->> 'audience')::public.audience,
  (d.data ->> 'startingPrice')::numeric,
  (d.data ->> 'bidIncrement')::numeric,
  (d.data ->> 'buyNowPrice')::numeric,
  legacy.ts(d.data -> 'startsAt'),
  legacy.ts(d.data -> 'endsAt'),
  legacy.ts(d.data -> 'hardEndsAt'),
  (d.data ->> 'status')::public.auction_status,
  nullif(d.data ->> 'outcome', '')::public.auction_outcome,
  coalesce((d.data ->> 'currentBid')::numeric, 0),
  legacy.profile(d.data ->> 'currentBidderUid'),
  coalesce((d.data ->> 'bidCount')::numeric::int, 0),
  legacy.profile(d.data ->> 'winnerUid'),
  (d.data ->> 'finalPrice')::numeric,
  nullif(d.data ->> 'paymentStatus', '')::public.payment_status,
  (d.data ->> 'paymentDepositUsd')::numeric,
  (d.data ->> 'paymentDepositPercent')::numeric,
  legacy.ts(d.data -> 'paymentDeadline'),
  d.data ->> 'paymentNote',
  d.data ->> 'paymentProofPath',
  d.data ->> 'paymentProofUrl',
  legacy.ts(d.data -> 'paymentProofSubmittedAt'),
  legacy.ts(d.data -> 'paymentStatusUpdatedAt'),
  legacy.profile(d.data ->> 'paymentStatusUpdatedBy'),
  legacy.ts(d.data -> 'cancelledAt'),
  legacy.profile(d.data ->> 'cancelledBy'),
  coalesce(d.data -> 'vehicleSnapshot', '{}'::jsonb),
  coalesce((d.data -> 'viewStats' ->> 'total')::numeric::int, 0),
  coalesce((d.data -> 'viewStats' ->> 'unique')::numeric::int, 0),
  legacy.profile(d.data ->> 'createdBy'),
  legacy.ts(d.data -> 'createdAt'),
  legacy.ts(d.data -> 'updatedAt'),
  d.data ->> 'winnerUid',
  d.data ->> 'currentBidderUid'
from legacy.fs_documents d
where d.collection = 'auctions' and d.path = 'auctions/' || d.doc_id
on conflict (id) do update set
  vehicle_id = excluded.vehicle_id, audience = excluded.audience,
  starting_price = excluded.starting_price, bid_increment = excluded.bid_increment,
  buy_now_price = excluded.buy_now_price, starts_at = excluded.starts_at,
  ends_at = excluded.ends_at, hard_ends_at = excluded.hard_ends_at, status = excluded.status,
  outcome = excluded.outcome, current_bid = excluded.current_bid,
  current_bidder_id = excluded.current_bidder_id, bid_count = excluded.bid_count,
  winner_id = excluded.winner_id, final_price = excluded.final_price,
  payment_status = excluded.payment_status, payment_deposit_usd = excluded.payment_deposit_usd,
  payment_deposit_percent = excluded.payment_deposit_percent,
  payment_deadline = excluded.payment_deadline, payment_note = excluded.payment_note,
  payment_proof_path = excluded.payment_proof_path, payment_proof_url = excluded.payment_proof_url,
  payment_proof_submitted_at = excluded.payment_proof_submitted_at,
  payment_status_updated_at = excluded.payment_status_updated_at,
  payment_status_updated_by = excluded.payment_status_updated_by,
  cancelled_at = excluded.cancelled_at, cancelled_by = excluded.cancelled_by,
  vehicle_snapshot = excluded.vehicle_snapshot, view_total = excluded.view_total,
  view_unique = excluded.view_unique, created_by = excluded.created_by,
  created_at = excluded.created_at, updated_at = excluded.updated_at,
  winner_firebase_uid = excluded.winner_firebase_uid,
  current_bidder_firebase_uid = excluded.current_bidder_firebase_uid;

-- Reserva y venta en salón (auctions/{id}/private/internal).
insert into public.auction_private as ap (
  auction_id, reserve_price, sold_offline_price_usd, sold_offline_at, sold_offline_by
)
select
  a.id,
  (d.data ->> 'reservePrice')::numeric,
  (d.data ->> 'soldOfflinePriceUsd')::numeric,
  legacy.ts(d.data -> 'soldOfflineAt'),
  legacy.profile(d.data ->> 'soldOfflineBy')
from legacy.fs_documents d
join public.auctions a on a.legacy_id = split_part(d.path, '/', 2)
where d.collection = 'private' and d.path like 'auctions/%/private/%'
on conflict (auction_id) do update set
  reserve_price = excluded.reserve_price,
  sold_offline_price_usd = excluded.sold_offline_price_usd,
  sold_offline_at = excluded.sold_offline_at,
  sold_offline_by = excluded.sold_offline_by;

-- Las subastas anteriores a la separación guardaban la reserva en el
-- documento padre (57 el 26/9): se usa si el subdocumento no la tiene.
insert into public.auction_private as ap (auction_id, reserve_price)
select a.id, (d.data ->> 'reservePrice')::numeric
from legacy.fs_documents d
join public.auctions a on a.legacy_id = d.doc_id
where d.collection = 'auctions' and d.path = 'auctions/' || d.doc_id and d.data ? 'reservePrice'
on conflict (auction_id) do update set
  reserve_price = coalesce(ap.reserve_price, excluded.reserve_price);

-- Pujas (auctions/{id}/bids/{bidId}); legacy_id = ruta completa.
insert into public.bids as b (
  id, legacy_id, auction_id, bidder_id, bidder_firebase_uid, amount, status,
  displaced_bidder_id, displaced_amount, buyer_snapshot, created_at
)
select
  legacy.id('bid', d.path),
  d.path,
  a.id,
  legacy.profile(d.data ->> 'buyerUid'),
  d.data ->> 'buyerUid',
  (d.data ->> 'amount')::numeric,
  (d.data ->> 'status')::public.bid_status,
  legacy.profile(d.data ->> 'displacedBuyerUid'),
  (d.data ->> 'displacedAmount')::numeric,
  coalesce(d.data -> 'buyerSnapshot', '{}'::jsonb),
  legacy.ts(d.data -> 'createdAt')
from legacy.fs_documents d
join public.auctions a on a.legacy_id = split_part(d.path, '/', 2)
where d.collection = 'bids' and d.path like 'auctions/%/bids/%'
on conflict (id) do update set
  bidder_id = excluded.bidder_id, amount = excluded.amount, status = excluded.status,
  displaced_bidder_id = excluded.displaced_bidder_id,
  displaced_amount = excluded.displaced_amount, buyer_snapshot = excluded.buyer_snapshot,
  created_at = excluded.created_at;

-- Quién vio cada subasta (auctions/{id}/viewers/{uid}).
insert into public.auction_viewers as av (
  auction_id, viewer_id, first_name, last_initial, first_view_at, last_view_at, view_count
)
select
  a.id, p.id, d.data ->> 'firstName', d.data ->> 'lastInitial',
  legacy.ts(d.data -> 'firstViewAt'), legacy.ts(d.data -> 'lastViewAt'),
  coalesce((d.data ->> 'viewCount')::numeric::int, 0)
from legacy.fs_documents d
join public.auctions a on a.legacy_id = split_part(d.path, '/', 2)
join public.profiles p on p.firebase_uid = d.doc_id
where d.collection = 'viewers' and d.path like 'auctions/%/viewers/%'
on conflict (auction_id, viewer_id) do update set
  first_name = excluded.first_name, last_initial = excluded.last_initial,
  first_view_at = excluded.first_view_at, last_view_at = excluded.last_view_at,
  view_count = excluded.view_count;

-- Favoritos: se recalculan enteros (users.favorites es la fuente).
delete from public.favorites f
using public.profiles p
where f.user_id = p.id
  and exists (select 1 from legacy.fs_documents d where d.collection = 'users' and d.doc_id = p.firebase_uid);
insert into public.favorites (user_id, auction_id)
select distinct p.id, a.id
from legacy.fs_documents d
join public.profiles p on p.firebase_uid = d.doc_id
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(d.data -> 'favorites') = 'array' then d.data -> 'favorites' else '[]'::jsonb end
) as f(auction_legacy_id)
join public.auctions a on a.legacy_id = f.auction_legacy_id
where d.collection = 'users' and d.path = 'users/' || d.doc_id
on conflict do nothing;

-- Operación -------------------------------------------------------------
insert into public.app_config as c (id, data, updated_at, updated_by_firebase_uid)
select d.doc_id, d.data - 'updatedAt' - 'updatedBy', legacy.ts(d.data -> 'updatedAt'), d.data ->> 'updatedBy'
from legacy.fs_documents d
where d.collection = 'app_config'
on conflict (id) do update set
  data = excluded.data, updated_at = excluded.updated_at,
  updated_by_firebase_uid = excluded.updated_by_firebase_uid;

-- Auditoría: solo se agrega, nunca se reescribe.
insert into public.audit_logs (
  id, legacy_id, actor_id, actor_firebase_uid, action, resource_type, resource_id, before, after, created_at
)
select
  legacy.id('audit', d.doc_id), d.doc_id, legacy.profile(d.data ->> 'actorUid'),
  d.data ->> 'actorUid', d.data ->> 'action', d.data ->> 'resourceType', d.data ->> 'resourceId',
  d.data -> 'before', d.data -> 'after', legacy.ts(d.data -> 'createdAt')
from legacy.fs_documents d
where d.collection = 'audit_logs'
on conflict (id) do nothing;

insert into public.notifications as n (
  id, legacy_id, type, to_user_id, to_email, auction_id, bid_legacy_id, status, reason, resend_id, created_at
)
select
  legacy.id('notification', d.doc_id), d.doc_id, d.data ->> 'type',
  legacy.profile(d.data ->> 'toUid'), d.data ->> 'toEmail',
  (select a.id from public.auctions a where a.legacy_id = d.data ->> 'auctionId'),
  d.data ->> 'bidId', d.data ->> 'status', d.data ->> 'reason', d.data ->> 'resendId',
  legacy.ts(d.data -> 'createdAt')
from legacy.fs_documents d
where d.collection = 'notifications'
on conflict (id) do update set status = excluded.status, reason = excluded.reason;

insert into public.password_reset_requests as r (
  id, legacy_id, user_id, email, first_name, last_name, request_count, status, requested_at, resolved_at
)
select
  legacy.id('pwreset', d.doc_id), d.doc_id, legacy.profile(d.data ->> 'uid'), d.data ->> 'email',
  d.data ->> 'firstName', d.data ->> 'lastName', coalesce((d.data ->> 'requestCount')::numeric::int, 1),
  d.data ->> 'status', legacy.ts(d.data -> 'requestedAt'), legacy.ts(d.data -> 'resolvedAt')
from legacy.fs_documents d
where d.collection = 'password_reset_requests'
on conflict (id) do update set
  request_count = excluded.request_count, status = excluded.status,
  requested_at = excluded.requested_at, resolved_at = excluded.resolved_at;

insert into public.page_views (id, legacy_id, at, path_kind, source, session_id, auction_id)
select
  legacy.id('pageview', d.doc_id), d.doc_id, legacy.ts(d.data -> 'at'), d.data ->> 'pathKind',
  d.data ->> 'source', d.data ->> 'sessionId',
  (select a.id from public.auctions a where a.legacy_id = d.data ->> 'auctionId')
from legacy.fs_documents d
where d.collection = 'page_views'
on conflict (id) do nothing;

insert into public.traffic_daily as t (
  date, total_views, unique_sessions, by_path_kind, by_source, funnel, updated_at
)
select
  (d.data ->> 'date')::date, coalesce((d.data ->> 'totalViews')::numeric::int, 0),
  coalesce((d.data ->> 'uniqueSessions')::numeric::int, 0),
  coalesce(d.data -> 'byPathKind', '{}'::jsonb), coalesce(d.data -> 'bySource', '{}'::jsonb),
  coalesce(d.data -> 'funnel', '{}'::jsonb), legacy.ts(d.data -> 'updatedAt')
from legacy.fs_documents d
where d.collection = 'insights_traffic_daily' and d.data ? 'date'
on conflict (date) do update set
  total_views = excluded.total_views, unique_sessions = excluded.unique_sessions,
  by_path_kind = excluded.by_path_kind, by_source = excluded.by_source,
  funnel = excluded.funnel, updated_at = excluded.updated_at;

commit;
