-- Primo Giocatore - partite a squadre
-- v1.0.0 - 202611221200
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Va lanciato PRIMA di pubblicare la versione dell'app con
-- le partite a squadre.
--
-- Cosa fa:
-- 1. si assicura che ci siano partite.a_squadre e partecipazioni.squadra
--    (l'import da BG Stats li scrive già: di solito ci sono);
-- 2. salva_partita (l'ultima era in eventi_fase3.sql) impara a salvare
--    la spunta «a squadre» e la squadra di ogni giocatore;
-- 3. l'archivio (Storico e Statistiche) porta anche questi due campi:
--    la funzione già installata viene ritoccata in due punti, il resto
--    (regole di visibilità comprese) resta com'è;
-- 4. il ricalcolo del Primeggio lascia fuori le partite a squadre: non si
--    può sapere quanto ha pesato ognuno (scelta di Luca, 22/11/2026);
-- 5. la classifica dell'evento riceve la spunta, così l'IPG dell'evento
--    le lascia fuori allo stesso modo.
-- Non cambia nessuna partita già registrata.

-- 1. -------------------------------------------------------------------
alter table public.partite add column if not exists a_squadre boolean not null default false;
alter table public.partecipazioni add column if not exists squadra text;

-- La squadra è un testo (BG Stats scrive «1», «2»...). Se la colonna
-- c'era già con un altro tipo, si porta a testo.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'partecipazioni' and column_name = 'squadra') <> 'text' then
    alter table public.partecipazioni alter column squadra type text using squadra::text;
  end if;
end $$;

-- 2. -------------------------------------------------------------------
create or replace function public.salva_partita(p_dati jsonb)
 returns uuid language plpgsql security invoker set search_path to 'public'
as $f$
declare
  v_id     uuid := nullif(p_dati->>'partita_id', '')::uuid;
  v_nuovo  uuid := nullif(p_dati->>'nuovo_id', '')::uuid;
  v_evento uuid := nullif(p_dati->>'evento_id', '')::uuid;
  v_sq     boolean := coalesce((p_dati->>'a_squadre')::boolean, false);
  g        jsonb;
  v_part   uuid;
  k        text;
  v        text;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.'; end if;

  if v_id is not null then
    update partite set
      gioco_id = (p_dati->>'gioco_id')::uuid,
      luogo_id = nullif(p_dati->>'luogo_id', '')::uuid,
      giocata_il = (p_dati->>'giocata_il')::timestamptz,
      durata_minuti = nullif(p_dati->>'durata_minuti', '')::int,
      tipo_punteggio = coalesce(nullif(p_dati->>'tipo_punteggio', ''), 'punti'),
      esito_coop = nullif(p_dati->>'esito_coop', ''),
      note = nullif(p_dati->>'note', ''),
      impronta = nullif(p_dati->>'impronta', ''),
      evento_id = case when p_dati ? 'evento_id' then v_evento else evento_id end,
      -- Solo se l'app lo manda: le versioni di prima non lo toccano.
      a_squadre = case when p_dati ? 'a_squadre' then v_sq else a_squadre end
    where id = v_id and registrata_da = auth.uid();
    if not found then raise exception 'Partita non trovata, oppure non l''hai registrata tu.'; end if;
    delete from partecipazioni where partita_id = v_id;
  else
    if v_nuovo is not null and exists (select 1 from partite where id = v_nuovo and registrata_da = auth.uid()) then
      return v_nuovo;
    end if;
    insert into partite (id, gioco_id, luogo_id, giocata_il, durata_minuti, tipo_punteggio, esito_coop, note, impronta,
                         registrata_da, evento_id, a_squadre)
    values (coalesce(v_nuovo, gen_random_uuid()), (p_dati->>'gioco_id')::uuid, nullif(p_dati->>'luogo_id', '')::uuid,
            (p_dati->>'giocata_il')::timestamptz, nullif(p_dati->>'durata_minuti', '')::int,
            coalesce(nullif(p_dati->>'tipo_punteggio', ''), 'punti'), nullif(p_dati->>'esito_coop', ''),
            nullif(p_dati->>'note', ''), nullif(p_dati->>'impronta', ''), auth.uid(), v_evento, v_sq)
    returning id into v_id;
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_dati->'giocatori', '[]'::jsonb)) loop
    v_part := null;
    insert into partecipazioni (partita_id, utente_id, ospite_id, ruolo, punteggio_totale, spareggio,
                                posizione, vincitore, ordine_turno, primo_giocatore, squadra)
    values (v_id, nullif(g->>'utente_id', '')::uuid, nullif(g->>'ospite_id', '')::uuid, nullif(g->>'ruolo', ''),
            nullif(g->>'punteggio_totale', '')::numeric, nullif(g->>'spareggio', '')::numeric,
            nullif(g->>'posizione', '')::smallint, coalesce((g->>'vincitore')::boolean, false),
            nullif(g->>'ordine_turno', '')::smallint, coalesce((g->>'primo_giocatore')::boolean, false),
            nullif(g->>'squadra', ''))
    returning id into v_part;
    continue when v_part is null;
    if jsonb_typeof(g->'parziali') = 'object' then
      for k, v in select * from jsonb_each_text(g->'parziali') loop
        insert into dettagli_punteggio (partecipazione_id, categoria, valore)
        values (v_part, k, coalesce(nullif(v, '')::numeric, 0));
      end loop;
    end if;
  end loop;
  return v_id;
end $f$;
revoke all on function public.salva_partita(jsonb) from public, anon;
grant execute on function public.salva_partita(jsonb) to authenticated;

-- 3. -------------------------------------------------------------------
do $$
declare
  prima text;
  dopo text;
