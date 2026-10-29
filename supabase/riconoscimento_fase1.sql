-- Primo Giocatore - riconoscimento delle persone, fase 1 (database)
-- v1.0.0 - 202610292330
-- Si può rilanciare senza danni. Non cancella partite né account.
--
-- 1. Cognome separato per account e ospiti.
-- 2. «Nomi collegati»: ogni nome di ospite approvato resta legato alla
--    persona per sempre (prima la scheda veniva cancellata e il nome
--    si perdeva). Recuperati subito dalle richieste già approvate.
-- 3. «Sei tu?» guarda gli ospiti di TUTTI e riconosce nickname, nome,
--    cognome e nomi parziali (gess → gessica).
-- 4. Una sola richiesta per più schede (gruppo), approvata una volta.
-- 5. Approvando, l'ospite non si cancella più: resta collegato.

-- 1. Cognome ---------------------------------------------------------------
alter table public.profili add column if not exists cognome text;
alter table public.ospiti  add column if not exists cognome text;

-- 2. Nomi collegati --------------------------------------------------------
create table if not exists public.nomi_collegati (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references public.profili(id) on delete cascade,
  nome      text not null,               -- minuscolo, senza spazi ai lati
  cognome   text not null default '',
  creato_il timestamptz not null default now(),
  unique (utente_id, nome, cognome)
);
alter table public.nomi_collegati enable row level security;
drop policy if exists "nomi collegati lettura" on public.nomi_collegati;
create policy "nomi collegati lettura" on public.nomi_collegati for select
  to authenticated using ((select public.ammesso()));
-- Si scrive solo dalle funzioni qui sotto: nessuna regola di scrittura.

insert into public.nomi_collegati (utente_id, nome)
select distinct utente_id, lower(trim(ospite_nome))
from public.richieste_collegamento
where stato = 'approvata' and coalesce(trim(ospite_nome), '') <> ''
on conflict do nothing;

insert into public.nomi_collegati (utente_id, nome, cognome)
select distinct utente_collegato, lower(trim(nome)), lower(trim(coalesce(cognome, '')))
from public.ospiti
where utente_collegato is not null and coalesce(trim(nome), '') <> ''
on conflict do nothing;

-- 3. Gruppo nelle richieste ------------------------------------------------
alter table public.richieste_collegamento add column if not exists gruppo uuid;

-- 4. Il collegamento: l'ospite resta, il nome si ricorda -------------------
create or replace function public.esegui_collegamento(p_ospite uuid, p_utente uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update ospiti set utente_collegato = p_utente, collegato_il = now() where id = p_ospite;

  insert into nomi_collegati (utente_id, nome, cognome)
  select p_utente, lower(trim(nome)), lower(trim(coalesce(cognome, '')))
  from ospiti where id = p_ospite and coalesce(trim(nome), '') <> ''
  on conflict do nothing;

  -- La stessa persona non può stare due volte nella stessa partita.
  delete from partecipazioni p
  where p.ospite_id = p_ospite
    and exists (select 1 from partecipazioni x
                where x.partita_id = p.partita_id and x.utente_id = p_utente);
  update partecipazioni set utente_id = p_utente, ospite_id = null
  where ospite_id = p_ospite;

  -- Né due volte allo stesso tavolo.
  delete from iscrizioni_tavolo i
  where i.ospite_id = p_ospite
    and exists (select 1 from iscrizioni_tavolo x
                where x.tavolo_id = i.tavolo_id and x.utente_id = p_utente);
  update iscrizioni_tavolo set utente_id = p_utente, ospite_id = null
  where ospite_id = p_ospite;

  update tavoli set dimostratore_id = p_utente, dimostratore_ospite_id = null
  where dimostratore_ospite_id = p_ospite;

  -- L'ospite NON si cancella più: resta come «questo nome è lui/lei»,
  -- così chi registra o importa partite lo ritrova invece di crearne un altro.
end;
$function$;

-- 5. «Sei tu?»: tutti gli ospiti, con la forza della somiglianza -----------
-- forza 4 = stessa email di un tavolo; 3 = nome intero uguale;
-- 2 = stessa prima parola; 1 = nome parziale (gess / gessica).
drop function if exists public.ospiti_simili();
create function public.ospiti_simili()
 returns table(id uuid, nome text, cognome text, partite int, ultima date,
               email_uguale boolean, richiesta text, creato_da text, forza int)
 language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select lower(trim(coalesce(nome, ''))) as n,
           lower(trim(coalesce(nickname, ''))) as k,
           lower(trim(coalesce(cognome, ''))) as c
    from profili where id = auth.uid()
  ),
  parole as (
    select distinct w
    from me, regexp_split_to_table(me.n || ' ' || me.k || ' ' || me.c, '\s+') as w
    where length(w) >= 3
  ),
  interi as (
    select v from me,
      unnest(array[me.n, me.k, trim(me.n || ' ' || me.c), trim(me.c || ' ' || me.n)]) as v
    where v <> ''
  ),
  valutati as (
    select o.id, o.nome, o.cognome, o.creato_da,
      case
        when email_combacia(o.id) then 4
        when lower(trim(o.nome)) in (select v from interi)
          or trim(lower(trim(o.nome)) || ' ' || lower(trim(coalesce(o.cognome, '')))) in (select v from interi) then 3
        when split_part(lower(trim(o.nome)), ' ', 1) in (select w from parole) then 2
        when length(split_part(lower(trim(o.nome)), ' ', 1)) >= 3 and exists (
          select 1 from parole
          where w like split_part(lower(trim(o.nome)), ' ', 1) || '%'
             or split_part(lower(trim(o.nome)), ' ', 1) like w || '%') then 1
        else 0
      end as forza
    from ospiti o
    where o.utente_collegato is null
  )
  select v.id, v.nome, v.cognome,
    (select count(*)::int from partecipazioni pa where pa.ospite_id = v.id),
    (select max(pt.giocata_il)::date
       from partecipazioni pa join partite pt on pt.id = pa.partita_id
      where pa.ospite_id = v.id),
    v.forza = 4,
    (select r.stato from richieste_collegamento r
      where r.ospite_id = v.id and r.utente_id = auth.uid()),
    (select coalesce(p.nickname, p.nome) from profili p where p.id = v.creato_da),
    v.forza
  from valutati v
  where v.forza > 0
  order by v.forza desc, 4 desc, 2
  limit 40;
