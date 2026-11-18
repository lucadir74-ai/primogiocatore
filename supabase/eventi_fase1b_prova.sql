-- Primo Giocatore - prova della fase 1b (tavoli dei partecipanti)
-- v1.0.0 - 202611181600
-- Da lanciare DOPO eventi_fase1b.sql. NON SALVA NIENTE: alla fine
-- annulla tutto. Il risultato arriva come «errore» rosso che comincia
-- con ESITO PROVA: è voluto. Ogni riga dice OK o NO.

do $$
declare
  u_a   uuid := '00000000-0000-4000-8000-00000000e011';  -- partecipante che pubblica
  u_b   uuid := '00000000-0000-4000-8000-00000000e012';  -- partecipante che si iscrive
  v_ev  uuid := '00000000-0000-4000-8000-00000000e0e2';
  v_gio uuid;
  v_tav uuid;
  v_isc uuid;
  v_st  text;
  n     int;
  esito text := '';
begin
  select id into v_gio from giochi limit 1;

  insert into auth.users (id, email, aud, role, instance_id)
    values (u_a, 'prova.a@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
           (u_b, 'prova.b@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into profili (id, nome) values (u_a, 'Prova A'), (u_b, 'Prova B') on conflict (id) do nothing;
  insert into eventi (id, nome, inizio, fine, codice)
    values (v_ev, 'Evento di prova 1b', oggi_roma(), oggi_roma() + 2, 'PROVAEV2');

  -- A entra e pubblica un tavolo su approvazione
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform entra_evento('PROVAEV2');
  begin
    insert into tavoli (titolo, evento_id, host_id, inizio, pubblicato, gioco_id, su_approvazione, posti_max)
      values ('Tavolo di A', v_ev, u_a, now() + interval '1 day', true, v_gio, true, 4)
      returning id into v_tav;
    esito := esito || E'\nOK un partecipante pubblica un tavolo dell''evento su approvazione';
  exception when others then
    esito := esito || E'\nNO un partecipante pubblica un tavolo: ' || sqlerrm;
  end;
  begin
    insert into tavoli (titolo, host_id, inizio, pubblicato, gioco_id)
      values ('Tavolo fuori evento', u_a, now() + interval '1 day', true, v_gio);
    esito := esito || E'\nNO il partecipante ha pubblicato un tavolo fuori evento';
  exception when others then
    esito := esito || E'\nOK il partecipante non pubblica tavoli fuori evento';
  end;

  -- B entra e si iscrive: resta in attesa
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform entra_evento('PROVAEV2');
  begin
    insert into iscrizioni_tavolo (tavolo_id, utente_id) values (v_tav, u_b) returning id, stato into v_isc, v_st;
    esito := esito || E'\n' || case when v_st = 'attesa' then 'OK' else 'NO' end
          || ' l''iscrizione di B resta in attesa (' || v_st || ')';
  exception when others then
    esito := esito || E'\nNO B si iscrive al tavolo: ' || sqlerrm;
  end;
  update iscrizioni_tavolo set stato = 'confermato' where id = v_isc;
  select stato into v_st from iscrizioni_tavolo where id = v_isc;
  esito := esito || E'\n' || case when v_st = 'attesa' then 'OK' else 'NO' end
        || ' B non si accetta da solo (' || coalesce(v_st, '?') || ')';
  update tavoli set titolo = 'Cambiato da B' where id = v_tav;
  get diagnostics n = row_count;
  esito := esito || E'\n' || case when n = 0 then 'OK' else 'NO' end || ' B non modifica il tavolo di A';

  -- A accetta B
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update iscrizioni_tavolo set stato = 'confermato' where id = v_isc;
  select stato into v_st from iscrizioni_tavolo where id = v_isc;
  esito := esito || E'\n' || case when v_st = 'confermato' then 'OK' else 'NO' end
        || ' A accetta B (' || coalesce(v_st, '?') || ')';

  -- Evento finito: A non pubblica più
  reset role;
  update eventi set fine = oggi_roma() - 1, inizio = oggi_roma() - 3 where id = v_ev;
  set local role authenticated;
  begin
    insert into tavoli (titolo, evento_id, host_id, inizio, pubblicato, gioco_id)
      values ('Tavolo tardivo', v_ev, u_a, now() + interval '1 day', true, v_gio);
    esito := esito || E'\nNO a evento finito A ha pubblicato ancora';
  exception when others then
    esito := esito || E'\nOK a evento finito A non pubblica più';
  end;
  reset role;

  raise exception 'ESITO PROVA (niente è stato salvato):%', esito;
end $$;
