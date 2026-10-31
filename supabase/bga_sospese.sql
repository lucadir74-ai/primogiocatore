-- Primo Giocatore - partite BGA in sospeso
-- v1.0.0 - 202610311500
-- Da quando rileggere BGA per ritrovare le partite che aspettano una
-- scelta (null: tutto lo storico). Lanciare PRIMA di caricare i file.
alter table public.bga_esiti add column if not exists sospese_dal timestamptz;
