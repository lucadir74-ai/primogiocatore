-- Primo Giocatore - archivio: lettura veloce anche con gli ospiti uniti
-- v1.0.0 - 202611021700
-- Dopo l'unione degli ospiti doppi, per chi registra molte partite
-- (es. bubbaxis) Storico e Statistiche andavano in timeout: per ogni
-- giocatore di ogni partita si cercava l'ospite nell'elenco di tutti
-- quelli «in comune», e prima la ricerca era quasi sempre evitata perché
-- l'ospite l'aveva creato lui. Ora si guarda prima se chi legge gioca in
-- quella partita (una volta per partita): se sì, i compagni sono in
-- comune per definizione. Stessi dati e stesse regole di prima.
-- Sostituisce archivio_partite di luoghi_casa_di.sql. Si può rilanciare.

create or replace function public.archivio_partite(
  p_da uuid default null,          -- da questo id (incluso)
  p_a uuid default null,           -- fino a questo id (escluso)
  p_dopo uuid default null,        -- dopo questo id (escluso): la pagina successiva
  p_limite int default 1000,
  p_dal timestamptz default null   -- solo le partite cambiate dopo questo momento
) returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
with io as materialized (
  select auth.uid() as uid,
         public.ammesso() as ammesso,
         public.e_organizzatore() or public.e_dimostratore() as vede_dimostratori
),
visibili as materialized (
  select p.id from partite p, io where p.registrata_da = io.uid
  union
  select pt.partita_id from partecipazioni pt, io where pt.utente_id = io.uid
  union
  select p.id from partite p join membri_gruppo m on m.gruppo_id = p.gruppo_id, io
   where m.utente_id = io.uid
),
in_comune as materialized (
  select distinct id from public.ids_ospiti_in_comune() as id
),
pagina as (
  select * from (
    -- Tutto l'archivio: si parte dall'elenco delle partite visibili.
    select p.*,
           exists (select 1 from partecipazioni x
                   where x.partita_id = p.id and x.utente_id = io.uid) as io_gioca
    from partite p, io
    where p_dal is null and io.uid is not null and io.ammesso
      and p.id in (select id from visibili)
      and (p_da is null or p.id >= p_da)
      and (p_a is null or p.id < p_a)
      and (p_dopo is null or p.id > p_dopo)
    union all
    -- Solo le novità: si parte dalle partite cambiate (poche) e si
    -- controlla per ognuna se è visibile, con le stesse tre ragioni.
    select p.*,
           exists (select 1 from partecipazioni x
                   where x.partita_id = p.id and x.utente_id = io.uid) as io_gioca
    from partite p, io
    where p_dal is not null and io.uid is not null and io.ammesso
      and p.aggiornata_il > p_dal
      and (p_da is null or p.id >= p_da)
      and (p_a is null or p.id < p_a)
      and (p_dopo is null or p.id > p_dopo)
      and (p.registrata_da = io.uid
           or exists (select 1 from partecipazioni x where x.partita_id = p.id and x.utente_id = io.uid)
           or (p.gruppo_id is not null
               and exists (select 1 from membri_gruppo m where m.gruppo_id = p.gruppo_id and m.utente_id = io.uid)))
  ) u
  order by u.id
  limit greatest(1, least(coalesce(p_limite, 1000), 2000))
)
select coalesce(jsonb_agg(
  jsonb_build_object(
    'id', p.id, 'giocata_il', p.giocata_il, 'durata_minuti', p.durata_minuti, 'note', p.note,
    'tipo_punteggio', p.tipo_punteggio, 'esito_coop', p.esito_coop, 'registrata_da', p.registrata_da,
    'giochi', (select jsonb_build_object('id', g.id, 'nome', g.nome, 'immagine_url', g.immagine_url)
                 from giochi g where g.id = p.gioco_id),
    'luoghi', (select jsonb_build_object('id', l.id, 'nome', l.nome, 'tipo', l.tipo,
                                         'creato_da', l.creato_da, 'nome_per_altri', l.nome_per_altri)
                 from luoghi l where l.id = p.luogo_id),
    'partecipazioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'utente_id', pt.utente_id, 'ospite_id', pt.ospite_id,
        'punteggio_totale', pt.punteggio_totale, 'posizione', pt.posizione, 'vincitore', pt.vincitore,
        'spareggio', pt.spareggio, 'ruolo', pt.ruolo, 'ordine_turno', pt.ordine_turno,
        'profili', (select jsonb_build_object('nome', pr.nome, 'nickname', pr.nickname, 'colore', pr.colore)
                      from profili pr where pr.id = pt.utente_id),
        'ospiti', (select jsonb_build_object('nome', o.nome, 'utente_collegato', o.utente_collegato)
                     from ospiti o
                    where o.id = pt.ospite_id
                      and (o.creato_da = io.uid or o.utente_collegato = io.uid
                           -- Chi gioca in questa partita ha in comune tutti i
                           -- suoi compagni: la ricerca nell'elenco serve solo
                           -- per le partite registrate senza giocarle.
                           or p.io_gioca
                           or o.id in (select id from in_comune)
                           or (o.dimostratore and io.vede_dimostratori)
                           or (o.creato_da is null and o.utente_collegato is null and o.nome = 'Ex giocatore')))
      ) order by pt.id)
      from partecipazioni pt
      where pt.partita_id = p.id
        and (p.registrata_da = io.uid or pt.utente_id = io.uid or p.io_gioca)
    ), '[]'::jsonb)
  ) order by p.id), '[]'::jsonb)
from pagina p, io;
$function$;
revoke all on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) from public, anon;
grant execute on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) to authenticated;
