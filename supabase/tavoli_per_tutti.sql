-- Primo Giocatore - tavoli pubblicabili da tutti gli iscritti
-- v1.0.0 - 202610282130
-- Si può rilanciare senza danni. Non cancella né modifica dati.
--
-- 1. Contatti degli iscritti (email, telefono): gli organizzatori li
--    vedono tutti; chi ha pubblicato il tavolo o lo spiega, se non è
--    organizzatore, solo quelli delle iscrizioni confermate.
-- 2. Chiusa la falla per cui un dimostratore qualunque poteva iscriversi
--    come «dimostratore» a un tavolo non suo e leggerne i contatti: ora
--    decidono tutto solo chi gestisce il tavolo e chi lo spiega.

-- 1. Contatti --------------------------------------------------------------
drop policy if exists "contatti lettura" on public.iscrizioni_contatti;
create policy "contatti lettura" on public.iscrizioni_contatti for select
  using (
    (select public.e_organizzatore())
    or exists (
      select 1 from public.iscrizioni_tavolo i
      where i.id = iscrizioni_contatti.iscrizione_id
        and i.stato = 'confermato'
        and (public.gestisco_tavolo(i.tavolo_id) or public.spiego_tavolo(i.tavolo_id))
    )
  );

-- La vecchia regola «per tutto» del dimostratore dava anche la lettura
-- senza condizioni: si divide in scrittura, modifica e cancellazione.
drop policy if exists "contatti dimostratore" on public.iscrizioni_contatti;
drop policy if exists "contatti dimostratore scrittura" on public.iscrizioni_contatti;
create policy "contatti dimostratore scrittura" on public.iscrizioni_contatti for insert
  with check (exists (
    select 1 from public.iscrizioni_tavolo i
    where i.id = iscrizioni_contatti.iscrizione_id and public.spiego_tavolo(i.tavolo_id)));
drop policy if exists "contatti dimostratore modifica" on public.iscrizioni_contatti;
create policy "contatti dimostratore modifica" on public.iscrizioni_contatti for update
  using (exists (
    select 1 from public.iscrizioni_tavolo i
    where i.id = iscrizioni_contatti.iscrizione_id and i.stato = 'confermato'
      and public.spiego_tavolo(i.tavolo_id)));
drop policy if exists "contatti dimostratore cancellazione" on public.iscrizioni_contatti;
create policy "contatti dimostratore cancellazione" on public.iscrizioni_contatti for delete
  using (exists (
    select 1 from public.iscrizioni_tavolo i
    where i.id = iscrizioni_contatti.iscrizione_id and public.spiego_tavolo(i.tavolo_id)));

-- 2. Iscrizioni: niente più via libera a ogni dimostratore -----------------
create or replace function public.proteggi_iscrizione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_max  int;
  v_conf int;
begin
  -- Chi gestisce o spiega QUESTO tavolo decide tutto.
  if public.gestisco_tavolo(new.tavolo_id) or public.spiego_tavolo(new.tavolo_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.utente_id := auth.uid();      -- nessuno iscrive un altro
    new.ospite_id := null;
    new.ruolo := 'giocatore';
    -- Un'iscrizione alla volta per tavolo: due arrivi nello stesso
    -- istante non sforano i posti.
    select posti_max into v_max from tavoli where id = new.tavolo_id for update;
    select count(*) into v_conf from iscrizioni_tavolo
      where tavolo_id = new.tavolo_id and stato = 'confermato';
    new.stato := case when v_max is not null and v_conf >= v_max then 'attesa' else 'confermato' end;
  else
    new.tavolo_id := old.tavolo_id;
    new.ruolo := old.ruolo;
    -- Da sé ci si può solo annullare.
    if new.stato is distinct from old.stato and new.stato <> 'annullato' then
      new.stato := old.stato;
    end if;
  end if;
  return new;
end $function$;
