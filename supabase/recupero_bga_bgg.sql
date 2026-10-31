-- Primo Giocatore - recupero una tantum delle partite BGA verso BGG
-- v1.0.0 - 202610311100
-- L'invio BGA parte solo per le partite importate DOPO aver acceso
-- l'opzione: quelle già in PG restano ferme. Qui si rimettono in coda
-- solo le partite BGA giocate dal 16/10/2026 in poi (fino al 15/10 su
-- BGG ci sono già, arrivate da BG Stats). creata_il serve solo all'invio
-- verso BGG: spostarlo non cambia nient'altro nell'app.

-- PASSO 1 - ANTEPRIMA (non modifica nulla): l'elenco delle partite BGA
-- dal 15/10 in poi. Il 15/10 è incluso solo per controllo.
select (p.giocata_il at time zone 'Europe/Rome')::date as giorno,
       g.nome as gioco, p.chiave_esterna, p.bgg_play_id, p.bgg_errore
from partite p
join bgg_sessioni s on s.utente_id = p.registrata_da
left join giochi g on g.id = p.gioco_id
where s.bgg_username ilike 'Seldon74'
  and p.chiave_esterna like 'bga:%'
  and (p.giocata_il at time zone 'Europe/Rome')::date >= date '2026-10-15'
order by p.giocata_il;

-- PASSO 2 - RECUPERO: lancialo da solo, dopo aver controllato l'anteprima.
-- Rimette in coda le partite BGA dal 16/10 non ancora inviate.
update partite p
   set creata_il = now()
  from bgg_sessioni s
 where s.utente_id = p.registrata_da
   and s.bgg_username ilike 'Seldon74'
   and s.invia_bga
   and p.chiave_esterna like 'bga:%'
   and p.bgg_play_id is null
   and p.bgg_inviata_il is null
   and (p.giocata_il at time zone 'Europe/Rome')::date >= date '2026-10-16';
