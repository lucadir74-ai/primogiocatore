-- Primo Giocatore - riconoscimento delle persone, fase 4 (regola unica)
-- v1.2.0 - 202611122000 (fra i dubbi mai per il solo nome di battesimo: serve lo stesso cognome, o il nome intero uguale)
-- Va eseguito DOPO riconoscimento_fase1/2/3.sql, niente_doppioni.sql e
-- ospiti_doppi.sql. Si può rilanciare senza danni. Non cancella partite,
-- ospiti né account.
--
-- Prima un iscritto vedeva un elenco di nomi simili al suo e decideva lui
-- «sono io»: poteva sbagliare o prendersi il nome di un altro. Ora:
-- 1. L'iscritto non sceglie più niente. Un ospite passa al suo account
--    DA SOLO soltanto quando il nome dell'ospite è uguale
--      - al suo nick, oppure
--      - al suo nome E cognome insieme («Mario Rossi» o «Rossi Mario»),
--    e l'iscritto con quel nome è uno solo.
-- 2. Mai per un pezzo solo. Una parola sola che è anche il nome di
--    battesimo di un iscritto («Luca») non collega nessuno da sola,
--    nemmeno se è il nick di qualcuno o un nome confermato in passato:
--    di Luca ce n'è più d'uno.
-- 3. I casi dubbi li decide chi ha inserito l'ospite, che sa con chi ha
--    giocato, oppure un organizzatore. Sono dubbi solo: gli omonimi, il
--    nick che è anche un nome di battesimo, e lo stesso cognome con il
--    nome mancante o abbreviato («Salvi», «V. Salvi»). Il solo nome di
--    battesimo non propone nessuno: quegli ospiti si collegano a mano
--    dalla sezione Ospiti. Un «no» si ricorda e non viene più riproposto.
--    Gli ospiti arrivati da Board Game Arena (hanno il numero BGA) sono
--    quasi tutti avversari sconosciuti: fra i dubbi entrano solo se il
--    nome è proprio uguale a quello di un iscritto, non per somiglianza.
-- 4. Ogni nome confermato resta legato alla persona (nomi_collegati),
--    come prima.

-- 1. Un nome scritto sempre allo stesso modo --------------------------------
-- (Senza «set search_path»: usa solo funzioni di sistema, e così il
-- database la svolge sul posto invece di chiamarla riga per riga.)
create or replace function public.nome_piatto(p text)
 returns text language sql immutable
as $f$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))
$f$;

-- Una parola sola che è il nome di battesimo di almeno un iscritto.
create or replace function public.nome_comune(p text)
 returns boolean language sql stable security definer set search_path to 'public'
as $f$
  select position(' ' in nome_piatto(p)) = 0 and exists (
    select 1 from profili pr
    where split_part(nome_piatto(pr.nome), ' ', 1) = nome_piatto(p))
$f$;

-- 2. Chi è, dato un nome? Nessuno se non è uno solo, o se è chi crea l'ospite.
create or replace function public.utente_per_nome(p_nome text, p_cognome text, p_escludi uuid)
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  with n as (
    select nome_piatto(p_nome) as nome, nome_piatto(p_cognome) as cognome
  ),
  c as (
    -- un nome già confermato per quella persona
    select nc.utente_id from nomi_collegati nc, n
    where nome_piatto(nc.nome) = n.nome and nome_piatto(nc.cognome) = n.cognome
      and n.nome <> ''
      and (n.cognome <> '' or not nome_comune(n.nome))
    union
    -- nome e cognome, nei due campi
    select p.id from profili p, n
    where n.cognome <> ''
      and nome_piatto(p.nome) = n.nome and nome_piatto(p.cognome) = n.cognome
    union
    -- nome e cognome scritti tutti nel nome, in un ordine o nell'altro
    select p.id from profili p, n
    where n.cognome = '' and nome_piatto(p.cognome) <> '' and nome_piatto(p.nome) <> ''
      and n.nome in (nome_piatto(p.nome) || ' ' || nome_piatto(p.cognome),
                     nome_piatto(p.cognome) || ' ' || nome_piatto(p.nome))
    union
    -- il nick
    select p.id from profili p, n
    where n.cognome = '' and n.nome <> ''
      and nome_piatto(p.nickname) = n.nome
      and not nome_comune(n.nome)
  )
  select case when count(*) = 1 and (array_agg(utente_id))[1] is distinct from p_escludi
              then (array_agg(utente_id))[1] end
  from c;
