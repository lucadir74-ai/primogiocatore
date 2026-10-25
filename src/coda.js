// Primo Giocatore - partite in attesa di rete
// v4.3.0 - 202610252200 (una coda per persona: su un telefono condiviso le partite in attesa non finiscono nel profilo di un altro; invio mai doppio)
//
// Quando manca la linea la partita resta sul telefono e parte da sola
// appena la rete torna. Vale solo per le partite nuove: modificarne
// una già registrata richiede di averla letta, quindi lì la rete serve.

import { impronta } from './impronta'
import { trovaOCreaLuogo } from './giochiMiei'

// Una coda per persona. Prima era una sola per telefono: su un tablet
// condiviso le partite in attesa di uno partivano col profilo di chi
// entrava dopo.
const CODA = 'primo-giocatore:coda'
const chiave = (profiloId) => `${CODA}:${profiloId}`

// La coda vecchia, senza nome: va a chi la apre per primo, che quasi
// sempre è chi l'ha riempita.
function prendiCodaVecchia(profiloId) {
  try {
    const vecchia = localStorage.getItem(CODA)
    if (!vecchia) return
    const mie = JSON.parse(localStorage.getItem(chiave(profiloId)) || '[]')
    localStorage.setItem(chiave(profiloId), JSON.stringify([...mie, ...JSON.parse(vecchia)]))
    localStorage.removeItem(CODA)
  } catch { /* resta dov'è */ }
}

export function leggiCoda(profiloId) {
  if (!profiloId) return []
  prendiCodaVecchia(profiloId)
  try {
    const grezzo = localStorage.getItem(chiave(profiloId))
    const righe = grezzo ? JSON.parse(grezzo) : []
    return righe.filter((r) => !r.profilo_id || r.profilo_id === profiloId)
  } catch {
    return []
  }
}

function scriviCoda(profiloId, righe) {
  try { localStorage.setItem(chiave(profiloId), JSON.stringify(righe)) } catch { /* spazio pieno */ }
}

export function accodaPartita(profiloId, dati) {
  const righe = leggiCoda(profiloId)
  righe.push({ ...dati, profilo_id: profiloId, accodataIl: new Date().toISOString(), id: crypto.randomUUID() })
  scriviCoda(profiloId, righe)
  return righe.length
}

export function togliDallaCoda(profiloId, id) {
  scriviCoda(profiloId, leggiCoda(profiloId).filter((r) => r.id !== id))
}

// Riconosce i guasti di rete dai rifiuti del database: i primi si
// ritentano, i secondi no — riprovare all'infinito un dato sbagliato
// non lo fa diventare giusto.
export function eProblemaDiRete(errore) {
  if (!navigator.onLine) return true
  const m = (errore?.message || '').toLowerCase()
  return m.includes('failed to fetch')
    || m.includes('networkerror')
    || m.includes('load failed')
    || m.includes('timeout')
}

/* ---------- Scrittura vera e propria ---------- */

// Una partita e i suoi giocatori. Usata sia al salvataggio normale
// sia quando la coda riparte, così la logica è una sola.
export async function scriviPartita(supabase, profilo, dati) {
  // Fra i luoghi che vedi, prima il tuo; se non c'è lo crei tu.
  const luogoId = await trovaOCreaLuogo(dati.luogo, profilo.id)

  const campi = {
    gioco_id: dati.gioco_id,
    luogo_id: luogoId,
    giocata_il: dati.giocata_il,
    durata_minuti: dati.durata_minuti,
    tipo_punteggio: dati.tipo_punteggio,
    esito_coop: dati.esito_coop,
    note: dati.note,
    impronta: impronta({
      giocoId: dati.gioco_id,
      giocataIl: dati.giocata_il,
      punteggi: dati.giocatori.map((g) => g.punteggio_totale),
    }),
  }

  let id = dati.partita_id
  if (id) {
    const { error } = await supabase.from('partite').update(campi).eq('id', id)
    if (error) throw error
    const { error: e0 } = await supabase.from('partecipazioni').delete().eq('partita_id', id)
    if (e0) throw e0
  } else {
    const { data, error } = await supabase
      .from('partite')
      .insert({ ...campi, registrata_da: profilo.id })
      .select('id').single()
    if (error) throw error
    id = data.id
  }

  // I parziali non sono una colonna: vanno in dettagli_punteggio,
  // agganciati alla partecipazione appena creata.
  const righe = dati.giocatori.map(({ parziali, ...g }) => ({ ...g, partita_id: id }))
  if (righe.length) {
    const { data: create, error } = await supabase
      .from('partecipazioni').insert(righe).select('id, utente_id, ospite_id')
    if (error) throw error

    const dettagli = []
    for (const g of dati.giocatori) {
      if (!g.parziali) continue
      const p = (create || []).find((c) =>
        (g.utente_id && c.utente_id === g.utente_id) || (g.ospite_id && c.ospite_id === g.ospite_id))
      if (!p) continue
      for (const [categoria, valore] of Object.entries(g.parziali)) {
        dettagli.push({ partecipazione_id: p.id, categoria, valore })
      }
    }
    // La partita a questo punto è già salvata: se i parziali non passano
    // non la si fa fallire, altrimenti riprovando nascerebbe un doppione.
    if (dettagli.length) {
      const { error: e2 } = await supabase.from('dettagli_punteggio').insert(dettagli)
      if (e2) console.warn('Parziali non salvati:', e2.message)
    }
  }
  return id
}

// Svuota la coda. Si ferma al primo guasto di rete, per non perdere
// l'ordine; scarta invece le partite che il database rifiuta, dopo
// averle segnalate a chi le ha scritte.
// Un invio alla volta: due invii insieme (la rete che torna mentre
// la pagina si apre) scrivevano due volte la stessa partita.
let invioInCorso = null

export async function inviaCoda(supabase, profilo, avviso = () => {}) {
  if (invioInCorso) return invioInCorso
  invioInCorso = inviaCodaOra(supabase, profilo, avviso)
  try { return await invioInCorso } finally { invioInCorso = null }
}

async function inviaCodaOra(supabase, profilo, avviso) {
  const righe = leggiCoda(profilo.id)
  if (righe.length === 0) return { inviate: 0, rimaste: 0, scartate: [] }

  let inviate = 0
  const scartate = []

  for (const r of righe) {
    try {
      await scriviPartita(supabase, profilo, r)
      togliDallaCoda(profilo.id, r.id)
      inviate++
      avviso({ inviate, totale: righe.length })
    } catch (e) {
      if (eProblemaDiRete(e)) break
      togliDallaCoda(profilo.id, r.id)
      scartate.push({ quando: r.accodataIl, motivo: e.message })
    }
  }

  return { inviate, rimaste: leggiCoda(profilo.id).length, scartate }
}
