-- Primo Giocatore - privacy, fase 1 (indicazioni di Enrico, 21/11/2026)
-- v1.0.0 - 202611211800
-- Si può rilanciare senza danni.
--
-- 1. La città non si raccoglie più: chi si iscrive non la scrive, e
--    quelle già salvate si cancellano (profilo e dati dell'iscrizione).
--    La colonna resta, vuota, perché altre funzioni la nominano.
-- 2. «Sostituisci tutto l'elenco» dei soci di una Tana: aggiunge e
--    aggiorna come importa_soci, poi toglie chi non è nel file. Non si
--    tengono copie del vecchio elenco. Chi viene tolto e ha un account
--    torna in attesa, come quando si toglie un socio a mano.

-- 1. Città -----------------------------------------------------------------
create or replace function public.dati_registrazione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  m jsonb;
begin
  select raw_user_meta_data into m from auth.users where id = new.id;
  if m is not null then
    new.cognome := coalesce(nullif(trim(new.cognome), ''), nullif(trim(m->>'cognome'), ''));
  end if;
  new.citta := null;
  return new;
end;
$function$;

update public.profili set citta = null where citta is not null;
update auth.users set raw_user_meta_data = raw_user_meta_data - 'citta'
 where raw_user_meta_data ? 'citta';

-- 2. Sostituisci l'elenco ----------------------------------------------------
create or replace function public.sostituisci_soci(p_righe jsonb, p_tana public.soci.tana_id%type)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_email text[];
  v_esito jsonb;
  v_tolti int;
begin
  if p_tana is null then raise exception 'Scegli la Tana.'; end if;
  if not (public.organizzatore_globale()
          or exists (select 1 from public.organizzatori_tana where utente_id = auth.uid() and tana_id = p_tana)) then
    raise exception 'Solo chi organizza questa Tana può sostituirne l''elenco soci.';
  end if;

  select array_agg(distinct lower(trim(r->>'email')))
    into v_email
    from jsonb_array_elements(p_righe) r
   where trim(coalesce(r->>'email', '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  -- Un file senza email valide svuoterebbe l'elenco: meglio fermarsi.
  if coalesce(array_length(v_email, 1), 0) = 0 then
    raise exception 'Nel file non c''è nessuna email valida: elenco non toccato.';
  end if;

  v_esito := to_jsonb(public.importa_soci(p_righe, p_tana));

  delete from public.soci
   where tana_id = p_tana
     and lower(trim(coalesce(email, ''))) <> all (v_email);
  get diagnostics v_tolti = row_count;

  return v_esito || jsonb_build_object('tolti', v_tolti);
end;
$function$;

revoke all on function public.sostituisci_soci(jsonb, public.soci.tana_id%type) from public, anon;
grant execute on function public.sostituisci_soci(jsonb, public.soci.tana_id%type) to authenticated;

-- Controllo: devono essere 0 e «sì».
select
  (select count(*) from public.profili where citta is not null)                        as profili_con_citta,
  (select count(*) from auth.users where raw_user_meta_data ? 'citta')                  as iscrizioni_con_citta,
  (case when exists (select 1 from pg_proc where proname = 'sostituisci_soci') then 'sì' else 'no' end) as sostituisci_pronta;
