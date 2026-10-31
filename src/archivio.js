// Primo Giocatore - l'archivio delle partite, uno solo per tutta l'app
// v1.2.0 - 202610311900 (archivio salvato sul telefono: all'apertura si scaricano solo le partite cambiate)
//
// Storico e Statistiche leggevano ognuno, a ogni apertura, tutte le
// partite (migliaia, con giocatori e punteggi). Ora le legge una volta
// questo modulo e le tiene in memoria:
// - aprendo una pagina si vede subito quello che c'era (memoria);
// - intanto si rilegge dal database dietro le quinte e la pagina si
//   aggiorna da sola quando arriva la versione nuova;
// - due pagine che chiedono insieme condividono la stessa lettura.
// Dopo una modifica (partita salvata, cancellata, import) basta
// chiedere di nuovo: la rilettura riporta tutto in pari.

import { supabase, tutteLeRighe } from './supabase'

const CAMPI = `
  id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop, registrata_da,
  giochi ( id, nome, immagine_url ),
  luoghi ( id, nome, tipo ),
  partecipazioni (
    id, utente_id, ospite_id, punteggio_totale, posizione, vincitore, spareggio, ruolo, ordine_turno,
    profili:utente_id ( nome, nickname, colore ),
    ospiti:ospite_id ( nome, utente_collegato )
  )
`

let stato = { utente: null, righe: null, lettura: null, cache: undefined }
const ascoltatori = new Set()

/* ---------------------------------------------------------------
   Archivio salvato sul telefono
   ---------------------------------------------------------------
   L'archivio completo resta nel telefono (IndexedDB). All'apertura si
   mostra subito quello, poi si chiedono al database solo le partite
   cambiate dall'ultima lettura e quelle cancellate.
   Sicurezze:
   - una volta a settimana, e a ogni cambio di formato, si rilegge tutto
     (corregge qualunque differenza sfuggita, per es. una partita che non
     puoi più vedere);
   - «Ricarica tutto l'archivio» in Dati e import fa lo stesso a mano;
   - se il telefono ha cancellato la memoria, o qualcosa va storto, si
     legge tutto come prima: l'originale resta sempre nel database.
   Interruttore: 'prova' = solo su chi lo attiva in Dati e import,
   'tutti' = per tutti, 'spento' = mai (si legge tutto ogni volta). */
export const ARCHIVIO_LOCALE = 'prova'
const CHIAVE_PROVA = 'primo-giocatore:archivio-locale'
const VERSIONE_CACHE = 1
const RILETTURA_COMPLETA = 7 * 86400000   // una settimana
const MARGINE = 5 * 60000                 // si richiedono anche gli ultimi 5 minuti già letti

export function archivioLocaleAttivo() {
  if (ARCHIVIO_LOCALE === 'tutti') return true
  if (ARCHIVIO_LOCALE !== 'prova') return false
  try { return localStorage.getItem(CHIAVE_PROVA) === '1' } catch { return false }
}

export function impostaArchivioLocale(si) {
  try { if (si) localStorage.setItem(CHIAVE_PROVA, '1'); else localStorage.removeItem(CHIAVE_PROVA) } catch { /* niente */ }
}

function apriDb() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') { ko(new Error('niente IndexedDB')); return }
    const r = indexedDB.open('primo-giocatore', 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('archivio')) r.result.createObjectStore('archivio', { keyPath: 'utente' }) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

async function cacheOp(modo, fn) {
  try {
    const db = await apriDb()
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction('archivio', modo)
        const r = fn(tx.objectStore('archivio'))
        tx.oncomplete = () => ok(r?.result ?? null)
        tx.onerror = () => ko(tx.error)
        tx.onabort = () => ko(tx.error)
      })
    } finally { db.close() }
  } catch { return null }   // memoria non disponibile: si legge tutto dal database
}
const leggiCache = (utente) => cacheOp('readonly', (st) => st.get(utente))
const scriviCache = (record) => cacheOp('readwrite', (st) => st.put(record))
const cancellaCache = (utente) => cacheOp('readwrite', (st) => st.delete(utente))

/* ---------------------------------------------------------------
   Lettura dal database
   --------------------------------------------------------------- */

// L'archivio a pagine, con la funzione del database archivio_partite:
// quattro fasce di id lette in parallelo, ognuna una pagina dopo l'altra.
// Stessi dati e stesse regole di visibilità della lettura diretta, ma
// il database usa gli indici invece di ricontrollare tutto l'archivio.
const FASCE = [null, '40000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000000',
  'c0000000-0000-0000-0000-000000000000', null]
const PER_PAGINA = 500   // pagine piccole: ognuna resta ben sotto il tempo massimo del database

async function leggiFascia(da, a, dal) {
  const righe = []
  let dopo = null
  for (let giro = 0; giro < 500; giro++) {
    const parametri = { p_da: da, p_a: a, p_dopo: dopo, p_limite: PER_PAGINA }
    if (dal) parametri.p_dal = dal   // solo le cambiate (serve archivio_locale.sql)
    const { data, error } = await supabase.rpc('archivio_partite', parametri)
    if (error) throw error
    const pagina = data || []
    righe.push(...pagina)
    if (pagina.length < PER_PAGINA) break
    dopo = pagina[pagina.length - 1].id
  }
  return righe
}

