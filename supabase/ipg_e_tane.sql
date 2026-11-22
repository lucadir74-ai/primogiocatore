-- Primo Giocatore - classifiche «tutto o niente» e Tane separate
-- v1.0.0 - 202611222200
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Meglio PRIMA di pubblicare la versione 4.43.3 (se arriva
-- prima, il ricalcolo continua a funzionare come adesso).
--
-- 1. Classifiche (IPG). Ogni notte la tabella ipg veniva svuotata e poi
--    riempita a blocchi: un ricalcolo interrotto a metà lasciava le
--    classifiche vuote o a pezzi, anche per giorni. Ora il server scrive
--    le righe nuove in ipg_nuova (con un numero di lotto) e pubblica_ipg
--    le mette al posto delle vecchie in un'unica operazione: o tutte o
--    nessuna. Chi guarda vede la classifica vecchia finché la nuova non
--    è completa. Una classifica vuota non sostituisce mai quella che c'è.
-- 2. Tane separate (prima di attivare Pescara). decidi_non_socio: un
--    organizzatore decide solo gli account senza Tana o della propria;
--    quelli di un'altra Tana li decide chi la gestisce (o l'amministratore).
--    non_nell_elenco mostra a ciascuno solo gli account che può decidere.
--    Per Roma oggi non cambia niente.

-- 1. Classifiche --------------------------------------------------------
-- La tabella d'appoggio ha le stesse colonne di ipg (anche se ipg cambierà),
-- più il lotto. Niente indici unici: due ricalcoli insieme non si pestano.
create table if not exists public.ipg_nuova (
  like public.ipg including defaults including identity including generated
);
alter table public.ipg_nuova add column if not exists lotto uuid;
alter table public.ipg_nuova add column if not exists messo_il timestamptz not null default now();
create index if not exists ipg_nuova_lotto on public.ipg_nuova (lotto);
-- La scrive e la legge solo il server (chiave di servizio).
alter table public.ipg_nuova enable row level security;
revoke all on public.ipg_nuova from anon, authenticated;

create or replace function public.pubblica_ipg(p_lotto uuid)
 returns integer language plpgsql security invoker set search_path to 'public'
as $f$
declare
  colonne text;
  n integer;
begin
  -- Un ricalcolo alla volta: il secondo aspetta che il primo abbia finito.
  perform pg_advisory_xact_lock(hashtext('primo-giocatore:pubblica_ipg'));
  select count(*) into n from ipg_nuova where lotto = p_lotto;
  if n = 0 then
    raise exception 'Lotto vuoto: la classifica non si sostituisce con niente.';
  end if;
  -- Le colonne di ipg che si scrivono (non quelle che si riempiono da sole).
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into colonne
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'ipg'
    and c.is_identity = 'NO' and c.is_generated = 'NEVER'
    and coalesce(c.column_default, '') not like 'nextval(%'
    and exists (select 1 from information_schema.columns d
                where d.table_schema = 'public' and d.table_name = 'ipg_nuova' and d.column_name = c.column_name);
  delete from ipg where true;
  execute format('insert into ipg (%s) select %s from ipg_nuova where lotto = $1', colonne, colonne) using p_lotto;
  -- Via il lotto pubblicato e gli avanzi di ricalcoli interrotti.
  delete from ipg_nuova where lotto = p_lotto or messo_il < now() - interval '1 hour';
  return n;
end $f$;
revoke all on function public.pubblica_ipg(uuid) from public, anon, authenticated;
grant execute on function public.pubblica_ipg(uuid) to service_role;

