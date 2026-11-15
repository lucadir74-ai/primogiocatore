-- Primo Giocatore - archivio: gli ospiti arrivano con il cognome
-- v1.0.0 - 202611152300
-- Si lancia una volta nell'editor SQL di Supabase. Si può rilanciare
-- senza danni. Non tocca partite, ospiti né account.
--
-- Un ospite inserito dalla partita ha nome e cognome in due campi. La
-- lettura veloce dell'archivio (archivio_partite) portava solo il nome:
-- in Storico, Statistiche e Giocatori «Mario Rossi» diventava «Mario».
-- Qui la funzione che c'è già nel database viene ritoccata in un punto
-- solo, aggiungendo il cognome accanto al nome dell'ospite: tutto il
-- resto (regole di visibilità comprese) resta com'è, qualunque versione
-- sia installata. Senza questo script l'app continua a mostrare solo il
-- nome, come prima.
-- Dopo averlo lanciato: Profilo → Dati e import → «Ricarica tutto
-- l'archivio» (oppure si aspetta la rilettura settimanale).

do $$
declare
  prima text;
  dopo text;
begin
  select pg_get_functiondef('public.archivio_partite(uuid, uuid, uuid, int, timestamptz)'::regprocedure)
    into prima;
  if position($q$'cognome', o.cognome$q$ in prima) > 0 then
    raise notice 'Il cognome c''è già: niente da fare.';
    return;
  end if;
  dopo := replace(prima,
    $q$jsonb_build_object('nome', o.nome, 'utente_collegato', o.utente_collegato)$q$,
    $q$jsonb_build_object('nome', o.nome, 'cognome', o.cognome, 'utente_collegato', o.utente_collegato)$q$);
  if dopo = prima then
    raise exception 'archivio_partite non ha la forma attesa: non è stato cambiato nulla.';
  end if;
  execute dopo;
  raise notice 'Fatto: l''archivio porta anche il cognome degli ospiti.';
end $$;

-- Come è andata: deve rispondere «sì».
select case when position($q$'cognome', o.cognome$q$ in
         pg_get_functiondef('public.archivio_partite(uuid, uuid, uuid, int, timestamptz)'::regprocedure)) > 0
       then 'sì' else 'no' end as cognome_nell_archivio;
