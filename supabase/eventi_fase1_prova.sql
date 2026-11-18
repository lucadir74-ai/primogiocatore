-- Primo Giocatore - prova della fase 1 eventi
-- v1.0.0 - 202611181430
-- Da lanciare DOPO eventi_fase1.sql. NON SALVA NIENTE: crea account,
-- evento e partita finti, prova cosa può fare ognuno e alla fine
-- annulla tutto. Il risultato arriva come «errore» rosso: è voluto,
-- è il modo per annullare. Ogni riga dice OK o NO.

do $$
declare
  u_est  uuid := '00000000-0000-4000-8000-00000000e001';  -- esterno (Pescara / nessuna tana)
  u_org  uuid := '00000000-0000-4000-8000-00000000e002';  -- organizzatore dell'evento, non socio
  u_soc  uuid;                                             -- un socio vero di Roma (solo letture)
  v_ev   uuid := '00000000-0000-4000-8000-00000000e0e1';
  v_gio  uuid;
  v_par  uuid;
  v_tav  uuid;
  n      int;
  esito  text := '';
  ok     boolean;
  x      jsonb;
begin
  select id into v_gio from giochi limit 1;
  select id into u_soc from profili where stato_socio = 'socio' and not organizzatore limit 1;

  esito := esito || E'\ncontrollo soci acceso: ' ||
    coalesce((select valore::text from impostazioni where chiave = 'controllo_soci'), 'non impostato');

  -- Account finti
  insert into auth.users (id, email, aud, role, instance_id)
    values (u_est, 'prova.esterno@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
           (u_org, 'prova.orgevento@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into profili (id, nome) values (u_est, 'Prova Esterno'), (u_org, 'Prova Org Evento')
    on conflict (id) do nothing;
  insert into eventi (id, nome, inizio, fine, codice)
    values (v_ev, 'Evento di prova', oggi_roma(), oggi_roma() + 2, 'PROVAEV1');
  insert into evento_ruoli (evento_id, utente_id, ruolo) values (v_ev, u_org, 'organizzatore');

  -- ===== Esterno =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
  set local role authenticated;

  x := entra_evento('provaev1');
  esito := esito || E'\n' || case when x ->> 'stato' = 'partecipante' then 'OK' else 'NO' end
        || ' esterno entra con il codice e diventa partecipante (' || coalesce(x ->> 'stato', '?') || ')';
  esito := esito || E'\n' || case when not ammesso() then 'OK' else 'NO' end || ' esterno non ammesso all''app completa';

  select count(*) into n from partite;
  esito := esito || E'\n' || case when n = 0 then 'OK' else 'NO' end || ' esterno vede 0 partite fuori evento (' || n || ')';
  select count(*) into n from tavoli where evento_id is distinct from v_ev;
  esito := esito || E'\n' || case when n = 0 then 'OK' else 'NO' end || ' esterno vede 0 tavoli fuori evento (' || n || ')';
  select count(*) into n from profili;
  esito := esito || E'\n' || case when n <= 2 then 'OK' else 'NO' end || ' esterno vede solo i profili dell''evento (' || n || ')';
  select count(*) into n from ospiti;
  esito := esito || E'\n' || case when n = 0 then 'OK' else 'NO' end || ' esterno vede 0 ospiti (' || n || ')';

  -- Registra una partita dell'evento
  begin
    insert into partite (gioco_id, evento_id, registrata_da) values (v_gio, v_ev, u_est) returning id into v_par;
    insert into partecipazioni (partita_id, utente_id, posizione, vincitore) values (v_par, u_est, 1, true);
    insert into partecipazioni (partita_id, utente_id, posizione) values (v_par, u_org, 2);
    esito := esito || E'\nOK esterno registra una partita dell''evento';
  exception when others then
    esito := esito || E'\nNO esterno registra una partita dell''evento: ' || sqlerrm;
  end;

  begin
    insert into partite (gioco_id, registrata_da) values (v_gio, u_est);
    esito := esito || E'\nNO esterno ha registrato una partita fuori evento';
  exception when others then
    esito := esito || E'\nOK esterno non registra partite fuori evento';
  end;

  begin
    insert into tavoli (titolo, evento_id, host_id, inizio, pubblicato)
      values ('Tavolo esterno', v_ev, u_est, now() + interval '1 day', true);
    esito := esito || E'\nNO esterno ha pubblicato un tavolo (non è dimostratore)';
  exception when others then
    esito := esito || E'\nOK esterno non pubblica tavoli';
  end;

  -- ===== Organizzatore dell'evento =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_org, 'role', 'authenticated')::text, true);
  set local role authenticated;

  esito := esito || E'\n' || case when not ammesso() then 'OK' else 'NO' end || ' organizzatore evento non ammesso all''app completa';
  begin
    insert into tavoli (titolo, evento_id, host_id, inizio, pubblicato, gioco_id)
      values ('Tavolo di prova', v_ev, u_org, now() + interval '1 day', true, v_gio) returning id into v_tav;
    esito := esito || E'\nOK organizzatore evento pubblica un tavolo dell''evento';
  exception when others then
    esito := esito || E'\nNO organizzatore evento pubblica un tavolo: ' || sqlerrm;
  end;
  begin
    insert into evento_ruoli (evento_id, utente_id, ruolo) values (v_ev, u_est, 'organizzatore')
      on conflict (evento_id, utente_id) do update set ruolo = 'organizzatore';
    esito := esito || E'\nNO organizzatore evento ha nominato un altro organizzatore';
  exception when others then
    esito := esito || E'\nOK organizzatore evento non nomina altri organizzatori';
  end;
  begin
    update evento_ruoli set ruolo = 'dimostratore' where evento_id = v_ev and utente_id = u_est;
    get diagnostics n = row_count;
    esito := esito || E'\n' || case when n = 1 then 'OK' else 'NO' end || ' organizzatore evento nomina un dimostratore';
  exception when others then
    esito := esito || E'\nNO organizzatore evento nomina un dimostratore: ' || sqlerrm;
  end;

  -- ===== Esterno si iscrive al tavolo =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into iscrizioni_tavolo (tavolo_id, utente_id) values (v_tav, u_est);
    esito := esito || E'\nOK esterno si iscrive al tavolo dell''evento';
  exception when others then
    esito := esito || E'\nNO esterno si iscrive al tavolo: ' || sqlerrm;
  end;

  -- ===== Evento finito =====
  reset role;
  update eventi set fine = oggi_roma() - 1, inizio = oggi_roma() - 3 where id = v_ev;
  perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from partite where evento_id = v_ev;
  esito := esito || E'\n' || case when n = 1 then 'OK' else 'NO' end || ' a evento finito l''esterno vede ancora la sua partita (' || n || ')';
  begin
    insert into partite (gioco_id, evento_id, registrata_da) values (v_gio, v_ev, u_est);
    esito := esito || E'\nNO a evento finito l''esterno ha registrato ancora';
  exception when others then
    esito := esito || E'\nOK a evento finito l''esterno non registra più';
  end;
  begin
    update partite set note = 'modificata' where id = v_par;
    get diagnostics n = row_count;
    esito := esito || E'\n' || case when n = 0 then 'OK' else 'NO' end || ' a evento finito l''esterno non modifica la partita';
  exception when others then
    esito := esito || E'\nOK a evento finito l''esterno non modifica la partita';
  end;
  select count(*) into n from tavoli where id = v_tav;
  esito := esito || E'\n' || case when n = 1 then 'OK' else 'NO' end || ' a evento finito l''esterno vede ancora il tavolo';

  -- ===== Socio vero di Roma: solo letture =====
  reset role;
  if u_soc is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u_soc, 'role', 'authenticated')::text, true);
    set local role authenticated;
    esito := esito || E'\n' || case when ammesso() then 'OK' else 'NO' end || ' un socio di Roma resta ammesso';
    select count(*) into n from partite;
    esito := esito || E'\n' || case when n > 0 then 'OK' else 'NO' end || ' il socio vede le sue partite (' || n || ')';
    select count(*) into n from profili;
    esito := esito || E'\n' || case when n > 2 then 'OK' else 'NO' end || ' il socio vede tutti i profili (' || n || ')';
    reset role;
  else
    esito := esito || E'\n-- nessun socio con account da provare';
  end if;

  raise exception 'ESITO PROVA (niente è stato salvato):%', esito;
end $$;
