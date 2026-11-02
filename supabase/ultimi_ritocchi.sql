-- Primo Giocatore - ultimi ritocchi della verifica del 02/11
-- v1.0.0 - 202611030300
-- 1. Ludoteca: un dimostratore modifica solo la ludoteca della sua Tana
--    (organizzatori generali e organizzatori di quella Tana come prima).
-- 2. Tavoli: l'elenco dei tavoli pubblicati lo legge chi ha un account,
--    anche se non è socio. Senza account si vede solo il tavolo del link,
--    tramite la funzione tavolo_pubblico (che ora usa la pagina pubblica).
-- 3. Archivio sul telefono: una partita da cui sei stato tolto sparisce
--    subito, non alla rilettura settimanale.
-- Va lanciato DOPO tavoli_bgg_verifica.sql. Si può rilanciare senza danni.

-- 1. Ludoteca ----------------------------------------------------------------
create or replace function public.puo_gestire_ludoteca(p_tana text)
 returns boolean language sql stable security definer set search_path to 'public'
as $f$
  select auth.uid() is not null and (
    public.e_organizzatore()
    or exists (select 1 from organizzatori_tana o where o.utente_id = auth.uid() and o.tana_id::text = p_tana)
    or exists (select 1 from profili p where p.id = auth.uid() and p.dimostratore and p.tana_id::text = p_tana))
$f$;

-- Il messaggio di chi prova a modificare la ludoteca di un'altra Tana.
CREATE OR REPLACE FUNCTION public.ludoteca_salva(p_tana text, p_gioco text, p_posizione text, p_note text DEFAULT NULL::text, p_copie integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca di questa Tana la modificano i suoi organizzatori e dimostratori.';
  end if;
  if coalesce(p_copie, 1) not between 1 and 99 then
    raise exception 'Le copie vanno da 1 a 99.';
  end if;
  insert into ludoteca_tana (tana_id, gioco_id, posizione, note, copie, aggiornato_da, aggiornato_il)
  select t.id, g.id, nullif(trim(p_posizione), ''), nullif(trim(p_note), ''), coalesce(p_copie, 1), auth.uid(), now()
    from tane t, giochi g where t.id::text = p_tana and g.id::text = p_gioco
  on conflict (tana_id, gioco_id) do update
    set posizione = excluded.posizione, note = excluded.note, copie = excluded.copie,
        aggiornato_da = excluded.aggiornato_da, aggiornato_il = excluded.aggiornato_il;
end $function$;
CREATE OR REPLACE FUNCTION public.ludoteca_salva_blocco(p_tana text, p_righe jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca di questa Tana la modificano i suoi organizzatori e dimostratori.';
  end if;
  insert into ludoteca_tana (tana_id, gioco_id, posizione, note, copie, aggiornato_da, aggiornato_il)
  select distinct on (g.id) t.id, g.id, nullif(trim(r.posizione), ''), nullif(trim(r.note), ''),
         least(99, greatest(1, coalesce(r.copie, 1))), auth.uid(), now()
    from jsonb_to_recordset(coalesce(p_righe, '[]'::jsonb))
           as r(gioco_id text, posizione text, copie int, note text)
    join giochi g on g.id::text = r.gioco_id
    join tane t on t.id::text = p_tana
  on conflict (tana_id, gioco_id) do update
    set posizione = excluded.posizione, copie = excluded.copie,
        note = coalesce(excluded.note, ludoteca_tana.note),
        aggiornato_da = excluded.aggiornato_da, aggiornato_il = excluded.aggiornato_il;
  get diagnostics n = row_count;
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.ludoteca_togli(p_tana text, p_gioco text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca di questa Tana la modificano i suoi organizzatori e dimostratori.';
  end if;
  delete from ludoteca_tana where tana_id::text = p_tana and gioco_id::text = p_gioco;
end $function$;

-- 2. Tavoli ------------------------------------------------------------------
-- La pagina del link: il tavolo, il gioco, il luogo e gli iscritti (nome e
-- soprannome), in una chiamata sola. Funziona anche senza account.
create or replace function public.tavolo_pubblico(p_tavolo uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $f$
  select jsonb_build_object(
    'tavolo', jsonb_build_object(
      'id', t.id, 'titolo', t.titolo, 'descrizione', t.descrizione, 'inizio', t.inizio,
      'posti_min', t.posti_min, 'posti_max', t.posti_max, 'su_approvazione', t.su_approvazione,
      'stato', t.stato, 'pubblicato', t.pubblicato, 'dimostratore_nome', t.dimostratore_nome,
      'dimostratore_foto', t.dimostratore_foto, 'chiusura_iscrizioni', t.chiusura_iscrizioni, 'note', t.note,
      'giochi', (select jsonb_build_object('nome', g.nome, 'immagine_url', g.immagine_url, 'immagine_grande', g.immagine_grande,
                        'min_giocatori', g.min_giocatori, 'max_giocatori', g.max_giocatori, 'durata_minuti', g.durata_minuti)
                 from giochi g where g.id = t.gioco_id),
      'luoghi', (select jsonb_build_object('nome', l.nome, 'tipo', l.tipo, 'piattaforma', l.piattaforma,
                        'creato_da', l.creato_da, 'nome_per_altri', l.nome_per_altri)
                 from luoghi l where l.id = t.luogo_id)),
    'iscritti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'stato', i.stato, 'nome_visibile', i.nome_visibile, 'utente_id', i.utente_id,
        'ruolo', i.ruolo, 'disposto_a_dimostrare', i.disposto_a_dimostrare,
        'profili', (select jsonb_build_object('nome', p.nome, 'nickname', p.nickname) from profili p where p.id = i.utente_id)
      ) order by i.creata_il)
      from iscrizioni_tavolo i where i.tavolo_id = t.id and i.stato <> 'annullato'), '[]'::jsonb))
  from tavoli t
  where t.id = p_tavolo
    and (t.pubblicato or (auth.uid() is not null and (public.gestisco_tavolo(t.id) or public.spiego_tavolo(t.id))))