-- 2. Tane separate ------------------------------------------------------
create or replace function public.decidi_non_socio(p_utente uuid, p_scelta text, p_tana integer,
  p_nickname text default null, p_nome text default null, p_cognome text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  posta text;
  v_tana integer;
begin
  if not public.gestisce_tana(p_tana) then raise exception 'Non gestisci questa Tana'; end if;
  -- Un account di un'altra Tana lo decide chi gestisce quella Tana.
  select p.tana_id into v_tana from public.profili p where p.id = p_utente;
  if v_tana is not null and v_tana <> p_tana and not public.gestisce_tana(v_tana) then
    raise exception 'Questo account è di un''altra Tana: lo decide chi gestisce quella Tana.';
  end if;
  select email into posta from auth.users where id = p_utente;
  if p_scelta = 'socio' then
    insert into public.soci (tana_id, nickname, nome, cognome, email)
      values (p_tana, nullif(trim(p_nickname), ''), nullif(trim(p_nome), ''), nullif(trim(p_cognome), ''), posta)
      on conflict (tana_id, lower(email)) do nothing;
    perform set_config('primo.soci_ok', '1', true);
    update public.profili set stato_socio = 'in_attesa' where id = p_utente and stato_socio = 'escluso';
    perform public.allinea_socio(p_utente);
  elsif p_scelta in ('eccezione', 'escluso', 'in_attesa') then
    perform set_config('primo.soci_ok', '1', true);
    update public.profili set stato_socio = p_scelta, tana_id = p_tana where id = p_utente;
  else
    raise exception 'Scelta non valida';
  end if;
  perform set_config('primo.soci_ok', '', true);
end $function$;
revoke all on function public.decidi_non_socio(uuid, text, integer, text, text, text) from public, anon;
grant execute on function public.decidi_non_socio(uuid, text, integer, text, text, text) to authenticated;

create or replace function public.non_nell_elenco()
 returns table(id uuid, nome text, nickname text, email text, stato_socio text, tana_id integer, creato_il timestamp with time zone)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not (public.organizzatore_globale()
          or exists (select 1 from public.organizzatori_tana o where o.utente_id = auth.uid())) then
    raise exception 'Solo per gli organizzatori';
  end if;
  return query
    select p.id, p.nome, p.nickname, u.email::text, p.stato_socio, p.tana_id, p.creato_il
    from public.profili p join auth.users u on u.id = p.id
    where p.stato_socio <> 'socio'
      -- gli organizzatori entrano comunque: non serve deciderli
      and not coalesce(p.organizzatore, false)
      and not exists (select 1 from public.organizzatori_tana o where o.utente_id = p.id)
      -- solo gli account senza Tana o di una Tana che gestisci
      and (p.tana_id is null or public.gestisce_tana(p.tana_id))
    order by (p.stato_socio = 'in_attesa') desc, p.creato_il desc;
end $function$;
revoke all on function public.non_nell_elenco() from public, anon;
grant execute on function public.non_nell_elenco() to authenticated;

-- 3. Prova dello scambio, sui dati veri --------------------------------
-- Copia la classifica di adesso in un lotto e la ripubblica: alla fine
-- ipg deve avere lo stesso numero di righe di prima. Poi controlla che
-- un lotto vuoto venga rifiutato. Se qualcosa va storto, l'errore annulla
-- tutto lo script e la classifica resta com'era.
do $$
declare
  prima integer;
  dopo integer;
  colonne text;
  l uuid := gen_random_uuid();
begin
  select count(*) into prima from public.ipg;
  if prima = 0 then
    perform set_config('primo.prova_scambio', 'saltata (classifica vuota)', false);
  else
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into colonne
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'ipg'
      and c.is_identity = 'NO' and c.is_generated = 'NEVER'
      and coalesce(c.column_default, '') not like 'nextval(%';
    execute format('insert into public.ipg_nuova (%s, lotto) select %s, $1 from public.ipg', colonne, colonne) using l;
    perform public.pubblica_ipg(l);
    select count(*) into dopo from public.ipg;
    if dopo <> prima then
      raise exception 'Lo scambio ha cambiato il numero di righe (% invece di %): annullato.', dopo, prima;
    end if;
    perform set_config('primo.prova_scambio', 'sì (' || dopo || ' righe)', false);
  end if;
  begin
    perform public.pubblica_ipg(gen_random_uuid());
    perform set_config('primo.prova_vuoto', 'NO: ha accettato un lotto vuoto', false);
  exception when others then
    perform set_config('primo.prova_vuoto', 'sì', false);
  end;
end $$;

-- Come è andata: devono essere tutti «sì».
select
  current_setting('primo.prova_scambio', true) as scambio_riuscito,
  current_setting('primo.prova_vuoto', true) as lotto_vuoto_rifiutato,
  case when not has_table_privilege('authenticated', 'public.ipg_nuova', 'SELECT')
        and not has_function_privilege('authenticated', 'public.pubblica_ipg(uuid)', 'EXECUTE')
       then 'sì' else 'no' end as solo_il_server,
  case when position('altra Tana: lo decide' in pg_get_functiondef(
         'public.decidi_non_socio(uuid, text, integer, text, text, text)'::regprocedure)) > 0
        and position('gestisce_tana(p.tana_id)' in pg_get_functiondef('public.non_nell_elenco()'::regprocedure)) > 0
       then 'sì' else 'no' end as tane_separate;
