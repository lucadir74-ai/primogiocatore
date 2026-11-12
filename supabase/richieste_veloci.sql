-- Primo Giocatore - richieste più veloci
-- v1.0.0 - 202611121800
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non tocca partite, ospiti né account: cambia solo il modo
-- in cui si leggono le richieste, non cosa si legge.
--
-- Le due letture degli avvisi in cima all'app (richieste «sono io» da
-- decidere e richieste di tavolo) erano fra le più lente:
-- 1. «Chi sono io» e «organizzo?» si chiedono una volta sola, non riga
--    per riga.
-- 2. Indici sulle richieste in attesa e su quelle fatte da una persona.
-- 3. Le richieste di tavolo si cercano per due strade separate (le mie,
--    quelle per me), ognuna col suo indice, invece di un «oppure» che
--    obbliga a guardarle tutte.
-- Va lanciato DOPO riconoscimento_fase1.sql e chi_ce_lha.sql. Se uno dei
-- due si rilancia in futuro, rilanciare poi anche questo.

-- 1. Indici -----------------------------------------------------------------
create index if not exists richieste_collegamento_attesa
  on public.richieste_collegamento (creata_il) where stato = 'attesa';
create index if not exists richieste_tavolo_richiedente
  on public.richieste_tavolo (richiedente, creata_il);

-- 2. Le richieste «sono io» da decidere ------------------------------------
create or replace function public.richieste_da_decidere()
 returns table(gruppo uuid, utente_id uuid, chi text, ospite_id uuid, ospite_nome text,
               ospite_cognome text, creato_da text, partite int, creata_il timestamptz)
 language sql stable security definer set search_path to 'public'
as $function$
  with s as materialized (select auth.uid() as io, public.e_organizzatore() as org)
  select coalesce(r.gruppo, r.id), r.utente_id,
    (select coalesce(p.nickname, p.nome) from profili p where p.id = r.utente_id),
    o.id, o.nome, o.cognome,
    (select coalesce(p.nickname, p.nome) from profili p where p.id = o.creato_da),
    (select count(*)::int from partecipazioni pa where pa.ospite_id = o.id),
    r.creata_il
  from s
  join richieste_collegamento r on r.stato = 'attesa' and r.utente_id <> s.io
  join ospiti o on o.id = r.ospite_id
  where s.io is not null
    and (s.org or o.creato_da = s.io)
  order by r.creata_il;
$function$;

-- 3. Le richieste di tavolo che mi riguardano ------------------------------
-- per_me = mi chiedono un tavolo (ancora aperte e senza mia risposta);
-- mie = le ho fatte io (anche organizzate, ultimi 30 giorni).
create or replace function public.richieste_tavolo_mie()
 returns table(id uuid, per_me boolean, gioco_id public.giochi.id%type, gioco text, immagine_url text,
               min_giocatori int, max_giocatori int, chi text, messaggio text, stato text,
               tavolo_id uuid, organizzata_da text, destinatari int, rifiuti int, creata_il timestamptz)
 language sql stable security definer set search_path to 'public'
as $function$
  with s as materialized (select auth.uid() as io),
  scelte as (
    select r.id from s
    join richieste_tavolo r on r.richiedente = s.io
    where r.creata_il > now() - interval '30 days'
    union
    select d.richiesta_id from s
    join richieste_tavolo_destinatari d on d.utente_id = s.io and d.risposta is null
    join richieste_tavolo r on r.id = d.richiesta_id and r.stato = 'aperta'
  ),
  conti as (
    select d.richiesta_id,
           count(*)::int as tutti,
           (count(*) filter (where d.risposta = 'no'))::int as no
    from richieste_tavolo_destinatari d
    where d.richiesta_id in (select x.id from scelte x)
    group by d.richiesta_id
  )
  select r.id, r.richiedente <> s.io, r.gioco_id, g.nome, g.immagine_url,
         g.min_giocatori::int, g.max_giocatori::int,
         (select coalesce(nullif(trim(p.nickname), ''), p.nome) from profili p where p.id = r.richiedente),
         r.messaggio, r.stato, r.tavolo_id,
         (select coalesce(nullif(trim(p.nickname), ''), p.nome) from profili p where p.id = r.organizzata_da),
         coalesce(c.tutti, 0), coalesce(c.no, 0),
         r.creata_il
  from s
  join scelte x on true
  join richieste_tavolo r on r.id = x.id
  join giochi g on g.id = r.gioco_id
  left join conti c on c.richiesta_id = r.id
  where s.io is not null
  order by r.creata_il desc;
$function$;

-- Statistiche aggiornate, così il database sceglie gli indici giusti.
analyze public.richieste_collegamento;
analyze public.richieste_tavolo;
analyze public.richieste_tavolo_destinatari;

-- Come è andata: devono comparire tutti e due gli indici.
select indexname from pg_indexes
where indexname in ('richieste_collegamento_attesa', 'richieste_tavolo_richiedente');
