-- Primo Giocatore - eventi, fase 1 (database)
-- v1.0.0 - 202611181400
-- Si può rilanciare senza danni: ogni passo sostituisce la versione
-- precedente di sé stesso. Non cancella dati.
--
-- Cosa cambia:
-- 1. Tane: «attiva» (oggi tutte sì). Solo i soci di una tana attiva
--    usano l'app completa.
-- 2. Eventi: nome, tana, luogo, date, codice per il link/QR, chiuso.
--    Ruoli nell'evento: organizzatore, dimostratore, partecipante.
-- 3. Nuovo stato socio «partecipante»: chi entra solo per un evento.
--    Non è ammesso al resto dell'app, anche con il controllo soci spento.
-- 4. Chi è solo partecipante vede tavoli, partite, ospiti, luoghi e
--    persone dei suoi eventi. Scrive (iscrizioni, partite) solo finché
--    l'evento è aperto; dopo, sola lettura.
-- 5. Chi organizza un evento gestisce i suoi tavoli.
--
-- Per soci, eccezioni e organizzatori non cambia niente: le regole nuove
-- si sommano con «oppure» a quelle di oggi.
--
-- ATTENZIONE: questo file sostituisce le regole «solo soci» di partite,
-- partecipazioni, ospiti, luoghi e profili. Non rilanciare dopo
-- sicurezza_ruoli_tavoli.sql (le rimetterebbe e chiuderebbe fuori i
-- partecipanti); se succede, rilanciare questo.

-- 1. Tane attive -----------------------------------------------------------
alter table public.tane add column if not exists attiva boolean not null default true;

-- 2. Eventi ----------------------------------------------------------------
create table if not exists public.eventi (id uuid primary key default gen_random_uuid());
alter table public.eventi add column if not exists nome text;
alter table public.eventi add column if not exists tana_id integer references public.tane(id);
alter table public.eventi add column if not exists luogo_id uuid references public.luoghi(id) on delete set null;
alter table public.eventi add column if not exists inizio date;
alter table public.eventi add column if not exists fine date;
alter table public.eventi add column if not exists codice text;
alter table public.eventi add column if not exists chiuso boolean not null default false;
alter table public.eventi add column if not exists creato_da uuid default auth.uid();
alter table public.eventi add column if not exists creato_il timestamptz not null default now();
update public.eventi set codice = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where codice is null;
alter table public.eventi alter column codice set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
create unique index if not exists eventi_codice on public.eventi (upper(codice));

create table if not exists public.evento_ruoli (
  evento_id  uuid not null references public.eventi(id) on delete cascade,
  utente_id  uuid not null references public.profili(id) on delete cascade,
  ruolo      text not null default 'partecipante'
             check (ruolo in ('organizzatore', 'dimostratore', 'partecipante')),
  aggiunto_da uuid default auth.uid(),
  aggiunto_il timestamptz not null default now(),
  primary key (evento_id, utente_id)
);
create index if not exists evento_ruoli_utente on public.evento_ruoli (utente_id);
create index if not exists tavoli_evento on public.tavoli (evento_id) where evento_id is not null;
create index if not exists partite_evento on public.partite (evento_id) where evento_id is not null;

-- tavoli.evento_id e partite.evento_id esistono già: li collego agli
-- eventi se non sono già collegati a qualcosa. «not valid» = non
-- controlla le righe vecchie.
do $$
declare t text;
begin
  foreach t in array array['tavoli', 'partite'] loop
    if not exists (
      select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = format('public.%I', t)::regclass and c.contype = 'f' and a.attname = 'evento_id'
    ) then
      execute format('alter table public.%I add constraint %I foreign key (evento_id) '
                     'references public.eventi(id) on delete set null not valid', t, t || '_evento_fk');
    end if;
  end loop;
end $$;

-- 3. Stato «partecipante» --------------------------------------------------
-- Se c'è un controllo sui valori di stato_socio, lo allargo.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.profili'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%stato_socio%' loop
    execute format('alter table public.profili drop constraint %I', r.conname);
  end loop;
  alter table public.profili add constraint profili_stato_socio_valori
    check (stato_socio in ('socio', 'in_attesa', 'eccezione', 'escluso', 'partecipante')) not valid;
