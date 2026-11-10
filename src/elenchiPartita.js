// Primo Giocatore - gli elenchi della pagina Partita (giochi, giocatori, luoghi)
// v1.0.0 - 202611101400 (tolti da Partita.jsx: ora si preparano all'apertura dell'app)
//
// Per registrare una partita senza rete servono i tuoi giochi e i nomi
// dei giocatori già sul telefono. Prima ci finivano solo aprendo la
// pagina Partita con la rete: chi non l'aveva mai aperta, senza linea
// trovava l'elenco vuoto. Ora l'app li prepara da sola poco dopo
// l'apertura (App.jsx), e la pagina Partita li rilegge quando si apre.

import { supabase, tutteLeRighe } from './supabase'
import { giochiMiei } from './giochiMiei'
import { archivioInMemoria, leggiDalTelefono, salvaSulTelefono } from './archivio'

const chiaveDi = (profiloId) => `elenchi-partita:${profiloId}`

// Gli elenchi dell'ultima lettura, per riaprire la pagina all'istante.
let inMemoria = null
let lettura = null   // { chiave, promessa, giochi }: due richieste insieme ne fanno una

// Quelli già pronti: in memoria, o salvati sul telefono. null se non ci sono.
export async function elenchiSalvati(profiloId) {
  const chiave = chiaveDi(profiloId)
  if (inMemoria?.chiave === chiave) return inMemoria
  const dati = (await leggiDalTelefono(chiave))?.dati
  return dati?.chiave === chiave ? dati : null
}

// Li rilegge dal database e li salva sul telefono.
// suCatalogo: chiamata con i giochi appena arrivano, senza aspettare il resto.
export function leggiElenchiPartita(profiloId, { suCatalogo = null } = {}) {
  const chiave = chiaveDi(profiloId)
  if (lettura?.chiave !== chiave) {
    const giochi = giochiMiei(profiloId, '*')
    giochi.catch(() => {})   // l'errore lo riporta la lettura intera
    const promessa = leggi(profiloId, chiave, giochi).finally(() => { if (lettura?.promessa === promessa) lettura = null })
    lettura = { chiave, promessa, giochi }
  }
  if (suCatalogo) lettura.giochi.then(suCatalogo, () => {})
  return lettura.promessa
}

// All'apertura dell'app: solo se in questa sessione non sono ancora stati letti.
export function preparaElenchiPartita(profiloId) {
  if (inMemoria?.chiave === chiaveDi(profiloId)) return Promise.resolve()
  return leggiElenchiPartita(profiloId).then(() => {}, () => {})
}

async function leggi(profiloId, chiave, giochi) {
  // Le partecipazioni per contare chi gioca di più: se l'archivio è già
  // in memoria (Storico, Statistiche, Home) non si rileggono.
  const archivio = archivioInMemoria(profiloId)
  const partecipazioni = archivio
    ? Promise.resolve(archivio.flatMap((x) => x.partecipazioni || []))
    : tutteLeRighe(() => supabase.from('partecipazioni').select('utente_id, ospite_id'))

  const ultima = (async () => {
    const { data: u } = await supabase
      .from('partite')
      .select('id, giocata_il, partecipazioni!inner ( utente_id )')
      .eq('partecipazioni.utente_id', profiloId)
      .order('giocata_il', { ascending: false })
      .limit(1)
    if (!u?.[0]) return []
    const { data: chi } = await supabase
      .from('partecipazioni')
      .select('utente_id, ospite_id, ordine_turno')
      .eq('partita_id', u[0].id)
    return (chi || []).map((x) => (x.utente_id ? `u-${x.utente_id}` : `o-${x.ospite_id}`))
  })()

  const [g, p, o, f, l, c, nc, up] = await Promise.all([
    giochi,
    tutteLeRighe(() => supabase.from('profili').select('id, nome, cognome, nickname, colore').order('nome')),
    tutteLeRighe(() => supabase.from('ospiti').select('id, nome, cognome, utente_collegato, unito_in').order('nome')),
    partecipazioni,
    tutteLeRighe(() => supabase.from('luoghi').select('nome').order('nome')),
    tutteLeRighe(() => supabase.from('collezioni').select('gioco_id').eq('utente_id', profiloId), 1000, 'gioco_id'),
    supabase.from('nomi_collegati').select('utente_id, nome, cognome').then(({ data }) => data || []),
    ultima,
  ])
  const nomi = new Map()
  for (const r of nc) {
    if (!nomi.has(r.utente_id)) nomi.set(r.utente_id, [])
    nomi.get(r.utente_id).push([r.nome, r.cognome].filter(Boolean).join(' '))
  }
  const conta = new Map()
  for (const r of f) {
    const k = r.utente_id ? `u-${r.utente_id}` : `o-${r.ospite_id}`
    conta.set(k, (conta.get(k) || 0) + 1)
  }
  const nuovi = {
    chiave, giochi: g, persone: p, ospiti: o, luoghi: l.map((x) => x.nome),
    collezione: c.map((x) => x.gioco_id), nomiCollegati: [...nomi], frequenza: [...conta], ultimaPartita: up,
  }
  inMemoria = nuovi
  salvaSulTelefono(chiave, nuovi)
  return nuovi
}
