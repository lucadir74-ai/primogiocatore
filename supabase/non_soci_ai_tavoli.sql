-- Primo Giocatore - giocatori non soci ai tavoli
-- v1.9.0 - 202611250400 (la Tana si riconosce dal nome del luogo, non dal tipo «sede»)
-- Si può rilanciare senza danni.
--
-- Chi ha giocato senza account alla Tana di Roma e non risulta
-- nell'elenco soci viene segnalato agli organizzatori, in Profilo → Soci
-- e nel riquadro «Da guardare».
-- - Alla Tana: il nome del luogo è quello della Tana di Roma o riconducibile
--   («Tana dei Goblin Roma», «TdG Roma», «tana»…: e_luogo_tana(), script
--   luogo_tana_unico.sql), e il luogo non è una casa o online. Le Tane di
--   altre città no. Il tipo «sede» NON basta (v1.9): l'app lo dà a ogni
--   luogo condiviso (tavoli con indirizzo pubblico, eventi, scelta a mano),
--   per esempio «Il rifugio di Tessie».
-- - Si guardano: tutte le partite giocate lì (inserite a mano o da un
--   tavolo), le partite dei tavoli che si tengono lì, e gli iscritti
--   confermati a quei tavoli (anche di domani), così una persona si vede
--   già quando si iscrive. Tavoli annullati esclusi.
-- - Fuori dagli eventi: agli eventi i non soci sono normali.
-- - Una persona è il suo nome: ospite, iscritto e partita con lo stesso
--   nome e cognome contano come una sola. Un tavolo e la partita che ne
--   nasce contano una volta. Il confronto (anche con l'elenco
--   soci) ignora maiuscole, accenti, spazi e apostrofi, e prova anche
--   cognome prima del nome. Vale anche il nick del socio, da solo o con
--   il nome (v1.6: «Laura Hatake» o «Hatake» per la socia Laura, nick
--   Hatake); nick di almeno 3 lettere.
-- - v1.7: confronto anche per parole. Chi crea un ospite parte dal testo
--   cercato e completa a mano, così restano parole ripetute o in più
--   («Michele Marino marino», «Gaspa Giovanni gasparini»). L'ospite è un
--   socio se contiene tutte le parole di nome e cognome del socio, oppure
--   il nick e tutte le parole del nome. Ordine e ripetizioni non contano.
-- - v1.8: del socio bastano il primo nome e il cognome («Carlo Trifogli»
--   o «Carlo pennuto Trifogli» per Carlo Maria Trifogli, nick pennuto77).
--   Per chi resta, la colonna «forse» propone il socio probabile, senza
--   decidere: stesso primo nome e cognome quasi uguale (al massimo 2
--   lettere diverse: «Maieli» per «Maielli»), oppure solo il nome (anche
--   «Gabriella tana») e un solo socio con quel nome. Decide l'organizzatore.
-- - Chi ha un account non conta: l'account è già passato dal controllo soci.
-- - «Visto» (per tutti gli organizzatori): la persona sparisce finché non
--   gioca di nuovo alla Tana (altra partita o altro tavolo).
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

