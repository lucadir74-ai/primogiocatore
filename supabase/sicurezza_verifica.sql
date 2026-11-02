-- Primo Giocatore - correzioni di sicurezza e conteggi (verifica del 02/11)
-- v1.0.0 - 202611022300
-- 1. Profili: chi non è entrato nell'app vede solo nome e soprannome, e
--    solo di chi è iscritto a un tavolo pubblicato (per il link del tavolo).
-- 2. Ospiti: solo un organizzatore può collegare un ospite a un account
--    (gli altri passano da «Sei tu?»); «dimostratore» lo segnano solo
--    organizzatori e dimostratori. Prima un socio poteva promuoversi da solo.
-- 3. Abbinamenti BGA→BGG: tutti ne aggiungono di nuovi; li corregge solo
--    chi li ha fatti o un organizzatore (valgono per le partite di tutti).
-- 4. Catalogo giochi: tipo di punteggio, fazioni, espansione, titoli
--    alternativi li cambia solo chi ha aggiunto il gioco o un organizzatore;
--    gli altri possono solo riempire i dati che mancano.
-- 5. Scheda iscritto: «importate da BGA» conta tutte le partite con il
--    numero di tavolo BGA, anche quelle arrivate prima da BGG e collegate.
-- Si può rilanciare senza danni.

-- 1. Profili --------------------------------------------------------------
create or replace function public.ids_profili_tavoli_pubblici()
 returns setof uuid language sql stable security definer set search_path to 'public'
as $f$
  select i.utente_id from iscrizioni_tavolo i join tavoli t on t.id = i.tavolo_id
  where t.pubblicato and i.utente_id is not null and i.stato <> 'annullato'
$f$;
drop policy if exists "profili leggibili" on public.profili;
create policy "profili leggibili" on public.profili for select to authenticated using (true);
drop policy if exists "profili sui tavoli pubblici" on public.profili;
create policy "profili sui tavoli pubblici" on public.profili for select to anon
  using (id in (select public.ids_profili_tavoli_pubblici()));
revoke select on public.profili from anon;
grant select (id, nome, nickname) on public.profili to anon;

