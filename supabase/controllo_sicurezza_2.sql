-- Primo Giocatore - controllo di sicurezza, seconda parte
-- v1.0.0 - 202611222330
-- SOLO LETTURA: non cambia niente. Si lancia nell'editor SQL di Supabase.
-- Mostra il testo di quattro oggetti creati a mano in Supabase (non sono
-- negli script del progetto) e chi può usarli, più un conteggio senza nomi.

select 'A vista v_partecipazioni' as oggetto,
       'chi non è entrato: ' || case when has_table_privilege('anon', 'public.v_partecipazioni', 'SELECT') then 'sì' else 'no' end
       || ' · chi è entrato: ' || case when has_table_privilege('authenticated', 'public.v_partecipazioni', 'SELECT') then 'sì' else 'no' end
       || E'\n' || pg_get_viewdef('public.v_partecipazioni'::regclass, true) as testo
union all
select 'B funzione ' || p.proname,
       'chi non è entrato: ' || case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'sì' else 'no' end
       || ' · chi è entrato: ' || case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'sì' else 'no' end
       || E'\n' || pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('non_nell_elenco', 'decidi_non_socio', 'e_membro', 'gestisce_tana')
union all
-- Nomi da ospite di iscritti che hanno nascosto il proprio nome: quanti
-- sono quelli con nome E cognome (quasi sempre il nome vero).
select 'C nomi da ospite di chi ha nascosto il nome',
       'iscritti coinvolti: ' || count(distinct n.utente_id) || ' · nomi con cognome: ' || count(*)
from nomi_collegati n join profili p on p.id = n.utente_id
where not coalesce(p.mostra_nome, false) and coalesce(trim(n.cognome), '') <> ''
order by 1;
