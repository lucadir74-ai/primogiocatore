-- Primo Giocatore - letture rifatte due volte: prima e seconda (sola lettura)
-- v1.0.0 - 202611231800
-- Non cambia niente. Come controllo_partecipante.sql, ma ogni lettura si
-- fa due volte di fila con lo stesso collegamento. Nell'app vera il
-- database tiene aperti i collegamenti, quindi conta soprattutto la
-- seconda: se è molto più veloce della prima, la lentezza vista finora
-- era in gran parte «riscaldamento».
-- Persone provate:
--   1. il partecipante con più partite (oggi DarioAggioli);
--   2. il partecipante con meno partite (il più simile a chi arriva a Pescara);
--   3. un socio tipico (a metà classifica per numero di partite).
-- Lancialo nell'editor SQL di Supabase, poi «Download CSV».

create temp table if not exists misure2 (id serial, chi text, lettura text,
                                         prima numeric, seconda numeric, righe text);
truncate misure2;

do $$
declare
  persone text[][];
  v_ev uuid;
  uid uuid;
  chi text;
  letture text[][];
  i int;
  j int;
  volta int;
  r record;
  ultima text;
  primariga text;
  tempi numeric[];
  quante text;
begin
  persone := array[
    ['partecipante con più partite', coalesce((
      select p.id::text from profili p
      left join partecipazioni pa on pa.utente_id = p.id
      where p.stato_socio = 'partecipante'
      group by p.id order by count(pa.*) desc limit 1), '')],
    ['partecipante con meno partite', coalesce((
      select p.id::text from profili p
      left join partecipazioni pa on pa.utente_id = p.id
      where p.stato_socio = 'partecipante'
      group by p.id order by count(pa.*), p.id limit 1), '')],
    ['socio tipico', coalesce((
      select utente_id::text from (
        select pa.utente_id, row_number() over (order by count(*)) as k,
               count(*) over () as tot
        from partecipazioni pa join profili p on p.id = pa.utente_id
        where p.stato_socio = 'socio'
        group by pa.utente_id) s
      where k = (tot + 1) / 2 limit 1), '')]
  ];

  for j in 1 .. array_length(persone, 1) loop
    chi := persone[j][1];
    if persone[j][2] = '' then
      insert into misure2 (chi, lettura, righe) values (chi, '(nessuno trovato)', '-');
      continue;
    end if;
    uid := persone[j][2]::uuid;
    select coalesce(
      (select er.evento_id from evento_ruoli er join eventi e on e.id = er.evento_id
       where er.utente_id = uid order by e.inizio desc nulls last limit 1),
      (select id from eventi order by inizio desc nulls last limit 1)) into v_ev;

    insert into misure2 (chi, lettura, righe) values
      (chi, '(chi è)', (select coalesce(nickname, nome, '?') || ' · ' || stato_socio
                                || ' · ' || (select count(*) from partecipazioni where utente_id = uid) || ' partite'
                         from profili where id = uid));

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
      tempi := array[null, null]::numeric[];
      quante := '?';
      for volta in 1 .. 2 loop
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', uid::text, true);
        begin
          execute 'set local role authenticated';
          primariga := null;
          for r in execute 'explain (analyze, costs off) ' || letture[i][2] loop
            if primariga is null then primariga := r."QUERY PLAN"; end if;
            ultima := r."QUERY PLAN";
          end loop;
          execute 'reset role';
          tempi[volta] := substring(ultima from 'Execution Time: ([0-9.]+)')::numeric;
          quante := coalesce(substring(primariga from 'rows=([0-9]+)'), '?');
        exception when others then
          execute 'reset role';
          quante := 'ERRORE: ' || sqlerrm;
        end;
      end loop;
      insert into misure2 (chi, lettura, prima, seconda, righe)
      values (chi, letture[i][1], round(tempi[1], 1), round(tempi[2], 1), quante);
    end loop;
  end loop;
end $$;

select chi, lettura,
       coalesce(prima::text || ' ms', '') as prima_volta,
       coalesce(seconda::text || ' ms', '') as seconda_volta,
       righe
from misure2 order by id;