$f$;
revoke all on function public.tavolo_pubblico(uuid) from public;
grant execute on function public.tavolo_pubblico(uuid) to anon, authenticated;

-- Le regole di lettura: solo con un account (prima valevano per tutti).
drop policy if exists "tavoli lettura" on public.tavoli;
create policy "tavoli lettura" on public.tavoli for select to authenticated
  using ((pubblicato = true) or (host_id = (select auth.uid())) or (select e_organizzatore())
         or ((gruppo_id is not null) and (gruppo_id in (select ids_gruppi_miei())))
         or (id in (select ids_tavoli_iscritto())));
drop policy if exists "iscrizioni lettura" on public.iscrizioni_tavolo;
create policy "iscrizioni lettura" on public.iscrizioni_tavolo for select to authenticated
  using (tavolo_pubblicato(tavolo_id) or gestisco_tavolo(tavolo_id) or (utente_id = auth.uid()));
drop policy if exists "iscrizioni creazione" on public.iscrizioni_tavolo;
create policy "iscrizioni creazione" on public.iscrizioni_tavolo for insert to authenticated
  with check (gestisco_tavolo(tavolo_id) or exists (
    select 1 from tavoli t
    where t.id = iscrizioni_tavolo.tavolo_id and t.pubblicato = true and t.stato = 'aperto'
      and t.inizio > now()
      and (t.chiusura_iscrizioni is null or t.chiusura_iscrizioni > now())));
drop policy if exists "luoghi lettura" on public.luoghi;
create policy "luoghi lettura" on public.luoghi for select to authenticated
  using ((creato_da = auth.uid()) or (tipo = any (array['sede'::text, 'online'::text]))
         or (id in (select ids_luoghi_visibili())));
drop policy if exists "proposte lettura" on public.tavolo_giochi_proposti;
create policy "proposte lettura" on public.tavolo_giochi_proposti for select to authenticated
  using (tavolo_pubblicato(tavolo_id) or gestisco_tavolo(tavolo_id));
drop policy if exists "voti lettura" on public.tavolo_voti;
create policy "voti lettura" on public.tavolo_voti for select to authenticated
  using (tavolo_pubblicato(tavolo_id) or gestisco_tavolo(tavolo_id));
-- Senza account i profili non servono più: nome e soprannome degli
-- iscritti arrivano con tavolo_pubblico.
drop policy if exists "profili sui tavoli pubblici" on public.profili;
revoke select on public.profili from anon;

-- Le posizioni: senza account solo quella del tavolo del link.
CREATE OR REPLACE FUNCTION public.posizioni_tavoli(p_tavolo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with io as (
    select auth.uid() as uid,
           auth.uid() is not null and coalesce(public.organizzatore_globale(), false) as org
  ),
  righe as (
    select t.id::text as tavolo_id, lp.zona, lp.pubblica, lp.indirizzo,
           lp.latitudine, lp.longitudine, t.pubblicato,
           (io.uid is not null and (
              io.org
              or t.host_id = io.uid
              or t.dimostratore_id = io.uid
              or lp.aggiornato_da = io.uid
              or exists (
                select 1 from public.iscrizioni_tavolo i
                where i.tavolo_id = t.id and i.utente_id = io.uid
                  and (i.stato = 'confermato'
                       or (i.ruolo = 'dimostratore' and i.stato <> 'annullato'))))) as vede
    from public.tavoli t
    join public.luoghi_posizione lp on lp.luogo_id = t.luogo_id
    cross join io
    -- L'elenco di tutte le posizioni solo a chi ha un account; senza
    -- account solo quella del tavolo del link.
    where (p_tavolo is null or t.id::text = p_tavolo)
      and (p_tavolo is not null or io.uid is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'tavolo_id', tavolo_id,
    'zona', zona,
    'pubblica', pubblica,
    'esatta', pubblica or vede,
    'lat', case when pubblica or vede then latitudine else round(latitudine::numeric, 2)::float8 end,
    'lon', case when pubblica or vede then longitudine else round(longitudine::numeric, 2)::float8 end,
    'indirizzo', case when pubblica or vede then indirizzo end
  )), '[]'::jsonb)
  from righe
  where pubblicato or vede
$function$;

-- 3. Archivio sul telefono ------------------------------------------------
-- Oltre alle partite cancellate, quelle cambiate che non puoi più vedere
-- (per esempio chi l'ha registrata ti ha tolto): il telefono le toglie.
create or replace function public.archivio_cancellate(p_dal timestamp with time zone)
 returns setof uuid language sql stable security definer set search_path to 'public'
as $f$
  select id from partite_cancellate where cancellata_il > p_dal and auth.uid() is not null
  union
  select p.id from partite p
  where auth.uid() is not null and p.aggiornata_il > p_dal
    and p.registrata_da is distinct from auth.uid()
    and not exists (select 1 from partecipazioni x where x.partita_id = p.id and x.utente_id = auth.uid())
    and not (p.gruppo_id is not null
             and exists (select 1 from membri_gruppo m where m.gruppo_id = p.gruppo_id and m.utente_id = auth.uid()))
$f$;
