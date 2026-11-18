-- Primo Giocatore - eventi, fase 1b
-- v1.0.0 - 202611181600
-- Si può rilanciare senza danni. Da lanciare dopo eventi_fase1.sql.
--
-- Chiunque partecipi a un evento aperto può pubblicare tavoli
-- dell'evento, anche con le iscrizioni su approvazione: chi pubblica il
-- tavolo accetta o rifiuta gli iscritti, come già succede oggi.
-- (Prima potevano solo i soci, chi organizza l'evento e i dimostratori.)

create or replace function public.ids_eventi_tavoli_miei()
 returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select e.id from eventi e
  where not e.chiuso and (e.fine is null or public.oggi_roma() <= e.fine)
    and (public.organizzo_evento(e.id)
         or exists (select 1 from evento_ruoli r where r.evento_id = e.id and r.utente_id = auth.uid()))
$f$;
