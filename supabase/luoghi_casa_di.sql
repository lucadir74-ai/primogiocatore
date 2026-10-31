-- Primo Giocatore - la casa di chi?
-- v1.0.0 - 202611011100
-- Un luogo di tipo «casa» si chiama spesso solo «Casa»: chi gioca da te
-- lo vedeva con lo stesso nome della propria casa. Ora ogni luogo ha
-- anche il nome che vedono gli ALTRI (nome_per_altri):
-- - casa con nome generico («Casa», «casa mia», «a casa»…) → «Casa di <soprannome>»;
-- - casa con un nome che contiene già il proprietario → resta com'è;
-- - casa con un altro nome («Casetta al mare») → «Casetta al mare (casa di <soprannome>)»;
-- - sedi, locali, luoghi online: uguale al nome.
-- Il proprietario continua a vedere il suo nome. Si aggiorna da solo se
-- cambia il nome, il tipo o il soprannome del proprietario.
-- Serve archivio_locale.sql già lanciato. Si può rilanciare senza danni.

-- 1. La colonna e la regola --------------------------------------------
alter table public.luoghi add column if not exists nome_per_altri text;

create or replace function public.luogo_nome_per_altri(p_nome text, p_tipo text, p_creato_da uuid)
 returns text language plpgsql stable security definer set search_path to 'public'
as $f$
declare
  chi text;
  cognome text;
  base text := lower(trim(coalesce(p_nome, '')));
begin
  if p_tipo is distinct from 'casa' or p_creato_da is null then return p_nome; end if;
  select coalesce(nullif(trim(nickname), ''), nullif(trim(nome), '')), nullif(trim(profili.cognome), '')
    into chi, cognome from profili where id = p_creato_da;
  if chi is null then return p_nome; end if;
  -- Il nome dice già di chi è.
  if position(lower(chi) in base) > 0 or (cognome is not null and position(lower(cognome) in base) > 0) then
    return p_nome;
  end if;
  if base in ('', 'casa', 'casa mia', 'mia casa', 'a casa', 'a casa mia', 'da me', 'casa nostra',
              'home', 'casa propria', 'la mia casa') then
    return 'Casa di ' || chi;
  end if;
  return p_nome || ' (casa di ' || chi || ')';
end $f$;

create or replace function public.luoghi_calcola_nome_per_altri()
 returns trigger language plpgsql set search_path to 'public'
as $f$
begin
  new.nome_per_altri := public.luogo_nome_per_altri(new.nome, new.tipo, new.creato_da);
  return new;
end $f$;
drop trigger if exists luoghi_nome_per_altri on public.luoghi;
create trigger luoghi_nome_per_altri before insert or update of nome, tipo, creato_da on public.luoghi
  for each row execute function public.luoghi_calcola_nome_per_altri();

-- Cambia il soprannome (o nome, cognome) del proprietario: si ricalcolano le sue case.
create or replace function public.luoghi_ricalcola_da_profilo()
 returns trigger language plpgsql security definer set search_path to 'public'
as $f$
begin
  update luoghi set nome_per_altri = public.luogo_nome_per_altri(nome, tipo, creato_da)
   where creato_da = new.id and tipo = 'casa';
  return null;
end $f$;
drop trigger if exists profili_luoghi_nome on public.profili;
create trigger profili_luoghi_nome after update on public.profili
  for each row when (old.nickname is distinct from new.nickname or old.nome is distinct from new.nome
                     or old.cognome is distinct from new.cognome)
  execute function public.luoghi_ricalcola_da_profilo();

-- Le partite in quel luogo risultano cambiate (archivio sul telefono).
drop trigger if exists luoghi_archivio on public.luoghi;
create trigger luoghi_archivio after update on public.luoghi
  for each row when (old.nome is distinct from new.nome or old.tipo is distinct from new.tipo
                     or old.nome_per_altri is distinct from new.nome_per_altri)
  execute function public.archivio_tocca_da_luogo();

-- 2. I luoghi già esistenti -----------------------------------------------
update public.luoghi set nome_per_altri = public.luogo_nome_per_altri(nome, tipo, creato_da)
 where nome_per_altri is distinct from public.luogo_nome_per_altri(nome, tipo, creato_da);

-- 3. L'archivio porta anche proprietario e nome per gli altri ----------
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
    select p.* from partite p, io
    where p_dal is null and io.uid is not null and io.ammesso
      and p.id in (select id from visibili)
      and (p_da is null or p.id >= p_da)
      and (p_a is null or p.id < p_a)
      and (p_dopo is null or p.id > p_dopo)
    union all
    -- Solo le novità: si parte dalle partite cambiate (poche) e si
    -- controlla per ognuna se è visibile, con le stesse tre ragioni.
    select p.* from partite p, io
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
                           or o.id in (select id from in_comune)
                           or (o.dimostratore and io.vede_dimostratori)
                           or (o.creato_da is null and o.utente_collegato is null and o.nome = 'Ex giocatore')))
      ) order by pt.id)
      from partecipazioni pt
      where pt.partita_id = p.id
        and (p.registrata_da = io.uid or pt.utente_id = io.uid
             or exists (select 1 from partecipazioni x where x.partita_id = p.id and x.utente_id = io.uid))
    ), '[]'::jsonb)
  ) order by p.id), '[]'::jsonb)
from pagina p, io;
$function$;
revoke all on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) from public, anon;
grant execute on function public.archivio_partite(uuid, uuid, uuid, int, timestamptz) to authenticated;

