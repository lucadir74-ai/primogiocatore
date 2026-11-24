-- Primo Giocatore - quanto ci mette il calcolo dei non soci alla Tana
-- v1.0.0 - 202611241700
-- Sola lettura, non cambia niente. Da lanciare DOPO non_soci_ai_tavoli.sql
-- (v1.2.0). Lanciarlo due volte: conta la seconda (la prima scalda il
-- collegamento). Guardare l'ultima riga, «Execution Time»: dall'app il
-- limite è 8000 ms, va bene se resta sotto i 1000.

explain (analyze, buffers) select * from public.calcola_non_soci_ai_tavoli(120);
