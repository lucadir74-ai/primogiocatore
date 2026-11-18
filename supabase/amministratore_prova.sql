-- Primo Giocatore - prova di amministratore.sql
-- v1.0.0 - 202611190000
-- Da lanciare DOPO amministratore.sql. NON SALVA NIENTE: il risultato
-- arriva come «errore» rosso che comincia con ESITO PROVA, ed è tutto
-- annullato. Ogni riga dice OK o NO. Usa gli account veri solo per
-- provare, senza lasciare tracce.

do $$
declare
  u_adm uuid;
  u_org uuid;   -- un organizzatore di Roma che non è amministratore
  u_soc uuid;   -- un socio qualunque
  b     boolean;
  esito text := '';
begin
  select id into u_adm from profili where amministratore limit 1;
  select id into u_org from profili where organizzatore and not amministratore limit 1;
  select id into u_soc from profili where not organizzatore and not amministratore and not dimostratore
    and stato_socio = 'socio' limit 1;
  if u_org is null or u_soc is null then raise exception 'Servono un organizzatore non amministratore e un socio semplice per la prova.'; end if;

  -- ===== Organizzatore di Roma =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_org, 'role', 'authenticated')::text, true);
  set local role authenticated;
  esito := esito || E'\n' || case when e_organizzatore() then 'OK' else 'NO' end || ' l''organizzatore di Roma organizza';
  esito := esito || E'\n' || case when not organizzatore_globale() then 'OK' else 'NO' end || ' l''organizzatore di Roma non è amministratore';
  esito := esito || E'\n' || case when gestisce_tana((select id from tane where nome = 'Roma' order by id limit 1)) then 'OK' else 'NO' end
        || ' l''organizzatore gestisce la Tana di Roma (soci, eventi di Roma)';
  update profili set amministratore = true where id = u_org;
  select amministratore into b from profili where id = u_org;
  esito := esito || E'\n' || case when not b then 'OK' else 'NO' end || ' l''organizzatore non si fa amministratore da solo';
  update profili set dimostratore = true where id = u_soc;
  select dimostratore into b from profili where id = u_soc;
  esito := esito || E'\n' || case when b then 'OK' else 'NO' end || ' l''organizzatore nomina un dimostratore';
  update profili set organizzatore = true where id = u_soc;
  select organizzatore into b from profili where id = u_soc;
  esito := esito || E'\n' || case when b then 'OK' else 'NO' end || ' l''organizzatore nomina un altro organizzatore di Roma';
  esito := esito || E'\n' || case when exists (select 1 from organizzatori_tana where utente_id = u_soc) then 'OK' else 'NO' end
        || ' il nuovo organizzatore entra fra gli organizzatori della Tana';
  reset role;

  -- ===== Socio semplice (tornato tale) =====
  perform set_config('primo.ruoli_ok', '1', true);
  update profili set organizzatore = false, dimostratore = false where id = u_soc;
  perform set_config('primo.ruoli_ok', '', true);
  esito := esito || E'\n' || case when not exists (select 1 from organizzatori_tana where utente_id = u_soc) then 'OK' else 'NO' end
        || ' tolto organizzatore, esce dagli organizzatori della Tana';
  perform set_config('request.jwt.claims', json_build_object('sub', u_soc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update profili set organizzatore = true, amministratore = true where id = u_soc;
  select organizzatore or amministratore into b from profili where id = u_soc;
  esito := esito || E'\n' || case when not b then 'OK' else 'NO' end || ' un socio non si dà permessi da solo';
  reset role;

  -- ===== Amministratore =====
  if (select count(*) from profili where amministratore) = 1 then
    perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update profili set amministratore = false where id = u_adm;
      esito := esito || E'\nNO l''ultimo amministratore si è tolto il permesso';
    exception when others then
      esito := esito || E'\nOK l''ultimo amministratore non può togliersi il permesso';
    end;
    reset role;
  end if;

  raise exception 'ESITO PROVA (niente è stato salvato):%', esito;
end $$;
