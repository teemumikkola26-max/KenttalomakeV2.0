-- =========================================================================
-- Kuva + sanelu – pilvitietokanta (Supabase, EU-alue)
--
-- Periaatteet
--   * Tutkija näkee vain kohteet, joiden tiimiin hänet on lisätty (kohde_jasenet).
--     Sääntö tarkistetaan tietokannassa (RLS), joten sitä ei voi ohittaa sovelluksesta.
--   * Kirjautuminen vain Microsoft 365 -tunnuksilla; tunnus hyväksytään vain sallitusta
--     sähköpostidomainista (trigger estää muut).
--   * Muokkaaja ja aika asetetaan palvelimella (ei luoteta laitteen kelloon tai tietoon).
--   * Rivejä ei poisteta sovelluksesta: poisto on merkintä (deleted), ja jokaisesta
--     muutoksesta jää lokirivi.
--   * Kuvat ovat yksityisessä säiliössä polussa <kohde_id>/<tiedosto_id>, ja niihin
--     pääsee vain kohteen tiimi.
--
-- Aja kerran Supabasen SQL-editorissa. Muuta sallittu domain kohdassa 1.
-- =========================================================================

-- 1) Sallitut sähköpostidomainit -------------------------------------------
create or replace function public.sallittu_email(email text) returns boolean
language sql immutable as $$
  select lower(split_part(coalesce(email, ''), '@', 2)) in ('pbm.fi')
$$;

-- 2) Profiilit -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nimi text,
  sarja text,                       -- tutkijan kenttänumerosarja, esim. TM (ei raportille)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.uusi_kayttaja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sallittu_email(new.email) then
    raise exception 'Tunnus ei ole sallitusta organisaatiosta';
  end if;
  insert into public.profiles (id, email, nimi)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.uusi_kayttaja();

-- Organisaation tutkijat näkevät toistensa nimet ja sähköpostit (tiimiin lisääminen)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.sallittu_email(auth.jwt() ->> 'email'));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 3) Kohteet ja tiimit -----------------------------------------------------
create table if not exists public.kohteet (
  id text primary key,
  nimi text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted boolean not null default false
);
alter table public.kohteet enable row level security;

create table if not exists public.kohde_jasenet (
  kohde_id text not null references public.kohteet(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rooli text not null default 'jasen' check (rooli in ('omistaja', 'jasen')),
  lisatty_by uuid default auth.uid(),
  lisatty timestamptz not null default now(),
  primary key (kohde_id, user_id)
);
alter table public.kohde_jasenet enable row level security;

-- Jäsenyyden tarkistus (security definer: ei kierrä RLS-sääntöjä silmukkaan)
create or replace function public.on_jasen(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kohde_jasenet where kohde_id = k and user_id = auth.uid())
$$;
create or replace function public.on_omistaja(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kohde_jasenet where kohde_id = k and user_id = auth.uid() and rooli = 'omistaja')
$$;

-- Kohteen luoja on sen omistaja
create or replace function public.kohde_luotu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.kohde_jasenet (kohde_id, user_id, rooli, lisatty_by) values (new.id, new.created_by, 'omistaja', new.created_by)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists kohde_luotu on public.kohteet;
create trigger kohde_luotu after insert on public.kohteet for each row execute function public.kohde_luotu();

drop policy if exists kohteet_select on public.kohteet;
create policy kohteet_select on public.kohteet for select to authenticated using (public.on_jasen(id));
drop policy if exists kohteet_insert on public.kohteet;
create policy kohteet_insert on public.kohteet for insert to authenticated with check (created_by = auth.uid());
drop policy if exists kohteet_update on public.kohteet;
create policy kohteet_update on public.kohteet for update to authenticated using (public.on_jasen(id)) with check (public.on_jasen(id));
-- Ei delete-sääntöä: kohde poistetaan merkinnällä (deleted) tai ylläpitäjän toimesta.

drop policy if exists jasenet_select on public.kohde_jasenet;
create policy jasenet_select on public.kohde_jasenet for select to authenticated using (public.on_jasen(kohde_id));
drop policy if exists jasenet_insert on public.kohde_jasenet;
create policy jasenet_insert on public.kohde_jasenet for insert to authenticated
  with check (public.on_jasen(kohde_id) and rooli = 'jasen'
              and exists (select 1 from public.profiles p where p.id = user_id));
drop policy if exists jasenet_delete on public.kohde_jasenet;
create policy jasenet_delete on public.kohde_jasenet for delete to authenticated
  using ((public.on_omistaja(kohde_id) and user_id <> auth.uid()) or (user_id = auth.uid() and rooli = 'jasen'));

-- 4) Kohteen rivit (kohde, kerrokset, tilat, suunnitelma, havainnot, mittalaitteet, kuntoarvio, tiedostot)
create table if not exists public.rivit (
  kohde_id text not null references public.kohteet(id) on delete cascade,
  laji text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (kohde_id, laji, id)
);
create index if not exists rivit_paivitys on public.rivit (kohde_id, updated_at);
alter table public.rivit enable row level security;

