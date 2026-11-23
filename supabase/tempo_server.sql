-- Primo Giocatore - più tempo per le operazioni del server
-- v1.0.0 - 202611240100
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare.
--
-- Supabase ferma ogni singola richiesta che dura più di pochi secondi
-- («canceling statement due to statement timeout»). Per l'app va bene:
-- le sue richieste sono piccole. Il ricalcolo dell'IPG invece legge e
-- riscrive migliaia di righe alla volta, e con lo storico BGA di tutti
-- nel database le partite sono diventate molte: un pezzo può sforare.
--
-- Qui si alza il limite SOLO per il ruolo del server (service_role, la
-- chiave segreta che sta su Vercel). Gli iscritti (authenticated) e chi
-- non è entrato (anon) restano con i limiti di prima.

alter role service_role set statement_timeout = '55s';
notify pgrst, 'reload config';

-- Com'è adesso: limiti per ruolo e grandezza delle tabelle del ricalcolo.
select r.rolname as ruolo,
       coalesce((select x from unnest(r.rolconfig) x where x like 'statement_timeout=%'), 'predefinito') as limite
from pg_roles r where r.rolname in ('service_role', 'authenticated', 'anon', 'authenticator')
union all select 'partite', count(*)::text from public.partite
union all select 'partecipazioni', count(*)::text from public.partecipazioni
union all select 'righe ipg', count(*)::text from public.ipg
union all select 'righe ipg_nuova (avanzi)', count(*)::text from public.ipg_nuova
union all select 'righe ipg_partite', count(*)::text from public.ipg_partite;
