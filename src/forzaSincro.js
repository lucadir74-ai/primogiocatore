// Primo Giocatore - «aggiorna adesso» dopo il gesto di trascinare giù
// v1.0.0 - 202611230100
//
// Trascinando giù la pagina l'app si ricarica. Prima si segna qui che
// l'aggiornamento l'ha chiesto chi usa l'app: così, alla riapertura, le
// sincronizzazioni (BGA, partite e collezione BGG) partono subito anche
// se l'ultimo giro è di pochi minuti prima. Restano le protezioni contro
// due sincronizzazioni insieme (quella in corso non si raddoppia).
// Vale un minuto: basta per la ricarica, non per le aperture dopo.

const CHIAVE = 'primo-giocatore:forza-sincro'
const VALE_PER = 60000

export function chiediSincroForzata() {
  try { sessionStorage.setItem(CHIAVE, String(Date.now())) } catch { /* senza memoria: ricarica normale */ }
}

export function sincroForzata() {
  try { return Date.now() - Number(sessionStorage.getItem(CHIAVE) || 0) < VALE_PER } catch { return false }
}
