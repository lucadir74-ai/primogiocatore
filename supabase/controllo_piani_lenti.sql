-- Primo Giocatore - perché le letture semplici sono lente (sola lettura)
-- v1.0.0 - 202611232000
-- Non cambia niente. Rifà, come se fosse l'iscritto con più partite,
-- le letture che nel controllo risultavano lente, e annota per ognuna
-- quanto ci mette e dove perde tempo (EXPLAIN ANALYZE).
-- Lancialo nell'editor SQL di Supabase, poi «Download CSV» e manda il
-- file a Claude. Ci mette al massimo qualche decina di secondi.

create temp table if not exists piani (id serial, n int, lettura text, riga text);
truncate piani;

do $$
declare
  uid uuid;
  letture text[][];
  i int;
  r record;
  righe text[];
begin
  -- L'iscritto con più partite: è quello per cui le letture costano di più.
  select utente_id into uid from partecipazioni where utente_id is not null
  group by utente_id order by count(*) desc limit 1;

  letture := array[
    ['luoghi (elenco)',        'select nome from luoghi order by nome, id limit 1000'],
    ['giochi creati da me',    format('select * from giochi where creato_da = %L order by id limit 1000', uid)],
    ['collezione con giochi',  format('select c.gioco_id, g.nome from collezioni c left join giochi g on g.id = c.gioco_id where c.utente_id = %L order by c.gioco_id limit 1000', uid)],
    ['partecipazioni (tutte)', 'select utente_id, ospite_id from partecipazioni order by id limit 1000'],
    ['ospiti (elenco)',        'select id, nome, cognome, utente_collegato, unito_in from ospiti order by nome, id limit 1000'],
    ['ids_luoghi_visibili',    'select count(*) from ids_luoghi_visibili()'],
    ['ids_giochi_visibili',    'select count(*) from ids_giochi_visibili()'],
    ['ids_ospiti_in_comune',   'select count(*) from ids_ospiti_in_comune()'],
    ['ids_partite_giocate',    'select count(*) from ids_partite_giocate()'],
    ['ids_partite_registrate', 'select count(*) from ids_partite_registrate()']
  ];

  for i in 1 .. array_length(letture, 1) loop
    righe := array[]::text[];
    -- Come l'app: ruolo «authenticated» con l'accesso di quell'iscritto.
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    begin
      execute 'set local role authenticated';
      for r in execute 'explain (analyze, buffers, costs off) ' || letture[i][2] loop
        righe := righe || r."QUERY PLAN";
      end loop;
      execute 'reset role';
    exception when others then
      execute 'reset role';
      righe := array['ERRORE: ' || sqlerrm];
    end;
    insert into piani (n, lettura, riga) select i, letture[i][1], x from unnest(righe) with ordinality as u(x, k) order by k;
  end loop;
end $$;

-- Le definizioni che mancavano nel controllo precedente.
insert into piani (n, lettura, riga)
select 100, 'funzione ' || p.proname, pg_get_functiondef(p.oid)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('ids_partite_giocate', 'ids_partite_registrate', 'ids_luoghi_eventi_miei', 'e_dimostratore');

select lettura, riga from piani order by id;