$function$;

-- 3. All'apertura dell'app: gli ospiti che sono io, senza chiedermelo -------
-- Solo le corrispondenze esatte della regola qui sopra, più la stessa
-- email confermata di un tavolo. Restituisce quante schede ha collegato.
create or replace function public.riconoscimi()
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare
  io    profili%rowtype;
  r     record;
  v_n   int := 0;
begin
  if auth.uid() is null or not (select public.ammesso()) then return 0; end if;
  select * into io from profili where id = auth.uid();
  if not found then return 0; end if;

  -- Prima i pochi ospiti con un nome che può essere il mio (controllo
  -- leggero su tutti), poi la regola vera solo su quelli.
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

  -- Stessa email, confermata, di un'iscrizione a un tavolo: è lui.
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

-- 4. I dubbi: per chi ha inserito l'ospite (o per chi organizza) ------------
-- Una riga per coppia ospite / iscritto che gli somiglia.
-- forza 3 = nome intero o nick uguale, ma non collegato da solo (omonimi,
--           nick che è anche un nome di battesimo);
--       2 = stesso cognome, e il nome non lo contraddice.
-- Il nome di battesimo da solo non propone nessuno.
drop function if exists public.ospiti_da_riconoscere();
create function public.ospiti_da_riconoscere()
 returns table(ospite_id uuid, nome text, cognome text, partite int, ultima date, creato_da text,
               mio boolean, utente_id uuid, chi text, forza int)
 language sql stable security definer set search_path to 'public'
