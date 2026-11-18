-- Primo Giocatore - lettura per il lavoro sugli eventi
-- v1.0.0 - 202611181200
-- SOLO LETTURA: non cambia niente. Restituisce una riga con un unico
-- testo (JSON) da copiare: funzioni di accesso, colonne delle tabelle
-- coinvolte, regole di sicurezza e tane.

with
tabelle(nome) as (values
  ('profili'),('tane'),('soci'),('organizzatori_tana'),('tavoli'),('iscrizioni_tavolo'),
  ('serate'),('disponibilita'),('partite'),('partecipazioni'),('ospiti'),('ipg'),('luoghi'),
  ('gruppi'),('impostazioni')
),
funzioni as (
  select p.proname as nome, pg_get_functiondef(p.oid) as testo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (p.proname in ('ammesso','e_organizzatore','organizzatore_globale','e_dimostratore',
                       'gestisco_tavolo','spiego_tavolo','tavolo_pubblicato','ids_tavoli_iscritto',
                       'ids_gruppi_miei','ids_luoghi_visibili','nuovo_utente','handle_new_user')
         or p.prosrc ilike '%stato_socio%'
         or p.prosrc ilike '%organizzatori_tana%')
)
select jsonb_build_object(
  'funzioni', (select jsonb_agg(jsonb_build_object('nome', nome, 'testo', testo) order by nome) from funzioni),
  'colonne', (select jsonb_object_agg(c.table_name, c.cols) from (
      select table_name, jsonb_agg(column_name || ' ' || data_type
             || case when is_nullable = 'NO' then ' not null' else '' end
             || coalesce(' = ' || column_default, '') order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'public' and table_name in (select nome from tabelle)
      group by table_name) c),
  'regole', (select jsonb_agg(jsonb_build_object('tabella', tablename, 'nome', policyname,
               'tipo', permissive, 'per', cmd, 'using', qual, 'check', with_check)
             order by tablename, policyname)
             from pg_policies where schemaname = 'public' and tablename in (select nome from tabelle)),
  'trigger', (select jsonb_agg(jsonb_build_object('tabella', event_object_table, 'nome', trigger_name,
               'azione', action_statement) order by event_object_table, trigger_name)
             from information_schema.triggers
             where trigger_schema = 'public' and event_object_table in (select nome from tabelle)),
  'tane', (select jsonb_agg(to_jsonb(t)) from public.tane t),
  'quanti', jsonb_build_object(
     'profili', (select count(*) from public.profili),
     'soci', (select count(*) from public.soci),
     'partite', (select count(*) from public.partite))
)::text as risultato;
