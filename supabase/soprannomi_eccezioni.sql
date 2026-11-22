-- Primo Giocatore - soprannome per i due iscritti «eccezione» che non ce l'hanno
-- v1.0.0 - 202611222145
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare.
--
-- FranK e pusher non sono nell'elenco soci (soprannomi_da_elenco.sql non
-- poteva trovarli) e nel nome hanno scritto il loro soprannome: lo si usa
-- come soprannome, se nessun altro lo ha già.

update profili p
set nickname = trim(a.nome)
from anagrafica a
where a.utente_id = p.id
  and p.id in ('bab4c50f-da63-428e-9a9e-ec0ba951e3df', '6a4809f2-b761-4dee-8215-cd64691da628')
  and coalesce(trim(p.nickname), '') = ''
  and coalesce(trim(a.nome), '') <> ''
  and not exists (select 1 from profili x
                  where x.id <> p.id and lower(trim(x.nickname)) = lower(trim(a.nome)));

-- Come è andata: deve rispondere 0.
select count(*) as ancora_senza_soprannome
from profili where coalesce(trim(nickname), '') = '';
