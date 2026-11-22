-- Primo Giocatore - soprannome dall'elenco soci a chi non ce l'ha
-- v1.0.0 - 202611222130
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni: tocca solo i profili ancora senza soprannome.
--
-- Perché: dopo la fase 5 della privacy nome e cognome sono nascosti a
-- chi non ha spuntato la casella. Un iscritto senza soprannome compariva
-- quindi come «Sconosciuto» e non si trovava cercandolo (es. Kaihla:
-- profilo senza soprannome, ma nell'elenco soci il nick c'è).
-- Qui il profilo prende il nick dell'elenco soci con la stessa email.
-- Se quel nick lo usa già un altro iscritto, non si tocca (lo dice
-- l'elenco in fondo). Le nuove iscrizioni prendono già il nick
-- dall'elenco (privacy_fase3.sql).

-- 1. Il soprannome dall'elenco soci, abbinando per email. -----------------
with dall_elenco as (
  select distinct on (p.id) p.id, trim(s.nickname) as nick
  from profili p
  join auth.users u on u.id = p.id
  join soci s on lower(trim(s.email)) = lower(trim(u.email))
  where coalesce(trim(p.nickname), '') = ''
    and coalesce(trim(s.nickname), '') <> ''
  order by p.id, s.aggiunto_il desc
)
update profili p
set nickname = d.nick
from dall_elenco d
where p.id = d.id
  -- un soprannome già usato da un altro non si duplica
  and not exists (select 1 from profili x
                  where x.id <> d.id and lower(trim(x.nickname)) = lower(d.nick));

-- 2. Come è andata. ---------------------------------------------------------
-- Chi resta senza soprannome, con il motivo: da sistemare a mano.
-- Nessuna riga = tutti a posto.
select p.id, a.nome as nome_vero, a.cognome as cognome_vero, p.stato_socio,
       case
         when s.email is null then 'email non nell''elenco soci'
         when coalesce(trim(s.nickname), '') = '' then 'nell''elenco senza nick'
         else 'nick «' || trim(s.nickname) || '» già usato da un altro'
       end as motivo
from profili p
left join anagrafica a on a.utente_id = p.id
left join auth.users u on u.id = p.id
left join lateral (select s.email, s.nickname from soci s
                   where lower(trim(s.email)) = lower(trim(u.email))
                   order by s.aggiunto_il desc limit 1) s on true
where coalesce(trim(p.nickname), '') = ''
order by p.stato_socio, a.nome;
