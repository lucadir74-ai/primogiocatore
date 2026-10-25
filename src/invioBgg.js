// Primo Giocatore - invio delle partite a BoardGameGeek (lato app)
// v1.0.0 - 202610252330
//
// Il lavoro vero lo fa il server (api/bgginvio.js): qui solo le chiamate
// e il «quando». Si prova all'apertura dell'app, dopo ogni partita
// salvata e dopo gli import da BGA. Le partite in attesa le tiene il
// database, quindi niente si perde se manca la rete: parte la volta dopo.

import { supabase } from './supabase'

export async function chiamaInvioBgg(azione, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/bgginvio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ azione, ...extra }),
  })
  let dati = null
  try { dati = await r.json() } catch { /* niente */ }
  if (!dati) throw new Error(`Il server non ha risposto (HTTP ${r.status}).`)
  if (dati.errore) throw new Error(dati.errore)
  return dati
}

// Chi non ha collegato BGG non deve pagare una chiamata a ogni apertura:
// il telefono se lo ricorda, e ricontrolla una volta al giorno (potrebbe
// averlo collegato da un altro dispositivo).
const CHIAVE = 'primo-giocatore:invio-bgg'
export function segnaCollegatoBgg(profiloId, si) {
  try { localStorage.setItem(`${CHIAVE}:${profiloId}`, JSON.stringify({ si, quando: Date.now() })) } catch { /* niente */ }
}
function sembraScollegato(profiloId) {
  try {
    const x = JSON.parse(localStorage.getItem(`${CHIAVE}:${profiloId}`) || 'null')
    return x && x.si === false && Date.now() - x.quando < 86400000
  } catch { return false }
}

let invioInCorso = null

// { inviate, aggiornate, eliminate, errori, scaduta } oppure null se
// BGG non è collegato. Non lancia errori: chi chiama non deve fermarsi.
export async function inviaABggSeServe(profilo) {
  if (!profilo?.id || sembraScollegato(profilo.id)) return null
  if (invioInCorso) return invioInCorso
  invioInCorso = (async () => {
    const totale = { inviate: 0, aggiornate: 0, eliminate: 0, errori: 0, scaduta: false }
    for (let giro = 0; giro < 10; giro++) {
      const r = await chiamaInvioBgg('invia')
      if (r.collegato === false) { segnaCollegatoBgg(profilo.id, false); return null }
      segnaCollegatoBgg(profilo.id, true)
      if (r.scaduta) { totale.scaduta = true; break }
      for (const k of ['inviate', 'aggiornate', 'eliminate', 'errori']) totale[k] += r[k] || 0
      if (!r.continua) break
    }
    return totale
  })()
  try { return await invioInCorso } catch { return null } finally { invioInCorso = null }
}
