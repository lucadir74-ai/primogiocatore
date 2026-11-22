-- Primo Giocatore - chi compare come «Sconosciuto»
-- v1.0.0 - 202611222100
-- SOLO LETTURA: non cambia niente. Si lancia nell'editor SQL di Supabase.
--
-- L'app mostra il soprannome; se manca, nome e cognome; se anche quelli
-- sono nascosti (casella privacy, profili.mostra_nome = false) scrive
-- «Sconosciuto». Qui: quanti sono, e chi è «kaihla».

-- 1. Quanti iscritti finiscono come «Sconosciuto».
select
  count(*) filter (where coalesce(trim(p.nickname), '') = '') as senza_soprannome,
  count(*) filter (where coalesce(trim(p.nickname), '') = ''
                     and coalesce(trim(p.nome), '') = '' and coalesce(trim(p.cognome), '') = '') as sconosciuti,
  count(*) as iscritti
from profili p;

-- 2. Chi è «kaihla»: per soprannome, nome vero o nome con cui era ospite.
select 'profilo' as dove, p.id, p.nickname, a.nome as nome_vero, p.mostra_nome, p.stato_socio
from profili p left join anagrafica a on a.utente_id = p.id
where p.nickname ilike '%kai%' or a.nome ilike '%kai%' or a.cognome ilike '%kai%'
union all
select 'nome da ospite', n.utente_id, p.nickname, n.nome || ' ' || n.cognome, p.mostra_nome, p.stato_socio
from nomi_collegati n join profili p on p.id = n.utente_id
where n.nome ilike '%kai%' or n.cognome ilike '%kai%'
union all
select 'elenco soci', null, s.nickname, s.nome || ' ' || s.cognome, null, null
from soci s
where s.nickname ilike '%kai%' or s.nome ilike '%kai%';
