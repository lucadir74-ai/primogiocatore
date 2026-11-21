-- Primo Giocatore - controllo lentezza dello storico (sola lettura)
-- v1.0.0 - 202611221300
-- Lancialo MENTRE sul PC lo storico dice «Carico lo storico…».
-- Incolla tutto il risultato a Claude.

select
  now() - query_start                      as da_quanto,
  state                                    as stato,
  wait_event_type || ':' || wait_event     as aspetta,
  usename                                  as utente_db,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and state <> 'idle'
order by query_start
limit 30;
