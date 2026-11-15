-- Primo Giocatore - voci del segnapunti di Trickerion
-- v1.0.0 - 202611160000
-- Le voci del conteggio finale dal regolamento (pag. 18), più i Punti
-- Fama fatti durante la partita. Trova il gioco per numero BGG (163068)
-- o per nome. Si può rilanciare senza danni: riscrive le stesse voci.

update public.giochi
   set categorie_punteggio = '[
     {"chiave": "s-partita",       "etichetta": "Durante la partita", "ordine": 1, "tipo": "sezione"},
     {"chiave": "v-fama-partita",  "etichetta": "Punti Fama in partita", "ordine": 2},
     {"chiave": "s-finale",        "etichetta": "Conteggio finale", "ordine": 3, "tipo": "sezione"},
     {"chiave": "v-frammenti",     "etichetta": "Frammenti del Trickerion", "ordine": 4},
     {"chiave": "v-monete",        "etichetta": "Monete risparmiate", "ordine": 5},
     {"chiave": "v-apprendisti",   "etichetta": "Apprendisti", "ordine": 6},
     {"chiave": "v-specialisti",   "etichetta": "Specialisti", "ordine": 7}
   ]'::jsonb
 where bgg_id::text = '163068'
    or nome ilike 'trickerion%';

-- Controllo: deve uscire una riga con 7 voci.
select id, nome, bgg_id, jsonb_array_length(categorie_punteggio) as voci
  from public.giochi
 where bgg_id::text = '163068'
    or nome ilike 'trickerion%';
