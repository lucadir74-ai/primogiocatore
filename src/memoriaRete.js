// Primo Giocatore - le letture dal database tenute da parte sul telefono
// v1.3.0 - 202611132100 (rete lenta: la copia dopo 4 secondi invece di 8, e quando i dati nuovi arrivano si offre di aggiornare la pagina)
//
// Ogni lettura riuscita (tavoli, giochi, classifiche, profilo…) resta
// sul telefono. Si chiede sempre prima alla rete: la copia serve solo
// quando la rete non c'è o non risponde, e l'app lo dice con un avviso
// («vedi i dati dell'ultima volta»). Le scritture non passano mai di qui:
// senza rete falliscono come prima, tranne le partite nuove, che hanno
// la loro coda (coda.js). L'archivio delle partite ha la sua memoria
// (archivio.js) e qui non si ripete.
//
// Le copie sono divise per account: su un tablet condiviso nessuno vede
// i dati di chi è entrato prima. All'uscita dall'account si cancellano.

// Le funzioni del database che leggono soltanto. Le altre (salvataggi,
// iscrizioni, unioni…) non si tengono: rispondere «fatto» con una copia
// vecchia sarebbe una bugia.
const FUNZIONI_DI_LETTURA = new Set([
  'ammesso', 'suggerisci_giochi', 'suggerisci_giochi_bga', 'posizioni_tavoli',
  'richieste_da_decidere', 'richieste_tavolo_mie', 'ospiti_simili', 'elenco_unioni',
  'chi_ha', 'chi_ha_gioco', 'ludoteca_cerca', 'ludoteca_dove', 'ludoteca_elenco',
  'puo_gestire_ludoteca', 'tavolo_pubblico', 'non_nell_elenco', 'soci_con_account', 'scheda_iscritto',
  'contatti_elenco', 'ospiti_da_riconoscere', 'partite_di_ospite', 'partite_per_ospite',
])

const ATTESA = 4000                 // oltre, se c'è una copia si mostra quella (e i dati nuovi, quando arrivano, si offrono)
const FRESCA_PER = 120000           // per quanto una risposta arrivata in ritardo vale senza richiederla
const SCADENZA = 45 * 86400000      // le copie non riviste da 45 giorni si buttano
const PESO_MASSIMO = 4_000_000      // caratteri: le risposte enormi non si tengono
const PAUSA_DOPO_GUASTO = 20000     // per quanto, dopo un guasto, si considera la rete giù
// Oltre questi tempi una richiesta si dà per persa: senza, con la rete
// impiantata la pagina restava su «Carico…» (o «Salvo…») per sempre.
const MASSIMO_LETTURA = 25000
const MASSIMO_ACCESSO = 20000       // entrare, rinnovare l'accesso
const MASSIMO_SCRITTURA = 60000     // salvataggi e funzioni del database
const MASSIMO_FILE = 120000         // foto caricate

/* ---------- Stato della rete ---------- */

let giuFino = 0
let datiVecchi = false
// La rete era lenta e si è mostrata la copia; poi la risposta è arrivata:
// l'avviso in cima offre di aggiornare la pagina (StatoRete.jsx).
let nuoviArrivati = false
const fresche = new Map()   // nome della copia -> quando è arrivata la risposta in ritardo
const ascoltatori = new Set()

const inLinea = () => typeof navigator === 'undefined' || navigator.onLine !== false

// Vero quando la rete manca o ha appena fallito: supabase.js lo usa per
// non restare mezzo minuto a ritentare il rinnovo dell'accesso.
export const reteGiu = () => !inLinea() || Date.now() < giuFino

