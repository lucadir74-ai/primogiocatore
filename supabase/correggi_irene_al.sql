-- Primo Giocatore - correzione: «Irene Al» non è Syliael (Irene Ragni)
-- 19/11/2026
--
-- Fa tre cose, tutte insieme o nessuna:
-- 1. Hanabi del 12/12/2020 (BGA, tavolo 130739918): il posto di Syliael
--    torna all'ospite «Irene Al», con lo stesso punteggio e posizione.
-- 2. L'ospite «Irene Al» non è più collegato a Syliael (e il nome
--    «irene al» non viene più riconosciuto come lei).
-- 3. La coppia «Irene Al» / Syliael è segnata «non è lei»: non viene più
--    proposta.
-- Se qualcosa non torna (ospite o partita non trovati, o più di uno) si
-- ferma con un messaggio e non cambia niente.

do $$
declare
  v_syl     uuid;
  v_luca    uuid;
  v_osp     uuid;
  v_nome    text;
  v_cognome text;
  v_partita uuid;
  v_n       int;
begin
  select id into strict v_syl  from profili where nickname = 'Syliael';
  select id into strict v_luca from profili where nickname = 'lucadir';

  select o.id, o.nome, o.cognome into strict v_osp, v_nome, v_cognome
  from ospiti o
  where trim(o.nome || ' ' || coalesce(o.cognome, '')) = 'Irene Al'
    and o.utente_collegato = v_syl;

  select pt.id into strict v_partita
  from partite pt
  where pt.bga_tavolo = 130739918
    and pt.registrata_da = v_luca;

  -- 1. Il posto nella partita torna all'ospite.
  update partecipazioni set utente_id = null, ospite_id = v_osp
  where partita_id = v_partita and utente_id = v_syl;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Mi aspettavo un posto di Syliael in Hanabi, ne ho trovati %. Non cambio niente.', v_n; end if;

  -- 2. L'ospite torna libero.
  update ospiti set utente_collegato = null, collegato_il = null where id = v_osp;
  delete from nomi_collegati
  where utente_id = v_syl
    and nome = lower(trim(v_nome))
    and cognome = lower(trim(coalesce(v_cognome, '')));

  -- 3. «Non è lei», per sempre.
  insert into richieste_collegamento (ospite_id, ospite_nome, utente_id, stato, decisa_da, decisa_il)
  values (v_osp, v_nome, v_syl, 'rifiutata', v_luca, now())
  on conflict (ospite_id, utente_id) do update
    set stato = 'rifiutata', decisa_da = v_luca, decisa_il = now();

  raise notice 'Fatto: Hanabi torna a «Irene Al», che non è più collegata a Syliael.';
end $$;

-- Controllo: chi c'è adesso in quella partita di Hanabi.
select coalesce(pr.nickname, trim(os.nome || ' ' || coalesce(os.cognome, ''))) as giocatore,
       case when x.ospite_id is not null then 'ospite' else 'iscritto' end as tipo,
       x.punteggio_totale, x.posizione
from partecipazioni x
join partite pt on pt.id = x.partita_id
left join profili pr on pr.id = x.utente_id
left join ospiti os on os.id = x.ospite_id
where pt.bga_tavolo = 130739918
order by x.posizione nulls last;
