-- Área de trabajo de la carga desde el espejo (no expuesta por la API).
--
-- legacy.fs_documents / legacy.auth_users reciben por COPY las tablas crudas
-- del espejo (apps/mirror, base renewsubastas_mirror), y 100_load_from_mirror
-- las transforma en las tablas de public. Se vacían en cada corrida.
create schema if not exists legacy;
revoke all on schema legacy from anon, authenticated;

create table if not exists legacy.fs_documents (
  path text primary key,
  collection text not null,
  doc_id text not null,
  parent_path text,
  data jsonb not null
);

create table if not exists legacy.auth_users (
  uid text primary key,
  email text,
  email_verified boolean,
  phone text,
  display_name text,
  photo_url text,
  disabled boolean,
  providers text,
  custom_claims text,
  created_at timestamptz,
  last_sign_in_at timestamptz
);

-- UUID determinista a partir del id de Firebase: la misma fila tiene el mismo
-- id en cada corrida (la carga es repetible y el orden no importa), y las
-- cuentas se importan a auth.users con el mismo UUID que su perfil.
create or replace function legacy.id(kind text, legacy_id text)
returns uuid
language sql
immutable
as $$
  select extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://renewsubastas.com.py/' || kind || '/' || legacy_id
  )
$$;

create or replace function legacy.uid(firebase_uid text)
returns uuid
language sql
immutable
as $$ select legacy.id('user', firebase_uid) $$;

-- El espejo guarda los Timestamp de Firestore como {"$ts": "<ISO>"}.
create or replace function legacy.ts(j jsonb)
returns timestamptz
language sql
immutable
as $$ select nullif(j ->> '$ts', '')::timestamptz $$;

-- Referencia a un perfil que exista; null si esa persona ya no está (una puja
-- o un registro de auditoría de una cuenta borrada no rompe la carga).
create or replace function legacy.profile(firebase_uid text)
returns uuid
language sql
stable
as $$ select p.id from public.profiles p where p.firebase_uid = $1 $$;
