-- Primo Giocatore - correzioni della verifica del 02/11, seconda parte
-- v1.0.0 - 202611030100
-- 1. Iscrizione dal link pubblico: iscrizione e contatti si salvano insieme,
--    con una funzione sola (iscriviti_tavolo). Nessuno può più attaccare i
--    propri contatti all'iscrizione di un altro (e poi farsi riconoscere
--    con «Sei tu?» al suo posto).
-- 2. Chi si iscrive senza account va sempre in attesa: lo conferma chi
--    gestisce il tavolo.
-- 3. Chi era stato tolto (annullato) può iscriversi di nuovo.
-- 4. Non ci si iscrive a un tavolo già passato (chi lo gestisce sì).
-- 5. BGG: una partita arrivata da BGG e cancellata qui non rientra più
--    alla sincronizzazione successiva (tabella bgg_scartate).
-- Va lanciato DOPO sicurezza_verifica.sql. Si può rilanciare senza danni.

-- 1-3. Il trigger delle iscrizioni ---------------------------------------
create or replace function public.proteggi_iscrizione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
declare
  v_max   int;
  v_conf  int;
  v_appr  boolean;
  -- La funzione iscriviti_tavolo può riattivare un'iscrizione annullata.
  v_dalla_funzione boolean := coalesce(current_setting('primo.iscrizione_ok', true), '') = '1';
