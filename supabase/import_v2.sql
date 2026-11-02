-- Primo Giocatore - import da CSV, seconda versione
-- v1.0.0 - 202611021900
-- 1. Abbinamento anche per parole: «Mercanti & Costruttori» trova
--    «Mercanti e Costruttori», e le parole possono essere in ordine diverso
--    (utile per le espansioni).
-- 2. Collezione di casa: un gioco che non c'è si può aggiungere dall'import
--    (solo se lo si sceglie riga per riga). Entra come gioco aggiunto a mano
--    (origine «manuale»): la sincronizzazione con BGG toglie solo i giochi
--    arrivati da BGG, quindi non lo cancella.
-- Va lanciato DOPO giochi_nomi.sql. Si può rilanciare senza danni.
-- Se un giorno rilanci ludoteca_import.sql, collezione_import.sql o
-- giochi_nomi.sql, rilancia subito dopo anche questo.

-- Le parole che contano di un titolo: senza articoli, congiunzioni e preposizioni.
create or replace function public.parole_titolo(t text)
 returns text[] language sql immutable
as $f$
  select coalesce(array_agg(distinct w), '{}')
  from unnest(string_to_array(public.titolo_piatto(t), ' ')) w
  where w <> '' and w not in ('e', 'ed', 'and', 'the', 'of', 'il', 'lo', 'la', 'i', 'gli', 'le', 'l',
    'di', 'del', 'della', 'dei', 'delle', 'a', 'an', 'de', 'des', 'du', 'der', 'die', 'das', 'und',
    'el', 'los', 'las', 'y', 'et', 'un', 'una', 'uno', 'in', 'da', 'per', 'con')
$f$;

drop function if exists public.titoli_giochi(uuid);
create function public.titoli_giochi(p_utente uuid)
 returns table(id text, nome text, anno int, immagine_url text, espansione boolean, titolo text, gp text, pw text[])
 language sql stable security definer set search_path to 'public'
as $f$
  select g.id::text, g.nome, g.anno::int, g.immagine_url, coalesce(g.espansione, false),
         v.titolo, v.gp, public.parole_titolo(v.titolo)
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

-- punteggio: 0 stesso titolo (o stesse parole), 1 il gioco inizia con il
-- titolo letto, 2 il titolo letto inizia con il gioco, 3 il titolo letto
-- sta dentro, 4 tutte le parole lette stanno nel gioco (in altro ordine),
-- 5 tutte le parole del gioco stanno nel titolo letto.
create or replace function public.abbina_titoli(p_titoli text[], p_utente uuid)
 returns table(indice int, gioco_id text, nome text, anno int, immagine_url text,
               espansione boolean, punteggio int, trovato text)
 language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select u.i::int as indice, public.titolo_piatto(u.x) as q, public.parole_titolo(u.x) as qw
    from unnest(p_titoli[1:300]) with ordinality as u(x, i)
    where length(public.titolo_piatto(u.x)) >= 2
  ),
  gn as materialized (select * from public.titoli_giochi(p_utente)),
  -- Prima si cercano le coppie titolo letto / titolo del gioco con almeno
  -- una parola in comune (veloce), poi si confrontano solo quelle.
  -- Le parole troppo comuni («edition», «game», i numeri…) si saltano:
  -- per ogni titolo si usano le parole presenti in al massimo 300 titoli,
  -- o almeno la più rara.
  gw as materialized (select gn.id, gn.titolo, w from gn, unnest(gn.pw) w),
  lette as (select t.indice, x.w from t, unnest(t.qw) as x(w)),
  frequenza as (
    select gw.w, count(*) as quante from gw
    where gw.w in (select w from lette)
    group by gw.w
  ),
  tw as (
    select l.indice, l.w, coalesce(f.quante, 0) as quante
    from lette l left join frequenza f on f.w = l.w
  ),
  scelte as (
    select indice, w from (
      select tw.*, row_number() over (partition by indice order by quante) as r from tw
    ) z
    where quante > 0 and (quante <= 300 or r = 1)
  ),
  coppie as materialized (
    select distinct s.indice, gw.id, gw.titolo
    from scelte s join gw on gw.w = s.w
  ),
  c as (
    select t.indice, gn.*, t.q,
           case when gn.gp = t.q or (cardinality(t.qw) >= 1 and gn.pw @> t.qw and t.qw @> gn.pw) then 0
                when gn.gp like t.q || ' %' then 1
                when t.q like gn.gp || ' %' and length(gn.gp) >= 4 then 2
                when gn.gp like '%' || t.q || '%' then 3
                when gn.pw @> t.qw then 4
                else 5 end as punti
    from coppie k
    join t on t.indice = k.indice
    join gn on gn.id = k.id and gn.titolo = k.titolo
    where gn.gp like '%' || t.q || '%'
      or (t.q like gn.gp || ' %' and length(gn.gp) >= 4)
      or (cardinality(t.qw) >= 1 and gn.pw @> t.qw)
      or (cardinality(gn.pw) >= 2 and t.qw @> gn.pw)
  ),
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

-- p_righe: [{ "gioco_id": "...", "posizione": "B3", "aggiungi": true }, ...]
-- Senza «aggiungi» si aggiorna solo la posizione dei giochi già in
-- collezione; con «aggiungi» il gioco entra in collezione (origine manuale).
-- Una posizione vuota non cancella quella che c'era.
create or replace function public.collezione_salva_posizioni(p_righe jsonb)
 returns int language plpgsql security definer set search_path to 'public'
as $f$
declare n int; m int;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.'; end if;
  insert into collezioni (utente_id, gioco_id, origine, posizione)
  select distinct on (g.id) auth.uid(), g.id, 'manuale', nullif(trim(x.posizione), '')
    from jsonb_to_recordset(coalesce(p_righe, '[]'::jsonb)) as x(gioco_id text, posizione text, aggiungi boolean)
    join giochi g on g.id::text = x.gioco_id
   where coalesce(x.aggiungi, false)
  on conflict do nothing;
  get diagnostics m = row_count;
  update collezioni c
     set posizione = coalesce(nullif(trim(r.posizione), ''), c.posizione)
    from (select distinct on (x.gioco_id) x.gioco_id, x.posizione
            from jsonb_to_recordset(coalesce(p_righe, '[]'::jsonb)) as x(gioco_id text, posizione text)) r
   where c.utente_id = auth.uid() and c.gioco_id::text = r.gioco_id;
  get diagnostics n = row_count;
  return n;
end $f$;
revoke all on function public.collezione_salva_posizioni(jsonb) from public, anon;
grant execute on function public.collezione_salva_posizioni(jsonb) to authenticated;
