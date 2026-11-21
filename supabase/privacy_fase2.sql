-- Primo Giocatore - privacy, fase 2: registro delle operazioni
-- v1.0.0 - 202611211900
-- Va eseguito DOPO privacy_fase1.sql. Si può rilanciare senza danni.
--
-- Enrico chiede un registro delle operazioni principali degli
-- amministratori, soprattutto caricamento e consultazione dell'elenco
-- soci. Qui:
-- - la tabella registro_operazioni: la scrive solo il database (nessuno
--   può aggiungere, cambiare o cancellare righe dall'app), la legge solo
--   l'amministratore dell'app;
-- - elenco soci: aggiunte, aggiornamenti e rimozioni si segnano da sole,
--   una riga per operazione (un CSV di 300 righe = una riga sola);
-- - consultazione: l'elenco si legge con elenco_soci(), che lo segna
--   (al massimo una volta ogni 10 minuti per persona, sennò ogni
--   ricarica della pagina farebbe una riga); l'apertura della scheda di
--   un socio si segna con segna_scheda_socio();
-- - controllo soci acceso/spento, organizzatori di Tana, ruoli
--   (organizzatore, dimostratore, amministratore), decisioni sugli
--   account «non nell'elenco».

-- 1. La tabella ----------------------------------------------------------------
create table if not exists public.registro_operazioni (
  id         bigint generated always as identity primary key,
  quando     timestamptz not null default now(),
  chi        uuid references public.profili(id) on delete set null,
  azione     text not null,
  dettaglio  text
);
create index if not exists registro_operazioni_quando on public.registro_operazioni (quando desc);

alter table public.registro_operazioni enable row level security;
drop policy if exists "registro: lo legge l'amministratore" on public.registro_operazioni;
create policy "registro: lo legge l'amministratore" on public.registro_operazioni
  for select to authenticated using (public.organizzatore_globale());
revoke insert, update, delete on public.registro_operazioni from anon, authenticated;
grant select on public.registro_operazioni to authenticated;

create or replace function public.registra(p_azione text, p_dettaglio text default null)
 returns void language sql security definer set search_path to 'public' as $f$
  insert into public.registro_operazioni (chi, azione, dettaglio) values (auth.uid(), p_azione, p_dettaglio);
$f$;
revoke all on function public.registra(text, text) from public, anon, authenticated;

-- Nome breve di un socio per il registro: nick, altrimenti nome e cognome.
create or replace function public.socio_in_breve(p_nick text, p_nome text, p_cognome text, p_email text)
 returns text language sql immutable as $f$
  select coalesce(nullif(trim(p_nick), ''), nullif(trim(concat_ws(' ', p_nome, p_cognome)), ''), p_email)
$f$;

-- 2. Elenco soci: aggiunte, aggiornamenti, rimozioni ------------------------
create or replace function public.registro_soci()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  n int;
  nomi text;
  tana text;
begin
  if tg_op = 'DELETE' then
    select count(*), string_agg(socio_in_breve(v.nickname, v.nome, v.cognome, v.email), ', ' order by v.nickname),
           string_agg(distinct t.nome, ', ')
      into n, nomi, tana from vecchie v left join tane t on t.id = v.tana_id;
  else
    select count(*), string_agg(socio_in_breve(v.nickname, v.nome, v.cognome, v.email), ', ' order by v.nickname),
           string_agg(distinct t.nome, ', ')
      into n, nomi, tana from nuove v left join tane t on t.id = v.tana_id;
  end if;
  if n = 0 then return null; end if;
  perform registra(
    case tg_op when 'INSERT' then 'soci aggiunti' when 'UPDATE' then 'soci aggiornati' else 'soci tolti' end,
    n || case when n = 1 then ' socio' else ' soci' end
      || coalesce(' · ' || tana, '')
      || case when n <= 5 then ': ' || nomi else '' end);
  return null;
end $f$;

drop trigger if exists registro_soci_aggiunti on public.soci;
create trigger registro_soci_aggiunti after insert on public.soci
  referencing new table as nuove for each statement execute function public.registro_soci();
drop trigger if exists registro_soci_aggiornati on public.soci;
create trigger registro_soci_aggiornati after update on public.soci
  referencing new table as nuove for each statement execute function public.registro_soci();
drop trigger if exists registro_soci_tolti on public.soci;
create trigger registro_soci_tolti after delete on public.soci
  referencing old table as vecchie for each statement execute function public.registro_soci();

-- 3. Consultazione --------------------------------------------------------------
create or replace function public.elenco_soci()
 returns setof public.soci language plpgsql security definer set search_path to 'public' as $f$
declare
  n int;
begin
  if not public.e_organizzatore() then
    raise exception 'L''elenco soci lo vedono solo gli organizzatori della Tana.';
  end if;
  select count(*) into n from soci s
   where public.organizzatore_globale()
      or s.tana_id in (select tana_id from organizzatori_tana where utente_id = auth.uid());
  if not exists (select 1 from registro_operazioni
                  where chi = auth.uid() and azione = 'elenco soci consultato'
                    and quando > now() - interval '10 minutes') then
    perform registra('elenco soci consultato', n || ' soci visibili');
  end if;
  return query
    select s.* from soci s
     where public.organizzatore_globale()
        or s.tana_id in (select tana_id from organizzatori_tana where utente_id = auth.uid())
     order by s.aggiunto_il desc;
end $f$;
revoke all on function public.elenco_soci() from public, anon;
grant execute on function public.elenco_soci() to authenticated;

create or replace function public.segna_scheda_socio(p_socio public.soci.id%type)
 returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  s soci;
begin
  if not public.e_organizzatore() then return; end if;
  select * into s from soci where id = p_socio;
  if found then
    perform registra('scheda socio aperta', socio_in_breve(s.nickname, s.nome, s.cognome, s.email));
  end if;
end $f$;
revoke all on function public.segna_scheda_socio(public.soci.id%type) from public, anon;
grant execute on function public.segna_scheda_socio(public.soci.id%type) to authenticated;

-- 4. Controllo soci, organizzatori di Tana, ruoli, decisioni ---------------
create or replace function public.registro_impostazioni()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.chiave = 'controllo_soci' and (tg_op = 'INSERT' or new.valore is distinct from old.valore) then
    perform registra('controllo soci', case when new.valore::text = 'true' then 'acceso' else 'spento' end);
  end if;
  return null;
end $f$;
drop trigger if exists registro_impostazioni on public.impostazioni;
create trigger registro_impostazioni after insert or update on public.impostazioni
  for each row execute function public.registro_impostazioni();

create or replace function public.registro_organizzatori_tana()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform registra(
    case when tg_op = 'DELETE' then 'organizzatore di Tana tolto' else 'organizzatore di Tana nominato' end,
    coalesce((select coalesce(nickname, nome) from profili where id = r.utente_id), 'account')
      || ' · ' || coalesce((select nome from tane where id = r.tana_id), 'Tana'));
  return null;
end $f$;
drop trigger if exists registro_organizzatori_tana on public.organizzatori_tana;
create trigger registro_organizzatori_tana after insert or delete on public.organizzatori_tana
  for each row execute function public.registro_organizzatori_tana();

-- Ruoli: sempre. Stato socio: solo quando lo cambia qualcuno a mano
-- («è socio», «lascia entrare», «non ammettere»…), non quando cambia da
-- solo perché un CSV ha aggiunto o tolto soci (quello è già segnato sopra).
create or replace function public.registro_profili()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  chi text := coalesce(nullif(trim(new.nickname), ''), new.nome, 'account');
  cambi text[] := '{}';
begin
  if new.amministratore is distinct from old.amministratore then
    cambi := cambi || (case when new.amministratore then 'diventa amministratore' else 'non è più amministratore' end);
  end if;
  if new.organizzatore is distinct from old.organizzatore then
    cambi := cambi || (case when new.organizzatore then 'diventa organizzatore' else 'non è più organizzatore' end);
  end if;
  if new.dimostratore is distinct from old.dimostratore then
    cambi := cambi || (case when new.dimostratore then 'diventa dimostratore' else 'non è più dimostratore' end);
  end if;
  if array_length(cambi, 1) > 0 then
    perform registra('ruoli cambiati', chi || ': ' || array_to_string(cambi, ', '));
  end if;
  if new.stato_socio is distinct from old.stato_socio
     and auth.uid() is not null and auth.uid() <> new.id and pg_trigger_depth() = 1 then
    perform registra('stato account deciso', chi || ': ' || coalesce(old.stato_socio, '—') || ' → ' || coalesce(new.stato_socio, '—'));
  end if;
  return null;
end $f$;
drop trigger if exists registro_profili on public.profili;
create trigger registro_profili after update of amministratore, organizzatore, dimostratore, stato_socio on public.profili
  for each row execute function public.registro_profili();

-- Controllo: devono essere tutti «sì».
select
  (case when to_regclass('public.registro_operazioni') is not null then 'sì' else 'no' end) as tabella,
  (select case when count(*) = 3 then 'sì' else 'no (' || count(*) || ')' end from pg_trigger
     where tgrelid = 'public.soci'::regclass and tgname like 'registro_soci_%') as trigger_soci,
  (case when exists (select 1 from pg_proc where proname = 'elenco_soci') then 'sì' else 'no' end) as elenco_soci,
  (case when exists (select 1 from pg_trigger where tgname = 'registro_profili') then 'sì' else 'no' end) as trigger_ruoli;
