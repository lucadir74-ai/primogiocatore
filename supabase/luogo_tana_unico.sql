-- Primo Giocatore - un solo luogo per la Tana
-- v1.0.0 - 202611091500
-- Si può rilanciare senza danni. Non cancella partite.
--
-- La Tana era scritta in tanti modi («Tana dei Goblin di Roma», «TdG
-- Roma», «tana», «Sede»…), spesso uno per ogni persona. Qui:
-- 1. la regola per riconoscerla (la stessa dell'app, eLuogoTana in
--    src/luoghiNome.js); le Tane di altre città restano fuori;
-- 2. tutti quei luoghi diventano uno solo, «Tana dei Goblin Roma», di tipo
--    sede (lo vedono tutti): partite, tavoli e il resto passano a quello,
--    i doppioni si cancellano.
-- Le partite già mandate a BGG non vengono rimandate per questo.
--
-- Per vedere PRIMA quali luoghi verranno uniti, lancia da sola la parte 1
-- e poi questa riga:
--   select id, nome, tipo, (select count(*) from partite p where p.luogo_id = l.id) as partite
--     from luoghi l where e_luogo_tana(nome) and coalesce(tipo, '') not in ('casa', 'online')
--    order by partite desc;

-- 1. La regola ----------------------------------------------------------------
create or replace function public.e_luogo_tana(p_nome text)
 returns boolean language sql immutable set search_path to 'public'
as $f$
  with n as (select btrim(regexp_replace(lower(coalesce(p_nome, '')), '[^a-z0-9]+', ' ', 'g')) as v)
  select v <> '' and (
    v ~ '^(la |presso (la )?)?(tana|tdg|goblins?|sede)( (dei|de) goblins?)?( (di |de )?(roma|rm))?( sede)?$'
    or (v ~ '(goblin|tdg)' and v ~ '\m(roma|rm)\M'))
  from n
$f$;

-- 2. L'unione -----------------------------------------------------------------
do $u$
declare
  v_tana  uuid;
  v_doppi uuid[];
  v_bgg   boolean := exists (select 1 from pg_trigger where tgname = 'partite_bgg_modifica'
                               and tgrelid = 'public.partite'::regclass);
  t record;
begin
  select array_agg(id) into v_doppi from luoghi
   where e_luogo_tana(nome) and coalesce(tipo, '') not in ('casa', 'online');
  if v_doppi is null then
    raise notice 'Nessun luogo della Tana: lo crea l''app alla prima partita.';
    return;
  end if;

  -- Resta quello che si chiama già così, altrimenti quello con più partite.
  select l.id into v_tana from luoghi l where l.id = any(v_doppi)
   order by (l.nome = 'Tana dei Goblin Roma') desc,
            (select count(*) from partite p where p.luogo_id = l.id) desc
   limit 1;
  update luoghi set nome = 'Tana dei Goblin Roma', tipo = 'sede' where id = v_tana;
  v_doppi := array_remove(v_doppi, v_tana);
  raise notice 'Luogo della Tana: %, doppioni da unire: %', v_tana, coalesce(cardinality(v_doppi), 0);
  if coalesce(cardinality(v_doppi), 0) = 0 then return; end if;

  -- Cambiare luogo non deve rimandare a BGG le partite già inviate.
  if v_bgg then execute 'alter table public.partite disable trigger partite_bgg_modifica'; end if;

  -- Ogni tabella che punta ai luoghi passa al luogo della Tana.
  for t in
    select c.conrelid::regclass::text as tabella, a.attname::text as colonna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.luoghi'::regclass and cardinality(c.conkey) = 1
    union   -- anche le colonne luogo_id senza vincolo dichiarato
    select format('public.%I', k.table_name), k.column_name::text
      from information_schema.columns k
      join information_schema.tables b on b.table_schema = k.table_schema and b.table_name = k.table_name
     where k.table_schema = 'public' and k.column_name = 'luogo_id' and b.table_type = 'BASE TABLE'
  loop
    begin
      execute format('update %s set %I = $1 where %I = any($2)', t.tabella, t.colonna, t.colonna)
        using v_tana, v_doppi;
    exception when unique_violation then
      if t.tabella in ('partite', 'public.partite') then raise; end if;   -- le partite non si toccano
      -- Il luogo della Tana ha già la sua riga (es. la posizione): si tiene quella.
      execute format('delete from %s where %I = any($1)', t.tabella, t.colonna) using v_doppi;
    end;
  end loop;

  if v_bgg then execute 'alter table public.partite enable trigger partite_bgg_modifica'; end if;

  delete from luoghi where id = any(v_doppi);
end $u$;
