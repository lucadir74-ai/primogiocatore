-- Primo Giocatore - indici per le letture con molte partite
-- v1.0.0 - 202610251140
-- Con gli storici molto lunghi (decine di migliaia di partite) alcune
-- letture superavano il tempo massimo del database ("statement
-- timeout"). Questi indici fanno trovare subito le partite di una
-- persona, in ordine di data o di id, e i giocatori di ogni partita.
-- Si può rilanciare senza danni: crea solo quello che manca.
create index if not exists partite_registrata_id      on public.partite (registrata_da, id);
create index if not exists partite_registrata_giocata on public.partite (registrata_da, giocata_il);
create index if not exists partecipazioni_partita     on public.partecipazioni (partita_id);
create index if not exists partecipazioni_utente      on public.partecipazioni (utente_id);
create index if not exists partecipazioni_ospite      on public.partecipazioni (ospite_id);
create index if not exists ospiti_creato_da           on public.ospiti (creato_da);
create index if not exists ospiti_utente_collegato    on public.ospiti (utente_collegato);
-- Statistiche aggiornate, così il database sceglie gli indici giusti.
analyze public.partite;
analyze public.partecipazioni;
analyze public.ospiti;