// Per l'avviso in cima all'app.
export const statoRete = () => ({ senzaRete: !inLinea(), datiVecchi, nuoviArrivati })
// La pagina è stata aggiornata (o cambiata): l'offerta non serve più.
export function vistiINuovi() {
  if (!nuoviArrivati) return
  nuoviArrivati = false
  avvisa()
}
export function seguiRete(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}
function avvisa() { for (const f of ascoltatori) f(statoRete()) }
function segna(vecchi) {
  if (datiVecchi === vecchi) return
  datiVecchi = vecchi
  avvisa()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { giuFino = 0; datiVecchi = false; nuoviArrivati = false; avvisa() })
  window.addEventListener('offline', avvisa)
}

/* ---------- Il deposito (IndexedDB, a parte da quello dell'archivio) ---------- */

function apriDb() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') { ko(new Error('niente IndexedDB')); return }
    const r = indexedDB.open('primo-giocatore-rete', 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('risposte')) r.result.createObjectStore('risposte', { keyPath: 'chiave' })
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

let dbAperto = null
async function deposito(modo, fn) {
  try {
    if (!dbAperto) dbAperto = apriDb().catch((e) => { dbAperto = null; throw e })
    const db = await dbAperto
    return await new Promise((ok, ko) => {
      const tx = db.transaction('risposte', modo)
      const r = fn(tx.objectStore('risposte'))
      tx.oncomplete = () => ok(r?.result ?? null)
      tx.onerror = () => ko(tx.error)
      tx.onabort = () => ko(tx.error)
    })
  } catch { return null }   // memoria non disponibile: si va solo di rete
}

// All'uscita dall'account: via tutto.
export const svuotaMemoriaRete = () => deposito('readwrite', (st) => st.clear())

// Una volta per apertura: via le copie che nessuno guarda più.
function pulisci() {
  const limite = Date.now() - SCADENZA
  deposito('readwrite', (st) => {
    const giro = st.openCursor()
    giro.onsuccess = () => {
      const c = giro.result
      if (!c) return
      if ((c.value.salvata_il || 0) < limite) c.delete()
      c.continue()
    }
    return null
  })
}
if (typeof window !== 'undefined') setTimeout(pulisci, 20000)

/* ---------- Quali richieste, e con che nome ---------- */

function impronta(testo) {
  let a = 0x811c9dc5
  let b = 5381
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = (Math.imul(b, 33) + c) | 0
  }
  return `${testo.length}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`
}

