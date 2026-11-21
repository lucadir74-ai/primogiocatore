-- Primo Giocatore - privacy, fase 6: i miei dati, ex soci
-- v1.0.0 - 202611220000
-- Va eseguito DOPO privacy_fase5.sql. Si può rilanciare senza danni.
--
-- Indicazioni dell'associazione:
-- - punto 5: nel profilo «scarica i miei dati» (CSV o JSON);
-- - punto 6: chi non è più socio va disattivato e i suoi dati cancellati
--   o resi anonimi, nei tempi che decide l'associazione.
--
-- Qui:
-- 1. i_miei_dati(): tutto quello che l'app ha su di me, in un documento.
--    Prende da sola ogni tabella con la colonna utente_id, così una
--    tabella nuova non viene dimenticata. Non include i dati degli altri
--    (per esempio gli altri giocatori delle mie partite).
-- 2. Quando un account smette di essere socio (tolto dall'elenco) si segna
--    il giorno: profili.non_socio_dal. Torna socio → si cancella.
--    L'account è già bloccato (resta «in attesa» col controllo soci acceso).
-- 3. ex_soci() ed elimina_account_ex_socio(): l'amministratore vede da
--    quanti giorni ognuno non è più socio e, quando è il momento, elimina
--    l'account esattamente come «Elimina il mio account» (partite
--    anonime, «Ex giocatore»). Si segna nel registro.
-- 4. Se un profilo viene cancellato, sparisce anche il suo nome vero.

-- 1. I miei dati ---------------------------------------------------------------
create or replace function public.i_miei_dati()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare
  io uuid := auth.uid();
  posta text;
  t record;
  v jsonb;
  esito jsonb;
begin
  if io is null then raise exception 'Entra nell''app per scaricare i tuoi dati.'; end if;
  select email into posta from auth.users where id = io;

  esito := jsonb_build_object(
    'esportato_il', now(),
    'nota', 'Dati di Primo Giocatore che riguardano te. Le partite contano solo il tuo risultato, non i dati degli altri giocatori.',
    'account', (select jsonb_build_object('email', u.email, 'creato_il', u.created_at, 'ultimo_accesso', u.last_sign_in_at)
                  from auth.users u where u.id = io),
    -- Nome e cognome veri stanno qui sotto: nel profilo c'è solo la copia per gli altri.
    'profilo', (select to_jsonb(p) - 'nome' - 'cognome' from profili p where p.id = io),
    'nome_e_cognome', (select jsonb_build_object('nome', a.nome, 'cognome', a.cognome) from anagrafica a where a.utente_id = io),
    'elenco_soci', (select coalesce(jsonb_agg(to_jsonb(s) - 'id'), '[]'::jsonb)
                      from soci s where lower(trim(s.email)) = lower(trim(posta))),
    'partite', (select coalesce(jsonb_agg(jsonb_build_object(
                    'partita_id', pt.id, 'giocata_il', pt.giocata_il, 'gioco', g.nome, 'durata_minuti', pt.durata_minuti)
                    order by pt.giocata_il), '[]'::jsonb)
                  from partecipazioni pa
                  join partite pt on pt.id = pa.partita_id
                  left join giochi g on g.id = pt.gioco_id
                 where pa.utente_id = io)
  );

  -- Ogni tabella con la colonna utente_id: le mie righe.
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'utente_id' and tb.table_type = 'BASE TABLE'
       and c.table_name not in ('anagrafica')
     order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.utente_id::text = $1', t.table_name)
      into v using io::text;
    if v <> '[]'::jsonb then esito := esito || jsonb_build_object(t.table_name, v); end if;
  end loop;

  return esito;
end $f$;
revoke all on function public.i_miei_dati() from public, anon;
grant execute on function public.i_miei_dati() to authenticated;

-- 2. Da quando non è più socio ------------------------------------------------
alter table public.profili add column if not exists non_socio_dal timestamptz;

