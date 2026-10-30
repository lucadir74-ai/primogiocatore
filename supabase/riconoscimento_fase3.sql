-- Primo Giocatore - riconoscimento delle persone, fase 3 (importazioni)
-- v1.0.0 - 202610300030
-- Va eseguito DOPO riconoscimento_fase1.sql. Si può rilanciare senza danni.
--
-- Vale per tutte le importazioni (BGG, BGA, BG Stats) e per la nuova
-- partita, senza toccarle una per una:
-- 1. Un ospite che nasce con il nome collegato di UN SOLO iscritto
--    (stesso nome e stesso cognome, anche vuoto) viene collegato subito
--    a lui. Se il nome è di due iscritti, resta libero: decide «Sei tu?».
-- 2. Una partecipazione salvata con un ospite già collegato passa
--    direttamente all'account (se la persona non è già nella partita).
-- 3. Una volta sola: sistema le partecipazioni e gli ospiti già esistenti.

-- Chi è, dato un nome? Nessuno se non è uno solo, o se è chi crea l'ospite.
create or replace function public.utente_per_nome(p_nome text, p_cognome text, p_escludi uuid)
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  with c as (
    select n.utente_id from nomi_collegati n
    where n.nome = lower(trim(p_nome))
      and n.cognome = coalesce(lower(trim(p_cognome)), '')
    union
    select p.id from profili p
    where coalesce(trim(p_cognome), '') <> ''
      and lower(trim(p.nome)) = lower(trim(p_nome))
      and lower(trim(p.cognome)) = lower(trim(p_cognome))
  )
  select case when count(*) = 1 and (array_agg(utente_id))[1] is distinct from p_escludi
              then (array_agg(utente_id))[1] end
  from c;
$function$;

-- 1. Ospite nuovo già riconosciuto ---------------------------------------
create or replace function public.ospite_riconosciuto()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v uuid;
begin
  if new.utente_collegato is null and new.creato_da is not null
     and coalesce(trim(new.nome), '') <> '' then
    v := utente_per_nome(new.nome, new.cognome, new.creato_da);
    if v is not null then
      new.utente_collegato := v;
      new.collegato_il := now();
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists ospiti_riconosci on public.ospiti;
create trigger ospiti_riconosci
  before insert on public.ospiti
  for each row execute function public.ospite_riconosciuto();

-- 2. Partecipazione con ospite collegato → all'account --------------------
create or replace function public.partecipazione_a_utente()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v uuid;
begin
  if new.ospite_id is not null then
    select utente_collegato into v from ospiti where id = new.ospite_id;
    if v is not null and not exists (
      select 1 from partecipazioni x
      where x.partita_id = new.partita_id and x.utente_id = v and x.id is distinct from new.id
    ) then
      new.utente_id := v;
      new.ospite_id := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists partecipazioni_a_utente on public.partecipazioni;
create trigger partecipazioni_a_utente
  before insert or update of ospite_id on public.partecipazioni
  for each row execute function public.partecipazione_a_utente();

-- 3a. Una volta: partecipazioni con ospiti già collegati → all'account -----
with candidate as (
  select p.id, o.utente_collegato as u,
         row_number() over (partition by p.partita_id, o.utente_collegato order by p.id) as n
  from partecipazioni p
  join ospiti o on o.id = p.ospite_id
  where o.utente_collegato is not null
    and not exists (select 1 from partecipazioni x
                    where x.partita_id = p.partita_id and x.utente_id = o.utente_collegato)
)
update partecipazioni p
set utente_id = c.u, ospite_id = null
from candidate c
where c.id = p.id and c.n = 1;

-- 3b. Una volta: ospiti liberi con un nome collegato di un solo iscritto ---
do $$
declare
  r record;
  v uuid;
begin
  for r in select id, nome, cognome, creato_da from ospiti
           where utente_collegato is null and creato_da is not null
  loop
    v := utente_per_nome(r.nome, r.cognome, r.creato_da);
    if v is not null then
      update richieste_collegamento
      set stato = case when utente_id = v then 'approvata' else 'rifiutata' end,
          decisa_il = now()
      where ospite_id = r.id and stato = 'attesa';
      perform esegui_collegamento(r.id, v);
    end if;
  end loop;
end $$;

-- Come è andata
select
  (select count(*) from nomi_collegati) as nomi_collegati,
  (select count(*) from ospiti where utente_collegato is not null) as ospiti_collegati,
  (select count(*) from partecipazioni p join ospiti o on o.id = p.ospite_id
    where o.utente_collegato is not null) as partecipazioni_ancora_su_ospite_collegato;
