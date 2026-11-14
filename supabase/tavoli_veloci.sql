-- Primo Giocatore - lettura dei tavoli più veloce
-- v1.0.0 - 202611141830
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni: crea solo quello che manca. Non tocca dati né regole di
-- accesso: aggiunge solo indici.
--
-- La pagina Tavoli chiede «i tavoli da oggi in poi» con dentro gioco,
-- luogo e iscritti. Senza indici il database guarda tutti i tavoli per
-- trovare quelli da oggi, e per ogni tavolo tutte le iscrizioni (con le
-- regole di accesso controllate riga per riga). Una risposta è arrivata
-- dopo 22,6 secondi (14/11/2026).

-- 1. I tavoli in ordine di data (pagina Tavoli e Home).
create index if not exists tavoli_inizio            on public.tavoli (inizio);
-- 2. Gli iscritti di un tavolo.
create index if not exists iscrizioni_tavolo_tavolo on public.iscrizioni_tavolo (tavolo_id);
-- 3. Il luogo di un tavolo.
create index if not exists tavoli_luogo             on public.tavoli (luogo_id);

-- Statistiche aggiornate, così il database sceglie gli indici giusti.
analyze public.tavoli;
analyze public.iscrizioni_tavolo;
analyze public.luoghi;

-- Come è andata: devono comparire tutti e tre gli indici.
select indexname from pg_indexes
where indexname in ('tavoli_inizio', 'iscrizioni_tavolo_tavolo', 'tavoli_luogo');
