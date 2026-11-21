-- Primo Giocatore - privacy, fase 4: informativa al primo accesso
-- v1.0.0 - 202611212100
-- Va eseguito DOPO privacy_fase3.sql. Si può rilanciare senza danni.
--
-- L'associazione chiede che al primo accesso si legga e accetti una breve
-- informativa, e che l'app registri data e versione accettate.
-- - informative: le versioni del testo; vale l'ultima pubblicata. Il
--   testo lo scrive l'associazione e lo pubblica l'amministratore
--   dall'app (Persone → Soci → Informativa). Le versioni non si
--   cambiano né si cancellano: per correggere se ne pubblica una nuova.
-- - accettazioni_informativa: chi ha accettato quale versione e quando.
-- Finché non c'è nessuna versione pubblicata, l'app non chiede niente.

-- 1. Tabelle ---------------------------------------------------------------------
create table if not exists public.informative (
  versione       text primary key,
  testo          text not null,
  pubblicata_il  timestamptz not null default now(),
  pubblicata_da  uuid references public.profili(id) on delete set null
);
alter table public.informative enable row level security;
drop policy if exists "informative: le leggono tutti gli iscritti" on public.informative;
create policy "informative: le leggono tutti gli iscritti" on public.informative
  for select to authenticated using (true);
revoke insert, update, delete on public.informative from anon, authenticated;
grant select on public.informative to authenticated;

create table if not exists public.accettazioni_informativa (
  utente_id     uuid not null references public.profili(id) on delete cascade,
  versione      text not null references public.informative(versione),
  accettata_il  timestamptz not null default now(),
  primary key (utente_id, versione)
);
alter table public.accettazioni_informativa enable row level security;
drop policy if exists "accettazioni: le mie, e tutte per l'amministratore" on public.accettazioni_informativa;
create policy "accettazioni: le mie, e tutte per l'amministratore" on public.accettazioni_informativa
  for select to authenticated using (utente_id = auth.uid() or public.organizzatore_globale());
revoke insert, update, delete on public.accettazioni_informativa from anon, authenticated;
grant select on public.accettazioni_informativa to authenticated;

-- 2. Funzioni --------------------------------------------------------------------
-- L'ultima versione, se io non l'ho ancora accettata; altrimenti niente.
create or replace function public.informativa_da_accettare()
 returns table (versione text, testo text, pubblicata_il timestamptz)
 language sql stable security definer set search_path to 'public' as $f$
  with ultima as (select * from informative order by pubblicata_il desc limit 1)
  select u.versione, u.testo, u.pubblicata_il
    from ultima u
   where not exists (select 1 from accettazioni_informativa a
                      where a.utente_id = auth.uid() and a.versione = u.versione)
$f$;

-- Si accetta solo l'ultima versione: data e ora le mette il database.
create or replace function public.accetta_informativa(p_versione text)
 returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  ultima text;
begin
  if auth.uid() is null then raise exception 'Entra nell''app per accettare.'; end if;
  select versione into ultima from informative order by pubblicata_il desc limit 1;
  if ultima is distinct from p_versione then
    raise exception 'L''informativa è stata aggiornata: ricarica la pagina e leggi la versione nuova.';
  end if;
  insert into accettazioni_informativa (utente_id, versione) values (auth.uid(), p_versione)
    on conflict do nothing;
end $f$;

-- Pubblica una versione nuova: solo l'amministratore. Da quel momento
-- tutti la rileggono e la riaccettano al prossimo accesso.
create or replace function public.pubblica_informativa(p_versione text, p_testo text)
 returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not public.organizzatore_globale() then
    raise exception 'Solo l''amministratore dell''app pubblica l''informativa.';
  end if;
  if coalesce(trim(p_versione), '') = '' or length(trim(coalesce(p_testo, ''))) < 50 then
    raise exception 'Servono il numero di versione e il testo completo.';
  end if;
  if exists (select 1 from informative where versione = trim(p_versione)) then
    raise exception 'La versione % esiste già: dai un numero nuovo.', trim(p_versione);
  end if;
  insert into informative (versione, testo, pubblicata_da) values (trim(p_versione), trim(p_testo), auth.uid());
  if to_regprocedure('public.registra(text, text)') is not null then
    perform registra('informativa pubblicata', 'versione ' || trim(p_versione));
  end if;
end $f$;

-- Per l'amministratore: quanti hanno accettato l'ultima versione.
create or replace function public.stato_informativa()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare
  v text;
begin
  if not public.organizzatore_globale() then return null; end if;
  select versione into v from informative order by pubblicata_il desc limit 1;
  return jsonb_build_object(
    'versione', v,
    'accettata_da', (select count(*) from accettazioni_informativa where versione = v),
    'iscritti', (select count(*) from profili));
end $f$;

revoke all on function public.informativa_da_accettare() from public, anon;
revoke all on function public.accetta_informativa(text) from public, anon;
revoke all on function public.pubblica_informativa(text, text) from public, anon;
revoke all on function public.stato_informativa() from public, anon;
grant execute on function public.informativa_da_accettare() to authenticated;
grant execute on function public.accetta_informativa(text) to authenticated;
grant execute on function public.pubblica_informativa(text, text) to authenticated;
grant execute on function public.stato_informativa() to authenticated;

-- Controllo: devono essere «sì», «sì», e 0 versioni pubblicate (le pubblichi tu dall'app).
select
  (case when to_regclass('public.informative') is not null then 'sì' else 'no' end) as tabelle,
  (case when exists (select 1 from pg_proc where proname = 'accetta_informativa') then 'sì' else 'no' end) as funzioni,
  (select count(*) from public.informative) as versioni_pubblicate;
