-- Primo Giocatore - collegamenti ospite → account annullabili
-- v1.0.0 - 202611191900
-- Si può rilanciare senza danni. Non cambia i dati che ci sono già.
--
-- Prima, collegare un ospite a un account spostava partite, tavoli e
-- disponibilità senza ricordare quali: uno sbaglio («Irene Al» finita su
-- Irene Ragni) si correggeva solo a mano. Da qui in poi:
-- 1. ogni collegamento si segna in «collegamenti_fatti» con tutto quello
--    che ha spostato (e le righe tolte perché doppie);
-- 2. anche le partite che arrivano DOPO con quell'ospite si aggiungono
--    al registro;
-- 3. annulla_collegamento(id) rimette tutto all'ospite, lo stacca
--    dall'account e segna la coppia come «non è lui»;
-- 4. elenco_collegamenti() per la sezione «Collegamenti fatti».
-- I collegamenti fatti prima di questo script non si possono annullare
-- (non si sa cosa avevano spostato).

-- 1. Il registro ------------------------------------------------------------
create table if not exists public.collegamenti_fatti (
  id                  uuid primary key default gen_random_uuid(),
  ospite_id           uuid not null references public.ospiti(id) on delete cascade,
  utente_id           uuid not null references public.profili(id) on delete cascade,
  fatta_da            uuid,                       -- null = automatico
  quando              timestamptz not null default now(),
  partecipazioni      uuid[] not null default '{}',
  partecipazioni_tolte jsonb not null default '[]',
  iscrizioni          uuid[] not null default '{}',
  iscrizioni_tolte    jsonb not null default '[]',
  disponibilita       uuid[] not null default '{}',
  disponibilita_tolte jsonb not null default '[]',
  tavoli              uuid[] not null default '{}',
  nome_aggiunto       boolean not null default false,
  annullato_il        timestamptz,
  annullato_da        uuid
);
create index if not exists collegamenti_fatti_ospite on public.collegamenti_fatti (ospite_id);
create index if not exists collegamenti_fatti_utente on public.collegamenti_fatti (utente_id);
alter table public.collegamenti_fatti enable row level security;
-- Si legge e si scrive solo dalle funzioni qui sotto.

-- 2. Il collegamento, che ora si segna tutto -------------------------------
-- Fa le stesse cose di prima, nello stesso ordine.
create or replace function public.esegui_collegamento(p_ospite uuid, p_utente uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_disp_tolte jsonb;
  v_disp       uuid[];
  v_tav        uuid[];
  v_part_tolte jsonb;
  v_part       uuid[];
  v_iscr_tolte jsonb;
  v_iscr       uuid[];
  v_nome       int;
begin
  -- Disponibilità e tavoli li sposta il trigger sugli ospiti: si guardano prima.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]') into v_disp_tolte
  from disponibilita d
  where d.ospite_id = p_ospite
    and exists (select 1 from disponibilita x where x.serata_id = d.serata_id and x.profilo_id = p_utente);
  select coalesce(array_agg(d.id), '{}') into v_disp
  from disponibilita d
  where d.ospite_id = p_ospite
    and not exists (select 1 from disponibilita x where x.serata_id = d.serata_id and x.profilo_id = p_utente);
  select coalesce(array_agg(id), '{}') into v_tav from tavoli where dimostratore_ospite_id = p_ospite;

  update ospiti set utente_collegato = p_utente, collegato_il = now() where id = p_ospite;

  insert into nomi_collegati (utente_id, nome, cognome)
  select p_utente, lower(trim(nome)), lower(trim(coalesce(cognome, '')))
  from ospiti where id = p_ospite and coalesce(trim(nome), '') <> ''
  on conflict do nothing;
  get diagnostics v_nome = row_count;

  -- La stessa persona non può stare due volte nella stessa partita.
  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into v_part_tolte
  from partecipazioni p
  where p.ospite_id = p_ospite
    and exists (select 1 from partecipazioni x
                where x.partita_id = p.partita_id and x.utente_id = p_utente);
  delete from partecipazioni p
  where p.ospite_id = p_ospite
    and exists (select 1 from partecipazioni x
                where x.partita_id = p.partita_id and x.utente_id = p_utente);
  select coalesce(array_agg(id), '{}') into v_part from partecipazioni where ospite_id = p_ospite;
  update partecipazioni set utente_id = p_utente, ospite_id = null
  where ospite_id = p_ospite;

  -- Né due volte allo stesso tavolo.
  select coalesce(jsonb_agg(to_jsonb(i)), '[]') into v_iscr_tolte
  from iscrizioni_tavolo i
  where i.ospite_id = p_ospite
    and exists (select 1 from iscrizioni_tavolo x
                where x.tavolo_id = i.tavolo_id and x.utente_id = p_utente);
  delete from iscrizioni_tavolo i
  where i.ospite_id = p_ospite
    and exists (select 1 from iscrizioni_tavolo x
                where x.tavolo_id = i.tavolo_id and x.utente_id = p_utente);
  select coalesce(array_agg(id), '{}') into v_iscr from iscrizioni_tavolo where ospite_id = p_ospite;
  update iscrizioni_tavolo set utente_id = p_utente, ospite_id = null
  where ospite_id = p_ospite;

  update tavoli set dimostratore_id = p_utente, dimostratore_ospite_id = null
  where dimostratore_ospite_id = p_ospite;

  insert into collegamenti_fatti (ospite_id, utente_id, fatta_da,
    partecipazioni, partecipazioni_tolte, iscrizioni, iscrizioni_tolte,
    disponibilita, disponibilita_tolte, tavoli, nome_aggiunto)
  values (p_ospite, p_utente, auth.uid(),
    v_part, v_part_tolte, v_iscr, v_iscr_tolte,
    v_disp, v_disp_tolte, v_tav, v_nome > 0);

  -- L'ospite NON si cancella: resta come «questo nome è lui/lei».
