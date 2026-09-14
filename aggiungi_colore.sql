-- Colonna del colore giocatore, richiesta dalla v1.0.0 dell'app.
alter table profili add column if not exists colore text
  check (colore in ('rosso','blu','giallo','verde','viola'));
