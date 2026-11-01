-- Primo Giocatore - ludoteca della Tana: numero di copie
-- v1.0.0 - 202611012000
-- Ogni gioco della ludoteca ha il numero di copie (di base 1).
-- Le copie stanno nella stessa posizione; se una sta altrove, lo si
-- scrive nella nota. Serve ludoteca.sql già lanciato.
-- Si può rilanciare senza danni.

alter table public.ludoteca_tana add column if not exists copie int not null default 1;
alter table public.ludoteca_tana drop constraint if exists ludoteca_tana_copie_check;
alter table public.ludoteca_tana add constraint ludoteca_tana_copie_check check (copie between 1 and 99);

-- Elenco: in più il numero di copie.
drop function if exists public.ludoteca_elenco(text);
create function public.ludoteca_elenco(p_tana text default null)
 returns table(gioco_id text, nome text, anno int, immagine_url text, posizione text, note text,
               tana_id text, tana text, posso boolean, copie int)
 language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select coalesce(p_tana, (select tana_id::text from profili where id = auth.uid())) as id
  )
  select g.id::text, g.nome, g.anno::int, g.immagine_url, l.posizione, l.note,
         t.id, (select to_jsonb(x) ->> 'nome' from tane x where x.id::text = t.id),
         public.puo_gestire_ludoteca(t.id), l.copie
  from t
  join ludoteca_tana l on l.tana_id::text = t.id
  join giochi g on g.id = l.gioco_id
  where auth.uid() is not null and (select public.ammesso())
  order by g.nome;
$f$;

-- Scheda del gioco: in più il numero di copie.
drop function if exists public.ludoteca_dove(text);
create function public.ludoteca_dove(p_gioco text)
 returns table(posizione text, tana text, copie int)
 language sql stable security definer set search_path to 'public'
as $f$
  select coalesce(l.posizione, ''), (select to_jsonb(x) ->> 'nome' from tane x where x.id = l.tana_id), l.copie
  from ludoteca_tana l
  where l.gioco_id::text = p_gioco
    and l.tana_id::text = (select tana_id::text from profili where id = auth.uid())
    and (select public.ammesso());
$f$;

-- Salvataggio: in più il numero di copie (la vecchia versione si toglie).
drop function if exists public.ludoteca_salva(text, text, text, text);
drop function if exists public.ludoteca_salva(text, text, text, text, int);
create function public.ludoteca_salva(p_tana text, p_gioco text, p_posizione text,
                                      p_note text default null, p_copie int default 1)
 returns void language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca la modificano organizzatori e dimostratori.';
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
end $f$;

revoke all on function public.ludoteca_elenco(text) from public, anon;
revoke all on function public.ludoteca_dove(text) from public, anon;
revoke all on function public.ludoteca_salva(text, text, text, text, int) from public, anon;
grant execute on function public.ludoteca_elenco(text) to authenticated;
grant execute on function public.ludoteca_dove(text) to authenticated;
grant execute on function public.ludoteca_salva(text, text, text, text, int) to authenticated;
