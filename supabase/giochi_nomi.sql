-- Primo Giocatore - titoli alternativi dei giochi (edizioni in altre lingue)
-- v1.0.0 - 202611012300
-- BGG chiama i giochi con il titolo originale («7 Wonders»), le scatole
-- italiane hanno il loro («Sette Meraviglie»). Qui si conservano i titoli
-- alternativi di BGG e l'import da CSV (ludoteca e collezione) abbina
-- anche con quelli.
-- I titoli li scrive solo il server (api/bgg, azione=nomi).
-- Servono ludoteca_import.sql e collezione_import.sql. Si può rilanciare senza danni.

alter table public.giochi add column if not exists nomi_alt text[];

-- Giochi con numero BGG ma senza titoli alternativi; ambito: i giochi
-- della collezione di p_utente, o tutto il catalogo se p_utente è vuoto.
-- restanti: quanti ne mancano in tutto, prima di questo giro.
drop function if exists public.giochi_senza_nomi(uuid, int);
create function public.giochi_senza_nomi(p_utente uuid, p_limite int default 40)
 returns table(gioco_id text, bgg_id text, restanti bigint)
 language sql stable security definer set search_path to 'public'
as $f$
  select g.id::text, g.bgg_id::text, count(*) over ()
  from giochi g
  where g.nomi_alt is null and g.bgg_id is not null
    and (p_utente is null or exists (select 1 from collezioni c where c.gioco_id = g.id and c.utente_id = p_utente))
  order by g.id
  limit greatest(1, least(coalesce(p_limite, 40), 100));
$f$;

-- p_righe: [{ "bgg_id": "68448", "nomi": ["Sette Meraviglie", ...] }, ...]
create or replace function public.giochi_imposta_nomi(p_righe jsonb)
 returns int language plpgsql security definer set search_path to 'public'
as $f$
declare n int;
begin
  update giochi g
     set nomi_alt = coalesce((select array_agg(x) from jsonb_array_elements_text(r.nomi) x), '{}')
    from jsonb_to_recordset(coalesce(p_righe, '[]'::jsonb)) as r(bgg_id text, nomi jsonb)
   where g.bgg_id::text = r.bgg_id;
  get diagnostics n = row_count;
  return n;
end $f$;

revoke all on function public.giochi_senza_nomi(uuid, int) from public, anon, authenticated;
revoke all on function public.giochi_imposta_nomi(jsonb) from public, anon, authenticated;
grant execute on function public.giochi_senza_nomi(uuid, int) to service_role;
grant execute on function public.giochi_imposta_nomi(jsonb) to service_role;

-- Ogni gioco con tutti i suoi titoli: quello principale e gli alternativi.
-- p_utente: solo la sua collezione; vuoto: tutto il catalogo.
create or replace function public.titoli_giochi(p_utente uuid)
 returns table(id text, nome text, anno int, immagine_url text, espansione boolean, titolo text, gp text)
 language sql stable security definer set search_path to 'public'
as $f$
  select g.id::text, g.nome, g.anno::int, g.immagine_url, coalesce(g.espansione, false), v.titolo, v.gp
  from giochi g
  cross join lateral (
    select g.nome as titolo, public.titolo_piatto(g.nome) as gp
    union
    select a, public.titolo_piatto(a) from unnest(coalesce(g.nomi_alt, '{}')) a
  ) v
  where length(v.gp) >= 2
    and (p_utente is null or exists (select 1 from collezioni c where c.gioco_id = g.id and c.utente_id = p_utente));
$f$;
revoke all on function public.titoli_giochi(uuid) from public, anon, authenticated;

-- L'abbinamento comune. punteggio: 0 stesso titolo, 1 il gioco inizia con
-- il titolo letto, 2 il titolo letto inizia con il gioco, 3 il titolo letto
-- sta dentro. trovato: con quale titolo del gioco si è abbinato.
create or replace function public.abbina_titoli(p_titoli text[], p_utente uuid)
 returns table(indice int, gioco_id text, nome text, anno int, immagine_url text,
               espansione boolean, punteggio int, trovato text)
 language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select u.i::int as indice, public.titolo_piatto(u.x) as q
    from unnest(p_titoli[1:300]) with ordinality as u(x, i)
    where length(public.titolo_piatto(u.x)) >= 2
  ),
  gn as materialized (select * from public.titoli_giochi(p_utente)),
  c as (
    select t.indice, gn.*, t.q,
           case when gn.gp = t.q then 0
                when gn.gp like t.q || ' %' then 1
                when t.q like gn.gp || ' %' and length(gn.gp) >= 4 then 2
                else 3 end as punti
    from t join gn
      on gn.gp like '%' || t.q || '%'
      or (t.q like gn.gp || ' %' and length(gn.gp) >= 4)
  ),
  -- Per ogni gioco il titolo che somiglia di più (il principale a parità).
  migliore as (
    select distinct on (c.indice, c.id) c.*
    from c
    order by c.indice, c.id, c.punti, (c.titolo <> c.nome), abs(length(c.gp) - length(c.q))
  ),
  o as (
    select m.*, row_number() over (partition by m.indice
             order by m.punti, m.espansione, abs(length(m.gp) - length(m.q)), m.anno desc nulls last) as rn
    from migliore m
  )
  select o.indice, o.id, o.nome, o.anno, o.immagine_url, o.espansione, o.punti, o.titolo
  from o
  where o.rn <= 5
  order by o.indice, o.rn;
$f$;
revoke all on function public.abbina_titoli(text[], uuid) from public, anon, authenticated;

-- Le due funzioni chiamate dall'app, ora con i titoli alternativi.
drop function if exists public.ludoteca_abbina(text, text[]);
create function public.ludoteca_abbina(p_tana text, p_titoli text[])
 returns table(indice int, gioco_id text, nome text, anno int, immagine_url text,
               espansione boolean, punteggio int, trovato text)
 language sql stable security definer set search_path to 'public'
as $f$
  select * from public.abbina_titoli(p_titoli, null) where public.puo_gestire_ludoteca(p_tana);
$f$;

drop function if exists public.collezione_abbina(text[]);
create function public.collezione_abbina(p_titoli text[])
 returns table(indice int, gioco_id text, nome text, anno int, immagine_url text,
               espansione boolean, punteggio int, trovato text)
 language sql stable security definer set search_path to 'public'
as $f$
  select * from public.abbina_titoli(p_titoli, auth.uid()) where auth.uid() is not null;
$f$;

revoke all on function public.ludoteca_abbina(text, text[]) from public, anon;
revoke all on function public.collezione_abbina(text[]) from public, anon;
grant execute on function public.ludoteca_abbina(text, text[]) to authenticated;
grant execute on function public.collezione_abbina(text[]) to authenticated;
