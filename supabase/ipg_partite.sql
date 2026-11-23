-- Primo Giocatore - Primeggio partita per partita
-- v1.0.0 - 202611232100
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non cambia nessuna partita e nessun IPG.
--
-- Il ricalcolo dell'IPG (di notte, o dal tasto in Statistiche) segue le
-- partite in ordine di data: da ora salva anche, per ogni partita e per
-- ogni giocatore con un account, l'IPG di quel gioco e quello globale
-- prima e dopo la partita. Così nello Storico, aprendo una partita già
-- registrata, si vede quanto ha fatto salire o scendere l'IPG di ognuno.
--
-- 1. ipg_partite: una riga per partita e giocatore. La legge solo chi può
--    già vedere la partita (valgono le regole della tabella partite); la
--    scrive solo il server. Ogni ricalcolo scrive le righe nuove con un
--    numero di lotto e poi toglie quelle dei lotti vecchi.
-- 2. primeggio_partite manda anche il numero della partita (in fondo a
--    ogni riga: il server di prima lo ignora).

-- 1. -------------------------------------------------------------------
create table if not exists public.ipg_partite (
  partita_id uuid not null references public.partite (id) on delete cascade,
  profilo_id uuid not null,
  lotto uuid not null,
  gioco_prima int,          -- null: prima partita a quel gioco
  gioco_dopo int not null,
  globale_prima int,        -- null: prima partita in assoluto
  globale_dopo int not null,
  aggiornato_il timestamptz not null default now(),
  primary key (partita_id, profilo_id, lotto)
);
create index if not exists ipg_partite_lotto on public.ipg_partite (lotto);

alter table public.ipg_partite enable row level security;
revoke all on public.ipg_partite from anon, authenticated, public;
grant select on public.ipg_partite to authenticated;
drop policy if exists "ipg partite lettura" on public.ipg_partite;
create policy "ipg partite lettura" on public.ipg_partite for select to authenticated
  using (exists (select 1 from public.partite p where p.id = ipg_partite.partita_id));

-- Tiene solo il lotto appena scritto.
create or replace function public.pubblica_ipg_partite(p_lotto uuid)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('primo-giocatore:pubblica_ipg_partite'));
  select count(*) into n from ipg_partite where lotto = p_lotto;
  if n = 0 then raise exception 'Lotto vuoto: le righe di prima restano.'; end if;
  delete from ipg_partite where lotto <> p_lotto;
  return n;
end $function$;
revoke all on function public.pubblica_ipg_partite(uuid) from public, anon, authenticated;
grant execute on function public.pubblica_ipg_partite(uuid) to service_role;

-- 2. -------------------------------------------------------------------
do $$
declare
  prima text;
  dopo text;
begin
  select pg_get_functiondef('public.primeggio_partite(uuid, int)'::regprocedure) into prima;
  if position($q$coalesce(parti.j, '[]'::jsonb), pg.id)$q$ in prima) > 0 then
    raise notice 'primeggio_partite manda già il numero della partita.';
    return;
  end if;
  dopo := replace(prima,
    $q$jsonb_build_array(pg.giocata_il, cr.n, pg.tipo_punteggio, cg.n, coalesce(parti.j, '[]'::jsonb))$q$,
    $q$jsonb_build_array(pg.giocata_il, cr.n, pg.tipo_punteggio, cg.n, coalesce(parti.j, '[]'::jsonb), pg.id)$q$);
  if dopo = prima then
    raise exception 'primeggio_partite non ha la forma attesa: non è stato cambiato nulla.';
  end if;
  execute dopo;
end $$;

-- Come è andata: devono essere tutti «sì».
select
  case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ipg_partite')
       then 'sì' else 'no' end as tabella,
  case when has_table_privilege('authenticated', 'public.ipg_partite', 'SELECT')
        and not has_table_privilege('authenticated', 'public.ipg_partite', 'INSERT')
        and not has_function_privilege('authenticated', 'public.pubblica_ipg_partite(uuid)', 'EXECUTE')
       then 'sì' else 'no' end as solo_lettura_per_gli_iscritti,
  case when position($q$pg.id)$q$ in pg_get_functiondef('public.primeggio_partite(uuid, int)'::regprocedure)) > 0
       then 'sì' else 'no' end as primeggio_con_numero_partita;
