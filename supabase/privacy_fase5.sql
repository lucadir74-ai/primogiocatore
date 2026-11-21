-- Primo Giocatore - privacy, fase 5: nome e cognome visibili solo se lo scegli
-- v1.0.0 - 202611212300
-- Va eseguito DOPO privacy_fase4.sql. Si può rilanciare senza danni.
--
-- Indicazioni dell'associazione (punto 4): nick e statistiche li vedono
-- tutti i soci; nome e cognome solo se l'interessato lo sceglie, con una
-- casella non spuntata, modificabile quando vuole.
--
-- Come:
-- - i nomi veri stanno in «anagrafica»: la leggono solo la persona
--   stessa, gli organizzatori e l'amministratore;
-- - in «profili» (quello che leggono tutti, e che le funzioni dello
--   storico, delle classifiche, dei tavoli… restituiscono) nome e cognome
--   restano solo se profili.mostra_nome è vero; altrimenti sono vuoti.
--   Così nessuna di quelle funzioni va toccata: se qualcosa sfugge, il
--   nome non compare;
-- - chi scrive nome e cognome nel profilo continua a farlo come prima: un
--   controllo del database li mette in anagrafica e li toglie da profili
--   se la casella non è spuntata;
-- - le funzioni che RICONOSCONO le persone (ospiti → account) leggono i
--   nomi veri dalla vista interna persone_vere, che l'app non può leggere.
--
-- Da subito la casella è spenta per tutti: i nomi spariscono finché
-- ognuno non la accende dal profilo.

-- 1. La casella --------------------------------------------------------------------
alter table public.profili add column if not exists mostra_nome boolean not null default false;

-- 2. I nomi veri -------------------------------------------------------------------
create table if not exists public.anagrafica (
  utente_id      uuid primary key references auth.users(id) on delete cascade,
  nome           text,
  cognome        text,
  aggiornata_il  timestamptz not null default now()
);
alter table public.anagrafica enable row level security;
drop policy if exists "anagrafica: la mia, e tutte per chi organizza" on public.anagrafica;
create policy "anagrafica: la mia, e tutte per chi organizza" on public.anagrafica
  for select to authenticated using (utente_id = auth.uid() or public.e_organizzatore());
revoke insert, update, delete on public.anagrafica from anon, authenticated;
grant select on public.anagrafica to authenticated;

-- I nomi di oggi, una volta sola (se si rilancia, non si sovrascrive niente).
insert into public.anagrafica (utente_id, nome, cognome)
select p.id, nullif(trim(p.nome), ''), nullif(trim(p.cognome), '')
  from public.profili p
  join auth.users u on u.id = p.id
on conflict (utente_id) do nothing;

-- Il nome in profili ora può restare vuoto.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profili'
                and column_name = 'nome' and is_nullable = 'NO') then
    alter table public.profili alter column nome drop not null;
  end if;
end $$;

-- 3. Il controllo che separa i nomi ----------------------------------------------
-- Gira per ultimo fra i controlli prima della scrittura (nome «zz_…»),
-- dopo quello che prende nome e cognome dall'iscrizione.
create or replace function public.nome_privato()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  a anagrafica%rowtype;
  v_nome text;
  v_cognome text;
begin
  if tg_op = 'UPDATE'
     and new.nome is not distinct from old.nome
     and new.cognome is not distinct from old.cognome
     and new.mostra_nome is not distinct from old.mostra_nome then
    return new;
  end if;
  select * into a from anagrafica where utente_id = new.id;
  -- Quello che si scrive ora; se si scrive vuoto (nome nascosto), quello che c'era.
  v_nome    := coalesce(nullif(trim(new.nome), ''), a.nome);
  v_cognome := coalesce(nullif(trim(new.cognome), ''), a.cognome);
  if exists (select 1 from auth.users where id = new.id) then
    insert into anagrafica (utente_id, nome, cognome, aggiornata_il)
      values (new.id, v_nome, v_cognome, now())
    on conflict (utente_id) do update
      set nome = excluded.nome, cognome = excluded.cognome, aggiornata_il = now()
      where anagrafica.nome is distinct from excluded.nome or anagrafica.cognome is distinct from excluded.cognome;
  end if;
  if new.mostra_nome then
    new.nome := v_nome;
    new.cognome := v_cognome;
  else
    new.nome := null;
    new.cognome := null;
  end if;
  return new;
