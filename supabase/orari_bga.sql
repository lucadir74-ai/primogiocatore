-- Primo Giocatore - orari delle partite BGA: correzione dello sfasamento
-- v1.0.0 - 202611231200
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni.
--
-- Il problema: l'app salvava l'ora di fine delle partite BGA come ora
-- italiana senza fuso, e il database la prendeva per ora UTC: le
-- partite importate dall'app risultavano 1 ora più tardi (2 d'estate).
-- Quelle importate dal server erano giuste. Dalla 4.46.0 l'ora si salva
-- con il fuso, da tutte e due le parti.
--
-- Le partite già salvate le corregge il server, a poco a poco: rilegge
-- da BGA lo storico di ogni iscritto (un pezzo a ogni giro, come lo
-- storico dei nuovi) e passa a questa funzione l'ora vera di ogni
-- tavolo. Si toccano solo le partite importate da BGA (chiave «bga:»),
-- solo l'ora di fine; niente nomi, punteggi o giocatori.
--
-- BGG: alle partite già inviate a BGG va solo la data, non l'ora. Se la
-- data italiana non cambia, la correzione non le rimanda; se cambia
-- (partite finite fra le 23 e mezzanotte), BGG riceve la data giusta.

-- 1. A che punto è la correzione, per ogni iscritto -----------------
alter table public.bga_esiti add column if not exists orari_pagina int not null default 1;
alter table public.bga_esiti add column if not exists orari_fatti boolean not null default false;

-- 2. Il segnale «cambia solo l'ora» per l'invio a BGG ---------------
-- Uguale a invio_bgg.sql, con in più la prima riga.
create or replace function public.bgg_segna_modifica()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  -- Correzione dell'ora dentro lo stesso giorno: per BGG non cambia niente.
  if coalesce(current_setting('primo.solo_orario', true), '') = 'si' then return new; end if;
  -- Le scritture del server (numero BGG, data di invio, errore) non
  -- contano come modifiche.
  if new.bgg_inviata_il is not distinct from old.bgg_inviata_il
     and new.bgg_play_id is not distinct from old.bgg_play_id
     and (new.gioco_id is distinct from old.gioco_id
          or new.giocata_il is distinct from old.giocata_il
          or new.durata_minuti is distinct from old.durata_minuti
          or new.luogo_id is distinct from old.luogo_id
          or new.note is distinct from old.note
          or new.esito_coop is distinct from old.esito_coop) then
    new.bgg_errore := null;                       -- si ritenta
    if old.bgg_play_id is not null then
      new.bgg_inviata_il := null;                 -- BGG riceve la correzione
    end if;
  end if;
  return new;
end $function$;

-- 3. La correzione ---------------------------------------------------
-- p_orari: [{"t": 947533303, "e": "2026-11-22T22:42:00.000Z"}, ...]
-- (numero del tavolo BGA e ora vera di fine). Restituisce quante
-- partite ha corretto.
create or replace function public.correggi_orari_bga(p_utente uuid, p_orari jsonb)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare
  n1 int;
  n2 int;
begin
  -- Stesso giorno italiano: solo l'ora, BGG non va avvisato.
  perform set_config('primo.solo_orario', 'si', true);
  with o as (
    select (x->>'t')::bigint as t, (x->>'e')::timestamptz as e
    from jsonb_array_elements(p_orari) x
    where x->>'t' ~ '^\d+$' and x->>'e' is not null
  )
  update public.partite p set giocata_il = o.e
    from o
   where p.registrata_da = p_utente
     and p.bga_tavolo = o.t and p.chiave_esterna = 'bga:' || o.t
     and p.giocata_il is distinct from o.e
     and (p.giocata_il at time zone 'Europe/Rome')::date = (o.e at time zone 'Europe/Rome')::date;
  get diagnostics n1 = row_count;

  -- Giorno diverso: se era già su BGG, riceve la data giusta.
  perform set_config('primo.solo_orario', '', true);
  with o as (
    select (x->>'t')::bigint as t, (x->>'e')::timestamptz as e
    from jsonb_array_elements(p_orari) x
    where x->>'t' ~ '^\d+$' and x->>'e' is not null
  )
  update public.partite p set giocata_il = o.e
    from o
   where p.registrata_da = p_utente
     and p.bga_tavolo = o.t and p.chiave_esterna = 'bga:' || o.t
     and p.giocata_il is distinct from o.e;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $function$;
revoke all on function public.correggi_orari_bga(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.correggi_orari_bga(uuid, jsonb) to service_role;

-- Come è andata: devono essere tutti «sì».
select
  case when exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'bga_esiti' and column_name = 'orari_fatti')
       then 'sì' else 'no' end as colonne,
  case when position('primo.solo_orario' in pg_get_functiondef('public.bgg_segna_modifica()'::regprocedure)) > 0
       then 'sì' else 'no' end as invio_bgg_protetto,
  case when not has_function_privilege('authenticated', 'public.correggi_orari_bga(uuid, jsonb)', 'EXECUTE')
       then 'sì' else 'no' end as solo_il_server;

-- Per seguire la correzione nei giorni seguenti (anche da sola):
-- select count(*) filter (where orari_fatti) as fatti, count(*) as iscritti from bga_esiti;
