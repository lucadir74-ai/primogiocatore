// Primo Giocatore - l'archivio delle partite, uno solo per tutta l'app
// v1.0.0 - 202610211500
//
// Storico e Statistiche leggevano ognuno, a ogni apertura, tutte le
// partite (migliaia, con giocatori e punteggi). Ora le legge una volta
// questo modulo e le tiene in memoria:
// - aprendo una pagina si vede subito quello che c'era (memoria);
// - intanto si rilegge dal database dietro le quinte e la pagina si
//   aggiorna da sola quando arriva la versione nuova;
// - due pagine che chiedono insieme condividono la stessa lettura.
// Dopo una modifica (partita salvata, cancellata, import) basta
// chiedere di nuovo: la rilettura riporta tutto in pari.

import { supabase, tutteLeRighe } from './supabase'

const CAMPI = `
  id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop, registrata_da,
  giochi ( id, nome, immagine_url ),
  luoghi ( id, nome, tipo ),
  partecipazioni (
    id, utente_id, ospite_id, punteggio_totale, posizione, vincitore, spareggio, ruolo, ordine_turno,
    profili:utente_id ( nome, nickname, colore ),
    ospiti:ospite_id ( nome, utente_collegato )
  )
`

let stato = { utente: null, righe: null, lettura: null }
const ascoltatori = new Set()

// Le partite già in memoria (dalla più vecchia), o null.
export function archivioInMemoria(utente) {
  return stato.utente === utente ? stato.righe : null
}

// Rilegge dal database. Se una lettura è già in corso, si aggancia a quella.
export function leggiArchivio(utente) {
  if (stato.utente !== utente) stato = { utente, righe: null, lettura: null }
  if (stato.lettura) return stato.lettura
  const lettura = tutteLeRighe(() => supabase.from('partite').select(CAMPI).order('giocata_il', { ascending: true }))
    .then((righe) => {
      if (stato.utente === utente) {
        stato.righe = righe
        for (const f of ascoltatori) f(righe)
      }
      return righe
    })
    .finally(() => { if (stato.lettura === lettura) stato.lettura = null })
  stato.lettura = lettura
  return lettura
}

// Avvisa quando arriva una versione nuova (per aggiornare le pagine aperte).
export function seguiArchivio(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}

// Toglie una partita dalla memoria subito (es. appena cancellata).
export function togliDallArchivio(id) {
  if (stato.righe) stato.righe = stato.righe.filter((p) => p.id !== id)
}
