// Primo Giocatore - misure dei tempi sul telefono
// v1.0.0 - 202611041200
//
// Serve a capire dove l'app rallenta davvero, sul dispositivo vero:
// - le fasi di lavoro (sincronizzazioni, ricerche) con quanto durano;
// - i blocchi dello schermo (compiti da oltre 50 ms), con la pagina aperta
//   e le fasi che erano in corso in quel momento.
// Tutto resta sul telefono (localStorage), non parte verso nessun server:
// lo si legge e si copia da Dati e import → Tempi dell'app.

const CHIAVE = 'primo-giocatore:misure'
const MASSIMO = 60

let contesto = ''           // la pagina aperta
const attive = new Map()    // fasi in corso
const recenti = []          // fasi appena finite: { nome, t0, t1 }
let contatore = 0
let avviato = false

function leggi() {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null') || { fasi: [], blocchi: [] } } catch { return { fasi: [], blocchi: [] } }
}
function scrivi(m) {
  try {
    m.fasi = m.fasi.slice(-MASSIMO)
    m.blocchi = m.blocchi.slice(-MASSIMO)
    localStorage.setItem(CHIAVE, JSON.stringify(m))
  } catch { /* senza memoria si misura solo per questa apertura */ }
}

export function segnaPagina(nome) { contesto = nome }

// const fine = inizia('nome'); ...lavoro...; fine('dettaglio facoltativo')
export function inizia(nome) {
  const id = ++contatore
  const t0 = performance.now()
  attive.set(id, { nome, t0 })
  return (dettaglio = '') => {
    const t1 = performance.now()
    attive.delete(id)
    recenti.push({ nome, t0, t1 })
    if (recenti.length > 100) recenti.shift()
    // Le fasi brevissime (controlli che escono subito) non dicono niente.
    if (t1 - t0 < 50 && !dettaglio) return
    const m = leggi()
    m.fasi.push({ q: new Date().toISOString(), nome, ms: Math.round(t1 - t0), d: dettaglio ? String(dettaglio).slice(0, 80) : '' })
    scrivi(m)
  }
}

// Una durata già misurata (per esempio dal disegno di una pagina).
export function registra(nome, ms, dettaglio = '') {
  const t1 = performance.now()
  recenti.push({ nome, t0: t1 - ms, t1 })
  if (recenti.length > 100) recenti.shift()
  const m = leggi()
  m.fasi.push({ q: new Date().toISOString(), nome, ms: Math.round(ms), d: dettaglio ? String(dettaglio).slice(0, 80) : '' })
  scrivi(m)
}

// Il lavoro intero, comunque finisca.
export async function misura(nome, lavoro) {
  const fine = inizia(nome)
  try {
    const r = await lavoro()
    fine()
    return r
  } catch (e) {
    fine('errore: ' + (e?.message || e))
    throw e
  }
}

export function avviaMisure() {
  if (avviato) return
  avviato = true
  try {
    if (!('PerformanceObserver' in window)) return
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return
    const osservatore = new PerformanceObserver((lista) => {
      const m = leggi()
      for (const e of lista.getEntries()) {
        const fine = e.startTime + e.duration
        const fasi = new Set()
        for (const f of attive.values()) if (f.t0 <= fine) fasi.add(f.nome)
        for (const f of recenti) if (f.t0 <= fine && f.t1 >= e.startTime) fasi.add(f.nome)
        m.blocchi.push({
          q: new Date().toISOString(),
          ms: Math.round(e.duration),
          dopo: Math.round(e.startTime / 100) / 10,   // secondi dall'apertura della pagina
          pagina: contesto,
          fasi: [...fasi].join(', '),
        })
      }
      scrivi(m)
    })
    osservatore.observe({ type: 'longtask', buffered: true })
  } catch { /* il browser non li dà: restano solo le fasi */ }
}

export function leggiMisure() { return leggi() }
export function azzeraMisure() { try { localStorage.removeItem(CHIAVE) } catch { /* niente */ } }

export function descriviDispositivo() {
  try {
    const c = navigator.connection
    return [
      `${navigator.hardwareConcurrency || '?'} core`,
      navigator.deviceMemory ? `${navigator.deviceMemory} GB` : null,
      c?.effectiveType ? `rete ${c.effectiveType}` : null,
      (navigator.userAgent.match(/(Android [\d.]+|iPhone OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+)/) || [])[0],
      (navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/) || [])[0],
    ].filter(Boolean).join(' · ')
  } catch { return '' }
}
