-- Classroom Connect & Play — initial schema
-- Backend: Supabase (Postgres + Realtime)
-- Auth model: 10-digit Indian mobile number + password (no OTP), gated by a 35-number allowlist.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- allowed_numbers: the whitelist of numbers that may register (max 35)
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_numbers (
  phone      text primary key,
  label      text,
  created_at timestamptz not null default now(),
  constraint allowed_numbers_phone_format check (phone ~ '^[6-9][0-9]{9}$')
);

create or replace function public.enforce_allowed_numbers_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.allowed_numbers) >= 35 then
    raise exception 'Only 35 allowed numbers are permitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_allowed_numbers_limit on public.allowed_numbers;
create trigger trg_allowed_numbers_limit
  before insert on public.allowed_numbers
  for each row execute function public.enforce_allowed_numbers_limit();

-- ---------------------------------------------------------------------------
-- users: private credentials (never exposed to clients)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles: public, safe fields
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references public.users(id) on delete cascade,
  display_name text not null,
  avatar       jsonb not null default '{"type":"preset","preset":"fox"}'::jsonb,
  bio          text not null default '',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- messages: public + anonymous rooms
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  avatar       jsonb not null,
  text         text not null,
  kind         text not null check (kind in ('public','anonymous')),
  created_at   timestamptz not null default now()
);
create index if not exists messages_created_at_idx on public.messages (created_at);

-- ---------------------------------------------------------------------------
-- dms: private 1:1 chat
-- ---------------------------------------------------------------------------
create table if not exists public.dms (
  id           uuid primary key default gen_random_uuid(),
  conversation text not null,
  from_id      uuid not null,
  to_id        uuid not null,
  from_name    text not null,
  to_name      text not null,
  from_avatar  jsonb not null,
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists dms_conversation_idx on public.dms (conversation, created_at);

-- ---------------------------------------------------------------------------
-- presence: who is online right now
-- ---------------------------------------------------------------------------
create table if not exists public.presence (
  user_id      uuid primary key,
  display_name text not null,
  avatar       jsonb not null,
  bio          text not null default '',
  in_room      text not null default 'idle',
  last_seen    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- game_rooms + room_polls: stored as documents
-- ---------------------------------------------------------------------------
create table if not exists public.game_rooms (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_polls (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.allowed_numbers enable row level security;
alter table public.users         enable row level security;
alter table public.profiles      enable row level security;
alter table public.messages      enable row level security;
alter table public.dms           enable row level security;
alter table public.presence      enable row level security;
alter table public.game_rooms    enable row level security;
alter table public.room_polls    enable row level security;

-- allowed_numbers and users: intentionally NO policies -> no client access.
-- They are reachable only through the SECURITY DEFINER functions below.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (true) with check (true);

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (true);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (true);

drop policy if exists dms_select on public.dms;
create policy dms_select on public.dms for select using (true);
drop policy if exists dms_insert on public.dms;
create policy dms_insert on public.dms for insert with check (true);

drop policy if exists presence_select on public.presence;
create policy presence_select on public.presence for select using (true);
drop policy if exists presence_insert on public.presence;
create policy presence_insert on public.presence for insert with check (true);
drop policy if exists presence_update on public.presence;
create policy presence_update on public.presence for update using (true) with check (true);
drop policy if exists presence_delete on public.presence;
create policy presence_delete on public.presence for delete using (true);

drop policy if exists game_rooms_all on public.game_rooms;
create policy game_rooms_all on public.game_rooms for all using (true) with check (true);

drop policy if exists room_polls_all on public.room_polls;
create policy room_polls_all on public.room_polls for all using (true) with check (true);

-- Table privileges for the client roles (RLS still applies).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.messages, public.dms, public.presence,
  public.game_rooms, public.room_polls
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles','messages','dms','presence','game_rooms','room_polls']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auth RPCs (SECURITY DEFINER: run with elevated rights, bypass RLS)
-- ---------------------------------------------------------------------------

-- Register: phone must be on the allowlist and unused.
create or replace function public.register_user(p_phone text, p_password text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_name  text;
  v_id    uuid;
  v_res   jsonb;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name  := coalesce(trim(p_display_name), '');

  if v_phone !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid 10-digit Indian mobile number.');
  end if;
  if length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 4 characters.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a display name.');
  end if;
  if not exists (select 1 from public.allowed_numbers a where a.phone = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'This number is not on the approved list.');
  end if;
  if exists (select 1 from public.users u where u.phone = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'An account already exists for this number.');
  end if;

  insert into public.users (phone, password_hash)
  values (v_phone, crypt(p_password, gen_salt('bf')))
  returning id into v_id;

  insert into public.profiles (user_id, display_name, avatar, bio)
  values (v_id, v_name, '{"type":"preset","preset":"fox"}'::jsonb, '')
  returning jsonb_build_object(
    'id', user_id,
    'phone', v_phone,
    'fullName', display_name,
    'avatar', avatar,
    'bio', bio,
    'createdAt', created_at
  ) into v_res;

  return jsonb_build_object('ok', true, 'user', v_res);
end;
$$;

-- Login: verify password against the stored bcrypt hash.
create or replace function public.login_user(p_phone text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_user  public.users;
  v_res   jsonb;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  select * into v_user from public.users where phone = v_phone;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No account found for this number.');
  end if;
  if v_user.password_hash <> crypt(coalesce(p_password, ''), v_user.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'Incorrect password.');
  end if;

  select jsonb_build_object(
    'id', p.user_id,
    'phone', v_phone,
    'fullName', p.display_name,
    'avatar', p.avatar,
    'bio', p.bio,
    'createdAt', p.created_at
  ) into v_res
  from public.profiles p
  where p.user_id = v_user.id;

  if v_res is null then
    v_res := jsonb_build_object(
      'id', v_user.id, 'phone', v_phone, 'fullName', 'Classmate',
      'avatar', '{"type":"preset","preset":"fox"}'::jsonb, 'bio', '',
      'createdAt', v_user.created_at
    );
  end if;

  return jsonb_build_object('ok', true, 'user', v_res);
end;
$$;

grant execute on function public.register_user(text, text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
