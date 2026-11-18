-- Primo Giocatore - eventi, fase 5 (classifica dell'evento)
-- v1.0.0 - 202611182200
-- Si può rilanciare senza danni. Da lanciare dopo eventi_fase3.sql.
--
-- classifica_evento: tutte le partite di un evento in forma compatta,
-- con i nomi di chi ha giocato, per calcolare la classifica nell'app.
-- La vede chi è socio (ammesso) e chi ha un ruolo nell'evento, anche a
-- evento concluso. Le partite non escono intere: solo gioco, data,
-- posizioni, punteggi e vincitori.

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
        'id', p.id, 'giocata_il', p.giocata_il, 'tipo_punteggio', p.tipo_punteggio,
        'giochi', jsonb_build_object('id', g.id, 'nome', g.nome, 'peso_bgg', g.peso_bgg, 'immagine_url', g.immagine_url),
        'partecipazioni', coalesce((
          select jsonb_agg(jsonb_build_object(
            'utente_id', x.utente_id, 'ospite_id', x.ospite_id, 'posizione', x.posizione,
            'punteggio_totale', x.punteggio_totale, 'vincitore', x.vincitore,
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
