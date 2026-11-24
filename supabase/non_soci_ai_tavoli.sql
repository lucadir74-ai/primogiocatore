-- Primo Giocatore - giocatori non soci ai tavoli
-- v1.0.0 - 202611241200
-- Si può rilanciare senza danni.
--
-- Quando un tavolo della Tana diventa una partita, chi ci ha giocato come
-- ospite (nome e cognome, senza account) e non risulta nell'elenco soci
-- viene segnalato agli organizzatori, in Profilo → Soci e nel riquadro
-- «Da guardare».
-- - Solo le partite nate da un tavolo (partite.tavolo_id) e fuori dagli
--   eventi: agli eventi i non soci sono normali.
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
 language sql stable security definer set search_path to 'public' as $f$
  with soci_nomi as (
    select nome_confronto(concat(s.nome, s.cognome)) as n1,
           nome_confronto(concat(s.cognome, s.nome)) as n2
      from soci s
  ),
  giocate as (
    select o.id as ospite_id, o.nome, o.cognome, p.id as partita_id,
           coalesce(p.giocata_il, p.creata_il) as quando, p.creata_il,
           g.nome as gioco, coalesce(nullif(trim(pr.nickname), ''), pr.nome) as chi
      from partite p
      join partecipazioni pa on pa.partita_id = p.id and pa.ospite_id is not null
      join ospiti o on o.id = pa.ospite_id and o.utente_collegato is null
      left join giochi g on g.id = p.gioco_id
      left join profili pr on pr.id = p.registrata_da
     where p.tavolo_id is not null
       and p.evento_id is null
       and coalesce(p.giocata_il, p.creata_il) > now() - make_interval(days => p_giorni)
  ),
  fuori as (
    select x.* from giocate x
     where not exists (
       select 1 from soci_nomi s
        where s.n1 <> ''
          and s.n1 in (nome_confronto(concat(x.nome, x.cognome)), nome_confronto(concat(x.cognome, x.nome))))
  )
  select f.ospite_id, f.nome, f.cognome,
         count(distinct f.partita_id)::int,
         count(distinct f.partita_id) filter (where v.visto_il is null or f.creata_il > v.visto_il)::int,
         max(f.quando),
         (array_agg(f.gioco order by f.quando desc))[1],
         (array_agg(f.chi order by f.quando desc))[1],
         v.visto_il
    from fuori f
    left join non_soci_visti v on v.ospite_id = f.ospite_id
   group by f.ospite_id, f.nome, f.cognome, v.visto_il
$f$;
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
  (select count(*) from public.calcola_non_soci_ai_tavoli(120)) as non_soci_adesso;
