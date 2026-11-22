-- Primo Giocatore - controllo di sicurezza del database
-- v1.0.0 - 202611222300
-- SOLO LETTURA: non cambia niente. Si lancia nell'editor SQL di Supabase.
-- Esce un elenco unico (controllo, oggetto, dettaglio): nessuna riga in
-- una categoria = nessun problema di quel tipo. Le righe «info» servono
-- solo a vedere le regole delle tabelle più delicate.

with
-- 1. Tabelle senza regole di accesso (RLS spenta): chiunque abbia la
--    chiave pubblica dell'app potrebbe leggerle e scriverle.
senza_rls as (
  select '1 tabella senza RLS' as controllo, c.relname::text as oggetto,
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'leggibile anche da chi non è entrato'
              else 'leggibile da chi è entrato' end as dettaglio
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
),
-- 2. Regole che lasciano passare tutti (condizione «true») chi non è entrato.
aperte_anon as (
  select '2 regola aperta a chi non è entrato', tablename || ': ' || policyname, cmd
  from pg_policies
  where schemaname = 'public' and permissive = 'PERMISSIVE'
    and roles && array['anon', 'public']::name[]
    and coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true'
),
-- 3. Regole che fanno SCRIVERE tutto a chiunque sia entrato.
scrittura_libera as (
  select '3 scrittura libera per chi è entrato', tablename || ': ' || policyname, cmd || ' ' || array_to_string(roles, ',')
  from pg_policies
  where schemaname = 'public' and permissive = 'PERMISSIVE'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true'
),
-- 4. Funzioni con privilegi (security definer) che chi NON è entrato può
--    chiamare e che non controllano chi le chiama.
definer_anon as (
  select '4 funzione con privilegi aperta a tutti', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'non controlla chi la chiama'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc !~* '(auth\.uid\(\)|auth\.role\(\)|ammesso\(|e_organizzatore\(|organizzatore_globale\(|amministratore)'
),
-- 5. Funzioni con privilegi senza search_path fisso (si possono ingannare).
definer_senza_path as (
  select '5 funzione con privilegi senza search_path', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ''
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) x where x like 'search_path=%')
),
-- 6. Viste leggibili dall'app: una vista normale ignora le regole delle
--    tabelle (le legge con i permessi di chi l'ha creata).
viste as (
  select '6 vista leggibile che salta le regole', c.relname::text,
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'anche da chi non è entrato' else 'da chi è entrato' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
    and not coalesce((select o.option_value = 'true' from pg_options_to_table(c.reloptions) o
                      where o.option_name = 'security_invoker'), false)
),
-- 7. Archivi di file pubblici.
file_pubblici as (
  select '7 archivio file pubblico', b.name::text, ''
  from storage.buckets b where b.public
),
-- info: le regole delle tabelle con dati personali o segreti.
delicate as (
  select 'info regole tabella delicata', tablename || ': ' || policyname,
         cmd || ' ' || array_to_string(roles, ',') || ' | ' || left(coalesce(qual, '-') || ' / ' || coalesce(with_check, '-'), 220)
  from pg_policies
  where schemaname = 'public'
    and tablename in ('soci', 'anagrafica', 'bga_sessioni', 'bgg_sessioni', 'registro_operazioni',
                      'accettazioni_informativa', 'profili', 'ospiti', 'nomi_collegati')
)
select * from senza_rls
union all select * from aperte_anon
union all select * from scrittura_libera
union all select * from definer_anon
union all select * from definer_senza_path
union all select * from viste
union all select * from file_pubblici
union all select * from delicate
order by 1, 2;