begin
  select pg_get_functiondef('public.archivio_partite(uuid, uuid, uuid, int, timestamptz)'::regprocedure)
    into prima;
  if position($q$'a_squadre', p.a_squadre$q$ in prima) > 0 then
    raise notice 'Archivio: le squadre ci sono già.';
    return;
  end if;
  dopo := replace(prima,
    $q$'tipo_punteggio', p.tipo_punteggio, 'esito_coop', p.esito_coop,$q$,
    $q$'tipo_punteggio', p.tipo_punteggio, 'esito_coop', p.esito_coop, 'a_squadre', p.a_squadre,$q$);
  dopo := replace(dopo,
    $q$'ruolo', pt.ruolo, 'ordine_turno', pt.ordine_turno,$q$,
    $q$'ruolo', pt.ruolo, 'ordine_turno', pt.ordine_turno, 'squadra', pt.squadra,$q$);
  if position($q$'a_squadre', p.a_squadre$q$ in dopo) = 0 or position($q$'squadra', pt.squadra$q$ in dopo) = 0 then
    raise exception 'archivio_partite non ha la forma attesa: non è stato cambiato nulla.';
  end if;
  execute dopo;
  raise notice 'Fatto: l''archivio porta anche le squadre.';
end $$;

-- 4. -------------------------------------------------------------------
do $$
declare
  prima text;
  dopo text;
begin
  select pg_get_functiondef('public.primeggio_partite(uuid, int)'::regprocedure) into prima;
  if position('not coalesce(p.a_squadre, false)' in prima) > 0 then
    raise notice 'Primeggio: le partite a squadre sono già fuori.';
    return;
  end if;
  dopo := replace(prima,
    'where p_dopo is null or p.id > p_dopo',
    'where (p_dopo is null or p.id > p_dopo) and not coalesce(p.a_squadre, false)');
  if dopo = prima then
    raise exception 'primeggio_partite non ha la forma attesa: non è stato cambiato nulla.';
  end if;
  execute dopo;
  raise notice 'Fatto: il Primeggio lascia fuori le partite a squadre.';
end $$;

-- 5. -------------------------------------------------------------------
create or replace function public.classifica_evento(p_evento uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
begin
  if auth.uid() is null
     or not ((select public.ammesso()) or p_evento in (select public.ids_eventi_miei(false))) then
    raise exception 'Questa classifica la vede chi partecipa all''evento.';
  end if;

  return jsonb_build_object(
    'partite', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'giocata_il', p.giocata_il, 'tipo_punteggio', p.tipo_punteggio, 'a_squadre', p.a_squadre,
        'giochi', jsonb_build_object('id', g.id, 'nome', g.nome, 'peso_bgg', g.peso_bgg, 'immagine_url', g.immagine_url),
        'partecipazioni', coalesce((
          select jsonb_agg(jsonb_build_object(
            'utente_id', x.utente_id, 'ospite_id', x.ospite_id, 'posizione', x.posizione,
            'punteggio_totale', x.punteggio_totale, 'vincitore', x.vincitore, 'squadra', x.squadra,
            'ospiti', case when x.ospite_id is null then null
                      else jsonb_build_object('utente_collegato', o.utente_collegato) end))
          from partecipazioni x left join ospiti o on o.id = x.ospite_id
          where x.partita_id = p.id), '[]'::jsonb)
      ) order by p.giocata_il)
      from partite p join giochi g on g.id = p.gioco_id
      where p.evento_id = p_evento), '[]'::jsonb),
    -- I nomi: account (soprannome, o nome) e ospiti senza account.
    'persone', coalesce((
      select jsonb_object_agg(k, nome) from (
        select pr.id::text as k, coalesce(nullif(trim(pr.nickname), ''), pr.nome) as nome
        from profili pr
        where pr.id in (select coalesce(x.utente_id, o.utente_collegato)
                        from partecipazioni x join partite p on p.id = x.partita_id
                        left join ospiti o on o.id = x.ospite_id
                        where p.evento_id = p_evento)
        union all
        select 'ospite:' || o.id, trim(concat_ws(' ', o.nome, o.cognome))
        from ospiti o
        where o.utente_collegato is null
          and o.id in (select x.ospite_id from partecipazioni x join partite p on p.id = x.partita_id
                       where p.evento_id = p_evento)
      ) n), '{}'::jsonb)
  );
end $f$;
revoke all on function public.classifica_evento(uuid) from public, anon;
grant execute on function public.classifica_evento(uuid) to authenticated;

-- Come è andata: devono essere tutti «sì».
select
  (select case when count(*) = 2 then 'sì' else 'no' end from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'partite' and column_name = 'a_squadre')
        or (table_name = 'partecipazioni' and column_name = 'squadra'))) as colonne,
  case when position('squadra' in pg_get_functiondef('public.salva_partita(jsonb)'::regprocedure)) > 0
       then 'sì' else 'no' end as salvataggio,
  case when position($q$'squadra', pt.squadra$q$ in
         pg_get_functiondef('public.archivio_partite(uuid, uuid, uuid, int, timestamptz)'::regprocedure)) > 0
       then 'sì' else 'no' end as archivio,
  case when position('not coalesce(p.a_squadre, false)' in
         pg_get_functiondef('public.primeggio_partite(uuid, int)'::regprocedure)) > 0
       then 'sì' else 'no' end as primeggio_senza_squadre,
  case when position('a_squadre' in pg_get_functiondef('public.classifica_evento(uuid)'::regprocedure)) > 0
       then 'sì' else 'no' end as classifica_evento,
  (select count(*) from partite where a_squadre) as partite_a_squadre_gia_presenti;
