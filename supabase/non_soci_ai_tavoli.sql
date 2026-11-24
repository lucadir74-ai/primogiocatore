-- Primo Giocatore - giocatori non soci ai tavoli
-- v1.2.0 - 202611241700 (calcolo più veloce: dall'app andava oltre gli 8 secondi)
-- Si può rilanciare senza danni.
--
-- Chi ha giocato come ospite (nome e cognome, senza account) a una
-- partita della Tana e non risulta nell'elenco soci viene segnalato agli
-- organizzatori, in Profilo → Soci e nel riquadro «Da guardare».
-- - Partite della Tana: quelle nate da un tavolo (partite.tavolo_id) e
--   quelle inserite a mano con luogo la sede (luoghi.tipo = 'sede').
--   Le partite a casa o importate da altri luoghi non contano.
-- - Fuori dagli eventi: agli eventi i non soci sono normali.
-- - Il confronto con l'elenco soci ignora maiuscole, accenti, spazi e
--   apostrofi, e prova anche cognome prima del nome.
-- - Gli ospiti già collegati a un account non contano: l'account è già
--   passato dal controllo soci.
-- - «Visto» (per tutti gli organizzatori): la persona sparisce finché non
--   gioca un'altra partita a un tavolo.
-- - L'elenco lo leggono solo gli organizzatori (e_organizzatore()); chi
--   registra la partita non vede nulla. Consultarlo si segna nel registro
--   delle operazioni, come l'elenco soci (al massimo ogni 10 minuti).

-- 1. Nome per il confronto --------------------------------------------------------
create or replace function public.nome_confronto(p text)
 returns text language sql immutable as $f$
  select regexp_replace(
           translate(lower(coalesce(p, '')), 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z]', '', 'g')
$f$;

-- 2. Chi è stato visto -------------------------------------------------------------
create table if not exists public.non_soci_visti (
  ospite_id  uuid primary key references public.ospiti(id) on delete cascade,
  visto_da   uuid references public.profili(id) on delete set null,
  visto_il   timestamptz not null default now()
);
alter table public.non_soci_visti enable row level security;
revoke all on public.non_soci_visti from anon, authenticated;   -- solo dalle funzioni qui sotto

-- 3. Il calcolo (interno) ------------------------------------------------------
create or replace function public.calcola_non_soci_ai_tavoli(p_giorni int)
 returns table (ospite_id uuid, nome text, cognome text, partite int, nuove int,
                ultima timestamptz, ultimo_gioco text, registrata_da text, visto_il timestamptz)
 language plpgsql stable security definer set search_path to 'public' set jit to off as $f$
#variable_conflict use_column
begin
  -- v1.2: ogni nome si normalizza una volta sola (prima: per ogni coppia
  -- partita × socio, oltre gli 8 secondi concessi all'app), e il confronto
  -- con i soci è un'uguaglianza semplice. L'elenco soci contiene già
  -- entrambi gli ordini (nome+cognome e cognome+nome).
  return query
  with partite_tana as materialized (
    select p.id, coalesce(p.giocata_il, p.creata_il) as quando, p.creata_il, p.gioco_id, p.registrata_da
      from partite p
      left join luoghi l on l.id = p.luogo_id
     where p.evento_id is null
       and (p.tavolo_id is not null or l.tipo = 'sede')
       and coalesce(p.giocata_il, p.creata_il) > now() - make_interval(days => p_giorni)
  ),
  giocate as materialized (
    select pa.ospite_id, pt.id as partita_id, pt.quando, pt.creata_il, pt.gioco_id, pt.registrata_da
      from partite_tana pt
      join partecipazioni pa on pa.partita_id = pt.id and pa.ospite_id is not null
  ),
  ospiti_tana as materialized (
    select o.id, o.nome, o.cognome, nome_confronto(concat(o.nome, o.cognome)) as n
      from ospiti o
     where o.utente_collegato is null
       and o.id in (select g.ospite_id from giocate g)
  ),
  soci_nomi as materialized (
    select nome_confronto(concat(s.nome, s.cognome)) as n from soci s
    union
    select nome_confronto(concat(s.cognome, s.nome)) from soci s
  ),
  fuori as materialized (
    select o.* from ospiti_tana o
     where not exists (select 1 from soci_nomi s where s.n = o.n and s.n <> '')
  )
  select f.id, f.nome, f.cognome,
         count(distinct g.partita_id)::int,
         (count(distinct g.partita_id) filter (where v.visto_il is null or g.creata_il > v.visto_il))::int,
         max(g.quando),
         (array_agg(gi.nome order by g.quando desc))[1],
         (array_agg(coalesce(nullif(trim(pr.nickname), ''), pr.nome) order by g.quando desc))[1],
         v.visto_il
    from fuori f
    join giocate g on g.ospite_id = f.id
    left join giochi gi on gi.id = g.gioco_id
    left join profili pr on pr.id = g.registrata_da
    left join non_soci_visti v on v.ospite_id = f.id
   group by f.id, f.nome, f.cognome, v.visto_il;
end $f$;
revoke all on function public.calcola_non_soci_ai_tavoli(int) from public, anon, authenticated;

-- 4. Per l'app: elenco, conteggio, «visto» -----------------------------------
create or replace function public.non_soci_ai_tavoli(p_giorni int default 120)
 returns table (ospite_id uuid, nome text, cognome text, partite int, nuove int,
                ultima timestamptz, ultimo_gioco text, registrata_da text, visto_il timestamptz)
 language plpgsql security definer set search_path to 'public' as $f$
begin
  if not public.e_organizzatore() then
    raise exception 'I giocatori non soci li vedono solo gli organizzatori della Tana.';
  end if;
  if not exists (select 1 from registro_operazioni
                  where chi = auth.uid() and azione = 'non soci ai tavoli consultati'
                    and quando > now() - interval '10 minutes') then
    perform registra('non soci ai tavoli consultati', null);
  end if;
  return query
    select * from calcola_non_soci_ai_tavoli(least(greatest(coalesce(p_giorni, 120), 1), 730)) c
     order by (c.nuove > 0) desc, c.ultima desc;
end $f$;
revoke all on function public.non_soci_ai_tavoli(int) from public, anon;
grant execute on function public.non_soci_ai_tavoli(int) to authenticated;

-- Quante persone da guardare (per l'avviso): 0 per chi non organizza.
create or replace function public.conta_non_soci_ai_tavoli()
 returns int language sql stable security definer set search_path to 'public' as $f$
  select case when public.e_organizzatore()
              then (select count(*)::int from calcola_non_soci_ai_tavoli(120) where nuove > 0)
              else 0 end
$f$;
revoke all on function public.conta_non_soci_ai_tavoli() from public, anon;
grant execute on function public.conta_non_soci_ai_tavoli() to authenticated;

create or replace function public.non_socio_visto(p_ospite uuid)
 returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not public.e_organizzatore() then
    raise exception 'Solo gli organizzatori della Tana.';
  end if;
  insert into non_soci_visti (ospite_id, visto_da, visto_il) values (p_ospite, auth.uid(), now())
  on conflict (ospite_id) do update set visto_da = excluded.visto_da, visto_il = excluded.visto_il;
end $f$;
revoke all on function public.non_socio_visto(uuid) from public, anon;
grant execute on function public.non_socio_visto(uuid) to authenticated;

-- Controllo: devono essere tutti «sì». «non soci adesso» è solo un numero:
-- quante persone sarebbero segnalate oggi (ultimi 120 giorni).
select
  (case when to_regclass('public.non_soci_visti') is not null then 'sì' else 'no' end) as tabella,
  (case when exists (select 1 from pg_proc where proname = 'non_soci_ai_tavoli') then 'sì' else 'no' end) as elenco,
  (case when exists (select 1 from pg_proc where proname = 'conta_non_soci_ai_tavoli') then 'sì' else 'no' end) as conteggio,
  (case when public.nome_confronto('D''Àngelo  Maria') = 'dangelomaria' then 'sì' else 'no' end) as confronto_nomi,
  (case when exists (select 1 from public.luoghi where tipo = 'sede') then 'sì' else 'no' end) as sede_trovata,
  (select count(*) from public.calcola_non_soci_ai_tavoli(120)) as non_soci_adesso;
