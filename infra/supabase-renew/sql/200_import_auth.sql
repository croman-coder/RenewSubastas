-- Cuentas de Firebase Auth → GoTrue (auth.users + auth.identities).
-- Lo corre import-auth.sh después de llenar legacy.auth_import.
--
-- - id = legacy.uid(firebase_uid): el mismo UUID que public.profiles.id.
-- - Contraseñas: el hash de Firebase va tal cual en formato $fbscrypt$; GoTrue
--   lo verifica al entrar (probado el 26/9 con una cuenta sintética).
-- - Google: identidad 'google' con el sub de Google que guardaba Firebase, así
--   la persona entra con su misma cuenta de Google.
-- - app_metadata lleva role, status y audience desde public.profiles: es lo que
--   van a leer las políticas RLS (hoy eran custom claims de Firebase).
-- - Cuenta deshabilitada → banned_until lejano.
-- - Una recarga pisa la contraseña con la de producción: es un entorno que se
--   sincroniza desde producción.
begin;

insert into auth.users as u (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at, banned_until,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  legacy.uid(i.firebase_uid),
  'authenticated',
  'authenticated',
  coalesce(i.email, i.google_email),
  nullif(i.encrypted_password, ''),
  case when i.email_verified or i.google_sub is not null then coalesce(i.created_at, now()) end,
  jsonb_strip_nulls(jsonb_build_object(
    'provider', case when nullif(i.encrypted_password, '') is null and i.google_sub is not null
                     then 'google' else 'email' end,
    'providers', to_jsonb(array_remove(array[
      case when nullif(i.encrypted_password, '') is not null then 'email' end,
      case when i.google_sub is not null then 'google' end
    ], null)),
    'role', p.role,
    'status', p.status,
    'audience', p.audience
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'full_name', i.display_name, 'avatar_url', i.photo_url, 'firebase_uid', i.firebase_uid
  )),
  coalesce(i.created_at, now()),
  now(),
  i.last_sign_in_at,
  case when i.disabled or p.status = 'disabled' then '2999-01-01'::timestamptz end,
  '', '', '', '', '', '', '', '', false, false
from legacy.auth_import i
left join public.profiles p on p.firebase_uid = i.firebase_uid
where coalesce(i.email, i.google_email) is not null
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  last_sign_in_at = excluded.last_sign_in_at,
  banned_until = excluded.banned_until,
  updated_at = now();

-- Identidad de email: cuentas con contraseña.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select
  legacy.uid(i.firebase_uid)::text,
  legacy.uid(i.firebase_uid),
  jsonb_build_object(
    'sub', legacy.uid(i.firebase_uid)::text, 'email', i.email,
    'email_verified', coalesce(i.email_verified, false), 'phone_verified', false
  ),
  'email',
  coalesce(i.created_at, now()),
  now(),
  i.last_sign_in_at
from legacy.auth_import i
where nullif(i.encrypted_password, '') is not null and i.email is not null
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data, user_id = excluded.user_id, updated_at = now();

-- Identidad de Google.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select
  i.google_sub,
  legacy.uid(i.firebase_uid),
  jsonb_strip_nulls(jsonb_build_object(
    'sub', i.google_sub, 'provider_id', i.google_sub,
    'email', coalesce(i.google_email, i.email), 'email_verified', true,
    'iss', 'https://accounts.google.com',
    'name', i.display_name, 'full_name', i.display_name,
    'picture', i.photo_url, 'avatar_url', i.photo_url
  )),
  'google',
  coalesce(i.created_at, now()),
  now(),
  i.last_sign_in_at
from legacy.auth_import i
where i.google_sub is not null
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data, user_id = excluded.user_id, updated_at = now();

-- Los hashes quedan solo en auth.users.
truncate legacy.auth_import;

commit;