end $f$;

drop trigger if exists zz_nome_privato on public.profili;
create trigger zz_nome_privato before insert or update on public.profili
  for each row execute function public.nome_privato();

-- 4. Vista interna con i nomi veri (solo per le funzioni del database) ----------
create or replace view public.persone_vere as
  select p.id, p.nickname, p.mostra_nome,
         coalesce(a.nome, p.nome) as nome,
         coalesce(a.cognome, p.cognome) as cognome
    from public.profili p
    left join public.anagrafica a on a.utente_id = p.id;
revoke all on public.persone_vere from public, anon, authenticated;

-- 5. Le funzioni che riconoscono le persone: nomi veri ----------------------------
create or replace function public.nome_comune(p text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select position(' ' in nome_piatto(p)) = 0 and exists (
    select 1 from persone_vere pr
    where split_part(nome_piatto(pr.nome), ' ', 1) = nome_piatto(p))
$function$;

create or replace function public.utente_per_nome(p_nome text, p_cognome text, p_escludi uuid)
 returns uuid language sql stable security definer set search_path to 'public' as $function$
  with n as (
    select nome_piatto(p_nome) as nome, nome_piatto(p_cognome) as cognome
  ),
  c as (
    select nc.utente_id from nomi_collegati nc, n
    where nome_piatto(nc.nome) = n.nome and nome_piatto(nc.cognome) = n.cognome
      and n.nome <> ''
      and (n.cognome <> '' or not nome_comune(n.nome))
    union
    select p.id from persone_vere p, n
    where n.cognome <> ''
      and nome_piatto(p.nome) = n.nome and nome_piatto(p.cognome) = n.cognome
    union
    select p.id from persone_vere p, n
    where n.cognome = '' and nome_piatto(p.cognome) <> '' and nome_piatto(p.nome) <> ''
      and n.nome in (nome_piatto(p.nome) || ' ' || nome_piatto(p.cognome),
                     nome_piatto(p.cognome) || ' ' || nome_piatto(p.nome))
    union
    select p.id from persone_vere p, n
    where n.cognome = '' and n.nome <> ''
      and nome_piatto(p.nickname) = n.nome
      and not nome_comune(n.nome)
  )
  select case when count(*) = 1 and (array_agg(utente_id))[1] is distinct from p_escludi
              then (array_agg(utente_id))[1] end
  from c;
$function$;
-- Dal nome all'account: la usano solo le funzioni del database, non l'app
-- (altrimenti chiunque potrebbe scoprire chi c'è dietro un nome).
revoke all on function public.utente_per_nome(text, text, uuid) from public, anon, authenticated;
revoke all on function public.nome_comune(text) from public, anon, authenticated;

create or replace function public.riconoscimi()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  io    profili%rowtype;
  r     record;
  v_n   int := 0;
  a_nome text;
  a_cognome text;
begin
  if auth.uid() is null or not (select public.ammesso()) then return 0; end if;
  select * into io from profili where id = auth.uid();
  if not found then return 0; end if;
  -- Il mio nome vero, anche se agli altri non lo mostro.
  select a.nome, a.cognome into a_nome, a_cognome from anagrafica a where a.utente_id = auth.uid();
  io.nome := coalesce(a_nome, io.nome);
  io.cognome := coalesce(a_cognome, io.cognome);

  for r in
    with miei as materialized (
      select v from unnest(array[
        nome_piatto(io.nickname), nome_piatto(io.nome),
        nome_piatto(io.nome) || ' ' || nome_piatto(io.cognome),
        nome_piatto(io.cognome) || ' ' || nome_piatto(io.nome)]) as v
      where v <> ''
      union
      select nome_piatto(nc.nome) from nomi_collegati nc where nc.utente_id = auth.uid()
    ),
    possibili as materialized (
      select o.id, o.nome, o.cognome, o.creato_da
      from ospiti o
      where o.utente_collegato is null
        and (to_jsonb(o) ->> 'unito_in') is null
        and o.creato_da is distinct from auth.uid()
        and nome_piatto(o.nome) in (select v from miei)
    )
    select x.id from possibili x
    where utente_per_nome(x.nome, x.cognome, x.creato_da) = auth.uid()
  loop
    update richieste_collegamento
    set stato = case when utente_id = auth.uid() then 'approvata' else 'rifiutata' end,
        decisa_il = now()
    where ospite_id = r.id and stato = 'attesa';
    perform esegui_collegamento(r.id, auth.uid());
    v_n := v_n + 1;
  end loop;

  begin
    for r in
      select o.id from ospiti o
      where o.utente_collegato is null and (to_jsonb(o) ->> 'unito_in') is null
        and email_combacia(o.id)
    loop
      update richieste_collegamento
      set stato = case when utente_id = auth.uid() then 'approvata' else 'rifiutata' end,
          decisa_il = now()
      where ospite_id = r.id and stato = 'attesa';
      perform esegui_collegamento(r.id, auth.uid());
      v_n := v_n + 1;
    end loop;
  exception when undefined_function then null;
  end;

  return v_n;
end;
$function$;

create or replace function public.ospiti_simili()
 returns table(id uuid, nome text, cognome text, partite integer, ultima date, email_uguale boolean, richiesta text, creato_da text, forza integer)
 language sql stable security definer set search_path to 'public' as $function$
  with me as (
    select lower(trim(coalesce(nome, ''))) as n,
           lower(trim(coalesce(nickname, ''))) as k,
           lower(trim(coalesce(cognome, ''))) as c
    from persone_vere where id = auth.uid()
  ),
  parole as (
    select distinct w
    from me, regexp_split_to_table(me.n || ' ' || me.k || ' ' || me.c, '\s+') as w
    where length(w) >= 3
  ),
  interi as (
    select v from me,
      unnest(array[me.n, me.k, trim(me.n || ' ' || me.c), trim(me.c || ' ' || me.n)]) as v
    where v <> ''
  ),
  valutati as (
    select o.id, o.nome, o.cognome, o.creato_da,
      case
        when email_combacia(o.id) then 4
        when lower(trim(o.nome)) in (select v from interi)
          or trim(lower(trim(o.nome)) || ' ' || lower(trim(coalesce(o.cognome, '')))) in (select v from interi) then 3
        when split_part(lower(trim(o.nome)), ' ', 1) in (select w from parole) then 2
        when length(split_part(lower(trim(o.nome)), ' ', 1)) >= 3 and exists (
          select 1 from parole
          where w like split_part(lower(trim(o.nome)), ' ', 1) || '%'
             or split_part(lower(trim(o.nome)), ' ', 1) like w || '%') then 1
        else 0
      end as forza
    from ospiti o
    where o.utente_collegato is null
  )
  select v.id, v.nome, v.cognome,
    (select count(*)::int from partecipazioni pa where pa.ospite_id = v.id),
    (select max(pt.giocata_il)::date
       from partecipazioni pa join partite pt on pt.id = pa.partita_id
      where pa.ospite_id = v.id),
    v.forza = 4,
    (select r.stato from richieste_collegamento r
      where r.ospite_id = v.id and r.utente_id = auth.uid()),
    (select coalesce(p.nickname, p.nome) from profili p where p.id = v.creato_da),
    v.forza
  from valutati v
  where v.forza > 0
  order by v.forza desc, 4 desc, 2
  limit 40;
$function$;

-- Riconosce con i nomi veri; nel risultato il nome vero dell'iscritto lo
-- vede solo chi organizza, o se l'iscritto lo mostra (gli altri vedono il nick).
create or replace function public.ospiti_da_riconoscere()
 returns table(ospite_id uuid, nome text, cognome text, partite integer, ultima date, creato_da text, mio boolean, utente_id uuid, chi text, forza integer)
 language sql stable security definer set search_path to 'public' as $function$
  with g as materialized (
    select o.id, o.nome, o.cognome, o.creato_da, o.bga_id is not null as da_bga,
           nome_piatto(o.nome) as n, nome_piatto(o.cognome) as c,
           split_part(nome_piatto(o.nome), ' ', 1) as primo
    from ospiti o
    where auth.uid() is not null and (select public.ammesso())
      and o.utente_collegato is null
      and (to_jsonb(o) ->> 'unito_in') is null
      and nome_piatto(o.nome) <> ''
      and ((select public.e_organizzatore()) or o.creato_da = auth.uid())
  ),
  p as materialized (
    select pr.id, pr.nome, pr.cognome, pr.nickname, pr.mostra_nome,
           nome_piatto(pr.nome) as pn, nome_piatto(pr.nickname) as pk, nome_piatto(pr.cognome) as pc,
           split_part(nome_piatto(pr.nome), ' ', 1) as pprimo
    from persone_vere pr
  ),
  interi as materialized (
    select distinct p.id, v as intero
    from p, unnest(array[p.pk, trim(p.pn || ' ' || p.pc), trim(p.pc || ' ' || p.pn)]) as v
    where v <> ''
  ),
  coppie as (
    select g.id, g.nome, g.cognome, g.creato_da, i.id as utente, 3 as forza
    from g join interi i on g.c = '' and i.intero = g.n
    union
    select g.id, g.nome, g.cognome, g.creato_da, p.id, 3
    from g join p on g.c <> '' and p.pn = g.n and p.pc = g.c
    union all
    select x.id, x.nome, x.cognome, x.creato_da, x.utente, 2
    from (
      select g.id, g.nome, g.cognome, g.creato_da, p.id as utente, p.pn,
        rtrim(case
          when g.c <> '' and g.c = p.pc then g.n
          when g.c <> '' then null
          when g.n = p.pc then ''
          when right(g.n, length(p.pc) + 1) = ' ' || p.pc then left(g.n, length(g.n) - length(p.pc) - 1)
          when left(g.n, length(p.pc) + 1) = p.pc || ' ' then substr(g.n, length(p.pc) + 2)
        end, '. ') as resto
      from g cross join p
      where not g.da_bga and p.pc <> ''
        and not (g.c = '' and exists (select 1 from interi i where i.id = p.id and i.intero = g.n))
        and not (g.c <> '' and p.pn = g.n and p.pc = g.c)
    ) x
    where x.resto is not null
      and (x.resto = ''
           or left(x.pn, length(x.resto)) = x.resto
           or (x.pn <> '' and left(x.resto, length(x.pn)) = x.pn))
  ),
  scelte as (
    select c.*, u.nome as u_nome, u.cognome as u_cognome, u.nickname as u_nick, u.mostra_nome as u_mostra
    from coppie c join p u on u.id = c.utente
    where c.forza > 0 and c.utente is distinct from c.creato_da
  )
  select c.id, c.nome, c.cognome,
    (select count(*)::int from partecipazioni pa where pa.ospite_id = c.id),
    (select max(pt.giocata_il)::date
       from partecipazioni pa join partite pt on pt.id = pa.partita_id
      where pa.ospite_id = c.id),
    (select coalesce(nullif(trim(x.nickname), ''), x.nome) from profili x where x.id = c.creato_da),
    c.creato_da = auth.uid(),
    c.utente,
    case when c.u_mostra or (select public.e_organizzatore()) then
      trim(coalesce(c.u_nome, '') || ' ' || coalesce(c.u_cognome, ''))
        || case when coalesce(trim(c.u_nick), '') <> '' then ' (' || trim(c.u_nick) || ')' else '' end
    else coalesce(nullif(trim(c.u_nick), ''), 'iscritto') end,
    c.forza
  from scelte c
  where not exists (select 1 from richieste_collegamento r
                    where r.ospite_id = c.id and r.utente_id = c.utente)
  order by 7 desc, 4 desc, c.nome, c.id, c.forza desc
  limit 400;
$function$;

-- 6. Si nascondono i nomi di oggi --------------------------------------------------
-- Scrivere vuoto fa partire il controllo: il nome vero resta in anagrafica.
update public.profili set nome = null, cognome = null
 where not mostra_nome and (nome is not null or cognome is not null);

-- Controllo: «sì», 0, e lo stesso numero due volte.
select
  (case when exists (select 1 from pg_trigger where tgname = 'zz_nome_privato') then 'sì' else 'no' end) as controllo_attivo,
  (select count(*) from public.profili where not mostra_nome and (nome is not null or cognome is not null)) as nomi_ancora_visibili,
  (select count(*) from public.profili) as profili,
  (select count(*) from public.anagrafica) as nomi_veri_salvati;
