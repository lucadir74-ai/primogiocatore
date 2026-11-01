-- Primo Giocatore - chiave esterna delle partite unica per persona
-- v1.0.0 - 202611011530
--
-- La chiave esterna («bga:123456», «bgg:…», «bgstats:…») dice da dove
-- arriva una partita importata. Era unica in tutto il database: quando
-- due iscritti hanno giocato lo stesso tavolo su BGA, il secondo che
-- importa riceveva l'errore
--   duplicate key value violates unique constraint "idx_partite_chiave_esterna"
-- e l'import si fermava.
--
-- Ognuno ha la sua copia della partita (come per BGG e BG Stats) e i
-- doppioni fra persone diverse li unisce già l'app quando conta. Quindi
-- la chiave deve essere unica per chi registra, non per tutti:
-- lo stesso tavolo una volta sola per persona.
--
-- Si lancia una volta nell'editor SQL di Supabase. Non cancella partite.

do $$
begin
  -- Il vecchio vincolo può essere un indice o un vincolo con quel nome.
  if exists (select 1 from pg_constraint where conname = 'idx_partite_chiave_esterna') then
    alter table public.partite drop constraint idx_partite_chiave_esterna;
  else
    drop index if exists public.idx_partite_chiave_esterna;
  end if;
end $$;

create unique index if not exists idx_partite_chiave_esterna
  on public.partite (registrata_da, chiave_esterna)
  where chiave_esterna is not null;

-- Controllo: deve comparire «(registrata_da, chiave_esterna)».
select indexdef from pg_indexes where indexname = 'idx_partite_chiave_esterna';
