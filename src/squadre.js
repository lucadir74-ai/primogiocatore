// Primo Giocatore - partite a squadre
// v1.0.0 - 202611221200
//
// Una partita a squadre (Codenames, Tichu, Crokinole in coppia...) ha
// un punteggio per squadra: lo stesso per tutti i suoi giocatori, come
// il piazzamento e la vittoria. Nel database: partite.a_squadre e, per
// ogni giocatore, partecipazioni.squadra (il numero, come testo: lo
// scrive così anche l'import di BG Stats).
// Le partite a squadre non contano nell'IPG (primeggioCalcolo.js): non
// si può sapere quanto ha pesato ognuno.

// La partita è a squadre e ogni giocatore ne ha una.
export function eASquadre(p) {
  if (!p?.a_squadre) return false
  const righe = p.partecipazioni || []
  return righe.length > 0 && righe.every((x) => x.squadra != null && x.squadra !== '')
}

const numero = (s) => (Number.isFinite(Number(s)) ? Number(s) : Infinity)

// Le squadre della partita, dalla prima classificata: per ognuna il
// numero, i giocatori (nell'ordine dato), punteggio, piazzamento e se ha vinto.
export function squadreDi(p, righe = p?.partecipazioni || []) {
  const m = new Map()
  for (const x of righe) {
    const k = String(x.squadra ?? '')
    const s = m.get(k) || { squadra: k, giocatori: [], punteggio: null, posizione: null, vincitore: false }
    s.giocatori.push(x)
    if (s.punteggio == null && x.punteggio_totale != null) s.punteggio = Number(x.punteggio_totale)
    if (s.posizione == null && x.posizione != null) s.posizione = x.posizione
    if (x.vincitore) s.vincitore = true
    m.set(k, s)
  }
  return [...m.values()].sort((a, b) =>
    (a.posizione ?? Infinity) - (b.posizione ?? Infinity)
    || Number(b.vincitore) - Number(a.vincitore)
    || numero(a.squadra) - numero(b.squadra))
}

// Contro quanti si gioca: le squadre in una partita a squadre, i
// giocatori nelle altre. Serve per l'atteso (1 / lati) e il piazzamento.
export function latiDi(p) {
  if (!eASquadre(p)) return (p?.partecipazioni || []).length
  return new Set(p.partecipazioni.map((x) => String(x.squadra))).size
}

// Due giocatori della stessa partita sono compagni di squadra.
export function compagni(p, a, b) {
  return eASquadre(p) && a && b && String(a.squadra) === String(b.squadra)
}

// I punteggi della partita contati una volta per squadra.
export function punteggiPerLato(p) {
  if (!eASquadre(p)) {
    return (p?.partecipazioni || []).map((x) => x.punteggio_totale).filter((v) => v != null)
  }
  return squadreDi(p).map((s) => s.punteggio).filter((v) => v != null)
}

// «Squadra 1», o i nomi se sono pochi: per il titolo della riga.
export const nomeSquadra = (s) => `Squadra ${s.squadra}`
