// Primo Giocatore - impronta della partita
// v3.0.1 - 202609191700
//
// Riconosce la stessa partita arrivata da fonti diverse. Non usa i
// nomi dei giocatori, che cambiano da una fonte all'altra, ma i
// punteggi, che restano identici.

export function impronta({ giocoId, giocataIl, punteggi }) {
  if (!giocoId || !giocataIl) return null
  const giorno = String(giocataIl).slice(0, 10)
  const validi = (punteggi || []).filter((v) => v != null && v !== '')
  const parte = validi.length
    ? [...validi].map(Number).sort((a, b) => a - b).join(',')
    : 'np'
  return `${giocoId}|${giorno}|${(punteggi || []).length}|${parte}`
}

// Quante partite esistono per ogni impronta. Il conteggio, non la
// semplice presenza: sei partite allo stesso gioco, nello stesso
// giorno, con gli stessi due giocatori sono normali quando è un
// gioco veloce ripetuto. Saltarle tutte perché la prima esiste
// sarebbe un errore.
export async function improntePresenti(supabase, profiloId) {
  const { data, error } = await supabase
    .from('partite')
    .select('impronta')
    .eq('registrata_da', profiloId)
    .not('impronta', 'is', null)
  if (error) throw error
  const conteggio = new Map()
  for (const r of data || []) conteggio.set(r.impronta, (conteggio.get(r.impronta) || 0) + 1)
  return conteggio
}

// Vero se questa partita risulta già presente. Consuma il conteggio:
// se nell'archivio ce ne sono sei e ne arrivano sette, la settima
// viene importata.
export function giaPresente(conteggio, imp) {
  if (!imp) return false
  const quante = conteggio.get(imp) || 0
  if (quante <= 0) return false
  conteggio.set(imp, quante - 1)
  return true
}

// Un'impronta senza punteggi è debole: distingue solo gioco, giorno
// e numero di giocatori. Serve a segnalare, non a decidere da sola.
export const improntaDebole = (imp) => Boolean(imp && imp.endsWith('np'))
