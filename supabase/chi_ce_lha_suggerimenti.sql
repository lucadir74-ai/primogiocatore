-- Primo Giocatore - «Chi ce l'ha?»: suggerimenti mentre scrivi
-- v1.0.0 - 202610301800
-- Va eseguito DOPO chi_ce_lha.sql. Si può rilanciare senza danni.
--
-- Mentre scrivi il nome di un gioco, l'app propone i giochi che qualcuno
-- possiede, anche se il nome è scritto male («supli batle» → Supplì
-- Battle). Usa la somiglianza a trigrammi di Postgres (pg_trgm).

create extension if not exists pg_trgm with schema extensions;

-- Fino a 8 giochi posseduti (e condivisi) con un nome simile a quello scritto.
create or replace function public.suggerisci_giochi(p_testo text)
 returns table(gioco_id public.giochi.id%type, nome text, anno int, immagine_url text, quanti int)
 language sql stable security definer set search_path to 'public', 'extensions'
as $function$
  with t as (select lower(trim(p_testo)) as q),
  candidati as (
    select g.id, g.nome, g.anno, g.immagine_url,
           word_similarity(t.q, lower(g.nome)) as somiglia,
           lower(g.nome) like t.q || '%' as inizia,
           lower(g.nome) like '%' || t.q || '%' as contiene
    from giochi g, t
    where length(t.q) >= 2
      and (lower(g.nome) like '%' || t.q || '%' or word_similarity(t.q, lower(g.nome)) > 0.35)
  )
  select c.id, c.nome, c.anno::int, c.immagine_url, count(distinct co.utente_id)::int
  from candidati c
  join collezioni co on co.gioco_id = c.id
  join profili p on p.id = co.utente_id
  where auth.uid() is not null
    and (select ammesso())
    and (p.collezione_condivisa or p.id = auth.uid())
  group by c.id, c.nome, c.anno, c.immagine_url, c.inizia, c.contiene, c.somiglia
  order by c.inizia desc, c.contiene desc, c.somiglia desc, 5 desc, c.nome
  limit 8;
$function$;

-- Chi ce l'ha, per un gioco preciso (scelto dai suggerimenti).
create or replace function public.chi_ha_gioco(p_gioco public.giochi.id%type)
 returns table(gioco_id public.giochi.id%type, nome text, anno int, immagine_url text,
               utente_id uuid, chi text, tana_id int, tana text, sono_io boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select g.id, g.nome, g.anno::int, g.immagine_url,
         p.id, coalesce(nullif(trim(p.nickname), ''), trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, ''))),
         p.tana_id,
         (select to_jsonb(t) ->> 'nome' from tane t where t.id = p.tana_id),
         p.id = auth.uid()
  from collezioni c
  join giochi g on g.id = c.gioco_id
  join profili p on p.id = c.utente_id
  where auth.uid() is not null
    and (select ammesso())
    and g.id = p_gioco
    and (p.collezione_condivisa or p.id = auth.uid())
  order by 8 nulls last, 6;
$function$;
