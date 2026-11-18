-- Primo Giocatore - luoghi: unione sicura e permessi
-- v1.0.0 - 202611182000
-- Si può rilanciare senza danni. Non cancella partite.
--
-- Prima l'unione di due luoghi la faceva il telefono, a pezzi: spostava
-- le partite, poi i tavoli, poi cancellava il luogo. Un socio spostava
-- solo le righe che poteva toccare e il resto restava a metà; e ogni
-- partita spostata ripartiva verso BGG. Ora:
-- 1. unisci_luoghi(): tutto in un colpo nel database, o niente. Lo può
--    fare chi organizza, oppure chi ha creato tutti e due i luoghi.
-- 2. Rinominare, cambiare tipo e cancellare un luogo: solo chi l'ha
--    creato, o chi organizza. Prima qualunque socio poteva rinominare
--    anche il luogo della Tana.

-- 1. L'unione ----------------------------------------------------------------
create or replace function public.unisci_luoghi(p_da uuid, p_verso uuid)
 returns int language plpgsql security definer set search_path to 'public'
as $f$
declare
  v_bgg     boolean := exists (select 1 from pg_trigger where tgname = 'partite_bgg_modifica'
                                 and tgrelid = 'public.partite'::regclass);
  v_partite int;
  t record;
begin
  if auth.uid() is null or not (select public.ammesso()) then raise exception 'Serve un account da socio.'; end if;
  if p_da is null or p_verso is null or p_da = p_verso then raise exception 'Scegli due luoghi diversi.'; end if;
  if not exists (select 1 from luoghi where id = p_da) or not exists (select 1 from luoghi where id = p_verso) then
    raise exception 'Luogo non trovato: forse è già stato unito.';
  end if;
  if not (public.e_organizzatore()
          or (exists (select 1 from luoghi where id = p_da and creato_da = auth.uid())
              and exists (select 1 from luoghi where id = p_verso and creato_da = auth.uid()))) then
    raise exception 'Solo chi organizza può unire luoghi creati da altri.';
  end if;

  select count(*) into v_partite from partite where luogo_id = p_da;

  -- Cambiare luogo non deve rimandare a BGG le partite già inviate.
  if v_bgg then execute 'alter table public.partite disable trigger partite_bgg_modifica'; end if;

  -- Ogni tabella che punta ai luoghi passa al luogo che resta.
  for t in
    select c.conrelid::regclass::text as tabella, a.attname::text as colonna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.luoghi'::regclass and cardinality(c.conkey) = 1
    union
    select format('public.%I', k.table_name), k.column_name::text
      from information_schema.columns k
      join information_schema.tables b on b.table_schema = k.table_schema and b.table_name = k.table_name
     where k.table_schema = 'public' and k.column_name = 'luogo_id' and b.table_type = 'BASE TABLE'
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', t.tabella, t.colonna, t.colonna)
        using p_verso, p_da;
    exception when unique_violation then
      if t.tabella in ('partite', 'public.partite') then raise; end if;
      -- Il luogo che resta ha già la sua riga (es. la posizione): si tiene quella.
      execute format('delete from %s where %I = $1', t.tabella, t.colonna) using p_da;
    end;
  end loop;

  if v_bgg then execute 'alter table public.partite enable trigger partite_bgg_modifica'; end if;

  delete from luoghi where id = p_da;
  return v_partite;
end;
$f$;

revoke all on function public.unisci_luoghi(uuid, uuid) from public, anon;
grant execute on function public.unisci_luoghi(uuid, uuid) to authenticated;

-- 2. Chi può cambiare o cancellare un luogo ------------------------------------
-- Regole «restrictive»: si aggiungono a quelle che ci sono già, non le sostituiscono.
drop policy if exists "luoghi modifica chi crea o organizza" on public.luoghi;
create policy "luoghi modifica chi crea o organizza" on public.luoghi as restrictive for update to authenticated
  using (creato_da = (select auth.uid()) or (select public.e_organizzatore()))
  with check (creato_da = (select auth.uid()) or (select public.e_organizzatore()));
drop policy if exists "luoghi cancella chi crea o organizza" on public.luoghi;
create policy "luoghi cancella chi crea o organizza" on public.luoghi as restrictive for delete to authenticated
  using (creato_da = (select auth.uid()) or (select public.e_organizzatore()));

-- Come è andata: deve dire «unisci_luoghi pronta» e 2 regole.
select
  (select case when count(*) = 1 then 'unisci_luoghi pronta' else 'MANCA unisci_luoghi' end
     from pg_proc where proname = 'unisci_luoghi') as funzione,
  (select count(*) from pg_policies where tablename = 'luoghi'
     and policyname in ('luoghi modifica chi crea o organizza', 'luoghi cancella chi crea o organizza')) as regole;