-- 2. Ospiti ---------------------------------------------------------------
-- Vale per le modifiche fatte dall'app (ruolo authenticated). Le funzioni
-- del database («Sei tu?», unioni, import BGA) girano come proprietario e
-- restano libere di collegare.
-- SECURITY INVOKER apposta: così current_user dice chi sta scrivendo
-- (l'app = authenticated; le funzioni del database = il proprietario).
create or replace function public.proteggi_ospite()
 returns trigger language plpgsql security invoker set search_path to 'public'
as $f$
begin
  if current_user not in ('authenticated', 'anon') or public.e_organizzatore() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.utente_collegato := null;   -- il riconoscimento per nome viene dopo, da solo
    new.collegato_il := null;
    new.unito_in := null;
    if not public.e_dimostratore() then new.dimostratore := false; end if;
  else
    new.utente_collegato := old.utente_collegato;
    new.collegato_il := old.collegato_il;
    new.unito_in := old.unito_in;
    new.creato_da := old.creato_da;
    if not public.e_dimostratore() then new.dimostratore := old.dimostratore; end if;
  end if;
  return new;
end $f$;
-- «0» nel nome: scatta prima degli altri trigger degli ospiti.
drop trigger if exists ospiti_0_proteggi on public.ospiti;
create trigger ospiti_0_proteggi before insert or update on public.ospiti
  for each row execute function public.proteggi_ospite();
drop policy if exists "ospiti modifica" on public.ospiti;
create policy "ospiti modifica" on public.ospiti for update to public
  using ((creato_da = auth.uid()) or e_organizzatore())
  with check ((creato_da = auth.uid()) or e_organizzatore());

-- 3. Abbinamenti BGA→BGG --------------------------------------------------
drop policy if exists "giochi_bga: aggiungono gli iscritti" on public.giochi_bga;
create policy "giochi_bga: aggiungono gli iscritti" on public.giochi_bga for insert to authenticated
  with check (aggiornato_da is not distinct from auth.uid());
drop policy if exists "giochi_bga: correggono gli iscritti" on public.giochi_bga;
drop policy if exists "giochi_bga: correggono autore e organizzatori" on public.giochi_bga;
create policy "giochi_bga: correggono autore e organizzatori" on public.giochi_bga for update to authenticated
  using (aggiornato_da = auth.uid() or public.e_organizzatore())
  with check (aggiornato_da = auth.uid() or public.e_organizzatore());

-- 4. Catalogo giochi --------------------------------------------------------
-- SECURITY INVOKER apposta, come proteggi_ospite.
create or replace function public.proteggi_gioco()
 returns trigger language plpgsql security invoker set search_path to 'public'
as $f$
declare
  dall_app boolean := current_user in ('authenticated', 'anon');
begin
  if auth.uid() is null or old.creato_da = auth.uid() or public.e_organizzatore() then
    return new;
  end if;
  new.nome := old.nome;
  new.bgg_id := old.bgg_id;
  new.creato_da := old.creato_da;
  new.tipo_punteggio := old.tipo_punteggio;
  new.usa_fazioni := old.usa_fazioni;
  -- I dati che mancano si possono aggiungere, non sostituire.
  new.anno := coalesce(old.anno, new.anno);
  new.min_giocatori := coalesce(old.min_giocatori, new.min_giocatori);
  new.max_giocatori := coalesce(old.max_giocatori, new.max_giocatori);
  new.durata_minuti := coalesce(old.durata_minuti, new.durata_minuti);
  new.peso_bgg := coalesce(old.peso_bgg, new.peso_bgg);
  if old.immagine_url is not null then new.immagine_url := old.immagine_url; end if;
  if old.immagine_grande is not null then new.immagine_grande := old.immagine_grande; end if;
  if old.categorie_punteggio is not null and jsonb_typeof(old.categorie_punteggio) = 'array'
     and jsonb_array_length(old.categorie_punteggio) > 0 then
    new.categorie_punteggio := old.categorie_punteggio;
  end if;
  -- Espansione e titoli alternativi arrivano da BGG tramite il server o le
  -- funzioni del database, non da una modifica dall'app.
  if dall_app then
    new.espansione := old.espansione;
    new.nomi_alt := old.nomi_alt;
  else
    new.espansione := old.espansione or new.espansione;
  end if;
  return new;
end $f$;

-- Le funzioni dei titoli alternativi le usa solo il server.
revoke all on function public.giochi_senza_nomi(uuid, int) from public, anon, authenticated;
revoke all on function public.giochi_imposta_nomi(jsonb) from public, anon, authenticated;
grant execute on function public.giochi_senza_nomi(uuid, int) to service_role;
grant execute on function public.giochi_imposta_nomi(jsonb) to service_role;

-- 5. Scheda iscritto --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scheda_iscritto(p_utente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  risposta jsonb;
begin
  if not exists (select 1 from profili where id = auth.uid() and organizzatore)
     and not exists (select 1 from organizzatori_tana where utente_id = auth.uid()) then
    raise exception 'Solo gli organizzatori possono aprire la scheda di un iscritto.';
  end if;

  select jsonb_build_object(
    'profilo', to_jsonb(p),
    'email', u.email,
    'ultimo_accesso', u.last_sign_in_at,
    'collezione', (select count(*) from collezioni c where c.utente_id = p.id),
    'giocate', (select count(distinct pa.partita_id) from partecipazioni pa where pa.utente_id = p.id),
    'ultima_giocata', (select max(pt.giocata_il) from partecipazioni pa
                       join partite pt on pt.id = pa.partita_id where pa.utente_id = p.id),
    'registrate', (select jsonb_build_object(
        -- Una partita con il numero di tavolo BGA conta come BGA, anche se
        -- era arrivata prima da BGG (BG Stats) ed è stata solo collegata.
        'totale',  count(*),
        'mano',    count(*) filter (where chiave_esterna is null and bga_tavolo is null),
        'bgg',     count(*) filter (where chiave_esterna like 'bgg:%' and bga_tavolo is null),
        'bgstats', count(*) filter (where chiave_esterna like 'bgstats:%' and bga_tavolo is null),
        'bga',     count(*) filter (where bga_tavolo is not null),
        'bga_create',    count(*) filter (where chiave_esterna like 'bga:%'),
        'bga_collegate', count(*) filter (where bga_tavolo is not null and coalesce(chiave_esterna, '') not like 'bga:%'),
        'ultima_bgg', max(creata) filter (where chiave_esterna like 'bgg:%'),
        'ultima_bga', max(creata) filter (where bga_tavolo is not null))
      from (select chiave_esterna, bga_tavolo, giocata_il as creata from partite where registrata_da = p.id) x),
    'bga_collegato', (select jsonb_build_object(
        'collegata_il', s.collegata_il,
        'ultima_lettura', s.ultima_lettura,
        'ultimo_errore', s.ultimo_errore)
      from bga_sessioni s where s.utente_id = p.id)
  )
  into risposta
  from profili p
  left join auth.users u on u.id = p.id
  where p.id = p_utente;

  return risposta;
end;
$function$
;