drop policy if exists rivit_select on public.rivit;
create policy rivit_select on public.rivit for select to authenticated using (public.on_jasen(kohde_id));
drop policy if exists rivit_insert on public.rivit;
create policy rivit_insert on public.rivit for insert to authenticated with check (public.on_jasen(kohde_id));
drop policy if exists rivit_update on public.rivit;
create policy rivit_update on public.rivit for update to authenticated using (public.on_jasen(kohde_id)) with check (public.on_jasen(kohde_id));
-- Ei delete-sääntöä: poisto on merkintä (deleted = true).

-- Palvelin asettaa ajan ja muokkaajan
create or replace function public.leimaa() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and tg_table_name = 'kohteet' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists rivit_leimaa on public.rivit;
create trigger rivit_leimaa before insert or update on public.rivit for each row execute function public.leimaa();
drop trigger if exists kohteet_leimaa on public.kohteet;
create trigger kohteet_leimaa before insert or update on public.kohteet for each row execute function public.leimaa();

-- 5) Muutosloki ------------------------------------------------------------
create table if not exists public.loki (
  id bigserial primary key,
  aika timestamptz not null default now(),
  user_id uuid default auth.uid(),
  kohde_id text,
  laji text,
  rivi_id text,
  toiminto text
);
alter table public.loki enable row level security;
drop policy if exists loki_select on public.loki;
create policy loki_select on public.loki for select to authenticated using (public.on_jasen(kohde_id));
-- Lokiin kirjoittaa vain trigger (ei insert-sääntöä sovellukselle).

create or replace function public.kirjaa_loki() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.loki (user_id, kohde_id, laji, rivi_id, toiminto)
  values (auth.uid(), new.kohde_id, new.laji, new.id,
          case when tg_op = 'INSERT' then 'lisäys' when new.deleted and not old.deleted then 'poisto' else 'muutos' end);
  return new;
end $$;
drop trigger if exists rivit_loki on public.rivit;
create trigger rivit_loki after insert or update on public.rivit for each row execute function public.kirjaa_loki();

-- 6) Kuvat ja pohjakuvat: yksityinen säiliö, polku <kohde_id>/<tiedosto_id> --------
insert into storage.buckets (id, name, public) values ('kohteet', 'kohteet', false)
on conflict (id) do update set public = false;

drop policy if exists kohteet_tiedostot_select on storage.objects;
create policy kohteet_tiedostot_select on storage.objects for select to authenticated
  using (bucket_id = 'kohteet' and public.on_jasen((storage.foldername(name))[1]));
drop policy if exists kohteet_tiedostot_insert on storage.objects;
create policy kohteet_tiedostot_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kohteet' and public.on_jasen((storage.foldername(name))[1]));
-- Ei update- eikä delete-sääntöä: tiedosto kirjoitetaan kerran (id on yksilöivä).

-- 7) Tarkistus: aja ja varmista, että rowsecurity = true kaikissa
-- select tablename, rowsecurity from pg_tables where schemaname = 'public'
--   and tablename in ('profiles','kohteet','kohde_jasenet','rivit','loki');
