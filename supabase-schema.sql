create extension if not exists pgcrypto;

create table if not exists public.cats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  name text not null check (char_length(name) between 1 and 120),
  breed text,
  age text,
  owner_name text,
  owner_phone text,
  photo_url text,
  checkin_date date,
  checkout_date date,
  diet text,
  supplement text,
  food text,
  health text,
  character text,
  private_note text,
  owner_items text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cat_id uuid not null references public.cats(id) on delete cascade,
  note_date date not null default current_date,
  mood text,
  appetite text,
  photo_url text,
  body text check (coalesce(char_length(body), 0) <= 5000),
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.owner_notes (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references public.cats(id) on delete cascade,
  owner_name text,
  message text not null check (char_length(message) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 180),
  created_at timestamptz not null default now()
);

create index if not exists cats_user_idx on public.cats(user_id);
create index if not exists daily_notes_user_idx on public.daily_notes(user_id);
create index if not exists daily_notes_cat_idx on public.daily_notes(cat_id);
create index if not exists owner_notes_cat_idx on public.owner_notes(cat_id);
create index if not exists packing_items_user_idx on public.packing_items(user_id);

alter table public.cats enable row level security;
alter table public.daily_notes enable row level security;
alter table public.owner_notes enable row level security;
alter table public.packing_items enable row level security;

drop policy if exists "cats_select_own" on public.cats;
create policy "cats_select_own"
on public.cats for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "cats_insert_own" on public.cats;
create policy "cats_insert_own"
on public.cats for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "cats_update_own" on public.cats;
create policy "cats_update_own"
on public.cats for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "cats_delete_own" on public.cats;
create policy "cats_delete_own"
on public.cats for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "daily_notes_select_own" on public.daily_notes;
create policy "daily_notes_select_own"
on public.daily_notes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "daily_notes_insert_own" on public.daily_notes;
create policy "daily_notes_insert_own"
on public.daily_notes for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.cats
    where cats.id = daily_notes.cat_id
      and cats.user_id = (select auth.uid())
  )
);

drop policy if exists "daily_notes_update_own" on public.daily_notes;
create policy "daily_notes_update_own"
on public.daily_notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.cats
    where cats.id = daily_notes.cat_id
      and cats.user_id = (select auth.uid())
  )
);

drop policy if exists "daily_notes_delete_own" on public.daily_notes;
create policy "daily_notes_delete_own"
on public.daily_notes for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "owner_notes_select_own_cats" on public.owner_notes;
create policy "owner_notes_select_own_cats"
on public.owner_notes for select
to authenticated
using (
  exists (
    select 1 from public.cats
    where cats.id = owner_notes.cat_id
      and cats.user_id = (select auth.uid())
  )
);

drop policy if exists "owner_notes_delete_own_cats" on public.owner_notes;
create policy "owner_notes_delete_own_cats"
on public.owner_notes for delete
to authenticated
using (
  exists (
    select 1 from public.cats
    where cats.id = owner_notes.cat_id
      and cats.user_id = (select auth.uid())
  )
);

drop policy if exists "packing_items_select_own" on public.packing_items;
create policy "packing_items_select_own"
on public.packing_items for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "packing_items_insert_own" on public.packing_items;
create policy "packing_items_insert_own"
on public.packing_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "packing_items_delete_own" on public.packing_items;
create policy "packing_items_delete_own"
on public.packing_items for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.owner_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat public.cats%rowtype;
  v_payload jsonb;
begin
  select *
  into v_cat
  from public.cats
  where public_token = p_token
  limit 1;

  if v_cat.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'cat', jsonb_build_object(
      'name', v_cat.name,
      'breed', v_cat.breed,
      'owner_name', v_cat.owner_name,
      'photo_url', v_cat.photo_url,
      'checkin_date', v_cat.checkin_date,
      'checkout_date', v_cat.checkout_date,
      'diet', v_cat.diet,
      'supplement', v_cat.supplement,
      'food', v_cat.food,
      'health', v_cat.health,
      'character', v_cat.character,
      'owner_items', v_cat.owner_items
    ),
    'daily_notes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'note_date', n.note_date,
          'mood', n.mood,
          'appetite', n.appetite,
          'photo_url', n.photo_url,
          'body', n.body,
          'flags', n.flags,
          'created_at', n.created_at
        )
        order by n.note_date desc, n.created_at desc
      )
      from public.daily_notes n
      where n.cat_id = v_cat.id
    ), '[]'::jsonb),
    'owner_notes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'owner_name', o.owner_name,
          'message', o.message,
          'created_at', o.created_at
        )
        order by o.created_at desc
      )
      from public.owner_notes o
      where o.cat_id = v_cat.id
    ), '[]'::jsonb),
    'packing_items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', i.label
        )
        order by i.created_at asc
      )
      from public.packing_items i
      where i.user_id = v_cat.user_id
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

create or replace function public.submit_owner_note(
  p_token text,
  p_owner_name text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat_id uuid;
  v_note_id uuid;
begin
  select id
  into v_cat_id
  from public.cats
  where public_token = p_token
  limit 1;

  if v_cat_id is null then
    raise exception 'Geçersiz sahip bağlantısı.';
  end if;

  if nullif(btrim(p_message), '') is null then
    raise exception 'Mesaj boş olamaz.';
  end if;

  insert into public.owner_notes(cat_id, owner_name, message)
  values (
    v_cat_id,
    nullif(btrim(p_owner_name), ''),
    btrim(p_message)
  )
  returning id into v_note_id;

  return v_note_id;
end;
$$;

revoke all on function public.owner_portal(text) from public;
revoke all on function public.submit_owner_note(text, text, text) from public;
grant execute on function public.owner_portal(text) to anon, authenticated;
grant execute on function public.submit_owner_note(text, text, text) to anon, authenticated;