begin
  -- Chi gestisce o spiega QUESTO tavolo decide tutto.
  if public.gestisco_tavolo(new.tavolo_id) or public.spiego_tavolo(new.tavolo_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.tavolo_id := old.tavolo_id;
    new.ruolo := old.ruolo;
    new.utente_id := old.utente_id;
    new.ospite_id := old.ospite_id;
    if new.stato is not distinct from old.stato then return new; end if;
    -- Da sé ci si può solo annullare...
    if new.stato = 'annullato' then return new; end if;
    -- ...o tornare, ma solo da annullato e passando da iscriviti_tavolo.
    if not (v_dalla_funzione and old.stato = 'annullato') then
      new.stato := old.stato;
      return new;
    end if;
  else
    new.utente_id := auth.uid();      -- nessuno iscrive un altro
    new.ospite_id := null;
    new.ruolo := 'giocatore';
  end if;

  -- Un'iscrizione alla volta per tavolo: due arrivi nello stesso istante
  -- non sforano i posti.
  select posti_max, su_approvazione into v_max, v_appr
  from tavoli where id = new.tavolo_id for update;
  select count(*) into v_conf from iscrizioni_tavolo
    where tavolo_id = new.tavolo_id and stato = 'confermato' and id is distinct from new.id;
  new.stato := case
    when auth.uid() is null then 'attesa'                         -- senza account: conferma chi gestisce
    when v_appr then 'attesa'                                     -- aspetta di essere accettato
    when v_max is not null and v_conf >= v_max then 'attesa'      -- lista d'attesa
    else 'confermato'
  end;
  return new;
end $f$;

-- 4. Niente iscrizioni a tavoli già passati (chi gestisce sì) --------------
drop policy if exists "iscrizioni creazione" on public.iscrizioni_tavolo;
create policy "iscrizioni creazione" on public.iscrizioni_tavolo for insert to public
  with check (gestisco_tavolo(tavolo_id) or exists (
    select 1 from tavoli t
    where t.id = iscrizioni_tavolo.tavolo_id and t.pubblicato = true and t.stato = 'aperto'
      and t.inizio > now()
      and (t.chiusura_iscrizioni is null or t.chiusura_iscrizioni > now())));

-- 1. I contatti li scrive solo chi gestisce il tavolo (o spiega, regole a
--    parte già esistenti) e la funzione d'iscrizione.
drop policy if exists "contatti scrittura" on public.iscrizioni_contatti;
create policy "contatti scrittura" on public.iscrizioni_contatti for insert to public
  with check (exists (select 1 from iscrizioni_tavolo i
                      where i.id = iscrizioni_contatti.iscrizione_id and gestisco_tavolo(i.tavolo_id)));

-- La funzione d'iscrizione: con o senza account. Restituisce lo stato
-- ('confermato' o 'attesa'), oppure 'gia' se si era già iscritti.
create or replace function public.iscriviti_tavolo(p_tavolo uuid, p_nome text, p_email text default null,
                                                   p_telefono text default null, p_disposto boolean default false)
 returns text language plpgsql security definer set search_path to 'public'
as $f$
declare
  t tavoli%rowtype;
  v_id uuid;
  v_stato text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
begin
  select * into t from tavoli where id = p_tavolo;
  if not found or not t.pubblicato then raise exception 'Questo tavolo non esiste, oppure non è più pubblicato.'; end if;
  if t.stato <> 'aperto' or (t.chiusura_iscrizioni is not null and t.chiusura_iscrizioni <= now()) then
    raise exception 'Le iscrizioni a questo tavolo sono chiuse.';
  end if;
  if t.inizio <= now() then raise exception 'Questo tavolo è già cominciato.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Serve il nome.'; end if;
  if auth.uid() is null and v_email is null and v_tel is null then
    raise exception 'Lascia almeno un contatto: email o telefono.';
  end if;

  if auth.uid() is not null then
    select id, stato into v_id, v_stato from iscrizioni_tavolo where tavolo_id = p_tavolo and utente_id = auth.uid();
    if v_id is not null and v_stato <> 'annullato' then return 'gia'; end if;
  elsif v_email is not null then
    -- Senza account: la stessa email una volta sola per tavolo.
    if exists (select 1 from iscrizioni_tavolo i join iscrizioni_contatti c on c.iscrizione_id = i.id
               where i.tavolo_id = p_tavolo and i.stato <> 'annullato' and lower(c.email) = v_email) then
      return 'gia';
    end if;
  end if;

  perform set_config('primo.iscrizione_ok', '1', true);
  if v_id is not null then
    update iscrizioni_tavolo set stato = 'confermato', nome_visibile = trim(p_nome),
           disposto_a_dimostrare = coalesce(p_disposto, false)
     where id = v_id returning stato into v_stato;
  else
    insert into iscrizioni_tavolo (tavolo_id, nome_visibile, disposto_a_dimostrare)
    values (p_tavolo, trim(p_nome), coalesce(p_disposto, false))
    returning id, stato into v_id, v_stato;
  end if;
  perform set_config('primo.iscrizione_ok', '', true);

  if v_email is not null or v_tel is not null then
    insert into iscrizioni_contatti (iscrizione_id, email, telefono) values (v_id, v_email, v_tel)
    on conflict (iscrizione_id) do update set email = excluded.email, telefono = excluded.telefono;
  end if;
  return v_stato;
end $f$;
revoke all on function public.iscriviti_tavolo(uuid, text, text, text, boolean) from public;
grant execute on function public.iscriviti_tavolo(uuid, text, text, text, boolean) to anon, authenticated;

-- 5. BGG: le partite arrivate da BGG e cancellate qui ---------------------
create table if not exists public.bgg_scartate (
  utente_id uuid not null references public.profili(id) on delete cascade,
  bgg_play_id bigint not null,
  scartata_il timestamptz not null default now(),
  primary key (utente_id, bgg_play_id)
);
alter table public.bgg_scartate enable row level security;
drop policy if exists "bgg_scartate proprie" on public.bgg_scartate;
create policy "bgg_scartate proprie" on public.bgg_scartate for select to authenticated using (utente_id = auth.uid());
drop policy if exists "bgg_scartate togli" on public.bgg_scartate;
create policy "bgg_scartate togli" on public.bgg_scartate for delete to authenticated using (utente_id = auth.uid());
grant select, delete on public.bgg_scartate to authenticated;

create or replace function public.bgg_segna_scartata()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  if old.chiave_esterna like 'bgg:%' and old.registrata_da is not null
     and substr(old.chiave_esterna, 5) ~ '^\d+$' then
    insert into bgg_scartate (utente_id, bgg_play_id)
    values (old.registrata_da, substr(old.chiave_esterna, 5)::bigint)
    on conflict do nothing;
  end if;
  return old;
end $f$;
drop trigger if exists partite_bgg_scartata on public.partite;
create trigger partite_bgg_scartata before delete on public.partite
  for each row execute function public.bgg_segna_scartata();
