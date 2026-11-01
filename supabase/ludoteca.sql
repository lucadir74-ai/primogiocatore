-- Primo Giocatore - dove sta un gioco: collezione di casa e ludoteca della Tana
-- v1.0.0 - 202611011600
-- 1. Collezione di casa: ogni gioco può avere una posizione (es. «Libreria
--    sala – 3° ripiano»). La vede solo il proprietario: «Chi ce l'ha?»
--    continua a mostrare agli altri solo che il gioco ce l'hai.
-- 2. Ludoteca della Tana: l'elenco dei giochi della Tana con la loro
--    posizione. La leggono tutti; la modificano organizzatori e
--    dimostratori (e chi organizza quella Tana).
-- Tutto passa da funzioni: la tabella della ludoteca non si scrive a mano.
-- Si può rilanciare senza danni.

-- 1. Collezione di casa ---------------------------------------------------
alter table public.collezioni add column if not exists posizione text;

create or replace function public.imposta_posizione(p_gioco text, p_posizione text)
 returns void language sql security definer set search_path to 'public'
as $f$
  update collezioni set posizione = nullif(trim(p_posizione), '')
   where utente_id = auth.uid() and gioco_id::text = p_gioco;
$f$;
revoke all on function public.imposta_posizione(text, text) from public, anon;
grant execute on function public.imposta_posizione(text, text) to authenticated;

-- 2. Ludoteca della Tana (i tipi degli id si leggono dal database) --------
do $$
declare
  tg text := (select format_type(atttypid, atttypmod) from pg_attribute
              where attrelid = 'public.giochi'::regclass and attname = 'id');
  tt text := (select format_type(atttypid, atttypmod) from pg_attribute
              where attrelid = 'public.tane'::regclass and attname = 'id');
begin
  execute format($t$
    create table if not exists public.ludoteca_tana (
      tana_id       %s not null references public.tane(id) on delete cascade,
      gioco_id      %s not null references public.giochi(id) on delete cascade,
      posizione     text,
      note          text,
      aggiornato_da uuid references public.profili(id) on delete set null,
      aggiornato_il timestamptz not null default now(),
      primary key (tana_id, gioco_id)
    )$t$, tt, tg);
end $$;
alter table public.ludoteca_tana enable row level security;
-- Nessuna regola: si legge e si scrive solo con le funzioni qui sotto.

create or replace function public.puo_gestire_ludoteca(p_tana text)
 returns boolean language sql stable security definer set search_path to 'public'
as $f$
  select auth.uid() is not null and (
    public.e_organizzatore() or public.e_dimostratore()
    or exists (select 1 from organizzatori_tana o where o.utente_id = auth.uid() and o.tana_id::text = p_tana))
$f$;

-- L'elenco di una Tana (o di quella dell'iscritto, se p_tana è vuoto).
drop function if exists public.ludoteca_elenco(text);
create function public.ludoteca_elenco(p_tana text default null)
 returns table(gioco_id text, nome text, anno int, immagine_url text, posizione text, note text,
               tana_id text, tana text, posso boolean)
 language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select coalesce(p_tana, (select tana_id::text from profili where id = auth.uid())) as id
  )
  select g.id::text, g.nome, g.anno::int, g.immagine_url, l.posizione, l.note,
         t.id, (select to_jsonb(x) ->> 'nome' from tane x where x.id::text = t.id),
         public.puo_gestire_ludoteca(t.id)
  from t
  join ludoteca_tana l on l.tana_id::text = t.id
  join giochi g on g.id = l.gioco_id
  where auth.uid() is not null and (select public.ammesso())
  order by g.nome;
$f$;

-- Dove sta un gioco nella ludoteca della propria Tana (per la scheda del gioco).
drop function if exists public.ludoteca_dove(text);
create function public.ludoteca_dove(p_gioco text)
 returns table(posizione text, tana text)
 language sql stable security definer set search_path to 'public'
as $f$
  select coalesce(l.posizione, ''), (select to_jsonb(x) ->> 'nome' from tane x where x.id = l.tana_id)
  from ludoteca_tana l
  where l.gioco_id::text = p_gioco
    and l.tana_id::text = (select tana_id::text from profili where id = auth.uid())
    and (select public.ammesso());
$f$;

-- Cerca nel catalogo i giochi da aggiungere (solo per chi gestisce).
drop function if exists public.ludoteca_cerca(text, text);
create function public.ludoteca_cerca(p_tana text, p_testo text)
 returns table(gioco_id text, nome text, anno int, immagine_url text, gia_dentro boolean)
 language sql stable security definer set search_path to 'public'
as $f$
  select g.id::text, g.nome, g.anno::int, g.immagine_url,
         exists (select 1 from ludoteca_tana l where l.tana_id::text = p_tana and l.gioco_id = g.id)
  from giochi g
  where public.puo_gestire_ludoteca(p_tana)
    and length(trim(coalesce(p_testo, ''))) >= 2
    and g.nome ilike '%' || trim(p_testo) || '%'
  order by (lower(g.nome) = lower(trim(p_testo))) desc, length(g.nome), g.nome
  limit 30;
$f$;

create or replace function public.ludoteca_salva(p_tana text, p_gioco text, p_posizione text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca la modificano organizzatori e dimostratori.';
  end if;
  insert into ludoteca_tana (tana_id, gioco_id, posizione, note, aggiornato_da, aggiornato_il)
  select t.id, g.id, nullif(trim(p_posizione), ''), nullif(trim(p_note), ''), auth.uid(), now()
    from tane t, giochi g where t.id::text = p_tana and g.id::text = p_gioco
  on conflict (tana_id, gioco_id) do update
    set posizione = excluded.posizione, note = excluded.note,
        aggiornato_da = excluded.aggiornato_da, aggiornato_il = excluded.aggiornato_il;
end $f$;

create or replace function public.ludoteca_togli(p_tana text, p_gioco text)
 returns void language plpgsql security definer set search_path to 'public'
as $f$
begin
  if not public.puo_gestire_ludoteca(p_tana) then
    raise exception 'La ludoteca la modificano organizzatori e dimostratori.';
  end if;
  delete from ludoteca_tana where tana_id::text = p_tana and gioco_id::text = p_gioco;
end $f$;

revoke all on function public.puo_gestire_ludoteca(text) from public, anon;
revoke all on function public.ludoteca_elenco(text) from public, anon;
revoke all on function public.ludoteca_dove(text) from public, anon;
revoke all on function public.ludoteca_cerca(text, text) from public, anon;
revoke all on function public.ludoteca_salva(text, text, text, text) from public, anon;
revoke all on function public.ludoteca_togli(text, text) from public, anon;
grant execute on function public.puo_gestire_ludoteca(text) to authenticated;
grant execute on function public.ludoteca_elenco(text) to authenticated;
grant execute on function public.ludoteca_dove(text) to authenticated;
grant execute on function public.ludoteca_cerca(text, text) to authenticated;
grant execute on function public.ludoteca_salva(text, text, text, text) to authenticated;
grant execute on function public.ludoteca_togli(text, text) to authenticated;
