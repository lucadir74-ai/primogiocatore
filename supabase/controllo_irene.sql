-- Primo Giocatore - controllo: dove sono finiti gli ospiti «Irene»?
-- SOLA LETTURA: non cambia niente. Incolla nell'SQL Editor di Supabase,
-- premi Run e incolla qui il risultato.
--
-- Per ogni ospite con «irene» nel nome dice:
--   - se è stato collegato a un account (e a quale: nick, nome, cognome);
--   - se è stato unito dentro un altro ospite (e quale);
--   - quante partite ha ancora come ospite.

select
  trim(o.nome || ' ' || coalesce(o.cognome, ''))          as ospite,
  case
    when o.utente_collegato is not null then 'collegato a un account'
    when o.unito_in is not null then 'unito dentro un altro ospite'
    else 'ancora ospite'
  end                                                       as stato,
  coalesce(p.nickname, '')                                  as account_nick,
  trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')) as account_nome,
  to_char(o.collegato_il, 'DD/MM/YYYY HH24:MI')             as collegato_il,
  coalesce(trim(d.nome || ' ' || coalesce(d.cognome, '')), '') as unito_dentro,
  (select count(*) from partecipazioni pa where pa.ospite_id = o.id) as partite_ancora_da_ospite,
  coalesce(c.nickname, c.nome, '')                          as inserito_da
from ospiti o
left join profili p on p.id = o.utente_collegato
left join ospiti d on d.id = o.unito_in
left join profili c on c.id = o.creato_da
where o.nome ilike '%irene%' or o.cognome ilike '%irene%'
   or o.nome ilike '%ragni%' or o.cognome ilike '%ragni%'
order by stato, ospite;
