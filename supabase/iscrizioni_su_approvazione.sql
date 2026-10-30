-- Primo Giocatore - iscrizioni su approvazione
-- v1.0.0 - 202610301900
-- Si può rilanciare senza danni.
--
-- Un tavolo può avere le iscrizioni su approvazione: chi si iscrive da
-- sé resta «in attesa» finché chi gestisce il tavolo non lo accetta.
-- Lo garantisce il database, non solo l'app. Chi gestisce il tavolo
-- (chi l'ha pubblicato, chi organizza, chi lo spiega) iscrive e accetta
-- come prima. I contatti di chi è in attesa restano nascosti a chi
-- pubblica senza essere organizzatore, come già oggi.

alter table public.tavoli add column if not exists su_approvazione boolean not null default false;

create or replace function public.proteggi_iscrizione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_max   int;
  v_conf  int;
  v_appr  boolean;
begin
  -- Chi gestisce o spiega QUESTO tavolo decide tutto.
  if public.gestisco_tavolo(new.tavolo_id) or public.spiego_tavolo(new.tavolo_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.utente_id := auth.uid();      -- nessuno iscrive un altro
    new.ospite_id := null;
    new.ruolo := 'giocatore';
    -- Un'iscrizione alla volta per tavolo: due arrivi nello stesso
    -- istante non sforano i posti.
    select posti_max, su_approvazione into v_max, v_appr
    from tavoli where id = new.tavolo_id for update;
    select count(*) into v_conf from iscrizioni_tavolo
      where tavolo_id = new.tavolo_id and stato = 'confermato';
    new.stato := case
      when v_appr then 'attesa'                                   -- aspetta di essere accettato
      when v_max is not null and v_conf >= v_max then 'attesa'    -- lista d'attesa
      else 'confermato'
    end;
  else
    new.tavolo_id := old.tavolo_id;
    new.ruolo := old.ruolo;
    -- Da sé ci si può solo annullare.
    if new.stato is distinct from old.stato and new.stato <> 'annullato' then
      new.stato := old.stato;
    end if;
  end if;
  return new;
end $function$;
