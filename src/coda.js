// Primo Giocatore - partite in attesa di rete
// v4.0.0 - 202609220900
//
// Quando manca la linea la partita resta sul telefono e parte da sola
// appena la rete torna. Vale solo per le partite nuove: modificarne
// una già registrata richiede di averla letta, quindi lì la rete serve.

import { impronta } from './impronta'

const CODA = 'primo-giocatore:coda'

export function leggiCoda() {
  try {
    const grezzo = localStorage.getItem(CODA)
    return grezzo ? JSON.parse(grezzo) : []
  } catch {
    return []
  }
}

function scriviCoda(righe) {
  try { localStorage.setItem(CODA, JSON.stringify(righe)) } catch { /* spazio pieno */ }
}

export function accodaPartita(dati) {
  const righe = leggiCoda()
  righe.push({ ...dati, accodataIl: new Date().toISOString(), id: crypto.randomUUID() })
  scriviCoda(righe)
  return righe.length
}

export function togliDallaCoda(id) {
  scriviCoda(leggiCoda().filter((r) => r.id !== id))
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
  let luogoId = null
  if (dati.luogo?.trim()) {
    const { data: esistente } = await supabase
      .from('luoghi').select('id').ilike('nome', dati.luogo.trim()).maybeSingle()
    if (esistente) luogoId = esistente.id
    else {
      const { data, error } = await supabase
        .from('luoghi')
        .insert({ nome: dati.luogo.trim(), tipo: 'altro', creato_da: profilo.id })
        .select('id').single()
      if (error) throw error
      luogoId = data.id
    }
  }

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

  const righe = dati.giocatori.map((g) => ({ ...g, partita_id: id }))
  if (righe.length) {
    const { error } = await supabase.from('partecipazioni').insert(righe)
    if (error) throw error
  }
  return id
}

// Svuota la coda. Si ferma al primo guasto di rete, per non perdere
// l'ordine; scarta invece le partite che il database rifiuta, dopo
// averle segnalate a chi le ha scritte.
export async function inviaCoda(supabase, profilo, avviso = () => {}) {
  const righe = leggiCoda()
  if (righe.length === 0) return { inviate: 0, rimaste: 0, scartate: [] }

  let inviate = 0
  const scartate = []

  for (const r of righe) {
    try {
      await scriviPartita(supabase, profilo, r)
      togliDallaCoda(r.id)
      inviate++
      avviso({ inviate, totale: righe.length })
    } catch (e) {
      if (eProblemaDiRete(e)) break
      togliDallaCoda(r.id)
      scartate.push({ quando: r.accodataIl, motivo: e.message })
    }
  }

  return { inviate, rimaste: leggiCoda().length, scartate }
}
