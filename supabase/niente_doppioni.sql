-- Primo Giocatore - niente doppioni: tavoli e ospiti
-- v1.0.0 - 202611101800
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non cancella partite, ospiti né account.
--
-- 1. Un tavolo, una partita sola. Due organizzatori (o due tocchi) che
--    premevano «Registra partita» nello stesso momento creavano due
--    partite per lo stesso tavolo. Ora il database ne ammette una.
--    Se oggi ci sono già tavoli con due partite la regola non si attiva:
--    lo script le elenca in fondo, si sistemano dall'app e si rilancia.
-- 2. Un ospite che nasce con nome e cognome scritti tutti nel nome
--    («Mario Rossi», come arriva dagli import) viene riconosciuto come
--    l'iscritto Mario Rossi, esattamente come quando nome e cognome sono
--    separati. Solo se l'iscritto con quel nome è uno solo; altrimenti
--    resta libero e decide «Sei tu?», come prima.
-- 3. In fondo, due controlli di sola lettura: i tavoli con più partite e
--    le partite del tutto uguali nello stesso archivio (stessa persona,
--    stesso gioco, stesso giorno, stessi punteggi), da guardare a mano.

-- 1. Un tavolo, una partita -------------------------------------------------
do $$
begin
  if exists (select 1 from public.partite where tavolo_id is not null
             group by tavolo_id having count(*) > 1) then
    raise notice 'Ci sono tavoli con più di una partita: la regola non è stata attivata. Vedi l''elenco in fondo, togli le copie dall''app e rilancia lo script.';
  else
    create unique index if not exists idx_partite_un_tavolo
      on public.partite (tavolo_id) where tavolo_id is not null;
  end if;
end $$;

-- 2. Ospite riconosciuto anche col nome scritto intero ------------------------
-- Sostituisce utente_per_nome di riconoscimento_fase3.sql: le prime due
-- strade sono quelle di prima, la terza è nuova.
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
    union
    select p.id from profili p
    where coalesce(trim(p_cognome), '') = ''
      and coalesce(trim(p.cognome), '') <> ''
      and lower(trim(p.nome) || ' ' || trim(p.cognome))
          = lower(regexp_replace(trim(p_nome), '\s+', ' ', 'g'))
  )
  select case when count(*) = 1 and (array_agg(utente_id))[1] is distinct from p_escludi
              then (array_agg(utente_id))[1] end
  from c;
$function$;

-- 3a. Tavoli con più di una partita (deve restare vuoto) ----------------------
select tavolo_id, count(*) as partite, array_agg(id order by giocata_il) as id_partite
from public.partite
where tavolo_id is not null
group by tavolo_id
having count(*) > 1;

-- 3b. Partite del tutto uguali nello stesso archivio --------------------------
-- Solo da guardare: più partite uguali nello stesso giorno sono normali
-- per i giochi veloci. Quelle sospette si tolgono dallo Storico.
select pr.nickname, pr.nome, g.nome as gioco, left(p.impronta, 200) as impronta,
       count(*) as copie, array_agg(coalesce(p.chiave_esterna, 'a mano') order by p.giocata_il) as origini
from public.partite p
join public.giochi g on g.id = p.gioco_id
left join public.profili pr on pr.id = p.registrata_da
where p.impronta is not null and p.impronta not like '%|np'
group by pr.nickname, pr.nome, p.registrata_da, g.nome, p.impronta
having count(*) > 1
order by count(*) desc, g.nome
limit 200;