end $$;

-- Funzioni di base ---------------------------------------------------------
create or replace function public.oggi_roma()
 returns date language sql stable as $f$
  select (now() at time zone 'Europe/Rome')::date
$f$;

-- Evento aperto: non chiuso e non ancora finito (ci si iscrive anche prima).
create or replace function public.evento_aperto(e uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from eventi where id = e and not chiuso
                 and (fine is null or public.oggi_roma() <= fine))
$f$;

create or replace function public.organizzo_evento(e uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (
    public.organizzatore_globale()
    or exists (select 1 from eventi v where v.id = e and v.tana_id is not null
               and exists (select 1 from organizzatori_tana o
                           where o.utente_id = auth.uid() and o.tana_id = v.tana_id))
    or exists (select 1 from evento_ruoli r where r.evento_id = e
               and r.utente_id = auth.uid() and r.ruolo = 'organizzatore'))
$f$;

-- Chi è solo partecipante (non socio, non organizzatore).
create or replace function public.solo_evento()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from profili where id = auth.uid() and stato_socio = 'partecipante')
     and not public.organizza_qualcosa()
$f$;

-- Gli eventi in cui ho un ruolo; con p_scrittura solo quelli aperti.
create or replace function public.ids_eventi_miei(p_scrittura boolean)
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select r.evento_id from evento_ruoli r join eventi e on e.id = r.evento_id
  where r.utente_id = auth.uid()
    and (not p_scrittura or (not e.chiuso and (e.fine is null or public.oggi_roma() <= e.fine)))
$f$;

-- Gli eventi aperti in cui posso pubblicare tavoli.
create or replace function public.ids_eventi_tavoli_miei()
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select e.id from eventi e
  where not e.chiuso and (e.fine is null or public.oggi_roma() <= e.fine)
    and (public.organizzo_evento(e.id)
         or exists (select 1 from evento_ruoli r where r.evento_id = e.id
                    and r.utente_id = auth.uid() and r.ruolo = 'dimostratore'))
$f$;

create or replace function public.ids_tavoli_eventi_miei(p_scrittura boolean)
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select t.id from tavoli t where t.evento_id in (select public.ids_eventi_miei(p_scrittura))
$f$;

create or replace function public.ids_partite_eventi_miei(p_scrittura boolean)
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select p.id from partite p where p.evento_id in (select public.ids_eventi_miei(p_scrittura))
$f$;

create or replace function public.ids_ospiti_eventi_miei()
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select pa.ospite_id from partecipazioni pa
  where pa.ospite_id is not null and pa.partita_id in (select public.ids_partite_eventi_miei(false))
  union
  select i.ospite_id from iscrizioni_tavolo i
  where i.ospite_id is not null and i.tavolo_id in (select public.ids_tavoli_eventi_miei(false))
  union
  select t.dimostratore_ospite_id from tavoli t
  where t.dimostratore_ospite_id is not null and t.evento_id in (select public.ids_eventi_miei(false))
$f$;

create or replace function public.ids_luoghi_eventi_miei()
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select e.luogo_id from eventi e
  where e.luogo_id is not null and e.id in (select public.ids_eventi_miei(false))
  union
  select t.luogo_id from tavoli t
  where t.luogo_id is not null and t.evento_id in (select public.ids_eventi_miei(false))
  union
  select p.luogo_id from partite p
  where p.luogo_id is not null and p.evento_id in (select public.ids_eventi_miei(false))
$f$;

-- Le persone dei miei eventi: ruoli, iscritti ai tavoli, giocatori,
-- chi pubblica e chi spiega.
create or replace function public.ids_persone_eventi_miei()
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select r.utente_id from evento_ruoli r where r.evento_id in (select public.ids_eventi_miei(false))
  union
  select i.utente_id from iscrizioni_tavolo i
  where i.utente_id is not null and i.tavolo_id in (select public.ids_tavoli_eventi_miei(false))
  union
  select pa.utente_id from partecipazioni pa
  where pa.utente_id is not null and pa.partita_id in (select public.ids_partite_eventi_miei(false))
  union
  select t.host_id from tavoli t
  where t.host_id is not null and t.evento_id in (select public.ids_eventi_miei(false))
  union
  select t.dimostratore_id from tavoli t
  where t.dimostratore_id is not null and t.evento_id in (select public.ids_eventi_miei(false))
