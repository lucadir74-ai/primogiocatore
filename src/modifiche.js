// Primo Giocatore - piccole modifiche in attesa di rete
// v1.0.0 - 202611101700
//
// Come le partite nuove (coda.js), ma per tre modifiche che riguardano
// solo chi le fa e che quindi si possono rimandare senza rischi:
// - il proprio profilo (nome, soprannome, città, colore…);
// - «è mio» su un gioco, o toglierlo dalla collezione;
// - il nome di un proprio luogo.
// Senza rete restano sul telefono e partono da sole quando torna la
// linea (StatoRete.jsx). Intanto l'app le mostra come già fatte.
//
// Tutto il resto resta fuori apposta: iscrizioni ai tavoli, modifiche a
// partite già registrate, unioni, ruoli e soci dipendono da quello che
// fanno gli altri nel frattempo, e rimandarli farebbe più danni che altro.
//
// Due modifiche alla stessa cosa (due volte il profilo, lo stesso gioco)
// ne lasciano in attesa una sola: l'ultima.

import { supabase } from './supabase'
import { eProblemaDiRete } from './coda'

const CHIAVE = 'primo-giocatore:modifiche'
// Cambia l'elenco di quelle in attesa: lo ascolta l'avviso in cima all'app.
export const EVENTO_MODIFICHE = 'primo-giocatore:modifiche-cambiate'
// Sono appena partite: chi mostra quei dati li rilegge.
export const EVENTO_MODIFICHE_INVIATE = 'primo-giocatore:modifiche-inviate'

const chiave = (profiloId) => `${CHIAVE}:${profiloId}`

export function leggiModifiche(profiloId) {
  if (!profiloId) return []
  try { return JSON.parse(localStorage.getItem(chiave(profiloId)) || '[]') || [] } catch { return [] }
}

function scrivi(profiloId, righe) {
  try { localStorage.setItem(chiave(profiloId), JSON.stringify(righe)) } catch { /* spazio pieno */ }
  try { window.dispatchEvent(new Event(EVENTO_MODIFICHE)) } catch { /* niente */ }
}

const senza = (righe, tipo, bersaglio) => righe.filter((m) => !(m.tipo === tipo && m.bersaglio === bersaglio))

/* ---------- La scrittura vera ---------- */

async function esegui(profiloId, m) {
  let esito
  if (m.tipo === 'profilo') {
    esito = await supabase.from('profili').update(m.dati).eq('id', profiloId)
  } else if (m.tipo === 'possesso') {
    esito = m.dati.posseduto
      ? await supabase.from('collezioni').upsert({ utente_id: profiloId, gioco_id: m.bersaglio, origine: 'manuale' })
      : await supabase.from('collezioni').delete().eq('utente_id', profiloId).eq('gioco_id', m.bersaglio)
  } else if (m.tipo === 'luogo-nome') {
    esito = await supabase.from('luoghi').update({ nome: m.dati.nome }).eq('id', m.bersaglio)
  } else {
    return   // un tipo che questa versione non conosce: si lascia cadere
  }
  if (esito.error) throw esito.error
}

// Salva subito; se manca la rete mette in attesa.
// Restituisce { inAttesa }. Un rifiuto del database arriva come errore.
export async function salvaOAccoda(profiloId, tipo, bersaglio, dati) {
  const m = { tipo, bersaglio: String(bersaglio), dati }
  try {
    await esegui(profiloId, m)
    // Una versione più vecchia rimasta in attesa non deve ripassarci sopra.
    const prima = leggiModifiche(profiloId)
    const dopo = senza(prima, tipo, m.bersaglio)
    if (dopo.length !== prima.length) scrivi(profiloId, dopo)
    return { inAttesa: false }
  } catch (e) {
    if (!eProblemaDiRete(e)) throw e
    scrivi(profiloId, [...senza(leggiModifiche(profiloId), tipo, m.bersaglio),
      { ...m, id: crypto.randomUUID(), quando: new Date().toISOString() }])
    return { inAttesa: true }
  }
}

const NOMI = { profilo: 'il profilo', possesso: 'un gioco della collezione', 'luogo-nome': 'il nome di un luogo' }

// Manda quelle in attesa, in ordine. Si ferma al primo guasto di rete;
// quelle che il database rifiuta si tolgono e si segnalano.
let invio = null
export function inviaModifiche(profiloId) {
  if (!invio) invio = inviaOra(profiloId).finally(() => { invio = null })
  return invio
}

async function inviaOra(profiloId) {
  let inviate = 0
  const scartate = []
  for (const m of leggiModifiche(profiloId)) {
    try {
      await esegui(profiloId, m)
      inviate++
    } catch (e) {
      if (eProblemaDiRete(e)) break
      scartate.push({ cosa: NOMI[m.tipo] || 'una modifica', motivo: e.message })
    }
    // Si toglie proprio questa: se nel frattempo ne è arrivata una più nuova, resta.
    scrivi(profiloId, leggiModifiche(profiloId).filter((x) => x.id !== m.id))
  }
  if (inviate || scartate.length) {
    try { window.dispatchEvent(new Event(EVENTO_MODIFICHE_INVIATE)) } catch { /* niente */ }
  }
  return { inviate, scartate, rimaste: leggiModifiche(profiloId).length }
}

/* ---------- Come appaiono i dati finché le modifiche aspettano ---------- */
// Senza rete le pagine rileggono la copia di prima: qui sopra si
// rimettono le modifiche non ancora partite.

export function profiloConModifiche(p) {
  if (!p?.id) return p
  const m = leggiModifiche(p.id).find((x) => x.tipo === 'profilo')
  return m ? { ...p, ...m.dati } : p
}

// idGiochi: gli id dei giochi in collezione. Restituisce un Set.
export function collezioneConModifiche(profiloId, idGiochi) {
  const s = new Set(idGiochi)
  for (const m of leggiModifiche(profiloId)) {
    if (m.tipo !== 'possesso') continue
    // Gli id arrivano dal database come numeri o testi: si cerca quello uguale.
    const presente = [...s].find((x) => String(x) === m.bersaglio)
    if (m.dati.posseduto) { if (presente === undefined) s.add(m.dati.id ?? m.bersaglio) }
    else if (presente !== undefined) s.delete(presente)
  }
  return s
}

export function luoghiConModifiche(profiloId, luoghi) {
  const nomi = new Map(leggiModifiche(profiloId).filter((m) => m.tipo === 'luogo-nome').map((m) => [m.bersaglio, m.dati.nome]))
  if (nomi.size === 0) return luoghi
  return luoghi.map((l) => (nomi.has(String(l.id)) ? { ...l, nome: nomi.get(String(l.id)) } : l))
}