create or replace function public.segna_non_socio()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.stato_socio is distinct from old.stato_socio then
    if old.stato_socio = 'socio' and new.stato_socio in ('in_attesa', 'escluso') then
      new.non_socio_dal := coalesce(new.non_socio_dal, now());
    elsif new.stato_socio in ('socio', 'eccezione', 'partecipante') then
      new.non_socio_dal := null;
    end if;
  end if;
  return new;
end $f$;
drop trigger if exists segna_non_socio on public.profili;
create trigger segna_non_socio before update of stato_socio on public.profili
  for each row execute function public.segna_non_socio();

-- 3. Ex soci, per l'amministratore ---------------------------------------------
create or replace function public.ex_soci()
 returns table (id uuid, nickname text, nome text, cognome text, email text, stato_socio text, non_socio_dal timestamptz, giorni int)
 language sql stable security definer set search_path to 'public' as $f$
  select p.id, p.nickname, v.nome, v.cognome, u.email, p.stato_socio, p.non_socio_dal,
         (current_date - p.non_socio_dal::date)::int
    from profili p
    join persone_vere v on v.id = p.id
    left join auth.users u on u.id = p.id
   where public.organizzatore_globale()
     and p.non_socio_dal is not null
     and p.stato_socio in ('in_attesa', 'escluso')
   order by p.non_socio_dal
$f$;
revoke all on function public.ex_soci() from public, anon;
grant execute on function public.ex_soci() to authenticated;

-- Elimina l'account di un ex socio come farebbe lui con «Elimina il mio
-- account»: la stessa funzione, eseguita a suo nome solo per questa
-- operazione (poi si torna all'amministratore).
create or replace function public.elimina_account_ex_socio(p_utente uuid)
 returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  p profili%rowtype;
  claims_prima text := current_setting('request.jwt.claims', true);
  sub_prima text := current_setting('request.jwt.claim.sub', true);
  chi text;
begin
  if not public.organizzatore_globale() then
    raise exception 'Solo l''amministratore dell''app elimina gli account degli ex soci.';
  end if;
  select * into p from profili where id = p_utente;
  if not found then raise exception 'Account non trovato.'; end if;
  if p.non_socio_dal is null or p.stato_socio not in ('in_attesa', 'escluso') then
    raise exception 'Questo account risulta ancora socio (o eccezione): non si elimina da qui.';
  end if;
  chi := coalesce(nullif(trim(p.nickname), ''), 'account');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_utente::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_utente::text, true);
  perform public.elimina_mio_account();
  perform set_config('request.jwt.claims', coalesce(claims_prima, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(sub_prima, ''), true);

  perform registra('account di ex socio eliminato',
    chi || ' · non socio dal ' || to_char(p.non_socio_dal, 'DD/MM/YYYY'));
end $f$;
revoke all on function public.elimina_account_ex_socio(uuid) from public, anon;
grant execute on function public.elimina_account_ex_socio(uuid) to authenticated;

-- 4. Profilo cancellato → via anche il nome vero ------------------------------
create or replace function public.via_anagrafica()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  delete from anagrafica where utente_id = old.id;
  return null;
end $f$;
drop trigger if exists via_anagrafica on public.profili;
create trigger via_anagrafica after delete on public.profili
  for each row execute function public.via_anagrafica();

-- Pulizia: nomi veri rimasti senza profilo.
delete from public.anagrafica a where not exists (select 1 from public.profili p where p.id = a.utente_id);

-- Controllo: «sì», «sì», «sì».
select
  (case when exists (select 1 from pg_proc where proname = 'i_miei_dati') then 'sì' else 'no' end) as i_miei_dati,
  (case when exists (select 1 from pg_trigger where tgname = 'segna_non_socio') then 'sì' else 'no' end) as segna_ex_soci,
  (case when exists (select 1 from pg_proc where proname = 'elimina_mio_account') then 'sì' else 'no' end) as elimina_account_presente;
