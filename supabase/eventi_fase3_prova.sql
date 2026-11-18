-- Primo Giocatore - prova della fase 3 (partite dell'evento)
-- v1.0.0 - 202611181900
-- Da lanciare DOPO eventi_fase3.sql. NON SALVA NIENTE: alla fine
-- annulla tutto. Il risultato arriva come «errore» rosso che comincia
-- con ESITO PROVA: è voluto. Ogni riga dice OK o NO.

do $$
declare
  u_a   uuid := '00000000-0000-4000-8000-00000000e021';
  v_ev  uuid := '00000000-0000-4000-8000-00000000e0e3';
  v_gio uuid;
  v_par uuid;
  v_ev2 uuid;
  n     int;
  esito text := '';
begin
  select id into v_gio from giochi limit 1;
  insert into auth.users (id, email, aud, role, instance_id)
    values (u_a, 'prova.f3@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into profili (id, nome) values (u_a, 'Prova F3') on conflict (id) do nothing;
  insert into eventi (id, nome, inizio, fine, codice) values (v_ev, 'Evento prova 3', oggi_roma(), oggi_roma() + 2, 'PROVAEV3');

  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform entra_evento('PROVAEV3');

  begin
    v_par := salva_partita(jsonb_build_object(
      'gioco_id', v_gio, 'giocata_il', now(), 'tipo_punteggio', 'punti', 'evento_id', v_ev,
      'nuovo_id', gen_random_uuid(),
      'giocatori', jsonb_build_array(
        jsonb_build_object('utente_id', u_a, 'punteggio_totale', 42, 'posizione', 1, 'vincitore', true))));
    select evento_id into v_ev2 from partite where id = v_par;
    esito := esito || E'\n' || case when v_ev2 = v_ev then 'OK' else 'NO' end || ' il partecipante salva una partita dell''evento';
  exception when others then
    esito := esito || E'\nNO il partecipante salva una partita dell''evento: ' || sqlerrm;
  end;

  begin
    perform salva_partita(jsonb_build_object('gioco_id', v_gio, 'giocata_il', now(),
      'giocatori', jsonb_build_array(jsonb_build_object('utente_id', u_a))));
    esito := esito || E'\nNO il partecipante ha salvato una partita fuori evento';
  exception when others then
    esito := esito || E'\nOK il partecipante non salva partite fuori evento';
  end;

  -- Modifica senza evento nei dati: l'evento resta
  begin
    perform salva_partita(jsonb_build_object('partita_id', v_par, 'gioco_id', v_gio, 'giocata_il', now(),
      'giocatori', jsonb_build_array(jsonb_build_object('utente_id', u_a, 'punteggio_totale', 50))));
    select evento_id into v_ev2 from partite where id = v_par;
    esito := esito || E'\n' || case when v_ev2 = v_ev then 'OK' else 'NO' end || ' modificando la partita l''evento resta';
  exception when others then
    esito := esito || E'\nNO modifica della partita: ' || sqlerrm;
  end;

  select count(*) into n from partecipazioni where partita_id = v_par;
  esito := esito || E'\n' || case when n = 1 then 'OK' else 'NO' end || ' i giocatori della partita sono quelli giusti (' || n || ')';

  reset role;
  raise exception 'ESITO PROVA (niente è stato salvato):%', esito;
end $$;
