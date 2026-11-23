-- Primo Giocatore - quanto è veloce l'app per chi viene all'evento (sola lettura)
-- v1.0.0 - 202611231730
-- Non cambia niente. Rifà le letture dell'app dell'evento (tavoli, partite,
-- persone, luoghi, ospiti, giochi) come se fosse:
--   1. il partecipante di un evento con più partite (stato «partecipante»);
--   2. un socio tipico (quello a metà classifica per numero di partite).
-- Per ognuno annota quanto ci mette ogni lettura. Delle letture sopra i
-- 200 ms aggiunge anche dove perde tempo.
-- Lancialo nell'editor SQL di Supabase, poi «Download CSV».

create temp table if not exists misure (id serial, chi text, lettura text, ms numeric, righe text);
truncate misure;
create temp table if not exists piani_p (id serial, chi text, lettura text, riga text);
truncate piani_p;

do $$
declare
  persone text[][];
  v_ev uuid;
  uid uuid;
  chi text;
  letture text[][];
  i int;
  j int;
  r record;
  righe text[];
  tempo numeric;
  quante text;
begin
  -- Il partecipante con più partite; se nessuno ha giocato, uno qualsiasi.
  select p.id into uid from profili p
  left join partecipazioni pa on pa.utente_id = p.id
  where p.stato_socio = 'partecipante'
  group by p.id order by count(pa.*) desc limit 1;
  -- Il socio tipico: a metà fra chi ha giocato di più e chi di meno.
  persone := array[
    ['partecipante', coalesce(uid::text, '')],
    ['socio tipico', coalesce((
      select utente_id::text from (
        select pa.utente_id, count(*) as n, row_number() over (order by count(*)) as k,
               count(*) over () as tot
        from partecipazioni pa join profili p on p.id = pa.utente_id
        where p.stato_socio = 'socio'
        group by pa.utente_id) s
      where k = (tot + 1) / 2 limit 1), '')]
  ];

  for j in 1 .. array_length(persone, 1) loop
    chi := persone[j][1];
    if persone[j][2] = '' then
      insert into misure (chi, lettura, righe) values (chi, '(nessuno trovato)', '-');
      continue;
    end if;
    uid := persone[j][2]::uuid;
    -- L'evento: quello di cui fa parte, altrimenti il più recente.
    select coalesce(
      (select er.evento_id from evento_ruoli er join eventi e on e.id = er.evento_id
       where er.utente_id = uid order by e.inizio desc nulls last limit 1),
      (select id from eventi order by inizio desc nulls last limit 1)) into v_ev;

    insert into misure (chi, lettura, righe) values
      (chi, '(chi è)', (select coalesce(nickname, nome, '?') || ' · ' || stato_socio
                                || ' · ' || (select count(*) from partecipazioni where utente_id = uid) || ' partite'
                         from profili where id = uid)),
      (chi, '(evento)', coalesce((select nome || ' · ' || coalesce(inizio::text, '?') from eventi where id = v_ev), '-'));

    letture := array[
      ['tavoli dell''evento',   format('select * from tavoli where evento_id = %L order by inizio', v_ev)],
      ['partite dell''evento',  format('select p.id, (select g.nome from giochi g where g.id = p.gioco_id), (select json_agg(json_build_object(''u'', pa.utente_id, ''v'', pa.vincitore)) from partecipazioni pa where pa.partita_id = p.id) from partite p where p.evento_id = %L order by p.giocata_il desc', v_ev)],
      ['persone (profili)',     'select id, nome, nickname, dimostratore from profili order by nome limit 1000'],
      ['luoghi (elenco)',       'select nome from luoghi order by nome limit 1000'],
      ['ospiti (elenco)',       'select id, nome, cognome, utente_collegato, unito_in from ospiti order by nome, id limit 1000'],
      ['giochi (elenco)',       'select id, nome from giochi order by nome limit 1000'],
      ['partecipazioni (tutte)','select utente_id, ospite_id from partecipazioni order by id limit 1000'],
      ['partite (le mie)',      'select id, giocata_il from partite order by giocata_il desc limit 1000'],
      ['posizioni dei tavoli',  'select * from posizioni_tavoli()']
    ];

    for i in 1 .. array_length(letture, 1) loop
      righe := array[]::text[];
      tempo := null;
      quante := '?';
      perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', uid::text, true);
      begin
        execute 'set local role authenticated';
        for r in execute 'explain (analyze, buffers, costs off) ' || letture[i][2] loop
          righe := righe || r."QUERY PLAN";
        end loop;
        execute 'reset role';
        tempo := substring(righe[array_length(righe, 1)] from 'Execution Time: ([0-9.]+)')::numeric;
        quante := coalesce(substring(righe[1] from 'rows=([0-9]+)'), '?');
      exception when others then
        execute 'reset role';
        righe := array['ERRORE: ' || sqlerrm];
        quante := 'ERRORE: ' || sqlerrm;
      end;
      insert into misure (chi, lettura, ms, righe) values (chi, letture[i][1], round(tempo, 1), quante);
      if tempo > 200 then
        insert into piani_p (chi, lettura, riga) select chi, letture[i][1], x from unnest(righe) x;
      end if;
    end loop;
  end loop;
end $$;

select chi, lettura, coalesce(ms::text || ' ms', '') as tempo, righe as dettaglio
from (select id as ordine, chi, lettura, ms, righe from misure
      union all
      select 100000 + id, chi, 'piano: ' || lettura, null, riga from piani_p) x
order by ordine;
