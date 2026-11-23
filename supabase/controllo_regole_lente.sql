-- Primo Giocatore - le regole di accesso e le funzioni che rallentano (sola lettura)
-- v1.0.0 - 202611231900
-- Non cambia niente: copia il testo delle funzioni e delle regole di
-- accesso che non sono nei file di questo progetto. Lancialo nell'editor
-- SQL di Supabase, scarica il risultato (Download CSV) e mandalo a Claude.
select 'funzione' as tipo, p.proname::text as nome, pg_get_functiondef(p.oid) as testo
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('ids_luoghi_visibili', 'ids_giochi_visibili', 'ids_ospiti_in_comune',
                    'ammesso', 'organizza_qualcosa', 'e_organizzatore', 'organizzatore_globale',
                    'riconcilia_ospiti', 'allinea_socio', 'ids_tavoli_iscritto', 'tavolo_pubblicato',
                    'ids_gruppi_miei', 'gestisco_tavolo', 'handle_new_user')
union all
select 'regola', tablename || ' · ' || policyname || ' · ' || cmd || ' · ' || permissive,
       'using: ' || coalesce(qual, '-') || E'\ncheck: ' || coalesce(with_check, '-')
from pg_policies
where schemaname = 'public'
  and tablename in ('luoghi', 'giochi', 'ospiti', 'partite', 'partecipazioni', 'profili', 'collezioni', 'tavoli')
order by 1, 2;
