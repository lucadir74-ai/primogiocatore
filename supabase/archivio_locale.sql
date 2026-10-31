-- Primo Giocatore - archivio salvato sul telefono: solo le novità
-- v1.0.0 - 202610311900
-- L'app conserva l'archivio partite sul telefono e a ogni apertura chiede
-- solo quello che è cambiato. Servono:
-- 1. partite.aggiornata_il: quando una partita (o qualcosa che l'app
--    mostra dentro di lei) è cambiata l'ultima volta;
-- 2. automatismi che la aggiornano: partita modificata, giocatori
--    aggiunti/tolti/cambiati, ospite rinominato o collegato a un account,
--    iscritto che cambia nome o colore, luogo rinominato;
-- 3. partite_cancellate: le partite cancellate, perché il telefono le
--    tolga (si tengono 30 giorni: l'app rilegge tutto ogni settimana);
-- 4. archivio_partite con il filtro «cambiate dopo»;
-- 5. archivio_ora e archivio_cancellate, per l'app.
-- Lanciare PRIMA di caricare i file. Si può rilanciare senza danni.

-- 1. -------------------------------------------------------------------
alter table public.partite add column if not exists aggiornata_il timestamptz not null default now();
create index if not exists partite_aggiornata on public.partite (aggiornata_il);

-- 2. -------------------------------------------------------------------
create or replace function public.archivio_partita_cambiata()
 returns trigger language plpgsql set search_path to 'public'
as $f$
begin
  new.aggiornata_il := now();
  return new;
end $f$;
drop trigger if exists partite_archivio_cambiata on public.partite;
create trigger partite_archivio_cambiata before update on public.partite
  for each row execute function public.archivio_partita_cambiata();

-- Giocatori: un solo aggiornamento per comando (gli import ne scrivono
-- centinaia insieme).
create or replace function public.archivio_tocca_da_partecipazioni()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update partite set aggiornata_il = now() where id in (select distinct partita_id from nuove);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update partite set aggiornata_il = now() where id in (select distinct partita_id from vecchie);
  end if;
  return null;
end $f$;
drop trigger if exists partecipazioni_archivio_ins on public.partecipazioni;
drop trigger if exists partecipazioni_archivio_upd on public.partecipazioni;
drop trigger if exists partecipazioni_archivio_del on public.partecipazioni;
create trigger partecipazioni_archivio_ins after insert on public.partecipazioni
  referencing new table as nuove for each statement execute function public.archivio_tocca_da_partecipazioni();
create trigger partecipazioni_archivio_upd after update on public.partecipazioni
  referencing new table as nuove old table as vecchie for each statement execute function public.archivio_tocca_da_partecipazioni();
create trigger partecipazioni_archivio_del after delete on public.partecipazioni
  referencing old table as vecchie for each statement execute function public.archivio_tocca_da_partecipazioni();

-- Ospite rinominato o collegato a un account.
create or replace function public.archivio_tocca_da_ospite()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  update partite set aggiornata_il = now()
   where id in (select partita_id from partecipazioni where ospite_id = new.id);
  return null;
end $f$;
drop trigger if exists ospiti_archivio on public.ospiti;
create trigger ospiti_archivio after update on public.ospiti
  for each row when (old.nome is distinct from new.nome or old.utente_collegato is distinct from new.utente_collegato)
  execute function public.archivio_tocca_da_ospite();

-- Iscritto che cambia nome, soprannome o colore.
create or replace function public.archivio_tocca_da_profilo()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  update partite set aggiornata_il = now()
   where id in (select partita_id from partecipazioni where utente_id = new.id);
  return null;
end $f$;
drop trigger if exists profili_archivio on public.profili;
create trigger profili_archivio after update on public.profili
  for each row when (old.nome is distinct from new.nome or old.nickname is distinct from new.nickname
                     or old.colore is distinct from new.colore)
  execute function public.archivio_tocca_da_profilo();

-- Luogo rinominato.
create or replace function public.archivio_tocca_da_luogo()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  update partite set aggiornata_il = now() where luogo_id = new.id;
  return null;
end $f$;
drop trigger if exists luoghi_archivio on public.luoghi;
create trigger luoghi_archivio after update on public.luoghi
  for each row when (old.nome is distinct from new.nome or old.tipo is distinct from new.tipo)
  execute function public.archivio_tocca_da_luogo();

-- 3. -------------------------------------------------------------------
create table if not exists public.partite_cancellate (
  id uuid primary key,
  cancellata_il timestamptz not null default now()
);
alter table public.partite_cancellate enable row level security;
-- Nessuna regola: si legge solo con archivio_cancellate.

create or replace function public.archivio_segna_cancellate()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  insert into partite_cancellate (id) select id from vecchie
    on conflict (id) do update set cancellata_il = now();
  delete from partite_cancellate where cancellata_il < now() - interval '30 days';
  return null;
end $f$;
drop trigger if exists partite_archivio_cancellate on public.partite;
create trigger partite_archivio_cancellate after delete on public.partite
  referencing old table as vecchie for each statement execute function public.archivio_segna_cancellate();

-- 4. -------------------------------------------------------------------
drop function if exists public.archivio_partite(uuid, uuid, uuid, int);
create or replace function public.archivio_partite(
  p_da uuid default null,          -- da questo id (incluso)
  p_a uuid default null,           -- fino a questo id (escluso)
  p_dopo uuid default null,        -- dopo questo id (escluso): la pagina successiva
  p_limite int default 1000,
  p_dal timestamptz default null   -- solo le partite cambiate dopo questo momento
) returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
with io as materialized (
  select auth.uid() as uid,
         public.ammesso() as ammesso,
         public.e_organizzatore() or public.e_dimostratore() as vede_dimostratori
),
visibili as materialized (
  select p.id from partite p, io where p.registrata_da = io.uid
  union
  select pt.partita_id from partecipazioni pt, io where pt.utente_id = io.uid
  union
  select p.id from partite p join membri_gruppo m on m.gruppo_id = p.gruppo_id, io
   where m.utente_id = io.uid
),
in_comune as materialized (
  select distinct id from public.ids_ospiti_in_comune() as id
),
pagina as (
  select * from (
    -- Tutto l'archivio: si parte dall'elenco delle partite visibili.
    select p.* from partite p, io
    where p_dal is null and io.uid is not null and io.ammesso
      and p.id in (select id from visibili)
      and (p_da is null or p.id >= p_da)
      and (p_a is null or p.id < p_a)
      and (p_dopo is null or p.id > p_dopo)
    union all
    -- Solo le novità: si parte dalle partite cambiate (poche) e si
    -- controlla per ognuna se è visibile, con le stesse tre ragioni.
    select p.* from partite p, io
    where p_dal is not null and io.uid is not null and io.ammesso
      and p.aggiornata_il > p_dal
      and (p_da is null or p.id >= p_da)
      and (p_a is null or p.id < p_a)
      and (p_dopo is null or p.id > p_dopo)
      and (p.registrata_da = io.uid
           or exists (select 1 from partecipazioni x where x.partita_id = p.id and x.utente_id = io.uid)
           or (p.gruppo_id is not null
               and exists (select 1 from membri_gruppo m where m.gruppo_id = p.gruppo_id and m.utente_id = io.uid)))
  ) u
  order by u.id
  limit greatest(1, least(coalesce(p_limite, 1000), 2000))
)
select coalesce(jsonb_agg(
  jsonb_build_object(
    'id', p.id, 'giocata_il', p.giocata_il, 'durata_minuti', p.durata_minuti, 'note', p.note,
    'tipo_punteggio', p.tipo_punteggio, 'esito_coop', p.esito_coop, 'registrata_da', p.registrata_da,
    'giochi', (select jsonb_build_object('id', g.id, 'nome', g.nome, 'immagine_url', g.immagine_url)
                 from giochi g where g.id = p.gioco_id),
    'luoghi', (select jsonb_build_object('id', l.id, 'nome', l.nome, 'tipo', l.tipo)
                 from luoghi l where l.id = p.luogo_id),
    'partecipazioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'utente_id', pt.utente_id, 'ospite_id', pt.ospite_id,
        'punteggio_totale', pt.punteggio_totale, 'posizione', pt.posizione, 'vincitore', pt.vincitore,
        'spareggio', pt.spareggio, 'ruolo', pt.ruolo, 'ordine_turno', pt.ordine_turno,
        'profili', (select jsonb_build_object('nome', pr.nome, 'nickname', pr.nickname, 'colore', pr.colore)
                      from profili pr where pr.id = pt.utente_id),
        'ospiti', (select jsonb_build_object('nome', o.nome, 'utente_collegato', o.utente_collegato)
                     from ospiti o
                    where o.id = pt.ospite_id
                      and (o.creato_da = io.uid or o.utente_collegato = io.uid
                           or o.id in (select id from in_comune)
                           or (o.dimostratore and io.vede_dimostratori)
                           or (o.creato_da is null and o.utente_collegato is null and o.nome = 'Ex giocatore')))
      ) order by pt.id)
      from partecipazioni pt
      where pt.partita_id = p.id
        and (p.registrata_da = io.uid or pt.utente_id = io.uid
             or exists (select 1 from partecipazioni x where x.partita_id = p.id and x.utente_id = io.uid))
    ), '[]'::jsonb)
  ) order by p.id), '[]'::jsonb)
from pagina p, io;
$function$;
revoke all on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) from public, anon;
grant execute on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) to authenticated;

-- 5. -------------------------------------------------------------------
create or replace function public.archivio_ora()
 returns timestamptz language sql stable as $f$ select now() $f$;
grant execute on function public.archivio_ora() to authenticated;

create or replace function public.archivio_cancellate(p_dal timestamptz)
 returns setof uuid language sql stable security definer set search_path to 'public'
as $f$ select id from partite_cancellate where cancellata_il > p_dal and auth.uid() is not null $f$;
revoke all on function public.archivio_cancellate(timestamptz) from public, anon;
grant execute on function public.archivio_cancellate(timestamptz) to authenticated;