-- 1b. Le parole di un nome (v1.7): minuscole, senza accenti, senza doppioni.
create or replace function public.nome_parole(p text)
 returns text[] language sql immutable as $f$
  select coalesce(array_agg(distinct w), '{}')
    from regexp_split_to_table(
           translate(lower(coalesce(p, '')), 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z]+') w
   where w <> ''
$f$;

-- 1c. Le parole in ordine (v1.8): serve la prima, il nome.
create or replace function public.nome_lista(p text)
 returns text[] language sql immutable as $f$
  select coalesce(array_agg(w order by i), '{}')
    from regexp_split_to_table(
           btrim(regexp_replace(
             translate(lower(coalesce(p, '')), 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
             '[^a-z]+', ' ', 'g')), ' ') with ordinality as x(w, i)
   where w <> ''
$f$;

-- 1d. Quante lettere cambiano fra due parole (distanza di Levenshtein),
-- solo per i pochi nomi rimasti. Si ferma oltre p_max.
create or replace function public.lettere_diverse(a text, b text, p_max int default 2)
 returns int language plpgsql immutable as $f$
declare
  la int := length(a); lb int := length(b);
  prec int[]; cur int[]; i int; j int; minimo int;
begin
  if abs(la - lb) > p_max then return p_max + 1; end if;
  prec := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i];
    minimo := i;
    for j in 1..lb loop
      cur := cur || least(prec[j + 1] + 1, cur[j] + 1,
                          prec[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
      minimo := least(minimo, cur[j + 1]);
    end loop;
    if minimo > p_max then return p_max + 1; end if;
    prec := cur;
  end loop;
  return prec[lb + 1];
end $f$;

-- 2. Chi è stato visto -------------------------------------------------------------
create table if not exists public.non_soci_visti (
  ospite_id  uuid primary key references public.ospiti(id) on delete cascade,
  visto_da   uuid references public.profili(id) on delete set null,
  visto_il   timestamptz not null default now()
);
alter table public.non_soci_visti enable row level security;
revoke all on public.non_soci_visti from anon, authenticated;   -- solo dalle funzioni qui sotto

-- 2b. «Visto» per nome (v1.4): vale anche per chi non è un ospite, e
-- ricorda le volte già viste (id del tavolo, o della partita se a mano). La tabella di prima resta valida.
create table if not exists public.non_soci_visti_nomi (
  chiave     text primary key,
  tavoli     uuid[] not null default '{}',
  visto_da   uuid references public.profili(id) on delete set null,
  visto_il   timestamptz not null default now()
);
alter table public.non_soci_visti_nomi enable row level security;
revoke all on public.non_soci_visti_nomi from anon, authenticated;

-- 2c. Luoghi della Tana di Roma ----------------------------------------------
-- La regola per i nomi è e_luogo_tana() (luogo_tana_unico.sql, la stessa
-- dell'app): conta solo il nome, il tipo esclude case e online.
create or replace function public.luogo_e_tana(p_tipo text, p_nome text)
 returns boolean language sql stable set search_path to 'public' as $f$
  select coalesce(p_tipo, '') not in ('casa', 'online') and coalesce(public.e_luogo_tana(p_nome), false)
$f$;

-- 3. Il calcolo (interno) ------------------------------------------------------
-- Le colonne cambiano fra le versioni: le vecchie funzioni vanno tolte prima.
drop function if exists public.conta_non_soci_ai_tavoli();
drop function if exists public.non_soci_ai_tavoli(int);
drop function if exists public.calcola_non_soci_ai_tavoli(int);

create or replace function public.calcola_non_soci_ai_tavoli(p_giorni int)
 returns table (chiave text, nome text, cognome text, volte int, nuove int, da_registrare int,
                ultima timestamptz, ultimo_gioco text, registrata_da text, visto_il timestamptz, forse text)
 language plpgsql stable security definer set search_path to 'public' set jit to off as $f$
#variable_conflict use_column
begin
  -- Ogni nome si normalizza una volta sola e il confronto con i soci è
  -- un'uguaglianza semplice (v1.2: prima andava oltre gli 8 secondi).
  return query
  with luoghi_tana as materialized (
    select l.id from luoghi l where luogo_e_tana(l.tipo, l.nome)
  ),
  tavoli_tana as materialized (
    select t.id, t.inizio, t.gioco_id
      from tavoli t
     where t.luogo_id in (select id from luoghi_tana)
       and t.evento_id is null
       and coalesce(t.stato, '') <> 'annullato'
       and t.inizio > now() - make_interval(days => p_giorni)
  ),
  -- Partite alla Tana: luogo della partita, oppure nate da un tavolo là.
  -- «volta» = il tavolo, o la partita stessa se inserita a mano.
  partite_tana as materialized (
    select p.id, coalesce(p.tavolo_id, p.id) as volta, p.tavolo_id,
           coalesce(p.giocata_il, p.creata_il) as quando, p.creata_il, p.gioco_id, p.registrata_da
      from partite p
     where p.evento_id is null
       and coalesce(p.giocata_il, p.creata_il) > now() - make_interval(days => p_giorni)
       and (p.luogo_id in (select id from luoghi_tana)
            or p.tavolo_id in (select id from tavoli_tana))
  ),
  -- Chi c'era: ospiti delle partite…
  sedute as materialized (
    select pt.volta, o.nome, o.cognome, o.id as ospite_id, pt.quando, pt.creata_il,
           pt.gioco_id, pt.registrata_da, false as solo_iscritto
      from partite_tana pt
      join partecipazioni pa on pa.partita_id = pt.id and pa.ospite_id is not null
      join ospiti o on o.id = pa.ospite_id and o.utente_collegato is null
    union all
    -- …e iscritti confermati senza account ai tavoli (con o senza scheda ospite).
    select tt.id, coalesce(o.nome, i.nome_visibile), case when o.id is null then null else o.cognome end,
           o.id, tt.inizio, null::timestamptz, tt.gioco_id, null::uuid,
           not exists (select 1 from partite_tana pt where pt.tavolo_id = tt.id)
      from tavoli_tana tt
      join iscrizioni_tavolo i on i.tavolo_id = tt.id and i.stato = 'confermato' and i.utente_id is null
      left join ospiti o on o.id = i.ospite_id
     where o.id is null or o.utente_collegato is null
  ),
  con_nome as materialized (
    select s.*, nome_confronto(concat(s.nome, s.cognome)) as n from sedute s
  ),
  soci_nomi as materialized (
    select nome_confronto(concat(s.nome, s.cognome)) as n from soci s
    union
    select nome_confronto(concat(s.cognome, s.nome)) from soci s
    union
    select x.n from soci s
     cross join lateral (values
       (nome_confronto(s.nickname)),
       (nome_confronto(concat(s.nome, s.nickname))),
       (nome_confronto(concat(s.nickname, s.nome)))) x(n)
     where length(nome_confronto(s.nickname)) >= 3
  ),
  -- Prima il confronto esatto (veloce), poi per parole sui pochi rimasti.
  quasi as materialized (
    select c.*, nome_parole(concat_ws(' ', c.nome, c.cognome)) as parole from con_nome c
     where c.n <> ''
       and not exists (select 1 from soci_nomi s where s.n = c.n)
  ),
  soci_parole as materialized (
    select (nome_lista(s.nome))[1] as primo,
           nome_parole(s.cognome) as del_cognome,
           nome_confronto(s.cognome) as cognome_unito,
           nullif(nome_confronto(s.nickname), '') as nick,
           concat_ws(' ', s.nome, s.cognome) || coalesce(' (' || nullif(trim(s.nickname), '') || ')', '') as chi
      from soci s
     where trim(coalesce(s.nome, '')) <> '' and trim(coalesce(s.cognome, '')) <> ''
  ),
  -- Socio: primo nome + tutte le parole del cognome, oppure primo nome + nick.
  fuori as materialized (
    select q.* from quasi q
     where not exists (
       select 1 from soci_parole sp
        where sp.primo = any(q.parole)
          and (sp.del_cognome <@ q.parole
               or (length(sp.nick) >= 3 and sp.nick = any(q.parole))))
  ),
  -- «Visto»: per nome (v1.4) oppure, da prima, per scheda ospite.
  visti as materialized (
    select f.n, max(vo.visto_il) as visto_ospite
      from fuori f
      left join non_soci_visti vo on vo.ospite_id = f.ospite_id
     group by f.n
  ),
  segnate as materialized (
    select f.*,
           not (f.volta = any(coalesce(vn.tavoli, '{}'::uuid[]))
                or (v.visto_ospite is not null and coalesce(f.creata_il, f.quando) <= v.visto_ospite)) as nuova,
           greatest(vn.visto_il, v.visto_ospite) as visto
      from fuori f
      join visti v on v.n = f.n
      left join non_soci_visti_nomi vn on vn.chiave = f.n
  )
  , gruppi as materialized (
  select s.n,
         (array_agg(s.nome order by s.quando desc))[1] as g_nome,
         (array_agg(s.cognome order by s.quando desc))[1] as g_cognome,
         count(distinct s.volta)::int as g_volte,
         (count(distinct s.volta) filter (where s.nuova))::int as g_nuove,
         (count(distinct s.volta) filter (where s.solo_iscritto))::int as g_da_registrare,
         max(s.quando) as g_ultima,
         (array_agg(gi.nome order by s.quando desc) filter (where gi.nome is not null))[1] as g_gioco,
         (array_agg(coalesce(nullif(trim(pr.nickname), ''), pr.nome) order by s.quando desc)
            filter (where pr.id is not null))[1] as g_da,
         max(s.visto) as g_visto
    from segnate s
    left join giochi gi on gi.id = s.gioco_id
    left join profili pr on pr.id = s.registrata_da
   group by s.n
  ),
  -- «Forse è»: le parole dell'ospite in ordine; «tana» da sola non è un cognome.
  liste as materialized (
    select g.*, l.lista, l.lista[1] as primo,
           array(select w from unnest(l.lista[2:]) w where w <> 'tana') as resto
      from gruppi g
     cross join lateral (select nome_lista(concat_ws(' ', g.g_nome, g.g_cognome)) as lista) l
  )
  select li.n, li.g_nome, li.g_cognome, li.g_volte, li.g_nuove, li.g_da_registrare,
         li.g_ultima, li.g_gioco, li.g_da, li.g_visto,
         (select string_agg(x.chi, ' oppure ' order by x.chi)
            from (
              -- stesso primo nome, cognome quasi uguale
              select sp.chi from soci_parole sp
               where sp.primo = li.primo and cardinality(li.resto) > 0
                 and length(sp.cognome_unito) >= 4
                 and exists (select 1 from unnest(li.resto) w
                              where lettere_diverse(w, sp.cognome_unito) <= 2
                                 or lettere_diverse(array_to_string(li.resto, ''), sp.cognome_unito) <= 2)
              union
              -- solo il nome, e un solo socio con quel nome
              select min(sp.chi) from soci_parole sp
               where cardinality(li.resto) = 0 and sp.primo = li.primo
              having count(*) = 1
              limit 3
            ) x)
    from liste li;
end $f$;
revoke all on function public.calcola_non_soci_ai_tavoli(int) from public, anon, authenticated;

-- 4. Per l'app: elenco, conteggio, «visto» -----------------------------------
create or replace function public.non_soci_ai_tavoli(p_giorni int default 120)
 returns table (chiave text, nome text, cognome text, volte int, nuove int, da_registrare int,
                ultima timestamptz, ultimo_gioco text, registrata_da text, visto_il timestamptz, forse text)
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

-- «Visto» per nome: segna come viste tutte le volte (tavoli e partite) di quel nome
-- fino a ora (ultimi 2 anni). Quella per scheda ospite (v1.3) resta per
-- un'app non ancora aggiornata.
create or replace function public.non_socio_visto_nome(p_chiave text)
 returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  v_tavoli uuid[];
begin
  if not public.e_organizzatore() then
    raise exception 'Solo gli organizzatori della Tana.';
  end if;
  select coalesce(array_agg(distinct x.t), '{}') into v_tavoli
    from (
      select coalesce(pt.tavolo_id, pt.id) as t
        from partite pt
        join partecipazioni pa on pa.partita_id = pt.id
        join ospiti o on o.id = pa.ospite_id
       where nome_confronto(concat(o.nome, o.cognome)) = p_chiave
         and coalesce(pt.giocata_il, pt.creata_il) > now() - interval '730 days'
      union
      select i.tavolo_id
        from iscrizioni_tavolo i
        join tavoli t on t.id = i.tavolo_id
        left join ospiti o on o.id = i.ospite_id
       where i.utente_id is null and t.inizio > now() - interval '730 days'
         and nome_confronto(case when o.id is null then i.nome_visibile else concat(o.nome, o.cognome) end) = p_chiave
    ) x;
  insert into non_soci_visti_nomi (chiave, tavoli, visto_da, visto_il)
  values (p_chiave, v_tavoli, auth.uid(), now())
  on conflict (chiave) do update set tavoli = excluded.tavoli, visto_da = excluded.visto_da, visto_il = excluded.visto_il;
end $f$;
revoke all on function public.non_socio_visto_nome(text) from public, anon;
grant execute on function public.non_socio_visto_nome(text) to authenticated;

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
  (case when to_regclass('public.non_soci_visti_nomi') is not null then 'sì' else 'no' end) as tabella,
  (case when exists (select 1 from pg_proc where proname = 'non_soci_ai_tavoli') then 'sì' else 'no' end) as elenco,
  (case when exists (select 1 from pg_proc where proname = 'conta_non_soci_ai_tavoli') then 'sì' else 'no' end) as conteggio,
  (case when exists (select 1 from pg_proc where proname = 'non_socio_visto_nome') then 'sì' else 'no' end) as visto,
  (case when public.nome_confronto('D''Àngelo  Maria') = 'dangelomaria'
          and public.nome_parole('Michele Marino marino') @> public.nome_parole('marino MICHELE') then 'sì' else 'no' end) as confronto_nomi,
  (case when exists (select 1 from public.luoghi where tipo = 'sede') then 'sì' else 'no' end) as sede_trovata,
  (case when public.luogo_e_tana('sede', 'Tana dei Goblin Roma') and public.luogo_e_tana(null, 'TdG Roma')
          and not public.luogo_e_tana(null, 'Tana dei Goblin Milano') and not public.luogo_e_tana('casa', 'Tana')
          and not public.luogo_e_tana('sede', 'Il rifugio di Tessie') then 'sì' else 'no' end) as regola_tana,
  (select string_agg(nome, ', ' order by nome) from public.luoghi where public.luogo_e_tana(tipo, nome)) as luoghi_che_valgono_tana,
  (select count(*) from public.calcola_non_soci_ai_tavoli(120)) as non_soci_adesso;