end;
$function$;

-- 3. Partite che arrivano dopo con un ospite già collegato -----------------
-- Come prima passano all'account; in più si segnano nel registro, così
-- annullando tornano anche loro all'ospite.
create or replace function public.partecipazione_a_utente()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v uuid;
begin
  if new.ospite_id is not null then
    select utente_collegato into v from ospiti where id = new.ospite_id;
    if v is not null and not exists (
      select 1 from partecipazioni x
      where x.partita_id = new.partita_id and x.utente_id = v and x.id is distinct from new.id
    ) then
      if new.id is not null then
        update collegamenti_fatti
        set partecipazioni = array_append(partecipazioni, new.id)
        where id = (select c.id from collegamenti_fatti c
                    where c.ospite_id = new.ospite_id and c.utente_id = v and c.annullato_il is null
                    order by c.quando desc limit 1);
      end if;
      new.utente_id := v;
      new.ospite_id := null;
    end if;
  end if;
  return new;
end;
$function$;

-- 4. Annullare ----------------------------------------------------------------
create or replace function public.annulla_collegamento(p_id uuid)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare
  c   collegamenti_fatti%rowtype;
  o   ospiti%rowtype;
  v_n int := 0;
  v_k int;
begin
  if auth.uid() is null then raise exception 'Serve un account.'; end if;
  select * into c from collegamenti_fatti where id = p_id for update;
  if not found then raise exception 'Collegamento non trovato.'; end if;
  if c.annullato_il is not null then raise exception 'Questo collegamento è già stato annullato.'; end if;
  select * into o from ospiti where id = c.ospite_id;
  if not (public.e_organizzatore() or c.fatta_da = auth.uid() or o.creato_da = auth.uid()) then
    raise exception 'Lo annulla chi l''ha fatto, chi ha inserito l''ospite, o chi organizza.';
  end if;
  if o.utente_collegato is distinct from c.utente_id then
    raise exception 'L''ospite non è più collegato a quell''account: va sistemato a mano.';
  end if;

  -- Prima si stacca l'ospite: altrimenti le partite tornerebbero subito all'account.
  update ospiti set utente_collegato = null, collegato_il = null where id = c.ospite_id;

  -- Partite.
  update partecipazioni set ospite_id = c.ospite_id, utente_id = null
  where id = any(c.partecipazioni) and utente_id = c.utente_id;
  get diagnostics v_n = row_count;
  insert into partecipazioni
  select * from jsonb_populate_recordset(null::partecipazioni, c.partecipazioni_tolte)
  on conflict do nothing;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;

  -- Tavoli, iscrizioni e disponibilità: se qualcosa nel frattempo è
  -- cambiato e non si può rimettere, si lascia com'è (le partite contano di più).
  begin
    update iscrizioni_tavolo set ospite_id = c.ospite_id, utente_id = null
    where id = any(c.iscrizioni) and utente_id = c.utente_id;
    insert into iscrizioni_tavolo
    select * from jsonb_populate_recordset(null::iscrizioni_tavolo, c.iscrizioni_tolte)
    on conflict do nothing;
  exception when others then null;
  end;
  begin
    update disponibilita set ospite_id = c.ospite_id, profilo_id = null
    where id = any(c.disponibilita) and profilo_id = c.utente_id;
    insert into disponibilita
    select * from jsonb_populate_recordset(null::disponibilita, c.disponibilita_tolte)
    on conflict do nothing;
  exception when others then null;
  end;
  begin
    update tavoli set dimostratore_ospite_id = c.ospite_id, dimostratore_id = null
    where id = any(c.tavoli) and dimostratore_id = c.utente_id;
  exception when others then null;
  end;

  -- Il nome non viene più riconosciuto come lui/lei.
  if c.nome_aggiunto then
    delete from nomi_collegati
    where utente_id = c.utente_id
      and nome = lower(trim(o.nome))
      and cognome = lower(trim(coalesce(o.cognome, '')));
  end if;

  -- «Non è lui»: la coppia non viene più proposta.
  insert into richieste_collegamento (ospite_id, ospite_nome, utente_id, stato, decisa_da, decisa_il)
  values (c.ospite_id, o.nome, c.utente_id, 'rifiutata', auth.uid(), now())
  on conflict (ospite_id, utente_id) do update
    set stato = 'rifiutata', decisa_da = auth.uid(), decisa_il = now();

  update collegamenti_fatti set annullato_il = now(), annullato_da = auth.uid() where id = p_id;
  return v_n;
