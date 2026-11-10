// Primo Giocatore - la partita che stai registrando c'è già?
// v1.0.0 - 202611101800
//
// Gli import riconoscono da soli le partite già presenti. La partita
// scritta a mano no: se era già arrivata da Board Game Arena o da BGG,
// o se l'aveva già registrata un altro del tavolo, nasceva un doppione.
// Qui si guarda, prima di salvare, fra le partite che vedi (le tue e
// quelle in cui giochi): stesso gioco, stesso giorno o uno accanto,
// stesso numero di giocatori, e poi
// - gli stessi punteggi (nel giorno accanto solo se poco comuni), oppure
// - a una delle due mancano i punteggi, stesso giorno e almeno un
//   giocatore in comune.
// Non decide da solo: l'app chiede, e si può registrare lo stesso.

import { supabase } from './supabase.js'

const GIORNO = 86400000
const ATTESA = 5000   // con poca rete non si tiene fermo il salvataggio

// I giorni in cui può cadere un istante: quello del telefono e quello
// «a orologio fermo» (gli import salvano l'ora così com'è scritta).
function giorniDi(istante) {
  const d = new Date(istante)
  if (Number.isNaN(d.getTime())) return []
  const p = (n) => String(n).padStart(2, '0')
  const qui = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return [...new Set([qui, d.toISOString().slice(0, 10)])]
}
const numero = (g) => Math.round(Date.parse(`${g}T00:00:00Z`) / GIORNO)

const punti = (righe) => (righe || [])
  .map((x) => x.punteggio_totale)
  .filter((v) => v != null && v !== '')
  .map(Number)
  .sort((a, b) => a - b)

const distintivi = (v) => v.length >= 2 && v.reduce((t, n) => t + Math.abs(n), 0) >= 20

// nuova: { giocoId, giocataIl, giocatori: [{ utente_id, ospite_id, punteggio_totale }] }
// Restituisce la partita che sembra la stessa ({ id, giocata_il,
// registrata_da, chiave_esterna, bga_tavolo }) oppure null.
export function stessaPartita(nuova, esistenti) {
  const giorni = giorniDi(nuova.giocataIl).map(numero)
  const mieiPunti = punti(nuova.giocatori)
  const chi = new Set(nuova.giocatori.flatMap((g) => [g.utente_id, g.ospite_id]).filter(Boolean))

  let vicina = null
  for (const p of esistenti || []) {
    const righe = p.partecipazioni || []
    if (righe.length !== nuova.giocatori.length) continue
    const suoi = giorniDi(p.giocata_il).map(numero)
    const distanza = Math.min(...giorni.flatMap((a) => suoi.map((b) => Math.abs(a - b))))
    if (!(distanza <= 1)) continue

    const altri = punti(righe)
    if (mieiPunti.length && altri.length) {
      const uguali = mieiPunti.length === altri.length && mieiPunti.every((v, i) => v === altri[i])
      if (!uguali) continue
      if (distanza === 0) return p
      if (distintivi(mieiPunti) && !vicina) vicina = p
      continue
    }
    const comune = righe.some((x) => chi.has(x.utente_id) || chi.has(x.ospite_id)
      || (x.ospiti?.utente_collegato && chi.has(x.ospiti.utente_collegato)))
    if (distanza === 0 && comune) return p
  }
  return vicina
}

export async function cercaGiaRegistrata(nuova) {
  const giorni = giorniDi(nuova.giocataIl)
  if (!nuova.giocoId || !giorni.length) return null
  const centro = Math.min(...giorni.map(numero))
  const dal = new Date((centro - 1) * GIORNO).toISOString()
  const al = new Date((centro + 3) * GIORNO).toISOString()

  const lettura = supabase.from('partite')
    .select('id, giocata_il, registrata_da, chiave_esterna, bga_tavolo, partecipazioni ( utente_id, ospite_id, punteggio_totale, ospiti:ospite_id ( utente_collegato ) )')
    .eq('gioco_id', nuova.giocoId).gte('giocata_il', dal).lt('giocata_il', al)
    .limit(200)
    .then(({ data, error }) => (error ? null : stessaPartita(nuova, data)))
  const scaduta = new Promise((ok) => setTimeout(() => ok(null), ATTESA))
  // Il controllo è un aiuto: se non riesce, la partita si salva e basta.
  try { return await Promise.race([lettura, scaduta]) } catch { return null }
}

// Da dove arriva la copia trovata, per dirlo a chi sta registrando.
export function origineDi(p) {
  if (p.bga_tavolo != null || /^bga:/.test(p.chiave_esterna || '')) return 'Board Game Arena'
  if (/^bgg:/.test(p.chiave_esterna || '')) return 'BoardGameGeek'
  if (/^bgstats:/.test(p.chiave_esterna || '')) return 'BG Stats'
  return null
}
