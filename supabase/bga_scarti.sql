-- Primo Giocatore - perché le partite BGA importate sono meno di quelle del profilo BGA
-- Lanciare UNA volta nel SQL Editor di Supabase.
alter table public.bga_esiti add column if not exists storico_annullate int;
alter table public.bga_esiti add column if not exists storico_abbandonate int;
alter table public.bga_esiti add column if not exists storico_senza_gioco int;
alter table public.bga_esiti add column if not exists storico_incerte int;

-- Facoltativo: fa rileggere lo storico BGA al server (non crea doppioni:
-- i tavoli già importati si saltano) solo per riempire questi conteggi.
-- update public.bga_esiti set pagina_storico = 1, storico_annullate = 0, storico_abbandonate = 0,
--   storico_senza_gioco = 0, storico_incerte = 0 where utente_id = '<TUO_ID>';
