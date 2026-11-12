-- Primo Giocatore - contatti della Tana
-- v1.0.0 - 202611121000
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non tocca partite, ospiti né account.
--
-- Telefono, email, social e sito della Tana, in una pagina che si apre
-- dalla Home. Li leggono tutti gli iscritti; li scrivono gli
-- organizzatori (generali o di quella Tana), direttamente dall'app.

-- 1. La tabella (il tipo dell'id della Tana si legge dal database) ---------
do $$
declare
  tt text := (select format_type(atttypid, atttypmod) from pg_attribute
              where attrelid = 'public.tane'::regclass and attname = 'id');
begin
  execute format($t$
    create table if not exists public.contatti_tana (
      id            uuid primary key default gen_random_uuid(),
      tana_id       %s not null references public.tane(id) on delete cascade,
      tipo          text not null,
      etichetta     text,
      valore        text not null,
      ordine        int not null default 0,
      aggiornato_da uuid references public.profili(id) on delete set null,
      aggiornato_il timestamptz not null default now()
    )$t$, tt);
end $$;
create index if not exists contatti_tana_tana on public.contatti_tana (tana_id, ordine);
alter table public.contatti_tana enable row level security;
-- Nessuna regola: si legge e si scrive solo con le funzioni qui sotto.

-- 2. Chi può modificarli ----------------------------------------------------
create or replace function public.puo_gestire_contatti(p_tana text)
 returns boolean language sql stable security definer set search_path to 'public'
as $f$
  select auth.uid() is not null and (
    public.e_organizzatore()
    or exists (select 1 from organizzatori_tana o where o.utente_id = auth.uid() and o.tana_id::text = p_tana))
$f$;

-- 3. Leggere: i contatti della propria Tana (o di quella indicata) ----------
drop function if exists public.contatti_elenco(text);
create function public.contatti_elenco(p_tana text default null)
 returns jsonb language sql stable security definer set search_path to 'public'
as $f$
  with t as (
    select coalesce(p_tana, (select tana_id::text from profili where id = auth.uid())) as id
  )
  select case when auth.uid() is null or not (select public.ammesso()) then null else
    jsonb_build_object(
      'tana_id', t.id,
      'tana', (select to_jsonb(x) ->> 'nome' from tane x where x.id::text = t.id),
      'posso', public.puo_gestire_contatti(t.id),
      'voci', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'etichetta', c.etichetta, 'valore', c.valore)
                         order by c.ordine, c.aggiornato_il)
        from contatti_tana c where c.tana_id::text = t.id), '[]'::jsonb))
    end
  from t;
$f$;

-- 4. Scrivere: l'elenco intero, nell'ordine in cui arriva -------------------
create or replace function public.contatti_salva(p_tana text, p_voci jsonb)
 returns integer language plpgsql security definer set search_path to 'public'
as $f$
declare n int;
begin
  if not public.puo_gestire_contatti(p_tana) then
    raise exception 'I contatti di questa Tana li modificano i suoi organizzatori.';
  end if;
  if not exists (select 1 from tane t where t.id::text = p_tana) then
    raise exception 'Tana non trovata.';
  end if;
  if jsonb_array_length(coalesce(p_voci, '[]'::jsonb)) > 30 then
    raise exception 'Troppi contatti: al massimo 30.';
  end if;

  delete from contatti_tana c where c.tana_id::text = p_tana;
  insert into contatti_tana (tana_id, tipo, etichetta, valore, ordine, aggiornato_da)
  select t.id,
         case when v.voce ->> 'tipo' in ('telefono', 'whatsapp', 'email', 'facebook', 'instagram', 'telegram', 'sito', 'altro')
              then v.voce ->> 'tipo' else 'altro' end,
         nullif(left(trim(v.voce ->> 'etichetta'), 60), ''),
         left(trim(v.voce ->> 'valore'), 200),
         v.n::int, auth.uid()
    from jsonb_array_elements(coalesce(p_voci, '[]'::jsonb)) with ordinality as v(voce, n)
    join tane t on t.id::text = p_tana
   where coalesce(trim(v.voce ->> 'valore'), '') <> '';
  get diagnostics n = row_count;
  return n;
end $f$;

revoke all on function public.puo_gestire_contatti(text) from public, anon;
revoke all on function public.contatti_elenco(text)      from public, anon;
revoke all on function public.contatti_salva(text, jsonb) from public, anon;
grant execute on function public.puo_gestire_contatti(text) to authenticated;
grant execute on function public.contatti_elenco(text)      to authenticated;
grant execute on function public.contatti_salva(text, jsonb) to authenticated;
