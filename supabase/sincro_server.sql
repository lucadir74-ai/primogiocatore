-- Primo Giocatore - sincronizzazione BGA programmata sul server
-- v1.0.1 - 202610311330
-- Lanciare UNA volta, DOPO aver caricato i file su GitHub e aver messo
-- SINCRO_SECRET fra le variabili di Vercel (vedi le istruzioni in chat).

-- 1. Due colonne in più per l'esito della sincronizzazione
alter table public.bga_esiti add column if not exists dal_server boolean not null default false;
alter table public.bga_esiti add column if not exists pagina_storico int;

-- 2. Le estensioni per programmare la chiamata
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 3. La chiamata ogni 10 minuti (ogni iscritto viene servito al massimo
--    una volta all'ora). Sostituisci INCOLLA_QUI_IL_SEGRETO con lo stesso
--    valore di SINCRO_SECRET su Vercel, lasciando gli apici.
select cron.unschedule(jobid) from cron.job where jobname = 'pg-sincro-bga';
select cron.schedule(
  'pg-sincro-bga',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://primogiocatore.vercel.app/api/sincro',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer INCOLLA_QUI_IL_SEGRETO'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Per fermare tutto in futuro:
-- select cron.unschedule(jobid) from cron.job where jobname = 'pg-sincro-bga';