as $function$
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
    select pr.id, pr.nome, pr.cognome, pr.nickname,
           nome_piatto(pr.nome) as pn, nome_piatto(pr.nickname) as pk, nome_piatto(pr.cognome) as pc,
           split_part(nome_piatto(pr.nome), ' ', 1) as pprimo
    from profili pr
  ),
  -- I nomi interi di ogni iscritto: nick, «nome cognome», «cognome nome».
  interi as materialized (
    select distinct p.id, v as intero
    from p, unnest(array[p.pk, trim(p.pn || ' ' || p.pc), trim(p.pc || ' ' || p.pn)]) as v
    where v <> ''
  ),
  coppie as (
    -- Nome proprio uguale (vale anche per gli ospiti arrivati da BGA).
    select g.id, g.nome, g.cognome, g.creato_da, i.id as utente, 3 as forza
    from g join interi i on g.c = '' and i.intero = g.n
    union
    select g.id, g.nome, g.cognome, g.creato_da, p.id, 3
    from g join p on g.c <> '' and p.pn = g.n and p.pc = g.c
    union all
    -- Stesso cognome (solo per gli ospiti inseriti a mano o da un file).
    -- Il nome da solo non basta mai: «Francesco Vitolo» non è Francesco
    -- Ciabatta, e di Valerio ce n'è più d'uno. Si propone un iscritto solo
    -- se il cognome è lo stesso e quello che resta del nome non lo
    -- contraddice: niente («Salvi»), un'iniziale («V. Salvi»), un pezzo
    -- («Vale Salvi»).
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
    select c.*, u.nome as u_nome, u.cognome as u_cognome, u.nickname as u_nick
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
    trim(coalesce(c.u_nome, '') || ' ' || coalesce(c.u_cognome, ''))
      || case when coalesce(trim(c.u_nick), '') <> '' then ' (' || trim(c.u_nick) || ')' else '' end,
    c.forza
  from scelte c
  where not exists (select 1 from richieste_collegamento r
                    where r.ospite_id = c.id and r.utente_id = c.utente)
  order by 7 desc, 4 desc, c.nome, c.id, c.forza desc
  limit 400;
$function$;

-- 5. «Sì, è lui»: l'ospite passa a quell'account ----------------------------
create or replace function public.riconosci_ospite(p_ospite uuid, p_utente uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  o ospiti%rowtype;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  select * into o from ospiti where id = p_ospite;
  if not found then raise exception 'Ospite non trovato.'; end if;
  if o.utente_collegato is not null then raise exception 'Questo ospite è già collegato a un iscritto.'; end if;
  if not (public.e_organizzatore() or o.creato_da = auth.uid()) then
    raise exception 'Lo decide chi ha inserito l''ospite, o chi organizza.';
  end if;
  if p_utente = auth.uid() and not public.e_organizzatore() then
    raise exception 'Non puoi collegare a te stesso un ospite che hai inserito tu.';
  end if;
  if not exists (select 1 from profili where id = p_utente) then raise exception 'Iscritto non trovato.'; end if;

  update richieste_collegamento
  set stato = case when utente_id = p_utente then 'approvata' else 'rifiutata' end,
      decisa_da = auth.uid(), decisa_il = now()
  where ospite_id = p_ospite and stato = 'attesa';
  perform esegui_collegamento(p_ospite, p_utente);
end;
$function$;

-- 6. «No, non è nessuno di questi»: non si ripropone più --------------------
create or replace function public.ospite_non_e(p_ospite uuid, p_utenti uuid[])
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare
  o   ospiti%rowtype;
  v   uuid;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  select * into o from ospiti where id = p_ospite;
  if not found then raise exception 'Ospite non trovato.'; end if;
  if not (public.e_organizzatore() or o.creato_da = auth.uid()) then
    raise exception 'Lo decide chi ha inserito l''ospite, o chi organizza.';
  end if;
  if coalesce(array_length(p_utenti, 1), 0) > 100 then raise exception 'Troppi nomi in una volta.'; end if;

  foreach v in array coalesce(p_utenti, '{}') loop
    if not exists (select 1 from profili where id = v) then continue; end if;
    insert into richieste_collegamento (ospite_id, ospite_nome, utente_id, stato, decisa_da, decisa_il)
    values (p_ospite, o.nome, v, 'rifiutata', auth.uid(), now())
    on conflict (ospite_id, utente_id) do update
      set stato = 'rifiutata', decisa_da = auth.uid(), decisa_il = now()
      where richieste_collegamento.stato = 'attesa';
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.riconoscimi()                   from public, anon;
revoke all on function public.ospiti_da_riconoscere()         from public, anon;
revoke all on function public.riconosci_ospite(uuid, uuid)    from public, anon;
revoke all on function public.ospite_non_e(uuid, uuid[])      from public, anon;
grant execute on function public.riconoscimi()                to authenticated;
grant execute on function public.ospiti_da_riconoscere()      to authenticated;
grant execute on function public.riconosci_ospite(uuid, uuid) to authenticated;
grant execute on function public.ospite_non_e(uuid, uuid[])   to authenticated;

-- 7. Una volta: gli ospiti liberi che la regola nuova riconosce -------------
do $$
declare
  r record;
  v uuid;
  n int := 0;
begin
  -- Solo gli ospiti il cui nome è il nick, il nome intero o un nome
  -- confermato di qualcuno: gli altri non li riconoscerebbe comunque.
  for r in
    with noti as materialized (
      select nome_piatto(nickname) as k from profili
      union select nome_piatto(nome) from profili
      union select nome_piatto(nome) || ' ' || nome_piatto(cognome) from profili
      union select nome_piatto(cognome) || ' ' || nome_piatto(nome) from profili
      union select nome_piatto(nome) from nomi_collegati
    )
    select o.id, o.nome, o.cognome, o.creato_da from ospiti o
    where o.utente_collegato is null and o.creato_da is not null
      and (to_jsonb(o) ->> 'unito_in') is null
      and nome_piatto(o.nome) in (select k from noti where k <> '')
  loop
    v := utente_per_nome(r.nome, r.cognome, r.creato_da);
    if v is not null then
      update richieste_collegamento
      set stato = case when utente_id = v then 'approvata' else 'rifiutata' end,
          decisa_il = now()
      where ospite_id = r.id and stato = 'attesa';
      perform esegui_collegamento(r.id, v);
      n := n + 1;
    end if;
  end loop;
  raise notice 'Ospiti collegati dalla regola nuova: %', n;
end $$;

-- Come è andata. nick_doppi deve restare vuoto: due iscritti con lo stesso
-- nick non vengono riconosciuti da soli per quel nick, finché uno non lo cambia.
select
  (select count(*) from ospiti where utente_collegato is not null) as ospiti_collegati,
  (select count(*) from ospiti o where o.utente_collegato is null
     and (to_jsonb(o) ->> 'unito_in') is null) as ospiti_liberi,
  (select count(*) from richieste_collegamento where stato = 'attesa') as richieste_in_attesa,
  (select string_agg(k, ', ') from (
     select lower(trim(nickname)) as k from profili where coalesce(trim(nickname), '') <> ''
     group by 1 having count(*) > 1) d) as nick_doppi;
