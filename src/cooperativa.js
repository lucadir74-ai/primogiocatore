// Primo Giocatore - partite cooperative
// v1.0.0 - 202611202300
//
// Nelle cooperative il punteggio, se c'è, è della squadra: lo stesso per
// tutti i giocatori. Si mostra una volta sola e nelle statistiche conta
// una volta sola.

// Il punteggio comune della partita; null se manca o se i giocatori ne
// hanno di diversi (alcuni import li portano a testa).
export function punteggioSquadra(p) {
  if (p?.tipo_punteggio !== 'coop') return null
  const valori = new Set((p.partecipazioni || [])
    .map((x) => x.punteggio_totale).filter((v) => v != null).map(Number))
  return valori.size === 1 ? [...valori][0] : null
}
