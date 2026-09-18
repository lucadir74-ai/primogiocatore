// Primo Giocatore - impronta della partita
// v3.3.0 - 202609201400
//
// Riconosce la stessa partita arrivata da fonti diverse. Non usa i
// nomi dei giocatori, che cambiano da una fonte all'altra, ma i
// punteggi, che restano identici.

export function impronta({ giocoId, giocataIl, punteggi }) {
  if (!giocoId || !giocataIl) return null
  const validi = (punteggi || []).filter((v) => v != null && v !== '')
  const parte = validi.length
    ? [...validi].map(Number).sort((a, b) => a - b).join(',')
    : 'np'
  return `${chiaveDebole({ giocoId, giocataIl, quanti: (punteggi || []).length })}|${parte}`
}

// Gioco, giorno e numero di giocatori: quel che resta quando una
// delle due parti non ha i punteggi. Capita spesso, perché la stessa
// partita può essere stata registrata con i numeri da un lato e
// senza dall'altro.
export function chiaveDebole({ giocoId, giocataIl, quanti }) {
  if (!giocoId || !giocataIl) return null
  return `${giocoId}|${String(giocataIl).slice(0, 10)}|${quanti}`
}

// Quante partite esistono per ogni impronta. Il conteggio, non la
// semplice presenza: sei partite allo stesso gioco, nello stesso
// giorno, con gli stessi due giocatori sono normali quando è un
// gioco veloce ripetuto. Saltarle tutte perché la prima esiste
// sarebbe un errore.
export async function improntePresenti(supabase, profiloId) {
  const { tutteLeRighe } = await import('./supabase')
  const data = await tutteLeRighe(() => supabase
    .from('partite')
    .select('impronta')
    .eq('registrata_da', profiloId)
    .not('impronta', 'is', null))

  const piene = new Map()
  const deboli = new Map()
  for (const r of data || []) {
    piene.set(r.impronta, (piene.get(r.impronta) || 0) + 1)
    const senzaPunteggi = r.impronta.split('|').slice(0, 3).join('|')
    deboli.set(senzaPunteggi, (deboli.get(senzaPunteggi) || 0) + 1)
  }
  return { piene, deboli }
}

// Vero se questa partita risulta già presente. Consuma i conteggi:
// se nell'archivio ce ne sono sei e ne arrivano sette, la settima
// viene importata.
//
// Prima si cerca la corrispondenza esatta, punteggi compresi. Se non
// c'è si ripiega su gioco, giorno e numero di giocatori: serve quando
// una delle due fonti non ha i punteggi, come capita spesso fra BGG
// e BG Stats per la stessa serata.
export function giaPresente(conteggi, imp) {
  if (!imp) return { presente: false, modo: null }

  const quante = conteggi.piene.get(imp) || 0
  const debole = imp.split('|').slice(0, 3).join('|')

  if (quante > 0) {
    conteggi.piene.set(imp, quante - 1)
    conteggi.deboli.set(debole, Math.max(0, (conteggi.deboli.get(debole) || 0) - 1))
    return { presente: true, modo: 'esatto' }
  }

  const quanteDeboli = conteggi.deboli.get(debole) || 0
  if (quanteDeboli > 0) {
    conteggi.deboli.set(debole, quanteDeboli - 1)
    return { presente: true, modo: 'debole' }
  }

  return { presente: false, modo: null }
}
