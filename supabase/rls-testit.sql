-- =========================================================================
-- Käyttöoikeussääntöjen (RLS) testit – aja Supabasen SQL-editorissa schema.sql:n jälkeen.
-- Kaikki tehdään yhdessä transaktiossa ja perutaan lopuksi (ROLLBACK): testi ei jätä tietoja.
-- Jokainen tarkistus tulostaa "OK …" tai keskeyttää virheeseen "VIRHE …".
-- Aja aina, kun sääntöjä muutetaan.
-- =========================================================================
begin;

-- Testikäyttäjät (sallittu domain) ja yksi ulkopuolinen
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'testi.a@pbm.fi', '{"full_name":"Testi A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'testi.b@pbm.fi', '{"full_name":"Testi B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'testi.c@pbm.fi', '{"full_name":"Testi C"}');

do $$ begin
  begin
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ee', 'ulkopuolinen@gmail.com');
    raise exception 'VIRHE: ulkopuolinen tunnus hyväksyttiin';
  exception when others then
    if sqlerrm like 'VIRHE%' then raise; end if;
    raise notice 'OK ulkopuolinen domain estetään';
  end;
end $$;

-- ---------- A luo kohteen ja rivin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"testi.a@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
insert into public.kohteet (id, nimi) values ('testikohde', 'Testikohde');
insert into public.rivit (kohde_id, laji, id, data, updated_by) values ('testikohde', 'havainto', 'h1', '{"sanelu":"salainen"}', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select updated_by from public.rivit where id = 'h1') <> '00000000-0000-0000-0000-00000000000a' then raise exception 'VIRHE: muokkaajan voi väärentää'; end if;
  raise notice 'OK muokkaaja asetetaan palvelimella';
  if (select count(*) from public.loki where kohde_id = 'testikohde') < 1 then raise exception 'VIRHE: loki puuttuu'; end if;
  raise notice 'OK muutos kirjautuu lokiin';
end $$;
do $$ begin
  begin insert into public.loki (kohde_id, toiminto) values ('testikohde', 'väärennys'); raise exception 'VIRHE: lokiin voi kirjoittaa';
  exception when others then if sqlerrm like 'VIRHE%' then raise; end if; raise notice 'OK lokiin ei voi kirjoittaa sovelluksesta'; end;
end $$;
delete from public.rivit where id = 'h1';
do $$ begin
  if (select count(*) from public.rivit where id = 'h1') <> 1 then raise exception 'VIRHE: rivin voi poistaa pysyvästi'; end if;
  raise notice 'OK rivejä ei voi poistaa pysyvästi (vain merkintä)';
end $$;

-- ---------- B ei kuulu tiimiin ----------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"testi.b@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.rivit where kohde_id = 'testikohde') <> 0 then raise exception 'VIRHE: ulkopuolinen näkee rivit'; end if;
  if (select count(*) from public.kohteet where id = 'testikohde') <> 0 then raise exception 'VIRHE: ulkopuolinen näkee kohteen'; end if;
  raise notice 'OK tiimin ulkopuolinen ei näe kohdetta eikä rivejä';
  begin insert into public.rivit (kohde_id, laji, id, data) values ('testikohde', 'havainto', 'h2', '{}'); raise exception 'VIRHE: ulkopuolinen voi kirjoittaa';
  exception when others then if sqlerrm like 'VIRHE%' then raise; end if; raise notice 'OK tiimin ulkopuolinen ei voi kirjoittaa'; end;
  begin insert into public.kohde_jasenet (kohde_id, user_id) values ('testikohde', '00000000-0000-0000-0000-00000000000b'); raise exception 'VIRHE: voi lisätä itsensä tiimiin';
  exception when others then if sqlerrm like 'VIRHE%' then raise; end if; raise notice 'OK itseään ei voi lisätä tiimiin'; end;
  update public.rivit set data = '{"sanelu":"muutettu"}' where kohde_id = 'testikohde';
end $$;

-- ---------- A lisää B:n tiimiin ----------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"testi.a@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select data->>'sanelu' from public.rivit where id = 'h1') <> 'salainen' then raise exception 'VIRHE: ulkopuolinen pystyi muuttamaan rivin'; end if;
  raise notice 'OK ulkopuolisen muutos ei mennyt läpi';
end $$;
insert into public.kohde_jasenet (kohde_id, user_id) values ('testikohde', '00000000-0000-0000-0000-00000000000b');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"testi.b@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.rivit where kohde_id = 'testikohde') <> 1 then raise exception 'VIRHE: tiimin jäsen ei näe rivejä'; end if;
  raise notice 'OK tiimin jäsen näkee kohteen';
  begin insert into public.kohde_jasenet (kohde_id, user_id, rooli) values ('testikohde', '00000000-0000-0000-0000-00000000000c', 'omistaja'); raise exception 'VIRHE: jäsen voi lisätä omistajan';
  exception when others then if sqlerrm like 'VIRHE%' then raise; end if; raise notice 'OK jäsen ei voi lisätä omistajaa'; end;
end $$;
insert into public.kohde_jasenet (kohde_id, user_id) values ('testikohde', '00000000-0000-0000-0000-00000000000c');
delete from public.kohde_jasenet where kohde_id = 'testikohde' and user_id = '00000000-0000-0000-0000-00000000000a';
insert into storage.objects (bucket_id, name) values ('kohteet', 'testikohde/kuva1');
do $$ begin
  if (select count(*) from public.kohde_jasenet where kohde_id = 'testikohde' and user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then raise exception 'VIRHE: jäsen voi poistaa omistajan'; end if;
  raise notice 'OK jäsen ei voi poistaa omistajaa';
  begin insert into storage.objects (bucket_id, name) values ('kohteet', 'vierasKohde/kuva'); raise exception 'VIRHE: kuvan voi tallentaa vieraaseen kohteeseen';
  exception when others then if sqlerrm like 'VIRHE%' then raise; end if; raise notice 'OK kuvia ei voi tallentaa vieraaseen kohteeseen'; end;
end $$;

-- ---------- A poistaa C:n; C ei enää näe mitään ----------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"testi.a@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
delete from public.kohde_jasenet where kohde_id = 'testikohde' and user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"testi.c@pbm.fi","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.rivit where kohde_id = 'testikohde') <> 0 then raise exception 'VIRHE: poistettu jäsen näkee rivit'; end if;
  if (select count(*) from storage.objects where name like 'testikohde/%') <> 0 then raise exception 'VIRHE: poistettu jäsen näkee kuvat'; end if;
  if (select count(*) from public.loki where kohde_id = 'testikohde') <> 0 then raise exception 'VIRHE: poistettu jäsen näkee lokin'; end if;
  raise notice 'OK tiimistä poistettu ei näe rivejä, kuvia eikä lokia';
end $$;

-- ---------- Kirjautumaton ----------
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  if (select count(*) from public.rivit) <> 0 or (select count(*) from public.kohteet) <> 0 or (select count(*) from public.profiles) <> 0 then raise exception 'VIRHE: kirjautumaton näkee tietoja'; end if;
  raise notice 'OK kirjautumaton ei näe mitään';
end $$;

reset role;
rollback;
