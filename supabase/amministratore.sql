-- Primo Giocatore - amministratore dell'app e organizzatori di Tana
-- v1.0.0 - 202611190000
-- Si può rilanciare senza danni.
--
-- Prima «organizzatore» sul profilo voleva dire due cose insieme:
-- organizza la Tana di Roma, e può tutto in tutta l'app. Ora sono due:
--
-- - AMMINISTRATORE DELL'APP (nuovo, profili.amministratore): tutto,
--   in ogni Tana e in ogni evento. Lo dà e lo toglie solo un altro
--   amministratore. All'inizio solo lucadir. Decide il controllo soci,
--   crea e attiva le Tane, nomina gli organizzatori di Tana, cancella
--   gli eventi.
-- - ORGANIZZATORE (profili.organizzatore, come prima): organizza la sua
--   Tana (oggi Roma) e lì può tutto: soci, ruoli, tavoli, serate,
--   eventi della Tana. Accenderlo o spegnerlo dalla pagina Ruoli lo
--   mette o lo toglie anche fra gli organizzatori della Tana.
--
-- Chi oggi è organizzatore (Dario, Lobo) resta organizzatore e diventa
-- organizzatore della Tana di Roma: per Roma non perde niente.

-- 1. La colonna, e il primo amministratore ------------------------------
alter table public.profili add column if not exists amministratore boolean not null default false;

do $$
declare n int;
begin
  select count(*) into n from public.profili where lower(nickname) = 'lucadir';
  if n <> 1 then raise exception 'Mi aspettavo un solo profilo con nickname lucadir, ne ho trovati %', n; end if;
  perform set_config('primo.ruoli_ok', '1', true);
  update public.profili set amministratore = true where lower(nickname) = 'lucadir';
  perform set_config('primo.ruoli_ok', '', true);
end $$;

-- 2. Gli organizzatori di oggi diventano organizzatori di Roma ------------
insert into public.organizzatori_tana (utente_id, tana_id)
select p.id, coalesce(p.tana_id, (select id from public.tane where nome = 'Roma' order by id limit 1))
from public.profili p
where p.organizzatore
  and coalesce(p.tana_id, (select id from public.tane where nome = 'Roma' order by id limit 1)) is not null
on conflict do nothing;

-- 3. Le funzioni dei permessi ---------------------------------------------
-- Tutto, ovunque: solo l'amministratore.
create or replace function public.organizzatore_globale()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select amministratore from public.profili where id = auth.uid()), false)
$f$;

-- Organizza (la sua Tana, oggi Roma): il permesso di sempre, più chi
-- organizza una Tana, più l'amministratore.
create or replace function public.e_organizzatore()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select organizzatore or amministratore from public.profili where id = auth.uid()), false)
      or exists (select 1 from public.organizzatori_tana where utente_id = auth.uid())
$f$;

create or replace function public.e_dimostratore()
 returns boolean language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select dimostratore from public.profili where id = auth.uid()), false)
      or public.e_organizzatore()
$f$;

-- 4. Chi cambia i permessi ------------------------------------------------
-- amministratore: solo un amministratore, e l'ultimo non si toglie.
-- organizzatore e dimostratore: chi organizza (la Tana) o l'amministratore.
create or replace function public.proteggi_ruoli()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if auth.uid() is not null and coalesce(current_setting('primo.ruoli_ok', true), '') <> '1' then
    if not public.organizzatore_globale() then
      if tg_op = 'INSERT' then new.amministratore := false; else new.amministratore := old.amministratore; end if;
    end if;
    if not public.e_organizzatore() then
      if tg_op = 'INSERT' then
        new.organizzatore := false; new.dimostratore := false;
      else
        new.organizzatore := old.organizzatore; new.dimostratore := old.dimostratore;
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.amministratore and not new.amministratore
     and not exists (select 1 from public.profili where amministratore and id <> old.id) then
    raise exception 'È l''ultimo amministratore dell''app: prima nominane un altro.';
  end if;
  return new;
end $f$;
drop trigger if exists profili_proteggi_ruoli on public.profili;
create trigger profili_proteggi_ruoli before insert or update on public.profili
  for each row execute function public.proteggi_ruoli();

-- 5. Organizzatore acceso o spento = dentro o fuori dagli organizzatori
--    della sua Tana (oggi Roma).
create or replace function public.allinea_organizzatore_tana()
 returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_tana int;
begin
  if new.organizzatore is not distinct from old.organizzatore then return new; end if;
  v_tana := coalesce(new.tana_id, (select id from tane where nome = 'Roma' order by id limit 1));
  if v_tana is null then return new; end if;
  if new.organizzatore then
    insert into organizzatori_tana (utente_id, tana_id) values (new.id, v_tana) on conflict do nothing;
  else
    delete from organizzatori_tana where utente_id = new.id and tana_id = v_tana;
  end if;
  return new;
end $f$;
drop trigger if exists profili_organizzatore_tana on public.profili;
create trigger profili_organizzatore_tana after update of organizzatore on public.profili
  for each row execute function public.allinea_organizzatore_tana();

-- Controllo finale: chi è cosa.
select coalesce(nullif(trim(p.nickname), ''), p.nome) as chi,
       p.amministratore as amministratore_app,
       p.organizzatore,
       (select string_agg(t.nome, ', ') from organizzatori_tana o join tane t on t.id = o.tana_id where o.utente_id = p.id) as organizza_tana
from profili p
where p.amministratore or p.organizzatore or exists (select 1 from organizzatori_tana o where o.utente_id = p.id)
order by p.amministratore desc, chi;
