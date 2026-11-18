-- Primo Giocatore - eventi, fase 3
-- v1.0.0 - 202611181900
-- Si può rilanciare senza danni. Da lanciare dopo eventi_fase1b.sql.
--
-- Il salvataggio della partita (salva_partita, da partite_sicure.sql)
-- impara l'evento: una partita nuova lo riceve dall'app, una modificata
-- lo cambia solo se l'app lo manda. Il resto è identico a prima.

create or replace function public.salva_partita(p_dati jsonb)
 returns uuid language plpgsql security invoker set search_path to 'public'
as $f$
declare
  v_id     uuid := nullif(p_dati->>'partita_id', '')::uuid;
  v_nuovo  uuid := nullif(p_dati->>'nuovo_id', '')::uuid;
  v_evento uuid := nullif(p_dati->>'evento_id', '')::uuid;
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
      evento_id = case when p_dati ? 'evento_id' then v_evento else evento_id end
    where id = v_id and registrata_da = auth.uid();
    if not found then raise exception 'Partita non trovata, oppure non l''hai registrata tu.'; end if;
    delete from partecipazioni where partita_id = v_id;
  else
    if v_nuovo is not null and exists (select 1 from partite where id = v_nuovo and registrata_da = auth.uid()) then
      return v_nuovo;
    end if;
    insert into partite (id, gioco_id, luogo_id, giocata_il, durata_minuti, tipo_punteggio, esito_coop, note, impronta,
                         registrata_da, evento_id)
    values (coalesce(v_nuovo, gen_random_uuid()), (p_dati->>'gioco_id')::uuid, nullif(p_dati->>'luogo_id', '')::uuid,
            (p_dati->>'giocata_il')::timestamptz, nullif(p_dati->>'durata_minuti', '')::int,
            coalesce(nullif(p_dati->>'tipo_punteggio', ''), 'punti'), nullif(p_dati->>'esito_coop', ''),
            nullif(p_dati->>'note', ''), nullif(p_dati->>'impronta', ''), auth.uid(), v_evento)
    returning id into v_id;
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_dati->'giocatori', '[]'::jsonb)) loop
    v_part := null;
    insert into partecipazioni (partita_id, utente_id, ospite_id, ruolo, punteggio_totale, spareggio,
                                posizione, vincitore, ordine_turno, primo_giocatore)
    values (v_id, nullif(g->>'utente_id', '')::uuid, nullif(g->>'ospite_id', '')::uuid, nullif(g->>'ruolo', ''),
            nullif(g->>'punteggio_totale', '')::numeric, nullif(g->>'spareggio', '')::numeric,
            nullif(g->>'posizione', '')::smallint, coalesce((g->>'vincitore')::boolean, false),
            nullif(g->>'ordine_turno', '')::smallint, coalesce((g->>'primo_giocatore')::boolean, false))
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
