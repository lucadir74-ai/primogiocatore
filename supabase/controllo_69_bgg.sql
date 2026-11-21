-- Primo Giocatore - controllo delle 69 partite arrivate da BGG (sola lettura)
-- v1.4.0 - 202611221600 (confronto di giocatori e punteggi con la gemella da BG Stats)
--
-- Per ogni partita nuova cerca, lo stesso giorno e per lo stesso gioco, una
-- partita da BG Stats con gli stessi punteggi (doppione sicuro) o almeno con
-- lo stesso numero di giocatori. Conta anche quante partite ci sono quel
-- giorno da una parte e dall'altra. Incolla il risultato a Claude.

with io as (select id from profili where lower(nickname) = 'lucadir'),
nuove as (
  select pt.id, pt.giocata_il::date as giorno, pt.gioco_id
    from partite pt, io
   where pt.registrata_da = io.id and pt.chiave_esterna like 'bgg:%'
     and pt.creata_il > now() - interval '48 hours'
),
firma as (   -- numero di giocatori e punteggi in ordine, per ogni partita
  select pa.partita_id,
         count(*) as quanti,
         string_agg(coalesce(pa.punteggio_totale::text, '-'), ',' order by pa.punteggio_totale) as punti
    from partecipazioni pa
   group by pa.partita_id
),
bgstats as (
  select v.id, v.giocata_il::date as giorno, v.gioco_id
    from partite v, io
   where v.registrata_da = io.id and v.chiave_esterna like 'bgstats:%'
),
confronto as (
  select n.id,
    exists (select 1 from bgstats b join firma fb on fb.partita_id = b.id join firma fn on fn.partita_id = n.id
             where b.gioco_id = n.gioco_id and b.giorno = n.giorno
               and fb.quanti = fn.quanti and fb.punti = fn.punti)                       as stessi_punti,
    exists (select 1 from bgstats b join firma fb on fb.partita_id = b.id join firma fn on fn.partita_id = n.id
             where b.gioco_id = n.gioco_id and b.giorno = n.giorno and fb.quanti = fn.quanti) as stessi_giocatori,
    (select count(*) from nuove x where x.gioco_id = n.gioco_id and x.giorno = n.giorno)    as nuove_quel_giorno,
    (select count(*) from bgstats b where b.gioco_id = n.gioco_id and b.giorno = n.giorno)  as bgstats_quel_giorno
  from nuove n
)
select
  count(*)                                                          as nuove,
  count(*) filter (where stessi_punti)                              as doppione_sicuro_stessi_punteggi,
  count(*) filter (where not stessi_punti and stessi_giocatori)     as stessi_giocatori_punteggi_diversi,
  count(*) filter (where not stessi_giocatori)                      as numero_giocatori_diverso,
  count(*) filter (where nuove_quel_giorno > bgstats_quel_giorno)   as piu_partite_su_bgg_che_su_bgstats
from confronto;
