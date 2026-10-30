-- Primo Giocatore - riconoscimento delle persone, fase 2 (registrazione)
-- v1.0.0 - 202610292345
-- Va eseguito DOPO riconoscimento_fase1.sql. Si può rilanciare senza danni.
--
-- Chi si iscrive scrive nome, cognome e città: arrivano con l'account
-- (dati dell'iscrizione) e qui finiscono nel profilo appena viene creato.
-- Il soprannome resta come prima: lo copia l'app al primo accesso, così
-- un soprannome già usato non blocca la creazione dell'account.

alter table public.profili add column if not exists cognome text;

create or replace function public.dati_registrazione()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  m jsonb;
begin
  select raw_user_meta_data into m from auth.users where id = new.id;
  if m is not null then
    new.cognome := coalesce(nullif(trim(new.cognome), ''), nullif(trim(m->>'cognome'), ''));
    new.citta   := coalesce(nullif(trim(new.citta), ''),   nullif(trim(m->>'citta'), ''));
  end if;
  return new;
end;
$function$;

drop trigger if exists profili_dati_registrazione on public.profili;
create trigger profili_dati_registrazione
  before insert on public.profili
  for each row execute function public.dati_registrazione();
