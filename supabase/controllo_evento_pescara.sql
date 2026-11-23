-- Primo Giocatore - controllo prima dell'evento di Pescara (sola lettura)
-- v1.0.0 - 202611231800
-- Non cambia niente: legge solo misure. Lancialo nell'editor SQL di
-- Supabase e incolla tutto il risultato a Claude.
-- Dice quanto è grande la macchina, quanto pesano le tabelle e quali
-- letture costano di più oggi (da quando le statistiche sono partite).

with macchina as (
  select 1 as ordine, 'macchina' as gruppo,
         'connessioni massime (60 = Nano o Micro, 90 = Small, 120 = Medium)' as voce,
         current_setting('max_connections') as valore
  union all
  select 2, 'macchina', 'memoria per i dati (shared_buffers)', current_setting('shared_buffers')
  union all
  select 3, 'macchina', 'peso del database', pg_size_pretty(pg_database_size(current_database()))
  union all
  select 4, 'macchina', 'letture trovate già in memoria, % (sotto 99 = memoria poca)',
         coalesce((select round(100.0 * sum(heap_blks_hit)
                                / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)::text
                   from pg_statio_user_tables), '?')
  union all
  select 5, 'macchina', 'account', (select count(*)::text from auth.users)
),
tabelle as (
  select 10 + row_number() over (order by pg_total_relation_size(s.relid) desc) as ordine,
         'tabella' as gruppo, s.relname::text as voce,
         coalesce(nullif(s.n_live_tup, 0), greatest(c.reltuples, 0)::bigint) || ' righe · '
           || pg_size_pretty(pg_total_relation_size(s.relid)) as valore
  from pg_stat_user_tables s
  join pg_class c on c.oid = s.relid
  where s.schemaname = 'public'
),
pesanti as (
  select 100 + row_number() over (order by total_exec_time desc) as ordine,
         'lettura pesante' as gruppo,
         left(regexp_replace(query, '\s+', ' ', 'g'), 180) as voce,
         calls || ' volte · media ' || round(mean_exec_time::numeric, 1) || ' ms · max '
           || round(max_exec_time::numeric) || ' ms · totale '
           || round((total_exec_time / 1000)::numeric) || ' s' as valore
  from extensions.pg_stat_statements
  where query not ilike '%pg_stat_statements%'
)
select gruppo, voce, valore from (
  select * from macchina
  union all select * from tabelle where ordine <= 24
  union all select * from pesanti where ordine <= 120
) x
order by ordine;
