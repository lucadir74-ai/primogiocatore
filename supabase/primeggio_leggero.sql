-- Primo Giocatore - Primeggio e Classifiche più leggeri
-- v1.0.0 - 202611131200
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
-- I giocatori di ogni partita escono nell'ordine in cui sono salvati nel
-- database (ctid), lo stesso in cui li dava la lettura di prima: in casi
-- rari (la stessa persona due volte nella stessa partita) il calcolo ne
-- tiene conto, e così l'IPG resta quello di prima.
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
pt as materialized (
  select x.partita_id, x.ctid as riga, x.utente_id, x.ospite_id, x.punteggio_totale, x.posizione,
         x.vincitore, o.utente_collegato
  from partecipazioni x
  join pg on pg.id = x.partita_id
  left join ospiti o on o.id = x.ospite_id
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
create or replace function public.classifiche_giochi(
  p_cerca text default null,
  p_limite int default 30
) returns table (gioco_id text, nome text, immagine text, classificati int, giocatori int, primo text)
language sql stable security invoker set search_path to 'public'
as $function$
  select i.gioco_id::text,
         max(i.gioco_nome)::text,
         max(i.gioco_immagine)::text,
         (count(*) filter (where i.posizione is not null))::int,
         count(*)::int,
         ((array_agg(i.nome order by i.posizione) filter (where i.posizione is not null))[1])::text
  from ipg i
  where i.gioco_id::text <> ''
  group by i.gioco_id
  having coalesce(p_cerca, '') = ''
      or position(lower(p_cerca) in lower(coalesce(max(i.gioco_nome), 'Gioco'))) > 0
  order by 4 desc, 5 desc, coalesce(max(i.gioco_nome), 'Gioco')
  limit greatest(1, least(coalesce(p_limite, 30), 200))
$function$;

revoke all on function public.classifiche_giochi(text, int) from public, anon;
grant execute on function public.classifiche_giochi(text, int) to authenticated, service_role;

-- 3. -------------------------------------------------------------------
create index if not exists ipg_per_gioco on public.ipg (gioco_id);
create index if not exists ipg_per_profilo on public.ipg (profilo_id);