end;
$function$;

-- 5. Elenco per la sezione «Collegamenti fatti» -----------------------------
-- Chi organizza li vede tutti; gli altri quelli fatti da loro o sui loro ospiti.
create or replace function public.elenco_collegamenti()
 returns table(id uuid, ospite text, account text, account_nome text, quando timestamptz,
               fatta_da text, partite int)
 language sql stable security definer set search_path to 'public'
as $f$
  select c.id,
         trim(o.nome || ' ' || coalesce(o.cognome, '')),
         coalesce(p.nickname, p.nome, ''),
         trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')),
         c.quando,
         coalesce((select coalesce(f.nickname, f.nome) from profili f where f.id = c.fatta_da), 'automatico'),
         cardinality(c.partecipazioni) + jsonb_array_length(c.partecipazioni_tolte)
  from collegamenti_fatti c
  join ospiti o on o.id = c.ospite_id
  join profili p on p.id = c.utente_id
  where c.annullato_il is null
    and (public.e_organizzatore() or c.fatta_da = auth.uid() or o.creato_da = auth.uid())
  order by c.quando desc
  limit 200
$f$;

revoke all on function public.annulla_collegamento(uuid) from public, anon;
revoke all on function public.elenco_collegamenti()      from public, anon;
grant execute on function public.annulla_collegamento(uuid) to authenticated;
grant execute on function public.elenco_collegamenti()      to authenticated;
revoke all on function public.esegui_collegamento(uuid, uuid) from public, anon, authenticated;

-- Controllo: deve dire «pronto».
select case when to_regclass('public.collegamenti_fatti') is not null
             and to_regprocedure('public.annulla_collegamento(uuid)') is not null
             and to_regprocedure('public.elenco_collegamenti()') is not null
            then 'pronto' else 'manca qualcosa' end as esito;