$function$;

-- 6. Una richiesta per più schede ------------------------------------------
create or replace function public.sono_io_tutti(p_ospiti uuid[])
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_gruppo    uuid := gen_random_uuid();
  v_id        uuid;
  v_nome      text;
  v_coll      uuid;
  v_attese    int;
  v_collegati int := 0;
  v_chiesti   int := 0;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  if coalesce(array_length(p_ospiti, 1), 0) = 0 then raise exception 'Scegli almeno una scheda.'; end if;
  if array_length(p_ospiti, 1) > 40 then raise exception 'Troppe schede in una volta.'; end if;

  -- Un freno a chi prova a prendersi mezzo elenco: tre richieste (gruppi) in attesa.
  select count(distinct coalesce(gruppo, id)) into v_attese
  from richieste_collegamento where utente_id = auth.uid() and stato = 'attesa';

  foreach v_id in array p_ospiti loop
    select nome, utente_collegato into v_nome, v_coll from ospiti where id = v_id;
    if not found or v_coll is not null then continue; end if;

    if email_combacia(v_id) then
      update richieste_collegamento
      set stato = case when utente_id = auth.uid() then 'approvata' else 'rifiutata' end,
          decisa_il = now()
      where ospite_id = v_id and stato = 'attesa';
      perform esegui_collegamento(v_id, auth.uid());
      v_collegati := v_collegati + 1;
    else
      if v_chiesti = 0 and v_attese >= 3 then
        raise exception 'Hai già tre richieste in attesa: aspetta che vengano guardate.';
      end if;
      -- Una richiesta rifiutata non si riapre da sola.
      insert into richieste_collegamento (ospite_id, ospite_nome, utente_id, gruppo)
      values (v_id, v_nome, auth.uid(), v_gruppo)
      on conflict (ospite_id, utente_id) do nothing;
      if found then v_chiesti := v_chiesti + 1; end if;
    end if;
  end loop;

  return case when v_chiesti > 0 then 'richiesta'
              when v_collegati > 0 then 'collegato'
              else 'nulla' end;
end;
$function$;

-- 7. Le richieste da decidere, già raggruppate -----------------------------
create or replace function public.richieste_da_decidere()
 returns table(gruppo uuid, utente_id uuid, chi text, ospite_id uuid, ospite_nome text,
               ospite_cognome text, creato_da text, partite int, creata_il timestamptz)
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(r.gruppo, r.id), r.utente_id,
    (select coalesce(p.nickname, p.nome) from profili p where p.id = r.utente_id),
    o.id, o.nome, o.cognome,
    (select coalesce(p.nickname, p.nome) from profili p where p.id = o.creato_da),
    (select count(*)::int from partecipazioni pa where pa.ospite_id = o.id),
    r.creata_il
  from richieste_collegamento r
  join ospiti o on o.id = r.ospite_id
  where r.stato = 'attesa'
    and r.utente_id <> auth.uid()
    and (public.e_organizzatore() or o.creato_da = auth.uid())
  order by r.creata_il;
$function$;

-- 8. Decidere una richiesta intera ----------------------------------------
-- Vale anche per le richieste vecchie (senza gruppo): il gruppo è il loro id.
-- Chi organizza decide tutto (anche le proprie); chi ha creato un ospite
-- decide le righe dei suoi ospiti.
create or replace function public.decidi_gruppo(p_gruppo uuid, p_approva boolean)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare
  r   record;
  v_n int := 0;
begin
  for r in
    select rc.id, rc.ospite_id, rc.utente_id
    from richieste_collegamento rc
    join ospiti o on o.id = rc.ospite_id
    where coalesce(rc.gruppo, rc.id) = p_gruppo
      and rc.stato = 'attesa'
      and (public.e_organizzatore() or (o.creato_da = auth.uid() and rc.utente_id <> auth.uid()))
  loop
    if p_approva then
      update richieste_collegamento
      set stato = case when id = r.id then 'approvata' else 'rifiutata' end,
          decisa_da = auth.uid(), decisa_il = now()
      where ospite_id = r.ospite_id and stato = 'attesa';
      perform esegui_collegamento(r.ospite_id, r.utente_id);
    else
      update richieste_collegamento
      set stato = 'rifiutata', decisa_da = auth.uid(), decisa_il = now()
      where id = r.id;
    end if;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Richiesta non trovata, già decisa o non spetta a te.';
  end if;
  return v_n;
end;
$function$;
