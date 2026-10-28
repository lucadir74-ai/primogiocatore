// Primo Giocatore - la partita in corso messa da parte sul telefono
// v1.0.0 - 202610281700 (spostata qui da Partita.jsx: la usa anche la Home per «Rifai l'ultima»)
//
// La partita in corso resta sul telefono finché non la salvi: se chiudi
// la pagina o cade la linea, la ritrovi com'era.

const BOZZA = 'primo-giocatore:bozza'

export function leggiBozza() {
  try {
    const grezzo = localStorage.getItem(BOZZA)
    return grezzo ? JSON.parse(grezzo) : null
  } catch { return null }
}

export function scriviBozza(dati) {
  try { localStorage.setItem(BOZZA, JSON.stringify(dati)) } catch { /* spazio pieno */ }
}

export function cancellaBozza() {
  try { localStorage.removeItem(BOZZA) } catch { /* niente da fare */ }
}
