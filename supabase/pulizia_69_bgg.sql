-- Primo Giocatore - pulizia delle 69 partite doppie arrivate da BGG il 22/11/2026
-- v1.0.0 - 202611221530
--
-- Il 22/11 il browser integrato (dispositivo nuovo) ha riletto tutto
-- l'archivio BGG di lucadir e importato 69 partite che c'erano già,
-- arrivate a suo tempo da BG Stats (stesso gioco, stesso giorno).
-- Qui si cancellano solo quelle: partite di lucadir con chiave 'bgg:',
-- create nelle ultime 48 ore, che hanno una gemella da BG Stats creata prima.
--
-- Sicurezza:
-- - se non sono esattamente 69 si ferma senza toccare niente;
-- - prima si toglie l'eventuale numero di partita BGG (bgg_play_id), così
--   l'automatismo «cancellata qui → cancella anche su BGG» non parte:
--   su BGG non cambia niente;
-- - cancellandole, l'app se le segna come scartate (bgg_scartate): non
--   rientrano alla prossima lettura di BGG.

do $$
declare
  io uuid;
  ids uuid[];
  n_partecipazioni int;
  n_partite int;
begin
  select id into io from profili where lower(nickname) = 'lucadir';

  select array_agg(n.id) into ids
    from partite n
   where n.registrata_da = io
     and n.chiave_esterna like 'bgg:%'
     and n.creata_il > now() - interval '48 hours'
     and exists (select 1 from partite v
                  where v.registrata_da = io and v.id <> n.id
                    and v.gioco_id = n.gioco_id
                    and v.giocata_il::date = n.giocata_il::date
                    and v.chiave_esterna like 'bgstats:%'
                    and v.creata_il <= now() - interval '48 hours');

  if coalesce(array_length(ids, 1), 0) <> 69 then
    raise exception 'Mi aspettavo 69 partite doppie, ne trovo %: non tocco niente.', coalesce(array_length(ids, 1), 0);
  end if;

  update partite set bgg_play_id = null where id = any(ids) and bgg_play_id is not null;
  delete from partecipazioni where partita_id = any(ids);
  get diagnostics n_partecipazioni = row_count;
  delete from partite where id = any(ids);
  get diagnostics n_partite = row_count;

  raise notice 'Cancellate % partite doppie e % righe di giocatori.', n_partite, n_partecipazioni;
end $$;

-- Controllo: 0 doppie rimaste, 69 segnate come scartate, 0 in coda per BGG.
with io as (select id from profili where lower(nickname) = 'lucadir')
select
  (select count(*) from partite n, io
    where n.registrata_da = io.id and n.chiave_esterna like 'bgg:%'
      and n.creata_il > now() - interval '48 hours')                        as doppie_rimaste,
  (select count(*) from bgg_scartate s, io
    where s.utente_id = io.id and s.scartata_il > now() - interval '1 hour') as segnate_come_scartate,
  (select count(*) from bgg_da_eliminare d, io where d.utente_id = io.id)   as in_coda_per_cancellare_su_bgg;
