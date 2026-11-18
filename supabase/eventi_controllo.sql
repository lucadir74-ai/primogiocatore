-- Primo Giocatore - controllo generale degli eventi
-- v1.0.0 - 202611182300
-- SOLO LETTURA: non cambia niente. Una riga per ogni pezzo degli script
-- degli eventi: OK se c'è ed è la versione giusta, MANCA se no.

with controlli(pezzo, ok) as (values
  ('fase 1: tabella eventi_ruoli',            to_regclass('public.evento_ruoli') is not null),
  ('fase 1: tane attive',                     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tane' and column_name = 'attiva')),
  ('fase 1: ammesso() esclude i partecipanti', exists (select 1 from pg_proc where proname = 'ammesso' and prosrc ilike '%partecipante%')),
  ('fase 1: entra_evento',                    exists (select 1 from pg_proc where proname = 'entra_evento')),
  ('fase 1: regole solo soci su partite',     exists (select 1 from pg_policies where tablename = 'partite' and policyname = 'solo soci lettura')),
  ('fase 1: vecchia regola «solo soci» tolta', not exists (select 1 from pg_policies where policyname = 'solo soci' and tablename in ('partite','partecipazioni','ospiti','luoghi','profili'))),
  ('fase 1b: i partecipanti pubblicano tavoli', exists (select 1 from pg_proc where proname = 'ids_eventi_tavoli_miei' and prosrc not ilike '%dimostratore%')),
  ('fase 3: salva_partita conosce l''evento', exists (select 1 from pg_proc where proname = 'salva_partita' and prosrc ilike '%evento_id%')),
  ('fase 5: classifica_evento',               exists (select 1 from pg_proc where proname = 'classifica_evento')),
  ('date: inizio e fine sono giorni',         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'eventi' and column_name in ('inizio','fine') and data_type = 'date') = 2),
  ('controllo soci acceso',                   coalesce((select valore = 'true'::jsonb from impostazioni where chiave = 'controllo_soci'), false))
)
select case when ok then 'OK' else 'MANCA' end as esito, pezzo from controlli
union all
select 'INFO', 'eventi: ' || coalesce(string_agg(nome || ' (' || inizio || ' → ' || fine || ', codice ' || codice || case when chiuso then ', chiuso' else '' end || ')', ' | '), 'nessuno')
from eventi
union all
select 'INFO', 'persone con permesso organizzatore (amministratori totali): ' || coalesce(string_agg(coalesce(nullif(trim(nickname), ''), nome), ', '), 'nessuna')
from profili where organizzatore;
