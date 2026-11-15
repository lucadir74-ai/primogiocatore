-- Primo Giocatore - voci del segnapunti di Kanban EV
-- v1.0.0 - 202611160000
-- Le voci del punteggio finale dal regolamento (pag. 24), più i PP
-- fatti durante la partita. Trova il gioco per numero BGG (284378)
-- o per nome. Si può rilanciare senza danni: riscrive le stesse voci.

update public.giochi
   set categorie_punteggio = '[
     {"chiave": "s-partita",         "etichetta": "Durante la partita", "ordine": 1, "tipo": "sezione"},
     {"chiave": "v-pp-in-partita",   "etichetta": "PP in partita", "ordine": 2},
     {"chiave": "s-finale",          "etichetta": "Punteggio finale", "ordine": 3, "tipo": "sezione"},
     {"chiave": "v-obiettivi-finali","etichetta": "Obiettivi finali", "ordine": 4},
     {"chiave": "v-turni",           "etichetta": "Turni accumulati", "ordine": 5},
     {"chiave": "v-gettoni",         "etichetta": "Gettoni Discorso, Libri, Buoni Ricambi", "ordine": 6},
     {"chiave": "v-auto",            "etichetta": "Auto nei garage", "ordine": 7},
     {"chiave": "v-formazione",      "etichetta": "Tracciati di formazione", "ordine": 8},
     {"chiave": "v-progetti",        "etichetta": "Progetti testati", "ordine": 9}
   ]'::jsonb
 where bgg_id::text = '284378'
    or nome ilike 'kanban ev%';

-- Controllo: deve uscire una riga con 9 voci.
select id, nome, bgg_id, jsonb_array_length(categorie_punteggio) as voci
  from public.giochi
 where bgg_id::text = '284378'
    or nome ilike 'kanban ev%';
