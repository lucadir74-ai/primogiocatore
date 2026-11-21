-- Primo Giocatore - privacy, fase 5: INDAGINE 2 (sola lettura, non cambia niente)
-- v1.0.0 - 202611212230
--
-- Il testo delle funzioni che usano nome e cognome per RICONOSCERE le
-- persone (ospiti → account). Esce una riga sola con tutto il testo:
-- fai clic sulla cella, copia e incolla a Claude.

select string_agg(pg_get_functiondef(p.oid), E'\n\n-- ----------------------------------------\n\n' order by p.proname) as definizioni
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('crea_profilo', 'riconoscimi', 'utente_per_nome', 'nome_comune',
                     'ospiti_da_riconoscere', 'ospiti_simili', 'ospite_non_e',
                     'ospiti_per_account_bga', 'richieste_da_decidere',
                     'luogo_nome_per_altri', 'decidi_non_socio');
