// Primo Giocatore - l'archivio delle partite, uno solo per tutta l'app
// v1.5.0 - 202611132100 (sul telefono una riga per partita: a ogni novità si scrivono solo le partite cambiate, non tutto l'archivio)
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
import { luoghiPerChiGuarda } from './luoghiNome'

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
export const ARCHIVIO_LOCALE = 'tutti'
const CHIAVE_PROVA = 'primo-giocatore:archivio-locale'
const VERSIONE_CACHE = 2   // 2: luoghi con proprietario e nome per gli altri
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

// Il deposito ha due scaffali:
// - «archivio»: una scheda per persona (fin dove si è letto, quando,
//   quante partite) e gli altri elenchi tenuti da parte (leggiDalTelefono);
// - «partite»: una riga per partita. Prima l'archivio intero stava in un
//   blocco solo dentro la scheda, e a ogni partita cambiata si riscriveva
//   tutto (migliaia di partite, a schermo fermo): ora si scrivono solo le
//   partite cambiate e si tolgono quelle cancellate.
function apriDb() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') { ko(new Error('niente IndexedDB')); return }
    const r = indexedDB.open('primo-giocatore', 2)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('archivio')) db.createObjectStore('archivio', { keyPath: 'utente' })
      if (!db.objectStoreNames.contains('partite')) db.createObjectStore('partite', { keyPath: ['utente', 'id'] })
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
    // Un'altra scheda aperta con la versione vecchia: si fa senza memoria.
    r.onblocked = () => ko(new Error('deposito occupato'))
  })
}

// Un'operazione su uno o più scaffali, tutta o niente.
async function depositoOp(scaffali, modo, fn) {
  try {
    const db = await apriDb()
    // Se un'altra scheda vuole aggiornare il deposito, non la si blocca.
    db.onversionchange = () => db.close()
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction(scaffali, modo)
        const r = fn(tx)
        tx.oncomplete = () => ok(r?.result ?? null)
        tx.onerror = () => ko(tx.error)
        tx.onabort = () => ko(tx.error)
      })
    } finally { db.close() }
  } catch { return null }   // memoria non disponibile: si legge tutto dal database
}
const cacheOp = (modo, fn) => depositoOp(['archivio'], modo, (tx) => fn(tx.objectStore('archivio')))
const leggiCache = (utente) => cacheOp('readonly', (st) => st.get(utente))
const scriviCache = (record) => cacheOp('readwrite', (st) => st.put(record))

// Tutte le partite di una persona: le chiavi sono [utente, id].
const fasciaDi = (utente) => IDBKeyRange.bound([utente], [utente, []])
// La scheda senza le partite, con il loro numero: se alla rilettura non
// torna (scrittura interrotta, memoria ripulita a metà) si rilegge tutto.
const schedaDi = (record) => {
  const { righe, ...scheda } = record
  return { ...scheda, quante: righe.length }
}

// L'archivio com'è sul telefono: la scheda con dentro «righe», o null.
async function leggiArchivioSalvato(utente) {
  const scheda = await leggiCache(utente)
  if (!scheda) return null
  // Il formato di prima, tutto in un blocco: si usa così com'è, e alla
  // prossima scrittura passa a quello nuovo.
  if (Array.isArray(scheda.righe)) return scheda
  const salvate = await depositoOp(['partite'], 'readonly', (tx) => tx.objectStore('partite').getAll(fasciaDi(utente)))
  if (!Array.isArray(salvate) || salvate.length !== scheda.quante) return null
  return { ...scheda, righe: ordina(salvate.map((x) => x.riga)) }
}

// Dopo una lettura completa: via le partite di prima, dentro quelle nuove.
const salvaArchivioIntero = (record) => depositoOp(['archivio', 'partite'], 'readwrite', (tx) => {
  const st = tx.objectStore('partite')
  st.delete(fasciaDi(record.utente))
  for (const riga of record.righe) st.put({ utente: record.utente, id: riga.id, riga })
  return tx.objectStore('archivio').put(schedaDi(record))
})

// Dopo le sole novità: si scrivono le cambiate e si tolgono le cancellate.
const salvaNovita = (record, cambiate, cancellate) => depositoOp(['archivio', 'partite'], 'readwrite', (tx) => {
  const st = tx.objectStore('partite')
  for (const id of cancellate) st.delete([record.utente, id])
  for (const riga of cambiate) st.put({ utente: record.utente, id: riga.id, riga })
  return tx.objectStore('archivio').put(schedaDi(record))
})

// Lo stesso posto sul telefono per altre cose da tenere (catalogo dei
// giochi, elenchi della pagina Partita): la chiave è una stringa qualunque
// nel campo «utente». Se la memoria non c'è, si torna null e basta.
export const leggiDalTelefono = (chiave) => leggiCache(chiave)
export const salvaSulTelefono = (chiave, dati) => scriviCache({ utente: chiave, salvato_il: Date.now(), dati })

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
  const righe = luoghiPerChiGuarda(await leggiTutto(), utente)
  if (lettoFino) {
    const record = { utente, versione: VERSIONE_CACHE, letto_fino: lettoFino, completo_il: Date.now(), quante: righe.length, righe }
    stato.cache = record
    await salvaArchivioIntero(record)
  }
  return righe
}

// Solo le novità, unite a quello che c'è già sul telefono.
async function aggiorna(utente, cache) {
  const lettoFino = await oraDatabase()
  const [cambiate, cancellate] = await Promise.all([
    leggiVeloce(cache.letto_fino).then((r) => luoghiPerChiGuarda(r, utente)),
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
  const record = { ...cache, letto_fino: lettoFino, quante: righe.length, righe }
  stato.cache = record
  // La copia era ancora nel formato di prima (un blocco solo): si riscrive tutta.
  if (cache.quante == null) await salvaArchivioIntero(record)
  else await salvaNovita(record, cambiate, cancellate)
  return righe
}

function pubblica(utente, righe) {
  if (stato.utente !== utente) return
  stato.righe = righe
  for (const f of ascoltatori) f(righe)
}

async function leggiConMemoria(utente, forzaTutto) {
  if (!archivioLocaleAttivo()) return luoghiPerChiGuarda(await leggiTutto(), utente)
  // forzaTutto: si rilegge tutto dal database. La copia sul telefono si
  // sostituisce solo a lettura riuscita: senza rete resta quella di prima.
  if (stato.cache === undefined) stato.cache = await leggiArchivioSalvato(utente)
  const cache = stato.cache
  // Usabile: è la mia, nel formato di adesso. Valida: in più è fresca.
  const usabile = cache && cache.versione === VERSIONE_CACHE && cache.utente === utente && Array.isArray(cache.righe)
  const valida = usabile && !forzaTutto && Date.now() - cache.completo_il < RILETTURA_COMPLETA
  // Si vede subito quello che c'era; le novità arrivano subito dopo.
  if (usabile && !stato.righe) pubblica(utente, cache.righe)
  try {
    if (valida) {
      try {
        return await aggiorna(utente, cache)
      } catch { /* qualcosa non va con le novità: si rilegge tutto, come prima */ }
    }
    return await leggiTuttoESalva(utente)
  } catch (e) {
    // Senza rete resta l'archivio del telefono, anche se ha più di una
    // settimana: meglio le partite dell'ultima volta che una pagina vuota.
    if (usabile) return (stato.cache?.righe) || cache.righe
    throw e
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