// Lo stesso ordine di sempre: per data, a parità per id.
const ordina = (righe) => righe.sort((x, y) => (x.giocata_il < y.giocata_il ? -1 : x.giocata_il > y.giocata_il ? 1
  : x.id < y.id ? -1 : x.id > y.id ? 1 : 0))

async function leggiVeloce(dal = null) {
  const fasce = await Promise.all(FASCE.slice(0, -1).map((da, i) => leggiFascia(da, FASCE[i + 1], dal)))
  return ordina(fasce.flat())
}

async function leggiTutto() {
  try {
    return await leggiVeloce()
  } catch (e) {
    // Senza lo script archivio_veloce.sql si legge come prima.
    if (!/archivio_partite/.test(e?.message || '')) throw e
    return tutteLeRighe(() => supabase.from('partite').select(CAMPI).order('giocata_il', { ascending: true }))
  }
}

async function oraDatabase() {
  const { data, error } = await supabase.rpc('archivio_ora')
  if (error || !data) throw error || new Error('ora non disponibile')
  return new Date(new Date(data).getTime() - MARGINE).toISOString()
}

// Tutto dal database, poi salvato sul telefono.
async function leggiTuttoESalva(utente) {
  let lettoFino = null
  try { lettoFino = await oraDatabase() } catch { /* senza archivio_locale.sql: niente memoria */ }
  const righe = await leggiTutto()
  if (lettoFino) {
    const record = { utente, versione: VERSIONE_CACHE, letto_fino: lettoFino, completo_il: Date.now(), righe }
    stato.cache = record
    await scriviCache(record)
  }
  return righe
}

// Solo le novità, unite a quello che c'è già sul telefono.
async function aggiorna(utente, cache) {
  const lettoFino = await oraDatabase()
  const [cambiate, cancellate] = await Promise.all([
    leggiVeloce(cache.letto_fino),
    supabase.rpc('archivio_cancellate', { p_dal: cache.letto_fino }).then(({ data, error }) => {
      if (error) throw error
      return (data || []).map((x) => (typeof x === 'string' ? x : x.archivio_cancellate || x.id))
    }),
  ])
  if (!cambiate.length && !cancellate.length) return cache.righe
  const perId = new Map(cache.righe.map((r) => [r.id, r]))
  for (const id of cancellate) perId.delete(id)
  for (const r of cambiate) perId.set(r.id, r)
  const righe = ordina([...perId.values()])
  const record = { ...cache, letto_fino: lettoFino, righe }
  stato.cache = record
  await scriviCache(record)
  return righe
}

function pubblica(utente, righe) {
  if (stato.utente !== utente) return
  stato.righe = righe
  for (const f of ascoltatori) f(righe)
}

async function leggiConMemoria(utente, forzaTutto) {
  if (!archivioLocaleAttivo()) return leggiTutto()
  if (forzaTutto) { stato.cache = null; await cancellaCache(utente) }
  if (stato.cache === undefined) stato.cache = await leggiCache(utente)
  const cache = stato.cache
  const valida = cache && cache.versione === VERSIONE_CACHE && cache.utente === utente
    && Array.isArray(cache.righe) && Date.now() - cache.completo_il < RILETTURA_COMPLETA
  if (!valida) return leggiTuttoESalva(utente)
  // Si vede subito quello che c'era; le novità arrivano subito dopo.
  if (!stato.righe) pubblica(utente, cache.righe)
  try {
    return await aggiorna(utente, cache)
  } catch {
    // Qualcosa non va con le novità: si rilegge tutto, come prima.
    return leggiTuttoESalva(utente)
  }
}

/* ---------------------------------------------------------------
   Per le pagine
   --------------------------------------------------------------- */

export function archivioInMemoria(utente) {
  return stato.utente === utente ? stato.righe : null
}

// Rilegge (dal telefono e dal database). Se una lettura è già in corso,
// si aggancia a quella. forzaTutto: ignora la memoria e rilegge tutto.
export function leggiArchivio(utente, { forzaTutto = false } = {}) {
  if (stato.utente !== utente) stato = { utente, righe: null, lettura: null, cache: undefined }
  if (stato.lettura && !forzaTutto) return stato.lettura
  const lettura = leggiConMemoria(utente, forzaTutto)
    .then((righe) => { pubblica(utente, righe); return righe })
    .finally(() => { if (stato.lettura === lettura) stato.lettura = null })
  stato.lettura = lettura
  return lettura
}

// «Ricarica tutto l'archivio» in Dati e import.
export function ricaricaTuttoArchivio(utente) {
  return leggiArchivio(utente, { forzaTutto: true })
}

export function seguiArchivio(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}

export function togliDallArchivio(id) {
  if (stato.righe) stato.righe = stato.righe.filter((p) => p.id !== id)
  // Sul telefono la toglie la prossima lettura (la cancellazione è registrata nel database).
}
