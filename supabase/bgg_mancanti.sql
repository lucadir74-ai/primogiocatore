-- Primo Giocatore - partite vecchie verso BGG, a richiesta
-- v1.0.0 - 202611110900
-- Si lancia una volta nell'editor SQL di Supabase, PRIMA di usare
-- «Cosa manca su BGG» in Dati e import. Si può rilanciare senza danni.
-- Non cancella e non invia niente da solo.
--
-- L'invio a BGG manda solo le partite registrate dopo il collegamento,
-- mai quelle arrivate da BG Stats o dallo storico di BGA. Con il
-- confronto («Cosa manca su BGG») chi gioca può scegliere di mandare
-- anche quelle che su BGG non ci sono: la scelta si segna qui, in
-- bgg_richiesta_il, e l'invio le prende come le altre.

alter table public.partite add column if not exists bgg_richiesta_il timestamptz;
create index if not exists partite_bgg_richiesta on public.partite (registrata_da)
  where bgg_richiesta_il is not null and bgg_inviata_il is null;

-- Come prima (invio_bgg.sql), più le partite chieste a mano.
create or replace function public.bgg_da_inviare(p_utente uuid, p_limite int default 30)
 returns setof uuid language sql stable security definer set search_path to 'public'
as $function$
  select p.id
  from partite p
  join bgg_sessioni s on s.utente_id = p.registrata_da
  where p.registrata_da = p_utente
    and p.bgg_inviata_il is null
    and p.bgg_errore is null
    and (p.bgg_play_id is not null
         or (p.bgg_richiesta_il is not null and coalesce(p.chiave_esterna, '') not like 'bgg:%')
         or (p.creata_il > s.collegata_il
             and (p.chiave_esterna is null
                  or (s.invia_bga and p.chiave_esterna like 'bga:%'
                      and p.creata_il > coalesce(s.invia_bga_dal, 'infinity'::timestamptz)))))
  order by p.giocata_il
  limit p_limite
$function$;
revoke execute on function public.bgg_da_inviare(uuid, int) from public, anon, authenticated;
