-- Primo Giocatore - chi organizza non diventa mai «partecipante»
-- v1.0.0 - 202611231830
-- Problema (23/11): DarioAggioli, organizzatore di Roma, è stato nominato
-- organizzatore di GOF V. Entrando nell'evento l'app ha cercato la sua
-- email nell'elenco soci, non l'ha trovata e lo ha fatto «partecipante»
-- (solo eventi). Per questo Primeggio lo toglie dalla classifica della Tana.
-- Qui:
-- 1. entrando in un evento non diventa «partecipante» chi organizza una
--    Tana o tutta l'app (si cambia solo quel pezzo della funzione, il
--    resto resta com'è nel database);
-- 2. chi organizza ed è già «partecipante» passa a «eccezione»: socio per
--    decisione, non per l'elenco soci (come i soci messi a mano).
-- Si può rilanciare senza danni.

do $$
declare
  v_src text;
  v_vecchio text := $v$  if tg_op = 'INSERT' then
    perform public.allinea_socio(new.utente_id);
    perform set_config('primo.soci_ok', '1', true);
    update profili set stato_socio = 'partecipante'
      where id = new.utente_id and stato_socio = 'in_attesa';
    perform set_config('primo.soci_ok', '', true);
  end if;$v$;
  v_nuovo text := $v$  if tg_op = 'INSERT' then
    perform public.allinea_socio(new.utente_id);
    -- Chi organizza una Tana o tutta l'app non diventa mai partecipante.
    if not exists (select 1 from organizzatori_tana where utente_id = new.utente_id)
       and not exists (select 1 from profili where id = new.utente_id
                       and (coalesce(organizzatore, false) or coalesce(amministratore, false))) then
      perform set_config('primo.soci_ok', '1', true);
      update profili set stato_socio = 'partecipante'
        where id = new.utente_id and stato_socio = 'in_attesa';
      perform set_config('primo.soci_ok', '', true);
    end if;
  end if;$v$;
begin
  select prosrc into v_src from pg_proc
  where proname = 'dopo_ruolo_evento' and pronamespace = 'public'::regnamespace;
  if v_src is null then
    raise exception 'Non trovo la funzione dopo_ruolo_evento: non cambio niente.';
  end if;
  if position(v_nuovo in v_src) > 0 then
    raise notice 'La funzione era già corretta.';
  elsif position(v_vecchio in v_src) = 0 then
    raise exception 'La funzione dopo_ruolo_evento è diversa da come me l''aspettavo: non cambio niente.';
  else
    execute format('create or replace function public.dopo_ruolo_evento() returns trigger '
                   'language plpgsql security definer set search_path to ''public'' as %L',
                   replace(v_src, v_vecchio, v_nuovo));
  end if;
end $$;

-- 2. Chi organizza ed è «partecipante» -> «eccezione» ------------------------
do $$
begin
  perform set_config('primo.soci_ok', '1', true);
  update public.profili p set stato_socio = 'eccezione'
  where p.stato_socio = 'partecipante'
    and (coalesce(p.organizzatore, false) or coalesce(p.amministratore, false)
         or exists (select 1 from public.organizzatori_tana o where o.utente_id = p.id));
  perform set_config('primo.soci_ok', '', true);
end $$;

-- 3. Controllo ---------------------------------------------------------------
select 'funzione corretta' as prova,
       case when (select prosrc from pg_proc where proname = 'dopo_ruolo_evento'
                  and pronamespace = 'public'::regnamespace)
                 like '%non diventa mai partecipante%' then 'sì' else 'NO' end as esito
union all
select 'organizzatori ancora «partecipante»',
       (select count(*)::text from public.profili p
        where p.stato_socio = 'partecipante'
          and (coalesce(p.organizzatore, false) or coalesce(p.amministratore, false)
               or exists (select 1 from public.organizzatori_tana o where o.utente_id = p.id)))
union all
select 'stato di ' || nickname, stato_socio from public.profili
where nickname in ('DarioAggioli', 'Lobo');
