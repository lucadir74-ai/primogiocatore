-- Primo Giocatore - ospiti doppi: unione automatica
-- v1.0.2 - 202611021430 (il primo controllo non gira più qui: lo fa il server)
-- Si può rilanciare senza danni. Non cancella partite né account.
--
-- Prima gli ospiti doppi li sistemava a mano un organizzatore. Ora:
-- 1. Stesso numero BGA = stessa persona, sempre. Un ospite nuovo con un
--    numero BGA già presente viene subito unito a quello esistente
--    (o all'account, se quell'ospite è già collegato a un iscritto).
-- 2. Stessa partita registrata da due iscritti diversi (stesso gioco e
--    stesso giorno, o stesso tavolo BGA, stesso numero di giocatori e
--    tutti uguali tranne uno): i due spaiati sono la stessa persona.
--    Si uniscono da soli quando la prova si ripete in almeno 2 partite.
--    Mai se hanno numeri BGA diversi o se sono stati nella stessa partita.
-- 3. L'ospite unito non si cancella: resta come «questo nome è quello»
--    (colonna unito_in), così chi lo usa ancora per nome o lo importa di
--    nuovo finisce sull'ospite giusto senza creare un altro doppione.
-- 4. Il controllo gira da solo ogni ora sul server (pg_cron), anche la
--    prima volta: il pannello di Supabase ha un limite di tempo, il server no.
--    Se un controllo è ancora in corso, il successivo salta il giro.
-- 5. «Unisci doppioni» nell'app passa dal database: funziona anche con
--    ospiti creati da altri (solo per chi organizza).
-- Il collegamento ospite → account per nome resta quello di «Sei tu?».

-- 1. Colonna dell'unione ---------------------------------------------------
alter table public.ospiti add column if not exists unito_in uuid
  references public.ospiti(id) on delete set null;
create index if not exists ospiti_unito_in on public.ospiti (unito_in);
create index if not exists ospiti_bga_id   on public.ospiti (bga_id);

-- 2. L'ospite «vero» in fondo alla catena delle unioni --------------------
create or replace function public.ospite_radice(p uuid)
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $f$
declare
  v uuid := p;
  s uuid;
  i int := 0;
begin
  if p is null then return null; end if;
  loop
    select unito_in into s from ospiti where id = v;
    exit when s is null or i > 20;
    v := s; i := i + 1;
  end loop;
  return v;
end $f$;

