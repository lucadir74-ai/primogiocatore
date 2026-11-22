-- Primo Giocatore - correzioni dal controllo di sicurezza del 22/11/2026
-- v1.0.0 - 202611222345
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non cambia nessuna partita, nessun profilo, nessun socio.
--
-- 1. v_partecipazioni (vista creata a mano, non usata dall'app) si poteva
--    leggere ANCHE SENZA ESSERE ENTRATI, e come vista saltava le regole:
--    tutte le partecipazioni con punteggi e nomi (degli ospiti, e il nome
--    da ospite di chi ha nascosto il proprio). Chiusa all'app; le funzioni
--    del database, se la usano, continuano a leggerla.
-- 2. e_membro: funzione con privilegi senza search_path fisso.
-- 3. non_nell_elenco (con le email): il controllo ora dice esplicitamente
--    «amministratore o organizzatore di Tana». Prima usava
--    organizza_qualcosa(), il cui testo non è negli script: così un
--    organizzatore di evento non può arrivarci di sicuro.
-- 4. nomi_collegati (i nomi con cui una persona era stata segnata come
--    ospite): nome E cognome di chi ha nascosto il proprio nome li vedono
--    solo la persona e gli organizzatori. Restano visibili a tutti i soci
--    i nomi senza cognome (di solito soprannomi, es. «kaihla») e quelli
--    di chi mostra il nome. Le funzioni del database non cambiano.

-- 1. -------------------------------------------------------------------
revoke all on public.v_partecipazioni from anon, authenticated, public;
do $$
begin
  -- In più, se un giorno la si riapre, varranno le regole delle tabelle.
  execute 'alter view public.v_partecipazioni set (security_invoker = true)';
exception when others then
  raise notice 'security_invoker non disponibile su questa versione: basta la revoca.';
end $$;

-- 2. -------------------------------------------------------------------
alter function public.e_membro(uuid) set search_path = public;

-- 3. -------------------------------------------------------------------
create or replace function public.non_nell_elenco()
 returns table(id uuid, nome text, nickname text, email text, stato_socio text, tana_id integer, creato_il timestamp with time zone)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not (public.organizzatore_globale()
          or exists (select 1 from public.organizzatori_tana o where o.utente_id = auth.uid())) then
    raise exception 'Solo per gli organizzatori';
  end if;
  return query
    select p.id, p.nome, p.nickname, u.email::text, p.stato_socio, p.tana_id, p.creato_il
    from public.profili p join auth.users u on u.id = p.id
    where p.stato_socio <> 'socio'
      -- gli organizzatori entrano comunque: non serve deciderli
      and not coalesce(p.organizzatore, false)
      and not exists (select 1 from public.organizzatori_tana o where o.utente_id = p.id)
    order by (p.stato_socio = 'in_attesa') desc, p.creato_il desc;
end $function$;
revoke all on function public.non_nell_elenco() from public, anon;
grant execute on function public.non_nell_elenco() to authenticated;

-- 4. -------------------------------------------------------------------
drop policy if exists "nomi collegati lettura" on public.nomi_collegati;
create policy "nomi collegati lettura" on public.nomi_collegati for select to authenticated
  using ((select public.ammesso()) and (
    utente_id = (select auth.uid())
    or (select public.e_organizzatore())
    or coalesce(trim(cognome), '') = ''
    or exists (select 1 from public.profili p where p.id = nomi_collegati.utente_id and p.mostra_nome)
  ));

-- Come è andata: devono essere tutti «sì».
select
  case when not has_table_privilege('anon', 'public.v_partecipazioni', 'SELECT')
        and not has_table_privilege('authenticated', 'public.v_partecipazioni', 'SELECT')
       then 'sì' else 'no' end as vista_chiusa,
  case when exists (select 1 from pg_proc p, unnest(coalesce(p.proconfig, '{}'::text[])) x
                    where p.oid = 'public.e_membro(uuid)'::regprocedure and x like 'search_path=%')
       then 'sì' else 'no' end as e_membro_protetta,
  case when position('organizzatori_tana o where o.utente_id = auth.uid()'
                     in pg_get_functiondef('public.non_nell_elenco()'::regprocedure)) > 0
        and not has_function_privilege('anon', 'public.non_nell_elenco()', 'EXECUTE')
       then 'sì' else 'no' end as email_solo_organizzatori,
  case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nomi_collegati'
                    and policyname = 'nomi collegati lettura' and qual like '%mostra_nome%')
       then 'sì' else 'no' end as nomi_nascosti_protetti,
  -- Solo per sapere: funzioni del database che usano la vista (di solito nessuna).
  coalesce((select string_agg(p.proname || case when p.prosecdef then '' else ' (attenzione)' end, ', ')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosrc ilike '%v_partecipazioni%'), 'nessuna') as funzioni_che_usano_la_vista;
