-- Primo Giocatore - privacy, fase 3: nuova iscrizione dei soci
-- v1.0.0 - 202611212000
-- Va eseguito DOPO privacy_fase2.sql. Si può rilanciare senza danni.
--
-- Come vuole l'associazione: il socio scrive il suo nick oppure l'email
-- con cui si è associato; se è nell'elenco, il link per attivare
-- l'account arriva all'email DELL'ELENCO (mai a un indirizzo scritto da
-- chi si iscrive) e a schermo l'email non compare mai.
-- Lo fa il server dell'app (api/iscrizione.js) con la chiave di servizio:
-- le due funzioni qui sotto le può usare solo lui, non il browser.
--
-- In più: la vecchia funzione email_tra_i_soci (che diceva a chiunque se
-- un'email era di un socio) non si può più chiamare dal browser.

-- 1. Tentativi, per il limite ------------------------------------------------
-- Si tengono solo impronte (hash) di indirizzo IP e di quello che si è
-- scritto, per un giorno al massimo.
create table if not exists public.tentativi_iscrizione (
  id         bigint generated always as identity primary key,
  quando     timestamptz not null default now(),
  ip         text not null,
  chiave     text not null
);
create index if not exists tentativi_iscrizione_quando on public.tentativi_iscrizione (quando);
alter table public.tentativi_iscrizione enable row level security;
revoke all on public.tentativi_iscrizione from anon, authenticated;

-- Segna il tentativo e dice se si può andare avanti: al massimo 5 l'ora
-- dallo stesso indirizzo IP e 3 l'ora per lo stesso nick o email.
create or replace function public.tentativo_iscrizione(p_ip text, p_chiave text)
 returns boolean language plpgsql security definer set search_path to 'public' as $f$
declare
  da_ip int;
  per_chiave int;
begin
  delete from tentativi_iscrizione where quando < now() - interval '1 day';
  select count(*) into da_ip from tentativi_iscrizione where ip = p_ip and quando > now() - interval '1 hour';
  select count(*) into per_chiave from tentativi_iscrizione where chiave = p_chiave and quando > now() - interval '1 hour';
  if da_ip >= 5 or per_chiave >= 3 then return false; end if;
  insert into tentativi_iscrizione (ip, chiave) values (p_ip, p_chiave);
  return true;
end $f$;
revoke all on function public.tentativo_iscrizione(text, text) from public, anon, authenticated;
grant execute on function public.tentativo_iscrizione(text, text) to service_role;

-- 2. Il socio dal nick o dall'email ------------------------------------------
-- Più righe se lo stesso nick è usato da soci con email diverse: il server
-- allora chiede di scrivere l'email.
create or replace function public.socio_per_iscrizione(p_chi text)
 returns table (email text, nickname text, nome text, cognome text, ha_account boolean)
 language sql stable security definer set search_path to 'public' as $f$
  select distinct on (lower(trim(s.email)))
         lower(trim(s.email)), s.nickname, s.nome, s.cognome,
         exists (select 1 from auth.users u where lower(u.email) = lower(trim(s.email)))
    from public.soci s
   where trim(coalesce(s.email, '')) <> ''
     and (lower(trim(s.email)) = lower(trim(p_chi))
          or lower(trim(s.nickname)) = lower(trim(p_chi)))
   order by lower(trim(s.email)), s.aggiunto_il desc
$f$;
revoke all on function public.socio_per_iscrizione(text) from public, anon, authenticated;
grant execute on function public.socio_per_iscrizione(text) to service_role;

-- 3. Il profilo di chi arriva dall'elenco -------------------------------------
-- Nick, nome e cognome arrivano dall'elenco soci (dati dell'invito): il
-- profilo nasce già con quelli. Il nick solo se nessun altro lo usa, così
-- un doppione non blocca mai la creazione dell'account.
create or replace function public.dati_registrazione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  m jsonb;
  nick text;
begin
  select raw_user_meta_data into m from auth.users where id = new.id;
  if m is not null then
    new.cognome := coalesce(nullif(trim(new.cognome), ''), nullif(trim(m->>'cognome'), ''));
    if coalesce((m->>'da_elenco_soci')::boolean, false) then
      new.nome    := coalesce(nullif(trim(m->>'nome'), ''), new.nome);
      new.cognome := coalesce(nullif(trim(m->>'cognome'), ''), new.cognome);
      nick := nullif(trim(m->>'nickname'), '');
      if nick is not null and not exists (select 1 from profili p where lower(p.nickname) = lower(nick) and p.id <> new.id) then
        new.nickname := nick;
      end if;
    end if;
  end if;
  new.citta := null;
  return new;
end;
$function$;

-- 4. La vecchia verifica non è più per tutti -----------------------------------
do $$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc
            where proname = 'email_tra_i_soci' and pronamespace = 'public'::regnamespace loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Controllo: devono essere «sì», «sì», «no».
select
  (case when to_regclass('public.tentativi_iscrizione') is not null then 'sì' else 'no' end) as tabella_tentativi,
  (case when exists (select 1 from pg_proc where proname = 'socio_per_iscrizione') then 'sì' else 'no' end) as ricerca_socio,
  (case when exists (select 1 from pg_proc p where p.proname = 'email_tra_i_soci'
                       and has_function_privilege('anon', p.oid, 'execute')) then 'sì' else 'no' end) as vecchia_verifica_aperta;
