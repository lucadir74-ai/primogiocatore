-- Primo Giocatore - «Chi ce l'ha?» e richieste di tavolo
-- v1.0.0 - 202610301200
-- Si può rilanciare senza danni.
--
-- 1. Le collezioni entrano nella ricerca «Chi ce l'ha?», salvo chi lo
--    toglie dal profilo (collezione_condivisa). Si vedono i nomi, divisi
--    per Tana, di tutte le Tane.
-- 2. Da un gioco si chiede un tavolo a chi ce l'ha: una richiesta, che
--    arriva a ognuno dei destinatari scelti.
-- 3. Chi risponde «Lo organizzo io» crea il tavolo con quel gioco: chi
--    aveva chiesto viene iscritto da solo e gli altri vedono che è fatta.
-- Tutto passa da funzioni del database: le tabelle non si scrivono a mano.

-- 1. Collezione visibile o no ----------------------------------------------
alter table public.profili add column if not exists collezione_condivisa boolean not null default true;

-- 2. Tabelle delle richieste (il tipo dell'id dei giochi si legge dal database)
do $$
declare
  t text := (select format_type(atttypid, atttypmod) from pg_attribute
             where attrelid = 'public.giochi'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.richieste_tavolo (
      id             uuid primary key default gen_random_uuid(),
      gioco_id       %s not null references public.giochi(id) on delete cascade,
      richiedente    uuid not null references public.profili(id) on delete cascade,
      messaggio      text,
      stato          text not null default 'aperta' check (stato in ('aperta', 'organizzata', 'chiusa')),
      tavolo_id      uuid references public.tavoli(id) on delete set null,
      organizzata_da uuid references public.profili(id) on delete set null,
      creata_il      timestamptz not null default now()
    )$f$, t);
end $$;

create table if not exists public.richieste_tavolo_destinatari (
  richiesta_id uuid not null references public.richieste_tavolo(id) on delete cascade,
  utente_id    uuid not null references public.profili(id) on delete cascade,
  risposta     text check (risposta in ('no')),
  primary key (richiesta_id, utente_id)
);
create index if not exists richieste_tavolo_dest_utente on public.richieste_tavolo_destinatari (utente_id);

alter table public.richieste_tavolo enable row level security;
alter table public.richieste_tavolo_destinatari enable row level security;
-- Nessuna regola: si legge e si scrive solo dalle funzioni qui sotto.

-- 3. Chi ce l'ha ------------------------------------------------------------
-- Cerca per nome fra i giochi che qualcuno possiede (e condivide).
drop function if exists public.chi_ha(text);
create function public.chi_ha(p_cerca text)
 returns table(gioco_id public.giochi.id%type, nome text, anno int, immagine_url text,
               utente_id uuid, chi text, tana_id int, tana text, sono_io boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select g.id, g.nome, g.anno::int, g.immagine_url,
         p.id, coalesce(nullif(trim(p.nickname), ''), trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, ''))),
         p.tana_id,
         (select to_jsonb(t) ->> 'nome' from tane t where t.id = p.tana_id),
         p.id = auth.uid()
  from collezioni c
  join giochi g on g.id = c.gioco_id
  join profili p on p.id = c.utente_id
  where auth.uid() is not null
    and (select ammesso())
    and length(trim(p_cerca)) >= 2
    and g.nome ilike '%' || trim(p_cerca) || '%'
    and (p.collezione_condivisa or p.id = auth.uid())
  order by g.nome, 8 nulls last, 6
  limit 400;
$function$;

