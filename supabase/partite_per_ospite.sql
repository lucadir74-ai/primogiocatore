-- Primo Giocatore - quante partite ha ogni ospite, in una risposta sola
-- v1.0.0 - 202611132100
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non tocca partite, ospiti né account.
--
-- La sezione Ospiti del profilo, per sapere quante partite ha ogni
-- ospite, leggeva tutte le partecipazioni (mille per volta) e le contava
-- sul telefono. Qui il conto lo fa il database e arriva già fatto:
-- { "<id ospite>": numero, ... }.
-- La funzione gira con i permessi di chi la chiama: conta le stesse
-- partecipazioni che quella persona vedeva prima, né una di più né una
-- di meno. Senza questo script l'app continua a contare come prima.

create or replace function public.partite_per_ospite()
 returns jsonb
 language sql stable security invoker set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(x.ospite_id, x.n), '{}'::jsonb)
  from (
    select pa.ospite_id, count(*)::int as n
    from partecipazioni pa
    where pa.ospite_id is not null
    group by pa.ospite_id
  ) x;
$function$;

revoke all on function public.partite_per_ospite() from public, anon;
grant execute on function public.partite_per_ospite() to authenticated;

-- Come è andata: quanti ospiti hanno almeno una partita (visti da chi lancia lo script).
select count(*) as ospiti_con_partite from jsonb_object_keys(public.partite_per_ospite());