// Di chi è la richiesta: sta nel gettone d'accesso che la accompagna.
function utenteDi(intestazioni) {
  try {
    const gettone = (intestazioni.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const pezzo = gettone.split('.')[1]
    if (!pezzo) return 'nessuno'
    const dati = JSON.parse(atob(pezzo.replace(/-/g, '+').replace(/_/g, '/')))
    return dati.sub || 'nessuno'
  } catch { return 'nessuno' }
}

// «Da adesso in poi» cambia a ogni millisecondo: nel nome della copia
// l'ora esatta si toglie, così senza rete si ritrova l'ultima risposta
// alla stessa domanda.
const ADESSO = /\d{4}-\d\d-\d\dT\d\d(?::|%3A)\d\d(?::|%3A)\d\d\.\d{3}Z/gi

function chiaveDi(indirizzo, opzioni) {
  const metodo = (opzioni?.method || 'GET').toUpperCase()
  let percorso
  try {
    const u = new URL(indirizzo)
    percorso = u.pathname
  } catch { return null }
  if (!percorso.startsWith('/rest/v1/')) return null   // accesso, file, tempo reale: mai

  const funzione = percorso.startsWith('/rest/v1/rpc/') ? percorso.slice('/rest/v1/rpc/'.length) : null
  let corpo = ''
  if (funzione) {
    if (!FUNZIONI_DI_LETTURA.has(funzione)) return null
    if (metodo === 'POST') {
      if (opzioni?.body != null && typeof opzioni.body !== 'string') return null
      corpo = opzioni?.body || ''
    } else if (metodo !== 'GET' && metodo !== 'HEAD') return null
  } else if (metodo !== 'GET' && metodo !== 'HEAD') return null

  const intestazioni = new Headers(opzioni?.headers || {})
  // Lo stesso indirizzo può rispondere in forme diverse (una riga sola,
  // con o senza conteggio): fanno parte del nome.
  const forma = [intestazioni.get('Accept') || '', intestazioni.get('Prefer') || '', intestazioni.get('Range') || '',
    intestazioni.get('Accept-Profile') || ''].join('|')
  const domanda = String(indirizzo).replace(ADESSO, 'ADESSO')
  return `${utenteDi(intestazioni)}|${metodo}|${impronta(`${domanda}|${forma}|${corpo}`)}`
}

const INTESTAZIONI_UTILI = ['content-type', 'content-range', 'content-profile', 'preference-applied']

async function mettiDaParte(chiave, risposta) {
  try {
    const corpo = await risposta.text()
    if (corpo.length > PESO_MASSIMO) return
    const intestazioni = INTESTAZIONI_UTILI
      .map((n) => [n, risposta.headers.get(n)])
      .filter(([, v]) => v != null)
    await deposito('readwrite', (st) => st.put({
      chiave, salvata_il: Date.now(), stato: risposta.status, testo: risposta.statusText, intestazioni, corpo,
    }))
  } catch { /* pazienza: resta la copia di prima */ }
}

function ricostruisci(copia) {
  const senzaCorpo = copia.stato === 204 || copia.stato === 205 || copia.stato === 304
  return new Response(senzaCorpo ? null : copia.corpo, {
    status: copia.stato, statusText: copia.testo, headers: copia.intestazioni,
  })
}

const eInterruzione = (e) => e?.name === 'AbortError'

// Lettura fallita e nessuna copia: le pagine mostrano il messaggio così
// com'è (la libreria lo compone come «nome: messaggio»), quindi lo si
// scrive in italiano al posto di «TypeError: Failed to fetch».
const NON_SUL_TELEFONO = 'questi dati non sono ancora sul telefono. Apri l\u2019app con la linea: dopo qualche secondo si salvano da soli.'
function maiVista() {
  const e = new Error(NON_SUL_TELEFONO)
  e.name = 'Senza rete'
  return e
}

/* ---------- Un tempo massimo per ogni richiesta ---------- */

const NON_RISPONDE = 'il server non ha risposto in tempo. Riprova fra poco.'
function tempoScaduto() {
  const e = new Error(NON_RISPONDE)
  e.name = 'Senza rete'
  e.scaduta = true
  return e
}

// Quante richieste sono in viaggio adesso: Prepara.jsx aspetta che
// siano finite prima di aprire la pagina successiva.
let inViaggio = 0
export const richiesteInCorso = () => inViaggio

function massimoPer(url) {
  if (url.includes('/auth/v1/')) return MASSIMO_ACCESSO
  if (url.includes('/storage/v1/')) return MASSIMO_FILE
  return MASSIMO_SCRITTURA
}

// fetch che si interrompe da solo dopo «massimo» millisecondi. Se chi
// chiama ha già un suo segnale di interruzione, vale anche quello.
async function fetchATempo(indirizzo, opzioni, massimo) {
  if (typeof AbortController === 'undefined') return fetch(indirizzo, opzioni)
  const freno = new AbortController()
  let scaduto = false
  const sveglia = setTimeout(() => { scaduto = true; freno.abort() }, massimo)
  const esterno = opzioni?.signal
  const inoltra = () => freno.abort()
  if (esterno) {
    if (esterno.aborted) freno.abort()
    else esterno.addEventListener('abort', inoltra, { once: true })
  }
  inViaggio++
  try {
    return await fetch(indirizzo, { ...(opzioni || {}), signal: freno.signal })
  } catch (e) {
    if (scaduto) throw tempoScaduto()
    throw e
  } finally {
    inViaggio--
    clearTimeout(sveglia)
    esterno?.removeEventListener?.('abort', inoltra)
  }
}

/* ---------- Il fetch che si dà a Supabase ---------- */

export async function fetchConMemoria(indirizzo, opzioni) {
  const url = typeof indirizzo === 'string' ? indirizzo : indirizzo?.url || String(indirizzo)
  const chiave = chiaveDi(url, opzioni)

  // Tutto il resto (scritture, accesso): rete e basta. Si prende solo
  // nota di come va, per sapere se la rete c'è.
  if (!chiave) {
    try {
      const r = await fetchATempo(indirizzo, opzioni, massimoPer(url))
      giuFino = 0
      return r
    } catch (e) {
      if (!eInterruzione(e)) giuFino = Date.now() + PAUSA_DOPO_GUASTO
      throw e
    }
  }

  const copia = deposito('readonly', (st) => st.get(chiave))

  // Senza rete dichiarata non si aspetta nemmeno: subito la copia.
  if (!inLinea()) {
    const c = await copia
    if (c) { segna(true); return ricostruisci(c) }
    // Nessuna copia: si risponde subito di no. Lasciando fallire la
    // richiesta, la libreria la ritenta tre volte e l'errore arriva dopo
    // sette secondi di «Carico…».
    avvisa()
    return new Response(JSON.stringify({ code: 'SENZA_RETE', message: `Senza rete: ${NON_SUL_TELEFONO}` }), {
      status: 504, statusText: 'Senza rete', headers: { 'content-type': 'application/json' },
    })
  }

  // Appena arrivata in ritardo (la pagina intanto mostrava la copia): chi
  // aggiorna la pagina la trova subito, senza rifare l'attesa.
  const arrivata = fresche.get(chiave)
  if (arrivata) {
    fresche.delete(chiave)
    if (Date.now() - arrivata < FRESCA_PER) {
      const c = await copia
      if (c) return ricostruisci(c)
    }
  }

  const rete = fetchATempo(indirizzo, opzioni, MASSIMO_LETTURA).then(
    (r) => ({ r }),
    (e) => ({ e }),
  )
  let sveglia
  const tempo = new Promise((ok) => { sveglia = setTimeout(() => ok({ lenta: true }), ATTESA) })
  let esito = await Promise.race([rete, tempo])
  clearTimeout(sveglia)

  if (esito.lenta) {
    const c = await copia
    if (c) {
      // La rete c'è ma non risponde: si mostra la copia; se poi la
      // risposta arriva, resta da parte per la prossima volta.
      rete.then(async (x) => {
        if (!x.r?.ok) return
        await mettiDaParte(chiave, x.r)
        giuFino = 0
        fresche.set(chiave, Date.now())
        datiVecchi = false
        nuoviArrivati = true
        avvisa()
      })
      segna(true)
      return ricostruisci(c)
    }
    esito = await rete
  }

  if (esito.e) {
    if (eInterruzione(esito.e)) throw esito.e
    giuFino = Date.now() + PAUSA_DOPO_GUASTO
    const c = await copia
    if (c) { segna(true); return ricostruisci(c) }
    // Tempo scaduto: si risponde di no una volta sola. Lasciando fallire la
    // richiesta, la libreria la ritenterebbe altre tre volte.
    if (esito.e.scaduta) {
      avvisa()
      return new Response(JSON.stringify({ code: 'SENZA_RETE', message: `Senza rete: ${NON_RISPONDE}` }), {
        status: 504, statusText: 'Senza rete', headers: { 'content-type': 'application/json' },
      })
    }
    throw maiVista()
  }

  const r = esito.r
  // Accesso scaduto mentre la rete sembrava giù (supabase.js): la
  // copia va bene lo stesso, e alla prossima richiesta l'accesso si rinnova.
  if (r.status === 401) {
    giuFino = 0
    const c = await copia
    if (c) return ricostruisci(c)
    return r
  }
  giuFino = 0
  if (r.ok) {
    segna(false)
    mettiDaParte(chiave, r.clone())
  }
  return r
}