-- 3. Unire un ospite dentro un altro (uso interno) ------------------------
create or replace function public.unisci_dentro(p_da uuid, p_verso uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $f$
declare
  d ospiti%rowtype;
  t ospiti%rowtype;
begin
  p_da := ospite_radice(p_da);
  p_verso := ospite_radice(p_verso);
  if p_da is null or p_verso is null or p_da = p_verso then return false; end if;
  select * into d from ospiti where id = p_da;
  select * into t from ospiti where id = p_verso;
  if not found then return false; end if;

  -- Numeri BGA diversi: persone diverse.
  if d.bga_id is not null and t.bga_id is not null and d.bga_id <> t.bga_id then
    return false;
  end if;
  -- Quello che resta è già un iscritto: si collega all'account.
  if t.utente_collegato is not null then
    if d.utente_collegato is not null then return false; end if;
    perform esegui_collegamento(p_da, t.utente_collegato);
    return true;
  end if;
  if d.utente_collegato is not null then return false; end if;

  -- La stessa persona non sta due volte nella stessa partita.
  delete from partecipazioni p
  where p.ospite_id = p_da
    and exists (select 1 from partecipazioni x
                where x.partita_id = p.partita_id and x.ospite_id = p_verso);
  update partecipazioni set ospite_id = p_verso where ospite_id = p_da;

  -- Né due volte allo stesso tavolo o alla stessa serata.
  delete from iscrizioni_tavolo i
  where i.ospite_id = p_da
    and exists (select 1 from iscrizioni_tavolo x
                where x.tavolo_id = i.tavolo_id and x.ospite_id = p_verso);
  update iscrizioni_tavolo set ospite_id = p_verso where ospite_id = p_da;

  delete from disponibilita d2
  where d2.ospite_id = p_da
    and exists (select 1 from disponibilita x
                where x.serata_id = d2.serata_id and x.ospite_id = p_verso);
  update disponibilita set ospite_id = p_verso where ospite_id = p_da;

  update tavoli set dimostratore_ospite_id = p_verso where dimostratore_ospite_id = p_da;

  -- Le richieste «Sei tu?» passano all'ospite che resta.
  delete from richieste_collegamento r
  where r.ospite_id = p_da
    and exists (select 1 from richieste_collegamento x
                where x.ospite_id = p_verso and x.utente_id = r.utente_id);
  update richieste_collegamento set ospite_id = p_verso where ospite_id = p_da;

  -- Quello che resta prende ciò che gli manca.
  update ospiti set
    bga_id = coalesce(bga_id, d.bga_id),
    cognome = coalesce(nullif(trim(cognome), ''), d.cognome),
    dimostratore = coalesce(dimostratore, false) or coalesce(d.dimostratore, false)
  where id = p_verso;

  update ospiti set unito_in = p_verso where unito_in = p_da;
  update ospiti set unito_in = p_verso where id = p_da;
  return true;
end $f$;

-- 4. Ospite nuovo già presente --------------------------------------------
-- Gira dopo ospiti_riconosci (ordine alfabetico): se quello l'ha già
-- collegato a un account per nome, qui non si tocca niente.
create or replace function public.ospite_gia_presente()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
declare
  v uuid;
  u uuid;
begin
  if new.utente_collegato is not null or new.unito_in is not null then return new; end if;

  if new.bga_id is not null then
    select x.utente_collegato into u from ospiti x
    where x.bga_id = new.bga_id and x.utente_collegato is not null limit 1;
    if u is not null then
      new.utente_collegato := u;
      new.collegato_il := now();
      return new;
    end if;
    select x.id into v from ospiti x
    where x.bga_id = new.bga_id and x.unito_in is null and x.utente_collegato is null
    order by (select count(*) from partecipazioni pa where pa.ospite_id = x.id) desc, x.id
    limit 1;
    if v is not null then new.unito_in := v; return new; end if;
  end if;

  -- Lo stesso nome, dalla stessa persona, di un ospite già unito.
  if new.creato_da is not null and coalesce(trim(new.nome), '') <> '' then
    select ospite_radice(x.unito_in) into v from ospiti x
    where x.creato_da = new.creato_da and x.unito_in is not null
      and lower(trim(x.nome)) = lower(trim(new.nome))
      and lower(trim(coalesce(x.cognome, ''))) = lower(trim(coalesce(new.cognome, '')))
    limit 1;
    if v is not null then new.unito_in := v; end if;
  end if;
  return new;
end $f$;

drop trigger if exists ospiti_unito on public.ospiti;
create trigger ospiti_unito
  before insert on public.ospiti
  for each row execute function public.ospite_gia_presente();

-- 5. Chi usa un ospite unito finisce su quello giusto ---------------------
-- partecipazioni_0_unito gira prima di partecipazioni_a_utente (ordine
-- alfabetico), così se l'ospite giusto è collegato a un account la
-- partecipazione passa poi all'account.
create or replace function public.partecipazione_ospite_unito()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
declare
  r uuid;
begin
  if new.ospite_id is null then return new; end if;
  r := ospite_radice(new.ospite_id);
  if r is distinct from new.ospite_id then
    if exists (select 1 from partecipazioni x
               where x.partita_id = new.partita_id and x.ospite_id = r
                 and x.id is distinct from new.id) then
      return null;   -- è già in questa partita
    end if;
    new.ospite_id := r;
  end if;
  return new;
end $f$;

drop trigger if exists partecipazioni_0_unito on public.partecipazioni;
create trigger partecipazioni_0_unito
  before insert or update of ospite_id on public.partecipazioni
  for each row execute function public.partecipazione_ospite_unito();

create or replace function public.iscrizione_ospite_unito()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
declare
  r uuid;
begin
  if new.ospite_id is null then return new; end if;
  r := ospite_radice(new.ospite_id);
  if r is distinct from new.ospite_id then
    if exists (select 1 from iscrizioni_tavolo x
               where x.tavolo_id = new.tavolo_id and x.ospite_id = r
                 and x.id is distinct from new.id) then
      return null;
    end if;
    new.ospite_id := r;
  end if;
  return new;
end $f$;

drop trigger if exists iscrizioni_tavolo_0_unito on public.iscrizioni_tavolo;
create trigger iscrizioni_tavolo_0_unito
  before insert or update of ospite_id on public.iscrizioni_tavolo
  for each row execute function public.iscrizione_ospite_unito();

create or replace function public.disponibilita_ospite_unito()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
declare
  r uuid;
begin
  if new.ospite_id is null then return new; end if;
  r := ospite_radice(new.ospite_id);
  if r is distinct from new.ospite_id then
    if exists (select 1 from disponibilita x
               where x.serata_id = new.serata_id and x.ospite_id = r
                 and x.id is distinct from new.id) then
      return null;
    end if;
    new.ospite_id := r;
  end if;
  return new;
end $f$;

drop trigger if exists disponibilita_0_unito on public.disponibilita;
create trigger disponibilita_0_unito
  before insert or update of ospite_id on public.disponibilita
  for each row execute function public.disponibilita_ospite_unito();

create or replace function public.tavolo_dimostratore_unito()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  if new.dimostratore_ospite_id is not null then
    new.dimostratore_ospite_id := ospite_radice(new.dimostratore_ospite_id);
  end if;
  return new;
end $f$;

drop trigger if exists tavoli_0_unito on public.tavoli;
create trigger tavoli_0_unito
  before insert or update of dimostratore_ospite_id on public.tavoli
  for each row execute function public.tavolo_dimostratore_unito();

-- 6. Il controllo (ogni ora, e una volta qui sotto) -----------------------
create or replace function public.riconcilia_ospiti()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $f$
declare
  r record;
  i int;
  a uuid;
  b uuid;
  da uuid;
  verso uuid;
  n_bga int := 0;
  n_account int := 0;
  n_partite int := 0;
begin
  -- Un controllo alla volta: se il precedente non ha finito, si salta.
  if not pg_try_advisory_xact_lock(hashtext('riconcilia_ospiti')) then
    return jsonb_build_object('saltato', 'controllo precedente ancora in corso');
  end if;

  -- Livello 1a: stesso numero BGA fra ospiti liberi.
  for r in
    select s.bga_id, array_agg(s.id order by s.partite desc, s.id) as ids
    from (select o.id, o.bga_id,
                 (select count(*) from partecipazioni pa where pa.ospite_id = o.id) as partite
          from ospiti o
          where o.bga_id is not null and o.unito_in is null and o.utente_collegato is null) s
    group by s.bga_id having count(*) > 1
  loop
    for i in 2 .. array_length(r.ids, 1) loop
      if unisci_dentro(r.ids[i], r.ids[1]) then n_bga := n_bga + 1; end if;
    end loop;
  end loop;

  -- Livello 1b: ospite libero con il numero BGA di un ospite già collegato.
  for r in
    select o.id, (select x.utente_collegato from ospiti x
                  where x.bga_id = o.bga_id and x.utente_collegato is not null
                  limit 1) as u
    from ospiti o
    where o.bga_id is not null and o.unito_in is null and o.utente_collegato is null
  loop
    continue when r.u is null;
    perform esegui_collegamento(r.id, r.u);
    n_account := n_account + 1;
  end loop;

  -- Livello 2: la stessa partita registrata da due iscritti.
  for r in
    with chi as (
      select pa.partita_id,
             coalesce('u' || pa.utente_id::text,
                      'u' || o.utente_collegato::text,
                      'o' || pa.ospite_id::text) as k
      from partecipazioni pa
      left join ospiti o on o.id = pa.ospite_id
    ),
    -- Ogni partita con l'elenco dei suoi giocatori in un'unica riga:
    -- il confronto fra due partite si fa sui due elenchi, senza rileggere
    -- tutte le partecipazioni a ogni coppia (era quello a rendere lento).
    pt as (
      select p.id, p.registrata_da as reg, p.gioco_id, p.giocata_il::date as d,
             p.bga_tavolo::text as tav, array_agg(c.k) as ks, count(*) as n,
             bool_or(c.k like 'o%') as con_ospiti
      from partite p join chi c on c.partita_id = p.id
      where p.gioco_id is not null
      group by p.id
    ),
    -- Servono solo partite con almeno un ospite libero e due giocatori.
    pto as (select * from pt where con_ospiti and n >= 2),
    coppie as (
      select a1.id as p1, b1.id as p2, a1.gioco_id, a1.d, a1.ks as k1, b1.ks as k2
      from pto a1 join pto b1
        on a1.gioco_id = b1.gioco_id and a1.d = b1.d and a1.id < b1.id
      where a1.reg is distinct from b1.reg and a1.n = b1.n
        and (a1.tav is null or b1.tav is null or a1.tav = b1.tav)
      union
      select a1.id, b1.id, a1.gioco_id, a1.d, a1.ks, b1.ks
      from pto a1 join pto b1
        on a1.tav = b1.tav and a1.id < b1.id
      where a1.reg is distinct from b1.reg and a1.n = b1.n
    ),
    resti as (
      select c.gioco_id, c.d,
             array(select unnest(c.k1) except select unnest(c.k2)) as r1,
             array(select unnest(c.k2) except select unnest(c.k1)) as r2
      from coppie c
    ),
    prove as (
      select least(substr(r1[1], 2)::uuid, substr(r2[1], 2)::uuid) as oa,
             greatest(substr(r1[1], 2)::uuid, substr(r2[1], 2)::uuid) as ob,
             count(distinct (gioco_id, d)) as volte
      from resti
      where cardinality(r1) = 1 and cardinality(r2) = 1
        and r1[1] like 'o%' and r2[1] like 'o%'
      group by 1, 2
    )
    select oa, ob from prove where volte >= 2
  loop
    a := ospite_radice(r.oa);
    b := ospite_radice(r.ob);
    continue when a is null or b is null or a = b;
    -- Mai stati insieme nella stessa partita.
    continue when exists (select 1 from partecipazioni x
                          join partecipazioni y on y.partita_id = x.partita_id
                          where x.ospite_id = a and y.ospite_id = b);
    -- Resta quello con il numero BGA, altrimenti quello con più partite.
    select id into verso from ospiti where id in (a, b)
    order by (bga_id is not null) desc,
             (select count(*) from partecipazioni pa where pa.ospite_id = ospiti.id) desc, id
    limit 1;
    da := case when verso = a then b else a end;
    if unisci_dentro(da, verso) then n_partite := n_partite + 1; end if;
  end loop;

  return jsonb_build_object('stesso_numero_bga', n_bga,
                            'collegati_ad_account', n_account,
                            'stessa_partita', n_partite);
end $f$;

-- 7. «Unisci doppioni» dall'app -------------------------------------------
create or replace function public.unisci_ospiti(p_da uuid, p_verso uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $f$
declare
  b1 bigint;
  b2 bigint;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  if not (e_organizzatore() or (
      exists (select 1 from ospiti where id = p_da and creato_da = auth.uid()) and
      exists (select 1 from ospiti where id = p_verso and creato_da = auth.uid()))) then
    raise exception 'Solo chi organizza può unire ospiti creati da altri.';
  end if;
  select bga_id into b1 from ospiti where id = p_da;
  select bga_id into b2 from ospiti where id = p_verso;
  if b1 is not null and b2 is not null and b1 <> b2 then
    raise exception 'Hanno numeri BGA diversi: sono due persone diverse.';
  end if;
  if not unisci_dentro(p_da, p_verso) then
    raise exception 'Unione non riuscita.';
  end if;
end $f$;

revoke execute on function public.unisci_dentro(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.riconcilia_ospiti() from public, anon, authenticated;
revoke execute on function public.unisci_ospiti(uuid, uuid) from public, anon;
grant execute on function public.unisci_ospiti(uuid, uuid) to authenticated;

-- 8. Ogni ora sul server ---------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'pg-riconcilia-ospiti';
select cron.schedule('pg-riconcilia-ospiti', '23 * * * *',
  $$select public.riconcilia_ospiti()$$);

-- 9. Installazione finita. Il primo controllo parte al prossimo «:23».
--    Per vedere com'è andato:
--    select status, start_time, end_time, return_message
--    from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'pg-riconcilia-ospiti')
--    order by start_time desc limit 5;
select 'installato' as esito;
