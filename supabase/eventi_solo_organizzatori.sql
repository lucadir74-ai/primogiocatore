-- Primo Giocatore - eventi: solo organizzatori e partecipanti
-- v1.0.0 - 202611222330
-- Si può rilanciare senza danni. Non cancella nessuno.
--
-- Nell'evento si nominano solo gli organizzatori: chi partecipa entra da
-- solo con il link o il QR, e chi spiega un gioco lo decide ogni tavolo
-- (iscrizioni_tavolo.ruolo = 'dimostratore', come sempre). Il ruolo
-- «dimostratore» dell'evento non era collegato a niente: chi l'aveva
-- resta nell'evento come partecipante.
--
-- L'app 4.44.0 funziona anche senza questo script: serve a tenere puliti
-- i dati e a non far rinascere il ruolo vecchio.

update public.evento_ruoli set ruolo = 'partecipante' where ruolo = 'dimostratore';

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.evento_ruoli'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%ruolo%' loop
    execute format('alter table public.evento_ruoli drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.evento_ruoli add constraint evento_ruoli_ruolo_valori
  check (ruolo in ('organizzatore', 'partecipante'));

-- Esito: 0 dimostratori rimasti, poi quanti organizzano e quanti partecipano.
select
  (select count(*) from public.evento_ruoli where ruolo not in ('organizzatore', 'partecipante')) as ruoli_vecchi_rimasti,
  (select count(*) from public.evento_ruoli where ruolo = 'organizzatore') as organizzatori,
  (select count(*) from public.evento_ruoli where ruolo = 'partecipante') as partecipanti,
  exists (select 1 from pg_constraint where conname = 'evento_ruoli_ruolo_valori') as controllo_attivo;
