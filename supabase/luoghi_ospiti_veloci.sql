-- Primo Giocatore - luoghi e ospiti visibili: calcolo veloce
-- v1.0.0 - 202611231700
-- Dal controllo dei piani (23/11): l'elenco dei luoghi ci metteva 3,3
-- secondi, quasi tutti dentro ids_luoghi_visibili() chiamata dalla regola
-- «luoghi lettura»; l'elenco degli ospiti 0,4 secondi, con
-- ids_ospiti_in_comune() che restituiva 65.000 righe per 16.700 ospiti
-- (le stesse persone ripetute una volta per partita).
-- Qui, come già fatto per i giochi (giochi_visibili_veloce.sql):
-- 1. «chi sono», «organizzo» e «spiego» si calcolano una volta sola,
--    non per ogni tavolo;
-- 2. ogni pezzo parte dalle mie righe e usa un indice;
-- 3. gli ospiti in comune escono una volta sola ciascuno;
-- 4. niente compilazione JIT dentro queste due funzioni.
-- Prima di cambiarle salva i risultati di alcuni iscritti (i 5 con più
-- partite, fino a 3 partecipanti di eventi, 5 a caso), poi li rifà e li
-- confronta. Devono uscire tutti «sì». Si può rilanciare senza danni.

-- 1. Indici ------------------------------------------------------------------
create index if not exists luoghi_creato_da        on public.luoghi (creato_da);
create index if not exists tavoli_pubblicati_luogo on public.tavoli (luogo_id) where pubblicato and luogo_id is not null;

-- 2. Risultati di prima ------------------------------------------------------
create temp table if not exists prova_utenti (utente uuid);
truncate prova_utenti;
insert into prova_utenti
select utente_id from (select utente_id from partecipazioni where utente_id is not null
                       group by utente_id order by count(*) desc limit 5) a
union
select id from (select id from profili where stato_socio = 'partecipante' limit 3) b
union
select id from (select id from profili order by random() limit 5) c;

create temp table if not exists prova_prima (utente uuid, cosa text, id uuid);
truncate prova_prima;
create temp table if not exists prova_dopo (utente uuid, cosa text, id uuid);
truncate prova_dopo;

do $$
declare u uuid;
begin
  for u in select utente from prova_utenti loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    insert into prova_prima select distinct u, 'luoghi', x from public.ids_luoghi_visibili() x where x is not null;
    insert into prova_prima select distinct u, 'ospiti', x from public.ids_ospiti_in_comune() x where x is not null;
  end loop;
end $$;

-- 3. Le funzioni -------------------------------------------------------------
create or replace function public.ids_luoghi_visibili()
 returns setof uuid
 language plpgsql stable security definer
 set search_path to 'public'
 set jit to off
as $f$
declare
  v_io  uuid    := auth.uid();
  v_org boolean := v_io is not null and coalesce(e_organizzatore(), false);
  v_dim boolean := coalesce(e_dimostratore(), false);
begin
  return query
  -- Tavoli pubblicati: li vedono tutti.
  select t.luogo_id from tavoli t where t.pubblicato and t.luogo_id is not null
  union
  select l.id from luoghi l where v_io is not null and l.creato_da = v_io
  union
  select p.luogo_id from partite p
  where v_io is not null and p.registrata_da = v_io and p.luogo_id is not null
  union
  -- Partite giocate: si parte dalle mie partecipazioni, non dalle partite.
  select p.luogo_id
  from partecipazioni pt join partite p on p.id = pt.partita_id
  where v_io is not null and pt.utente_id = v_io and p.luogo_id is not null
  union
  select p.luogo_id
  from membri_gruppo m join partite p on p.gruppo_id = m.gruppo_id
  where v_io is not null and m.utente_id = v_io and p.luogo_id is not null
  union
  -- Gli altri tavoli: tutti per chi organizza, altrimenti i miei.
  select t.luogo_id from tavoli t
  where v_io is not null and t.luogo_id is not null
    and (v_org
         or t.host_id = v_io
         or t.dimostratore_id = v_io
         or exists (select 1 from iscrizioni_tavolo i
                    where i.tavolo_id = t.id and i.utente_id = v_io))
  union
  select s.luogo_id from serate s where v_dim and s.luogo_id is not null;
end $f$;

create or replace function public.ids_ospiti_in_comune()
 returns setof uuid
 language sql stable security definer
 set search_path to 'public'
 set jit to off
as $f$
  select distinct sua.ospite_id
  from partecipazioni mia
  join partecipazioni sua on sua.partita_id = mia.partita_id
  where mia.utente_id = auth.uid() and sua.ospite_id is not null;
$f$;

-- 4. Risultati di dopo e confronto -------------------------------------------
do $$
declare u uuid;
begin
  for u in select utente from prova_utenti loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
    insert into prova_dopo select u, 'luoghi', x from public.ids_luoghi_visibili() x where x is not null;
    insert into prova_dopo select u, 'ospiti', x from public.ids_ospiti_in_comune() x;
  end loop;
end $$;

select 'iscritti provati' as prova, count(*)::text as esito from prova_utenti
union all
select 'luoghi: gli stessi di prima',
       case when not exists (select utente, id from prova_prima where cosa = 'luoghi'
                             except select utente, id from prova_dopo where cosa = 'luoghi')
             and not exists (select utente, id from prova_dopo where cosa = 'luoghi'
                             except select utente, id from prova_prima where cosa = 'luoghi')
            then 'sì' else 'NO' end
union all
select 'ospiti: gli stessi di prima',
       case when not exists (select utente, id from prova_prima where cosa = 'ospiti'
                             except select utente, id from prova_dopo where cosa = 'ospiti')
             and not exists (select utente, id from prova_dopo where cosa = 'ospiti'
                             except select utente, id from prova_prima where cosa = 'ospiti')
            then 'sì' else 'NO' end
union all
select 'ospiti: ognuno una volta sola',
       case when (select count(*) from prova_dopo where cosa = 'ospiti')
               = (select count(*) from (select distinct utente, id from prova_dopo where cosa = 'ospiti') d)
            then 'sì' else 'NO' end
union all
select 'luoghi trovati in tutto', (select count(*)::text from prova_dopo where cosa = 'luoghi')
union all
select 'ospiti trovati in tutto', (select count(*)::text from prova_dopo where cosa = 'ospiti');
