-- Primo Giocatore - collezione di casa: posizioni importate da CSV
-- v1.0.0 - 202611012200
-- Lo stesso CSV della ludoteca (titolo;posizione;...), ma per i propri
-- scaffali: si abbina solo ai giochi della propria collezione e si
-- aggiorna solo la posizione. I giochi che non sono in collezione non
-- si aggiungono (la collezione resta allineata con BGG).
-- Servono ludoteca.sql e ludoteca_import.sql. Si può rilanciare senza danni.

-- Per ogni titolo letto, i giochi della MIA collezione che gli somigliano.
-- punteggio come in ludoteca_abbina: 0 stesso titolo, 1 il gioco inizia
-- con il titolo, 2 il titolo inizia con il gioco, 3 il titolo sta dentro.
drop function if exists public.collezione_abbina(text[]);
create function public.collezione_abbina(p_titoli text[])
 returns table(indice int, gioco_id text, nome text, anno int, immagine_url text,
               espansione boolean, punteggio int)
 language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select u.i::int as indice, public.titolo_piatto(u.x) as q
    from unnest(p_titoli[1:300]) with ordinality as u(x, i)
    where length(public.titolo_piatto(u.x)) >= 2
  ),
  gn as materialized (
    select g.id::text as id, g.nome, g.anno::int as anno, g.immagine_url,
           coalesce(g.espansione, false) as espansione, public.titolo_piatto(g.nome) as gp
    from collezioni c join giochi g on g.id = c.gioco_id
    where c.utente_id = auth.uid()
  ),
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
  o as (
    select c.*, row_number() over (partition by c.indice
             order by c.punti, c.espansione, abs(length(c.gp) - length(c.q)), c.anno desc nulls last) as rn
    from c
  )
  select o.indice, o.id, o.nome, o.anno, o.immagine_url, o.espansione, o.punti
  from o
  where o.rn <= 5 and auth.uid() is not null
  order by o.indice, o.rn;
$f$;

-- p_righe: [{ "gioco_id": "...", "posizione": "Sala, scaffale 2" }, ...]
-- Solo i giochi già nella propria collezione; una posizione vuota non
-- cancella quella che c'era. Restituisce quanti giochi ha aggiornato.
create or replace function public.collezione_salva_posizioni(p_righe jsonb)
 returns int language plpgsql security definer set search_path to 'public'
as $f$
declare n int;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.'; end if;
  update collezioni c
     set posizione = coalesce(nullif(trim(r.posizione), ''), c.posizione)
    from (select distinct on (x.gioco_id) x.gioco_id, x.posizione
            from jsonb_to_recordset(coalesce(p_righe, '[]'::jsonb)) as x(gioco_id text, posizione text)) r
   where c.utente_id = auth.uid() and c.gioco_id::text = r.gioco_id;
  get diagnostics n = row_count;
  return n;
end $f$;

revoke all on function public.collezione_abbina(text[]) from public, anon;
revoke all on function public.collezione_salva_posizioni(jsonb) from public, anon;
grant execute on function public.collezione_abbina(text[]) to authenticated;
grant execute on function public.collezione_salva_posizioni(jsonb) to authenticated;
