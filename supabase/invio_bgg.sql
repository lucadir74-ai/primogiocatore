-- Primo Giocatore - invio delle partite a BoardGameGeek
-- v1.0.0 - 202610252330
-- Si può rilanciare senza danni. Va lanciato PRIMA di caricare il codice
-- nuovo: senza queste colonne l'invio non parte (il resto dell'app
-- funziona comunque).
--
-- Cosa aggiunge:
-- 1. Su ogni partita: quando è stata creata, il numero che BGG le ha dato,
--    quando è stata inviata e l'eventuale errore.
-- 2. bgg_sessioni: il collegamento a BGG di ogni iscritto (sessione
--    cifrata, mai la password). La legge solo il server.
-- 3. bgg_da_eliminare: le partite cancellate qui che vanno tolte anche da
--    BGG, altrimenti la sincronizzazione da BGG le farebbe rientrare.
-- 4. Automatismi: una partita già inviata e poi modificata (o con i
--    giocatori cambiati) torna «da inviare», e BGG riceve la correzione.
-- 5. bgg_da_inviare(): l'elenco delle partite da mandare, per il server.

-- 1. Colonne sulle partite ------------------------------------------------
-- Le partite già presenti prendono come data di creazione l'istante in cui
-- si lancia lo script: vengono prima di qualunque collegamento, quindi
-- nessuna partita vecchia parte verso BGG.
alter table public.partite add column if not exists creata_il timestamptz default now();
alter table public.partite add column if not exists bgg_play_id bigint;
alter table public.partite add column if not exists bgg_inviata_il timestamptz;
alter table public.partite add column if not exists bgg_errore text;
create index if not exists partite_bgg_play on public.partite (registrata_da, bgg_play_id)
  where bgg_play_id is not null;
create index if not exists partite_bgg_attesa on public.partite (registrata_da, creata_il)
  where bgg_inviata_il is null;

-- 2. Collegamenti BGG -----------------------------------------------------
create table if not exists public.bgg_sessioni (
  utente_id      uuid primary key references public.profili(id) on delete cascade,
  bgg_username   text not null,
  cookie_cifrati text not null,
  collegata_il   timestamptz not null default now(),
  invia_bga      boolean not null default false,
  invia_bga_dal  timestamptz,
  ultimo_invio   timestamptz,
  ultimo_errore  text
);
-- Nessuna regola di accesso: dall'app non si legge, solo dal server.
alter table public.bgg_sessioni enable row level security;

-- 3. Partite da togliere da BGG -------------------------------------------
create table if not exists public.bgg_da_eliminare (
  bgg_play_id bigint primary key,
  utente_id   uuid not null references public.profili(id) on delete cascade,
  creato_il   timestamptz not null default now()
);
alter table public.bgg_da_eliminare enable row level security;
drop policy if exists "bgg_da_eliminare lettura" on public.bgg_da_eliminare;
create policy "bgg_da_eliminare lettura" on public.bgg_da_eliminare
  for select to authenticated using (utente_id = auth.uid());

-- 4. Automatismi ------------------------------------------------------------
create or replace function public.bgg_segna_modifica()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  -- Le scritture del server (numero BGG, data di invio, errore) non
  -- contano come modifiche.
  if new.bgg_inviata_il is not distinct from old.bgg_inviata_il
     and new.bgg_play_id is not distinct from old.bgg_play_id
     and (new.gioco_id is distinct from old.gioco_id
          or new.giocata_il is distinct from old.giocata_il
          or new.durata_minuti is distinct from old.durata_minuti
          or new.luogo_id is distinct from old.luogo_id
          or new.note is distinct from old.note
          or new.esito_coop is distinct from old.esito_coop) then
    new.bgg_errore := null;                       -- si ritenta
    if old.bgg_play_id is not null then
      new.bgg_inviata_il := null;                 -- BGG riceve la correzione
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists partite_bgg_modifica on public.partite;
create trigger partite_bgg_modifica before update on public.partite
  for each row execute function public.bgg_segna_modifica();

create or replace function public.bgg_segna_giocatori()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  p uuid;
begin
  if tg_op = 'DELETE' then p := old.partita_id; else p := new.partita_id; end if;
  update partite
     set bgg_inviata_il = case when bgg_play_id is not null then null else bgg_inviata_il end,
         bgg_errore = null
   where id = p
     and ((bgg_play_id is not null and bgg_inviata_il is not null) or bgg_errore is not null);
  return null;
end $function$;
drop trigger if exists partecipazioni_bgg on public.partecipazioni;
create trigger partecipazioni_bgg after insert or update or delete on public.partecipazioni
  for each row execute function public.bgg_segna_giocatori();

create or replace function public.bgg_segna_eliminazione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if old.bgg_play_id is not null and old.registrata_da is not null then
    insert into bgg_da_eliminare (bgg_play_id, utente_id)
    values (old.bgg_play_id, old.registrata_da)
    on conflict (bgg_play_id) do nothing;
  end if;
  return old;
end $function$;
drop trigger if exists partite_bgg_eliminazione on public.partite;
create trigger partite_bgg_eliminazione before delete on public.partite
  for each row execute function public.bgg_segna_eliminazione();

-- 5. Partite da inviare -----------------------------------------------------
-- Le correzioni di partite già inviate, più le partite create dopo il
-- collegamento: registrate qui, oppure importate da BGA se l'iscritto
-- l'ha chiesto. Mai quelle arrivate da BGG o da BG Stats.
create or replace function public.bgg_da_inviare(p_utente uuid, p_limite int default 30)
 returns setof uuid language sql stable security definer set search_path to 'public'
as $function$
  select p.id
  from partite p
  join bgg_sessioni s on s.utente_id = p.registrata_da
  where p.registrata_da = p_utente
    and p.bgg_inviata_il is null
    and p.bgg_errore is null
    and (p.bgg_play_id is not null
         or (p.creata_il > s.collegata_il
             and (p.chiave_esterna is null
                  or (s.invia_bga and p.chiave_esterna like 'bga:%'
                      and p.creata_il > coalesce(s.invia_bga_dal, 'infinity'::timestamptz)))))
  order by p.giocata_il
  limit p_limite
$function$;
revoke execute on function public.bgg_da_inviare(uuid, int) from public, anon, authenticated;
