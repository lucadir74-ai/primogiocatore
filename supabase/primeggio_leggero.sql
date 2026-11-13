-- Primo Giocatore - Primeggio e Classifiche più leggeri
-- v1.1.0 - 202611132200 (giocatori nell'ordine dell'indice, come PostgREST, non per ctid; classifiche_giochi con i pari merito al confine)
--
-- Il traffico verso Supabase (egress) era quasi tutto qui:
-- - il ricalcolo notturno del Primeggio leggeva ogni notte tutte le
--   partite in formato pieno (circa 40 MB a notte);
-- - Statistiche e Classifiche scaricavano a ogni apertura l'intera
--   tabella ipg, che cresce con iscritti × giochi.
-- Questo script aggiunge:
-- 1. primeggio_partite: le partite per il ricalcolo in forma compatta
--    (ogni id una volta sola per blocco, niente nomi di campo ripetuti,
--    niente nome e immagine del gioco in ogni partita). Solo il server
--    può chiamarla;
-- 2. classifiche_giochi: il riepilogo per gioco della pagina Classifiche
--    (nome, quanti in classifica, chi è primo), già calcolato qui;
-- 3. gli indici per leggere la tabella ipg per gioco e per persona.
-- I giocatori di ogni partita escono nello stesso ordine in cui li dava
-- la lettura di prima (PostgREST, dall'indice su partita_id): il calcolo
-- ne dipende (la stessa persona due volte nella stessa partita, e gli
-- arrotondamenti di openskill), e così l'IPG resta identico.
-- La v1.0.0 li ordinava per ctid: dopo certe modifiche di una riga
-- l'ordine era diverso. Rilanciare questo script la sostituisce.
-- Lanciare PRIMA di caricare i file. Si può rilanciare senza danni.
-- Se i file arrivano prima dello script, l'app e il server continuano
-- a funzionare come prima.

-- 1. -------------------------------------------------------------------
create or replace function public.primeggio_partite(
  p_dopo uuid default null,     -- le partite dopo questo id (escluso): il blocco successivo
  p_limite int default 2000
) returns jsonb
language sql stable set search_path to 'public'
as $function$
with pg as materialized (
  select p.id, p.giocata_il, p.registrata_da, p.tipo_punteggio, p.gioco_id
  from partite p
  where p_dopo is null or p.id > p_dopo
  order by p.id
  limit greatest(1, least(coalesce(p_limite, 2000), 5000))
),
-- I giocatori di ogni partita si leggono come li leggeva PostgREST: una
-- partita alla volta, dall'indice su partita_id, e «riga» ne fissa
-- l'ordine di arrivo. Non è l'ordine per ctid: quando una riga viene
-- modificata senza spostarsi di pagina (aggiornamento «HOT») il ctid
-- cambia, ma l'indice continua a darla nella posizione di prima.
pt as materialized (
  select pg.id as partita_id, x.riga, x.utente_id, x.ospite_id, x.punteggio_totale, x.posizione,
         x.vincitore, x.utente_collegato
  from pg
  cross join lateral (
    select y.utente_id, y.ospite_id, y.punteggio_totale, y.posizione, y.vincitore,
           (select o.utente_collegato from ospiti o where o.id = y.ospite_id) as utente_collegato,
           row_number() over () as riga
    from partecipazioni y
    where y.partita_id = pg.id
  ) x
),
chiavi as materialized (
  select k, (row_number() over (order by k)) - 1 as n
  from (
    select registrata_da::text as k from pg
    union select gioco_id::text from pg
    union select utente_id::text from pt
    union select ospite_id::text from pt
    union select utente_collegato::text from pt
  ) s
  where k is not null
),
parti as (
  select pt.partita_id,
         jsonb_agg(jsonb_build_array(cu.n, co.n, pt.punteggio_totale, pt.posizione, pt.vincitore, cc.n)
                   order by pt.riga) as j
  from pt
  left join chiavi cu on cu.k = pt.utente_id::text
  left join chiavi co on co.k = pt.ospite_id::text
  left join chiavi cc on cc.k = pt.utente_collegato::text
  group by pt.partita_id
)
select jsonb_build_object(
  'quante', (select count(*) from pg),
  'ultimo', (select id from pg order by id desc limit 1),
  'chiavi', coalesce((select jsonb_agg(k order by n) from chiavi), '[]'::jsonb),
  'righe', coalesce((
    select jsonb_agg(jsonb_build_array(pg.giocata_il, cr.n, pg.tipo_punteggio, cg.n, coalesce(parti.j, '[]'::jsonb))
                     order by pg.id)
    from pg
    left join chiavi cr on cr.k = pg.registrata_da::text
    left join chiavi cg on cg.k = pg.gioco_id::text
    left join parti on parti.partita_id = pg.id
  ), '[]'::jsonb)
)
$function$;

-- Solo il server (chiave di servizio): legge tutte le partite.
revoke all on function public.primeggio_partite(uuid, int) from public;
revoke all on function public.primeggio_partite(uuid, int) from anon, authenticated;
grant execute on function public.primeggio_partite(uuid, int) to service_role;

-- 2. -------------------------------------------------------------------
-- Con i permessi di chi guarda: valgono le regole della tabella ipg.
-- L'ordine è quello della pagina: più classificati, più giocatori, poi
-- il nome. Il nome però lo ordina l'app (alfabeto italiano del browser):
-- il database ha regole sue (per esempio ignora spazi e apostrofi), e al
-- confine del limite potrebbe scegliere giochi diversi. Per questo qui
-- si restituiscono i primi p_limite giochi PIÙ quelli a pari merito con
-- l'ultimo (stessi classificati e giocatori): l'app li ordina e taglia.
-- A parità anche di nome vale l'ordine che dava la pagina di prima (la
-- prima riga del gioco nella tabella letta per profilo_id e gioco_id).
create or replace function public.classifiche_giochi(
  p_cerca text default null,
  p_limite int default 30
) returns table (gioco_id text, nome text, immagine text, classificati int, giocatori int, primo text)
language sql stable security invoker set search_path to 'public'
as $function$
  with g as (
    select i.gioco_id::text as gioco_id,
           max(i.gioco_nome)::text as nome,
           max(i.gioco_immagine)::text as immagine,
           (count(*) filter (where i.posizione is not null))::int as classificati,
           count(*)::int as giocatori,
           ((array_agg(i.nome order by i.posizione) filter (where i.posizione is not null))[1])::text as primo,
           min(i.profilo_id::text collate "C") as primo_profilo
    from ipg i
    where i.gioco_id::text <> ''
    group by i.gioco_id
    having coalesce(p_cerca, '') = ''
        or position(lower(p_cerca) in lower(coalesce(max(i.gioco_nome), 'Gioco'))) > 0
  ),
  soglia as (
    select g.classificati, g.giocatori from g
    order by g.classificati desc, g.giocatori desc
    offset greatest(1, least(coalesce(p_limite, 30), 200)) - 1
    limit 1
  )
  select g.gioco_id, g.nome, g.immagine, g.classificati, g.giocatori, g.primo
  from g
  where not exists (select 1 from soglia)
     or (g.classificati, g.giocatori) >= (select s.classificati, s.giocatori from soglia s)
  order by g.classificati desc, g.giocatori desc, g.primo_profilo, g.gioco_id
$function$;

revoke all on function public.classifiche_giochi(text, int) from public, anon;
grant execute on function public.classifiche_giochi(text, int) to authenticated, service_role;

-- 3. -------------------------------------------------------------------
create index if not exists ipg_per_gioco on public.ipg (gioco_id);
create index if not exists ipg_per_profilo on public.ipg (profilo_id);
