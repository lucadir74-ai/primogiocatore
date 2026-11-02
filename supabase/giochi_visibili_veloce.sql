-- Primo Giocatore - giochi visibili: calcolo veloce
-- v1.0.0 - 202611021800
-- La regola «giochi lettura» chiama ids_giochi_visibili() a ogni lettura
-- di giochi (collezione, Giochi, Partita, Profilo...). Misurata: 2 secondi
-- su 2,08 della lettura della collezione. Qui:
-- 1. «chi sono» e «sono organizzatore» si calcolano una volta sola;
-- 2. ogni pezzo parte dalla tabella più piccola e usa un indice;
-- 3. gli indici che mancavano.
-- Stessi giochi visibili di prima. Si può rilanciare senza danni.

-- 1. Indici ------------------------------------------------------------------
create index if not exists giochi_creato_da           on public.giochi (creato_da);
create index if not exists collezioni_utente          on public.collezioni (utente_id);
create index if not exists partite_gruppo             on public.partite (gruppo_id) where gruppo_id is not null;
create index if not exists membri_gruppo_utente       on public.membri_gruppo (utente_id);
create index if not exists iscrizioni_tavolo_utente   on public.iscrizioni_tavolo (utente_id);
create index if not exists tavoli_pubblicati_gioco    on public.tavoli (gioco_id) where pubblicato and gioco_id is not null;

-- 2. La funzione -------------------------------------------------------------
create or replace function public.ids_giochi_visibili()
 returns setof uuid
 language plpgsql stable security definer
 set search_path to 'public'
as $f$
declare
  v_io  uuid := auth.uid();
  v_org boolean := coalesce(e_organizzatore(), false);
begin
  -- Tavoli pubblicati: li vedono tutti.
  return query
  select t.gioco_id from tavoli t where t.pubblicato and t.gioco_id is not null
  union
  select g.id from giochi g where v_io is not null and g.creato_da = v_io
  union
  select c.gioco_id from collezioni c where v_io is not null and c.utente_id = v_io
  union
  select p.gioco_id from partite p where v_io is not null and p.registrata_da = v_io
  union
  -- Partite giocate: si parte dalle mie partecipazioni (poche), non dalle partite.
  select p.gioco_id
  from partecipazioni pt join partite p on p.id = pt.partita_id
  where v_io is not null and pt.utente_id = v_io
  union
  select p.gioco_id
  from membri_gruppo m join partite p on p.gruppo_id = m.gruppo_id
  where v_io is not null and m.utente_id = v_io
  union
  -- Gli altri tavoli: tutti per chi organizza, altrimenti i miei.
  select t.gioco_id from tavoli t
  where v_io is not null and t.gioco_id is not null
    and (v_org
         or t.host_id = v_io
         or t.dimostratore_id = v_io
         or exists (select 1 from iscrizioni_tavolo i
                    where i.tavolo_id = t.id and i.utente_id = v_io));
end $f$;

-- 3. Statistiche aggiornate per le tabelle toccate dalle unioni di oggi -----
analyze public.partite;
analyze public.partecipazioni;
analyze public.giochi;
analyze public.collezioni;
analyze public.tavoli;

select 'installato' as esito;
