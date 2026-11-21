-- Primo Giocatore - controllo: la casella del nome si è salvata? (sola lettura)
-- v1.0.0 - 202611221200
-- Incolla il risultato a Claude.

select
  p.nickname,
  p.mostra_nome                                       as casella_salvata,
  p.nome is not null                                  as nome_visibile_agli_altri,
  (select count(*) from partecipazioni pa where pa.utente_id = p.id)  as mie_partite,
  (select max(pt.aggiornata_il) from partite pt
     join partecipazioni pa on pa.partita_id = pt.id
    where pa.utente_id = p.id)                         as ultima_partita_toccata,
  (select setting from pg_settings where name = 'statement_timeout') as tempo_massimo_sql,
  (select rolconfig::text from pg_roles where rolname = 'authenticated') as impostazioni_utenti
from profili p
where lower(p.nickname) = 'lucadir';
