-- Primo Giocatore - prova della fase 5 (classifica dell'evento)
-- v1.0.0 - 202611182200
-- Da lanciare DOPO eventi_fase5.sql. NON SALVA NIENTE: alla fine
-- annulla tutto. Il risultato arriva come «errore» rosso che comincia
-- con ESITO PROVA: è voluto. Ogni riga dice OK o NO.

do $$
declare
  u_a   uuid := '00000000-0000-4000-8000-00000000e031';   -- partecipante dell'evento
  u_b   uuid := '00000000-0000-4000-8000-00000000e032';   -- partecipante di un ALTRO evento
  v_ev  uuid := '00000000-0000-4000-8000-00000000e0e5';
  v_ev2 uuid := '00000000-0000-4000-8000-00000000e0e6';
  v_gio uuid;
  u_soc uuid;
  x     jsonb;
  esito text := '';
begin
  select id into v_gio from giochi limit 1;
  select id into u_soc from profili where stato_socio = 'socio' and not organizzatore limit 1;
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_a, 'prova.f5a@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_b, 'prova.f5b@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into profili (id, nome, nickname) values (u_a, 'Prova A', 'Provina'), (u_b, 'Prova B', null) on conflict (id) do nothing;
  insert into eventi (id, nome, inizio, fine, codice) values
    (v_ev, 'Evento prova 5', oggi_roma(), oggi_roma() + 2, 'PROVAEV5'),
    (v_ev2, 'Altro evento', oggi_roma(), oggi_roma() + 2, 'PROVAEV6');

  -- A entra e registra una partita con un ospite
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform entra_evento('PROVAEV5');
  perform salva_partita(jsonb_build_object('gioco_id', v_gio, 'giocata_il', now(), 'evento_id', v_ev, 'nuovo_id', gen_random_uuid(),
    'giocatori', jsonb_build_array(jsonb_build_object('utente_id', u_a, 'posizione', 1, 'vincitore', true))));

  x := classifica_evento(v_ev);
  esito := esito || E'\n' || case when jsonb_array_length(x->'partite') = 1 then 'OK' else 'NO' end
        || ' il partecipante vede la partita dell''evento in classifica (' || jsonb_array_length(x->'partite') || ')';
  esito := esito || E'\n' || case when x->'persone'->>u_a::text = 'Provina' then 'OK' else 'NO' end
        || ' il nome è il soprannome (' || coalesce(x->'persone'->>u_a::text, '?') || ')';

  -- B, di un altro evento, non vede questa classifica
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform entra_evento('PROVAEV6');
  begin
    x := classifica_evento(v_ev);
    esito := esito || E'\nNO chi è di un altro evento ha visto la classifica';
  exception when others then
    esito := esito || E'\nOK chi è di un altro evento non vede la classifica';
  end;

  -- Un socio di Roma la vede
  reset role;
  if u_soc is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u_soc, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      x := classifica_evento(v_ev);
      esito := esito || E'\n' || case when jsonb_array_length(x->'partite') = 1 then 'OK' else 'NO' end || ' un socio di Roma vede la classifica dell''evento';
    exception when others then
      esito := esito || E'\nNO un socio di Roma vede la classifica: ' || sqlerrm;
    end;
    reset role;
  end if;

  -- Evento concluso: A la vede ancora
  update eventi set fine = oggi_roma() - 1, inizio = oggi_roma() - 3 where id = v_ev;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    x := classifica_evento(v_ev);
    esito := esito || E'\nOK a evento concluso il partecipante vede ancora la classifica';
  exception when others then
    esito := esito || E'\nNO a evento concluso: ' || sqlerrm;
  end;
  reset role;

  raise exception 'ESITO PROVA (niente è stato salvato):%', esito;
end $$;