$f$;

-- Ho almeno un evento aperto (per creare ospiti).
create or replace function public.ho_evento_aperto()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select public.ids_eventi_miei(true))
$f$;

-- ammesso(): come prima, più due cose. Chi è «partecipante» non entra
-- nell'app completa (nemmeno a controllo spento), e i soci di una tana
-- non attiva nemmeno. Gli organizzatori entrano sempre.
create or replace function public.ammesso()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select public.organizza_qualcosa()
      or (
        not exists (select 1 from public.profili where id = auth.uid() and stato_socio = 'partecipante')
        and (
          coalesce((select valore = 'true'::jsonb from public.impostazioni where chiave = 'controllo_soci'), false) is false
          or exists (select 1 from public.profili p
                     left join public.tane t on t.id = p.tana_id
                     where p.id = auth.uid() and p.stato_socio in ('socio', 'eccezione')
                       and coalesce(t.attiva, true))
        )
      )
$f$;

-- Chi organizza un evento gestisce anche i suoi tavoli.
create or replace function public.gestisco_tavolo(t uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (
    select 1 from tavoli where id = t
      and (host_id = auth.uid() or (evento_id is not null and public.organizzo_evento(evento_id)))
  ) or e_organizzatore();
$f$;

-- 4. Regole sui dati -------------------------------------------------------
-- Partite: socio come prima; partecipante solo quelle dei suoi eventi.
drop policy if exists "solo soci" on public.partite;
drop policy if exists "solo soci lettura" on public.partite;
drop policy if exists "solo soci creazione" on public.partite;
drop policy if exists "solo soci modifica" on public.partite;
drop policy if exists "solo soci cancellazione" on public.partite;
create policy "solo soci lettura" on public.partite as restrictive for select to authenticated
  using ((select public.ammesso()) or evento_id in (select public.ids_eventi_miei(false)));
create policy "solo soci creazione" on public.partite as restrictive for insert to authenticated
  with check ((select public.ammesso()) or evento_id in (select public.ids_eventi_miei(true)));
create policy "solo soci modifica" on public.partite as restrictive for update to authenticated
  using ((select public.ammesso()) or evento_id in (select public.ids_eventi_miei(true)))
  with check ((select public.ammesso()) or evento_id in (select public.ids_eventi_miei(true)));
create policy "solo soci cancellazione" on public.partite as restrictive for delete to authenticated
  using ((select public.ammesso()) or evento_id in (select public.ids_eventi_miei(true)));

-- Partecipazioni: quelle delle partite dei miei eventi.
drop policy if exists "solo soci" on public.partecipazioni;
drop policy if exists "solo soci lettura" on public.partecipazioni;
drop policy if exists "solo soci creazione" on public.partecipazioni;
drop policy if exists "solo soci modifica" on public.partecipazioni;
drop policy if exists "solo soci cancellazione" on public.partecipazioni;
create policy "solo soci lettura" on public.partecipazioni as restrictive for select to authenticated
  using ((select public.ammesso()) or partita_id in (select public.ids_partite_eventi_miei(false)));
create policy "solo soci creazione" on public.partecipazioni as restrictive for insert to authenticated
  with check ((select public.ammesso()) or partita_id in (select public.ids_partite_eventi_miei(true)));
create policy "solo soci modifica" on public.partecipazioni as restrictive for update to authenticated
  using ((select public.ammesso()) or partita_id in (select public.ids_partite_eventi_miei(true)))
  with check ((select public.ammesso()) or partita_id in (select public.ids_partite_eventi_miei(true)));
create policy "solo soci cancellazione" on public.partecipazioni as restrictive for delete to authenticated
  using ((select public.ammesso()) or partita_id in (select public.ids_partite_eventi_miei(true)));

-- Ospiti: quelli dei miei eventi e quelli creati da me; ne creo solo
-- con un evento aperto.
drop policy if exists "solo soci" on public.ospiti;
drop policy if exists "solo soci lettura" on public.ospiti;
drop policy if exists "solo soci creazione" on public.ospiti;
drop policy if exists "solo soci modifica" on public.ospiti;
drop policy if exists "solo soci cancellazione" on public.ospiti;
create policy "solo soci lettura" on public.ospiti as restrictive for select to authenticated
  using ((select public.ammesso()) or creato_da = (select auth.uid()) or utente_collegato = (select auth.uid())
         or id in (select public.ids_ospiti_eventi_miei()));
create policy "solo soci creazione" on public.ospiti as restrictive for insert to authenticated
  with check ((select public.ammesso()) or (creato_da = (select auth.uid()) and (select public.ho_evento_aperto())));
create policy "solo soci modifica" on public.ospiti as restrictive for update to authenticated
  using ((select public.ammesso()) or (creato_da = (select auth.uid()) and (select public.ho_evento_aperto())))
  with check ((select public.ammesso()) or (creato_da = (select auth.uid()) and (select public.ho_evento_aperto())));
create policy "solo soci cancellazione" on public.ospiti as restrictive for delete to authenticated
  using ((select public.ammesso()) or (creato_da = (select auth.uid()) and (select public.ho_evento_aperto())));

-- Luoghi: lettura di quelli dei miei eventi; scrittura solo soci.
drop policy if exists "solo soci" on public.luoghi;
drop policy if exists "solo soci lettura" on public.luoghi;
drop policy if exists "solo soci scrittura" on public.luoghi;
drop policy if exists "solo soci creazione" on public.luoghi;
drop policy if exists "solo soci modifica" on public.luoghi;
drop policy if exists "solo soci cancellazione" on public.luoghi;
create policy "solo soci lettura" on public.luoghi as restrictive for select to authenticated
  using ((select public.ammesso()) or id in (select public.ids_luoghi_eventi_miei()));
create policy "solo soci creazione" on public.luoghi as restrictive for insert to authenticated
  with check ((select public.ammesso()));
create policy "solo soci modifica" on public.luoghi as restrictive for update to authenticated
  using ((select public.ammesso())) with check ((select public.ammesso()));
create policy "solo soci cancellazione" on public.luoghi as restrictive for delete to authenticated
  using ((select public.ammesso()));

-- Profili: anche le persone dei miei eventi.
drop policy if exists "solo soci" on public.profili;
drop policy if exists "solo soci lettura" on public.profili;
drop policy if exists "solo soci scrittura" on public.profili;
drop policy if exists "solo soci creazione" on public.profili;
drop policy if exists "solo soci modifica" on public.profili;
drop policy if exists "solo soci cancellazione" on public.profili;
create policy "solo soci lettura" on public.profili as restrictive for select to authenticated
  using ((select public.ammesso()) or id = (select auth.uid()) or id in (select public.ids_persone_eventi_miei()));
create policy "solo soci creazione" on public.profili as restrictive for insert to authenticated
  with check ((select public.ammesso()) or id = (select auth.uid()));
create policy "solo soci modifica" on public.profili as restrictive for update to authenticated
  using ((select public.ammesso()) or id = (select auth.uid()))
  with check ((select public.ammesso()) or id = (select auth.uid()));
create policy "solo soci cancellazione" on public.profili as restrictive for delete to authenticated
  using ((select public.ammesso()) or id = (select auth.uid()));

-- Tavoli e iscrizioni: oggi li vede ogni account. Resta così per tutti
-- tranne chi è solo partecipante, che vede quelli dei suoi eventi.
-- I tavoli di un evento li pubblicano solo i soci, chi organizza
-- l'evento e i suoi dimostratori.
drop policy if exists "solo evento lettura" on public.tavoli;
drop policy if exists "solo evento creazione" on public.tavoli;
drop policy if exists "solo evento modifica" on public.tavoli;
drop policy if exists "solo evento cancellazione" on public.tavoli;
create policy "solo evento lettura" on public.tavoli as restrictive for select to authenticated
  using (not (select public.solo_evento()) or evento_id in (select public.ids_eventi_miei(false)));
-- Chi organizza un evento vede anche i tavoli non ancora pubblicati.
drop policy if exists "tavoli lettura evento" on public.tavoli;
create policy "tavoli lettura evento" on public.tavoli for select to authenticated
  using (evento_id is not null and public.organizzo_evento(evento_id));
create policy "solo evento creazione" on public.tavoli as restrictive for insert to authenticated
  with check ((select public.ammesso()) or evento_id in (select public.ids_eventi_tavoli_miei()));
create policy "solo evento modifica" on public.tavoli as restrictive for update to authenticated
  using ((select public.ammesso()) or evento_id in (select public.ids_eventi_tavoli_miei()))
  with check ((select public.ammesso()) or evento_id in (select public.ids_eventi_tavoli_miei()));
create policy "solo evento cancellazione" on public.tavoli as restrictive for delete to authenticated
  using ((select public.ammesso()) or evento_id in (select public.ids_eventi_tavoli_miei()));

drop policy if exists "solo evento lettura" on public.iscrizioni_tavolo;
drop policy if exists "solo evento scrittura" on public.iscrizioni_tavolo;
drop policy if exists "solo evento creazione" on public.iscrizioni_tavolo;
drop policy if exists "solo evento modifica" on public.iscrizioni_tavolo;
drop policy if exists "solo evento cancellazione" on public.iscrizioni_tavolo;
create policy "solo evento lettura" on public.iscrizioni_tavolo as restrictive for select to authenticated
  using (not (select public.solo_evento()) or tavolo_id in (select public.ids_tavoli_eventi_miei(false)));
create policy "solo evento creazione" on public.iscrizioni_tavolo as restrictive for insert to authenticated
  with check (not (select public.solo_evento()) or tavolo_id in (select public.ids_tavoli_eventi_miei(true)));
create policy "solo evento modifica" on public.iscrizioni_tavolo as restrictive for update to authenticated
  using (not (select public.solo_evento()) or tavolo_id in (select public.ids_tavoli_eventi_miei(true)))
  with check (not (select public.solo_evento()) or tavolo_id in (select public.ids_tavoli_eventi_miei(true)));
create policy "solo evento cancellazione" on public.iscrizioni_tavolo as restrictive for delete to authenticated
  using (not (select public.solo_evento()) or tavolo_id in (select public.ids_tavoli_eventi_miei(true)));

-- Regole di eventi e ruoli -------------------------------------------------
alter table public.eventi enable row level security;
alter table public.evento_ruoli enable row level security;
revoke all on public.eventi, public.evento_ruoli from anon;
grant select, insert, update, delete on public.eventi, public.evento_ruoli to authenticated;

drop policy if exists "eventi lettura" on public.eventi;
drop policy if exists "eventi creazione" on public.eventi;
drop policy if exists "eventi modifica" on public.eventi;
drop policy if exists "eventi cancellazione" on public.eventi;
create policy "eventi lettura" on public.eventi for select to authenticated
  using ((select public.ammesso()) or id in (select public.ids_eventi_miei(false)) or public.organizzo_evento(id));
-- Un evento lo crea chi organizza tutto, o chi organizza la sua tana.
create policy "eventi creazione" on public.eventi for insert to authenticated
  with check (public.organizzatore_globale() or (tana_id is not null and public.gestisce_tana(tana_id)));
create policy "eventi modifica" on public.eventi for update to authenticated
  using (public.organizzo_evento(id)) with check (public.organizzo_evento(id));
create policy "eventi cancellazione" on public.eventi for delete to authenticated
  using (public.organizzatore_globale());

-- Tana e codice dell'evento li cambia solo chi organizza tutto o la tana.
create or replace function public.proteggi_evento()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if auth.uid() is not null and not public.organizzatore_globale()
     and not (old.tana_id is not null and public.gestisce_tana(old.tana_id)) then
    new.tana_id := old.tana_id;
    new.codice := old.codice;
  end if;
  return new;
end $f$;
drop trigger if exists eventi_proteggi on public.eventi;
create trigger eventi_proteggi before update on public.eventi
  for each row execute function public.proteggi_evento();

drop policy if exists "ruoli evento lettura" on public.evento_ruoli;
drop policy if exists "ruoli evento gestione" on public.evento_ruoli;
create policy "ruoli evento lettura" on public.evento_ruoli for select to authenticated
  using (utente_id = (select auth.uid()) or (select public.ammesso()) or public.organizzo_evento(evento_id));
create policy "ruoli evento gestione" on public.evento_ruoli for all to authenticated
  using (public.organizzo_evento(evento_id)) with check (public.organizzo_evento(evento_id));

-- Organizzatori di evento li nomina solo chi organizza tutto o la tana
-- dell'evento. Chi entra in un evento e non è socio diventa partecipante.
create or replace function public.dopo_ruolo_evento()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  v_tana  int;
  v_tocca boolean;
begin
  -- Si tocca un organizzatore: nominarlo, togliergli il ruolo, toglierlo.
  v_tocca := case tg_op
    when 'INSERT' then new.ruolo = 'organizzatore'
    when 'UPDATE' then (new.ruolo = 'organizzatore' or old.ruolo = 'organizzatore')
                       and (new.ruolo is distinct from old.ruolo or new.utente_id is distinct from old.utente_id
                            or new.evento_id is distinct from old.evento_id)
    else old.ruolo = 'organizzatore' end;
  if v_tocca and auth.uid() is not null then
    select tana_id into v_tana from eventi
      where id = case when tg_op = 'DELETE' then old.evento_id else new.evento_id end;
    if not (public.organizzatore_globale() or (v_tana is not null and public.gestisce_tana(v_tana))) then
      raise exception 'Gli organizzatori di un evento li nomina e li toglie chi organizza la Tana.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    perform public.allinea_socio(new.utente_id);
    perform set_config('primo.soci_ok', '1', true);
    update profili set stato_socio = 'partecipante'
      where id = new.utente_id and stato_socio = 'in_attesa';
    perform set_config('primo.soci_ok', '', true);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
drop trigger if exists evento_ruoli_dopo on public.evento_ruoli;
create trigger evento_ruoli_dopo before insert or update or delete on public.evento_ruoli
  for each row execute function public.dopo_ruolo_evento();

-- Entrare con il link o il QR ----------------------------------------------
-- Prima dell'accesso: solo nome e date dell'evento.
create or replace function public.evento_da_codice(p_codice text)
 returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object('id', e.id, 'nome', e.nome, 'inizio', e.inizio, 'fine', e.fine,
                            'aperto', public.evento_aperto(e.id))
  from eventi e where upper(e.codice) = upper(trim(p_codice))
$f$;
revoke all on function public.evento_da_codice(text) from public;
grant execute on function public.evento_da_codice(text) to anon, authenticated;

create or replace function public.entra_evento(p_codice text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  v_evento uuid;
  v_stato  text;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  select id into v_evento from eventi where upper(codice) = upper(trim(p_codice));
  if v_evento is null then raise exception 'Codice evento non trovato.'; end if;
  if not public.evento_aperto(v_evento) then raise exception 'Questo evento è chiuso.'; end if;
  select stato_socio into v_stato from profili where id = auth.uid();
  if v_stato is null then raise exception 'Completa prima il profilo.'; end if;
  if v_stato = 'escluso' then raise exception 'Questo account non è ammesso.'; end if;
  insert into evento_ruoli (evento_id, utente_id, ruolo, aggiunto_da)
    values (v_evento, auth.uid(), 'partecipante', auth.uid())
    on conflict (evento_id, utente_id) do nothing;
  return public.evento_da_codice(p_codice)
         || jsonb_build_object('stato', (select stato_socio from profili where id = auth.uid()));
end $f$;
revoke all on function public.entra_evento(text) from public;
grant execute on function public.entra_evento(text) to authenticated;
