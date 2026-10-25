-- Primo Giocatore - chiusura dei buchi trovati nell'analisi del 25/10/2026
-- v1.0.0 - 202610251300
-- Si può rilanciare senza danni: ogni passo sostituisce la versione
-- precedente di sé stesso. Non cancella né modifica dati.
--
-- 1. Le regole «solo soci» diventano RESTRITTIVE: si sommano alle altre
--    invece di aggiungersi. Se fossero permissive, finché il controllo
--    soci è spento chiunque abbia un account leggerebbe e modificherebbe
--    partite, giocatori, ospiti e collezioni di tutti.
-- 2. Ruoli: «organizzatore» e «dimostratore» li cambia solo un
--    organizzatore. Prima chiunque poteva darseli da solo sul proprio
--    profilo, e da organizzatore vedere email, contatti ed elenco soci.
-- 3. Iscrizioni ai tavoli: chi non gestisce il tavolo non può iscriversi
--    come «dimostratore» (darebbe accesso ai contatti degli iscritti),
--    né iscrivere un altro, né confermarsi da solo se è in attesa. I
--    posti li conta il database, una iscrizione alla volta.
-- 4. Tavoli: il padrone di un tavolo lo cambia solo il padrone o un
--    organizzatore (la regola precedente non controllava niente).
-- 5. Catalogo giochi: nome, numero BGG, immagini già presenti e voci di
--    punteggio già impostate li cambia solo chi ha aggiunto il gioco o un
--    organizzatore. Fazioni e tipo di punteggio restano liberi.
-- 6. Foto dimostratori: solo immagini fino a 2 MB, e ognuno carica o
--    sostituisce solo le proprie.

-- 1. «solo soci» restrittive ---------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['partite','partecipazioni','ospiti','luoghi','collezioni',
                           'serate','ipg','richieste_collegamento','giochi_bga'] loop
    execute format('drop policy if exists "solo soci" on public.%I', t);
    execute format('create policy "solo soci" on public.%I as restrictive for all to authenticated '
                   'using ((select public.ammesso())) with check ((select public.ammesso()))', t);
  end loop;
end $$;
drop policy if exists "solo soci" on public.profili;
create policy "solo soci" on public.profili as restrictive for all to authenticated
  using ((select public.ammesso()) or id = auth.uid())
  with check ((select public.ammesso()) or id = auth.uid());

-- 2. Ruoli protetti --------------------------------------------------------
create or replace function public.proteggi_ruoli()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is not null
     and coalesce(current_setting('primo.ruoli_ok', true), '') <> '1'
     and not public.organizzatore_globale() then
    if tg_op = 'INSERT' then
      new.organizzatore := false;
      new.dimostratore := false;
    else
      new.organizzatore := old.organizzatore;
      new.dimostratore := old.dimostratore;
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists profili_proteggi_ruoli on public.profili;
create trigger profili_proteggi_ruoli before insert or update on public.profili
  for each row execute function public.proteggi_ruoli();

-- Un ospite dimostratore che diventa utente resta dimostratore anche se a
-- collegarlo non è un organizzatore: identica a prima, più il permesso.
create or replace function public.ospite_diventa_utente()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.utente_collegato is not null
     and old.utente_collegato is distinct from new.utente_collegato then

    -- Se per una serata ha già risposto con l'account, vale quella.
    delete from disponibilita d
    where d.ospite_id = new.id
      and exists (
        select 1 from disponibilita x
        where x.serata_id = d.serata_id and x.profilo_id = new.utente_collegato
      );

    update disponibilita
    set profilo_id = new.utente_collegato, ospite_id = null
    where ospite_id = new.id;

    -- I tavoli che spiegava da ospite passano al suo account.
    update tavoli
    set dimostratore_id = new.utente_collegato, dimostratore_ospite_id = null
    where dimostratore_ospite_id = new.id;

    if new.dimostratore then
      perform set_config('primo.ruoli_ok', '1', true);
      update profili set dimostratore = true where id = new.utente_collegato;
      perform set_config('primo.ruoli_ok', '', true);
    end if;
  end if;
  return new;
end;
$function$;

-- 3. Iscrizioni ai tavoli --------------------------------------------------
create or replace function public.proteggi_iscrizione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_max  int;
  v_conf int;
begin
  -- Chi gestisce o spiega il tavolo, e i dimostratori, decidono tutto.
  if public.gestisco_tavolo(new.tavolo_id) or public.spiego_tavolo(new.tavolo_id)
     or public.e_dimostratore() then
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
drop trigger if exists iscrizioni_proteggi on public.iscrizioni_tavolo;
create trigger iscrizioni_proteggi before insert or update on public.iscrizioni_tavolo
  for each row execute function public.proteggi_iscrizione();

-- 4. Padrone del tavolo ----------------------------------------------------
create or replace function public.proteggi_tavolo()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is not null
     and new.host_id is distinct from old.host_id
     and old.host_id is distinct from auth.uid()
     and not public.e_organizzatore() then
    new.host_id := old.host_id;
  end if;
  return new;
end $function$;
drop trigger if exists tavoli_proteggi on public.tavoli;
create trigger tavoli_proteggi before update on public.tavoli
  for each row execute function public.proteggi_tavolo();

-- 5. Catalogo giochi -------------------------------------------------------
create or replace function public.proteggi_gioco()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or old.creato_da = auth.uid() or public.e_organizzatore() then
    return new;
  end if;
  new.nome := old.nome;
  new.bgg_id := old.bgg_id;
  new.creato_da := old.creato_da;
  -- Immagini e voci si possono aggiungere se mancano, non sostituire.
  if old.immagine_url is not null then new.immagine_url := old.immagine_url; end if;
  if old.immagine_grande is not null then new.immagine_grande := old.immagine_grande; end if;
  if old.categorie_punteggio is not null and jsonb_typeof(old.categorie_punteggio) = 'array'
     and jsonb_array_length(old.categorie_punteggio) > 0 then
    new.categorie_punteggio := old.categorie_punteggio;
  end if;
  return new;
end $function$;
drop trigger if exists giochi_proteggi on public.giochi;
create trigger giochi_proteggi before update on public.giochi
  for each row execute function public.proteggi_gioco();

-- 6. Foto dimostratori -----------------------------------------------------
-- I file si chiamano già «<id del profilo>-<ora>-<nome>»: le foto
-- caricate finora restano valide.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'dimostratori';
drop policy if exists "foto scrittura" on storage.objects;
create policy "foto scrittura" on storage.objects for insert to authenticated
  with check (bucket_id = 'dimostratori' and name like auth.uid()::text || '-%');
drop policy if exists "foto sostituzione" on storage.objects;
create policy "foto sostituzione" on storage.objects for update to authenticated
  using (bucket_id = 'dimostratori' and name like auth.uid()::text || '-%')
  with check (bucket_id = 'dimostratori' and name like auth.uid()::text || '-%');