-- 4. Chiedere un tavolo ------------------------------------------------------
create or replace function public.chiedi_tavolo(p_gioco public.giochi.id%type, p_destinatari uuid[], p_messaggio text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id     uuid;
  v_aperte int;
  v_n      int;
begin
  if auth.uid() is null or not (select ammesso()) then raise exception 'Serve un account.'; end if;

  select count(*) into v_aperte from richieste_tavolo
  where richiedente = auth.uid() and stato = 'aperta';
  if v_aperte >= 5 then
    raise exception 'Hai già cinque richieste aperte: aspetta che qualcuno risponda o chiudine una.';
  end if;

  -- Solo chi ha davvero il gioco e lo condivide, e non sé stessi.
  select count(*) into v_n
  from unnest(p_destinatari) d(u)
  join collezioni c on c.utente_id = d.u and c.gioco_id = p_gioco
  join profili p on p.id = d.u and p.collezione_condivisa
  where d.u <> auth.uid();
  if v_n = 0 then raise exception 'Nessuno a cui mandare la richiesta.'; end if;
  if v_n > 30 then raise exception 'Troppi destinatari: scegli una Tana.'; end if;

  insert into richieste_tavolo (gioco_id, richiedente, messaggio)
  values (p_gioco, auth.uid(), nullif(trim(p_messaggio), ''))
  returning id into v_id;

  insert into richieste_tavolo_destinatari (richiesta_id, utente_id)
  select distinct v_id, d.u
  from unnest(p_destinatari) d(u)
  join collezioni c on c.utente_id = d.u and c.gioco_id = p_gioco
  join profili p on p.id = d.u and p.collezione_condivisa
  where d.u <> auth.uid();

  return v_id;
end;
$function$;

-- 5. Le richieste che mi riguardano ----------------------------------------
-- per_me = mi chiedono un tavolo (ancora aperte e senza mia risposta);
-- mie = le ho fatte io (anche organizzate, ultime 30 giorni).
create or replace function public.richieste_tavolo_mie()
 returns table(id uuid, per_me boolean, gioco_id public.giochi.id%type, gioco text, immagine_url text,
               min_giocatori int, max_giocatori int, chi text, messaggio text, stato text,
               tavolo_id uuid, organizzata_da text, destinatari int, rifiuti int, creata_il timestamptz)
 language sql stable security definer set search_path to 'public'
as $function$
  select r.id, r.richiedente <> auth.uid(), r.gioco_id, g.nome, g.immagine_url,
         g.min_giocatori::int, g.max_giocatori::int,
         (select coalesce(nullif(trim(p.nickname), ''), p.nome) from profili p where p.id = r.richiedente),
         r.messaggio, r.stato, r.tavolo_id,
         (select coalesce(nullif(trim(p.nickname), ''), p.nome) from profili p where p.id = r.organizzata_da),
         (select count(*)::int from richieste_tavolo_destinatari d where d.richiesta_id = r.id),
         (select count(*)::int from richieste_tavolo_destinatari d where d.richiesta_id = r.id and d.risposta = 'no'),
         r.creata_il
  from richieste_tavolo r
  join giochi g on g.id = r.gioco_id
  where auth.uid() is not null
    and (
      (r.richiedente = auth.uid() and r.creata_il > now() - interval '30 days')
      or (r.stato = 'aperta' and exists (
            select 1 from richieste_tavolo_destinatari d
            where d.richiesta_id = r.id and d.utente_id = auth.uid() and d.risposta is null))
    )
  order by r.creata_il desc;
$function$;

-- 6. Rispondere «non posso» o chiudere la propria richiesta ---------------
create or replace function public.rispondi_richiesta_tavolo(p_richiesta uuid, p_risposta text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_risposta = 'chiudi' then
    update richieste_tavolo set stato = 'chiusa'
    where id = p_richiesta and richiedente = auth.uid() and stato = 'aperta';
  elsif p_risposta = 'no' then
    update richieste_tavolo_destinatari set risposta = 'no'
    where richiesta_id = p_richiesta and utente_id = auth.uid();
    -- Se hanno detto tutti di no, la richiesta si chiude.
    update richieste_tavolo r set stato = 'chiusa'
    where r.id = p_richiesta and r.stato = 'aperta'
      and not exists (select 1 from richieste_tavolo_destinatari d
                      where d.richiesta_id = r.id and d.risposta is null);
  else
    raise exception 'Risposta non valida.';
  end if;
end;
$function$;

-- 7. «Lo organizzo io»: dopo aver creato il tavolo --------------------------
create or replace function public.richiesta_tavolo_organizzata(p_richiesta uuid, p_tavolo uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  r richieste_tavolo;
  v_nome text;
begin
  select * into r from richieste_tavolo where id = p_richiesta;
  if not found or r.stato <> 'aperta' then
    raise exception 'La richiesta non è più aperta: forse l''ha già organizzata qualcun altro.';
  end if;
  if not exists (select 1 from richieste_tavolo_destinatari
                 where richiesta_id = p_richiesta and utente_id = auth.uid()) then
    raise exception 'Questa richiesta non era per te.';
  end if;
  if not exists (select 1 from tavoli where id = p_tavolo and host_id = auth.uid()
                 and gioco_id = r.gioco_id) then
    raise exception 'Il tavolo non è tuo o ha un altro gioco.';
  end if;

  update richieste_tavolo
  set stato = 'organizzata', tavolo_id = p_tavolo, organizzata_da = auth.uid()
  where id = p_richiesta;

  -- Chi aveva chiesto è già iscritto.
  select coalesce(nullif(trim(nickname), ''), nome) into v_nome from profili where id = r.richiedente;
  if not exists (select 1 from iscrizioni_tavolo
                 where tavolo_id = p_tavolo and utente_id = r.richiedente and stato <> 'annullato') then
    insert into iscrizioni_tavolo (tavolo_id, utente_id, nome_visibile, stato, ruolo)
    values (p_tavolo, r.richiedente, v_nome, 'confermato', 'giocatore');
  end if;
end;
$function$;
