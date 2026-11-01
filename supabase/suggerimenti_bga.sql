-- Primo Giocatore - suggerimenti per i giochi BGA da tutto il catalogo
-- v1.0.0 - 202611011400
--
-- BGA chiama i giochi con un nome tutto attaccato («forbiddenisland»).
-- Prima il suggerimento «dal nome» guardava solo le partite di chi
-- importa: se non aveva mai registrato quel gioco altrove, niente.
-- Questa funzione confronta i nomi BGA con TUTTI i giochi dell'app che
-- hanno un numero BGG, togliendo spazi, punteggiatura, maiuscole e
-- accenti da entrambe le parti (la stessa regola dell'app).
--
-- Riservatezza: restituisce solo nome e numero BGG del gioco, che sono
-- dati pubblici di BoardGameGeek. Non dice chi lo possiede o ci gioca.
--
-- Se più giochi hanno lo stesso nome si preferisce il gioco base
-- all'espansione, poi quello con più partite nell'app.
--
-- Si lancia una volta nell'editor SQL di Supabase.

create or replace function public.suggerisci_giochi_bga(p_nomi text[])
returns table(bga_nome text, bgg_id public.giochi.bgg_id%type, nome text)
language sql
stable
security definer
set search_path = public
as $$
  with nomi as (
    select distinct n as bga_nome,
           regexp_replace(lower(n), '[^a-z0-9]', '', 'g') as chiave
    from unnest(p_nomi[1:500]) as n
    where auth.uid() is not null and n is not null and length(n) >= 2
  ),
  catalogo as (
    select g.id, g.bgg_id, g.nome, coalesce(g.espansione, false) as espansione,
           regexp_replace(
             translate(lower(g.nome), 'àáâäãåèéêëìíîïòóôöõùúûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy'),
             '[^a-z0-9]', '', 'g') as chiave
    from giochi g
    where g.bgg_id is not null
  ),
  candidati as (
    select n.bga_nome, c.bgg_id, c.nome,
           row_number() over (
             partition by n.bga_nome
             order by c.espansione,
                      (select count(*) from partite p where p.gioco_id = c.id) desc,
                      c.bgg_id
           ) as rango
    from nomi n
    join catalogo c on c.chiave = n.chiave
  )
  select bga_nome, bgg_id, nome from candidati where rango = 1;
$$;

revoke all on function public.suggerisci_giochi_bga(text[]) from public, anon;
grant execute on function public.suggerisci_giochi_bga(text[]) to authenticated;
