-- Primo Giocatore - perché la sincronizzazione BGA dal server non gira?
-- v1.0.0 - 202611222120
-- SOLO LETTURA: non cambia niente. Si lancia nell'editor SQL di Supabase.
-- Del giro programmato (pg_cron) mostra solo l'indirizzo chiamato, MAI il
-- codice segreto. Poi gli ultimi giri, le ultime risposte del server e
-- quanti hanno BGA collegato (senza nomi).

with
lavori as (
  select j.jobid, j.jobname, j.schedule, j.active,
         coalesce(substring(j.command from 'https?://[^''"\s]+'), 'indirizzo non trovato nel comando') as indirizzo
  from cron.job j
  where j.command ilike '%sincro%'
),
giri as (
  select d.start_time, d.status, d.return_message
  from cron.job_run_details d
  where d.jobid in (select jobid from lavori)
  order by d.start_time desc
  limit 5
),
risposte as (
  select r.created, r.status_code, r.timed_out, left(coalesce(r.error_msg, r.content, ''), 160) as testo
  from net._http_response r
  order by r.created desc
  limit 5
)
select '1 lavoro ' || jobid as voce,
       coalesce(jobname, '(senza nome)') || ' · ' || schedule || ' · attivo: ' || case when active then 'sì' else 'NO' end
       || ' · chiama ' || indirizzo as valore
from lavori
union all
select '2 giro ' || to_char(start_time at time zone 'Europe/Rome', 'DD/MM HH24:MI:SS'),
       status || ' · ' || left(coalesce(return_message, ''), 200)
from giri
union all
select '3 risposta ' || to_char(created at time zone 'Europe/Rome', 'DD/MM HH24:MI:SS'),
       coalesce(status_code::text, '-') || case when timed_out then ' (tempo scaduto)' else '' end || ' · ' || testo
from risposte
union all
select '4 sessioni BGA',
       'collegate: ' || count(*)
       || ' · scadute: ' || count(*) filter (where ultimo_errore = 'scaduta')
       || ' · altri errori: ' || count(*) filter (where ultimo_errore is not null and ultimo_errore <> 'scaduta')
from bga_sessioni
union all
select '5 ultimo giro dall''app',
       coalesce(to_char(max(quando) filter (where not coalesce(dal_server, false)) at time zone 'Europe/Rome', 'DD/MM HH24:MI'), '-')
from bga_esiti
union all
select '6 nessun lavoro programmato?',
       case when exists (select 1 from lavori) then 'c''è' else 'NESSUN lavoro chiama /api/sincro' end
order by 1;
