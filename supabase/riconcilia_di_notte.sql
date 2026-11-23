-- Primo Giocatore - il controllo degli ospiti doppi una volta a notte
-- v1.0.0 - 202611231900
-- Il controllo automatico degli ospiti doppi (riconcilia_ospiti) partiva
-- ogni ora al minuto 23. Dal controllo del 23/11: 508 giri, in media 6,5
-- secondi e fino a 33 secondi l'uno. È la cosa più pesante del database:
-- mentre gira, il resto rallenta. Una volta a notte basta (alle 4:23 ora
-- italiana d'inverno: il server conta in UTC, quindi 3:23).
-- Si può rilanciare senza danni. Per tornare a ogni ora: stesso comando
-- con '23 * * * *'.

select cron.unschedule(jobid) from cron.job where jobname = 'pg-riconcilia-ospiti';
select cron.schedule('pg-riconcilia-ospiti', '23 3 * * *',
  $$select public.riconcilia_ospiti()$$);

select jobname as lavoro, schedule as quando,
       case when schedule = '23 3 * * *' then 'sì' else 'NO' end as una_volta_a_notte
from cron.job where jobname = 'pg-riconcilia-ospiti';
