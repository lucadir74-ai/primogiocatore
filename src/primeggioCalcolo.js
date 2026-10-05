// Primo Giocatore - Primeggio: il calcolo dell'IPG
// v1.1.0 - 202610061200
//
// Primeggio è il sistema di classifica; IPG (Indice Primo Giocatore)
// è il numero di ciascuno, per gioco e globale.
//
// Il motore è openskill (metodo Weng-Lin, della famiglia di TrueSkill):
// ogni giocatore ha una forza stimata (mu) e un'incertezza (sigma).
// Dopo ogni partita, tutti al tavolo si aggiornano in base alla
// posizione finale e alla forza degli avversari. Per l'IPG si usa il
// valore prudente mu - 3·sigma: chi ha poche partite non va in cima
// per fortuna.
//
// Questo file è solo calcolo: nessun database. Lo usa la funzione
// del server che legge tutte le partite e scrive la tabella ipg.

import { rating, rate, ordinal } from 'openskill'
import { unisciCondivise } from './condivise.js'

export const MIN_PARTITE_GIOCO = 5
export const MIN_PARTITE_GLOBALE = 20

// IPG globale: ogni gioco conta in proporzione a peso BGG × partite.
// Le partite contano fino a un tetto, così chi gioca centinaia di volte
// lo stesso gioco non schiaccia tutto il resto. Un gioco senza peso
// (fatto a mano, o mai votato su BGG) vale come un gioco medio.
export const TETTO_PARTITE = 20
export const PESO_NEUTRO = 2.5
export const pesoEffettivo = (peso) => (Number(peso) > 0 ? Number(peso) : PESO_NEUTRO)

// Scala: chi non ha mai giocato vale 1000; un giocatore medio con
// molte partite si assesta intorno ai 1500.
export const ipgDa = (r) => Math.round(1000 + 25 * ordinal(r))

const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || (x.ospite_id ? `ospite:${x.ospite_id}` : null)
const eAccount = (k) => k && !String(k).startsWith('ospite:')

// La classifica di una partita come numeri di posto (1 = primo, pari
// merito = stesso numero). In ordine di affidabilità:
// 1. le posizioni salvate (partite registrate nell'app o da BG Stats);
// 2. i punteggi, nel verso indicato dal vincitore (se il vincitore ha
//    il punteggio più basso, vince chi fa meno);
// 3. solo il vincitore: lui primo, tutti gli altri pari al secondo.
export function posti(righe) {
  if (righe.every((r) => r.posizione != null)) return righe.map((r) => Number(r.posizione))

  const conPunti = righe.every((r) => r.punteggio_totale != null)
  const vincitori = righe.filter((r) => r.vincitore)
  if (conPunti && righe.length > 1) {
    const punti = righe.map((r) => Number(r.punteggio_totale))
    const max = Math.max(...punti)
    const min = Math.min(...punti)
    let alto = true
    if (vincitori.length) {
      const pv = Number(vincitori[0].punteggio_totale)
      if (pv === min && pv !== max) alto = false
    }
    return punti.map((p) => 1 + punti.filter((q) => (alto ? q > p : q < p)).length)
  }

  if (vincitori.length) return righe.map((r) => (r.vincitore ? 1 : 2))
  return null   // nessuna informazione su chi ha vinto: la partita non conta
}

// partite: [{ id, giocata_il, registrata_da, tipo_punteggio, giochi: { id, peso_bgg },
//             partecipazioni: [{ utente_id, ospite_id, punteggio_totale,
//                                posizione, vincitore, ospiti: { utente_collegato } }] }]
// Restituisce le righe della tabella ipg (solo account).
export function calcolaPrimeggio(partite) {
  const valide = unisciCondivise(partite)
    .filter((p) => p.giochi?.id && p.tipo_punteggio !== 'coop')
    .sort((a, b) => String(a.giocata_il).localeCompare(String(b.giocata_il)))

  const perGioco = new Map()   // gioco -> Map(identità -> { r, partite })
  const pesi = new Map()       // gioco -> peso effettivo
  for (const p of valide) {
    // Una persona una volta sola per partita.
    const viste = new Set()
    const righe = []
    for (const x of p.partecipazioni || []) {
      const k = identita(x)
      if (!k || viste.has(k)) continue
      viste.add(k)
      righe.push({ ...x, k })
    }
    if (righe.length < 2) continue
    const rank = posti(righe)
    if (!rank) continue

    const gioco = String(p.giochi.id)
    pesi.set(gioco, pesoEffettivo(p.giochi.peso_bgg))
    const tab = perGioco.get(gioco) || new Map()
    perGioco.set(gioco, tab)
    const voci = righe.map((r) => {
      const v = tab.get(r.k) || { r: rating(), partite: 0 }
      tab.set(r.k, v)
      return v
    })
    const nuovi = rate(voci.map((v) => [v.r]), { rank })
    voci.forEach((v, i) => { v.r = nuovi[i][0]; v.partite++ })
  }

  const righeIpg = []
  const globale = new Map()   // account -> { somma, pesoTot, partite }

  for (const [gioco, tab] of perGioco) {
    const qui = []
    for (const [k, v] of tab) {
      if (!eAccount(k)) continue
      const ipg = ipgDa(v.r)
      qui.push({ profilo_id: k, gioco_id: gioco, ipg, mu: v.r.mu, sigma: v.r.sigma, partite: v.partite })
      const g = globale.get(k) || { somma: 0, pesoTot: 0, partite: 0 }
      const w = pesi.get(gioco) * Math.min(v.partite, TETTO_PARTITE)
      g.somma += ipg * w
      g.pesoTot += w
      g.partite += v.partite
      globale.set(k, g)
    }
    // Il posto in classifica solo per chi ha abbastanza partite.
    qui.filter((r) => r.partite >= MIN_PARTITE_GIOCO)
      .sort((a, b) => b.ipg - a.ipg)
      .forEach((r, i) => { r.posizione = i + 1 })
    righeIpg.push(...qui)
  }

  // Globale: media degli IPG per gioco, pesata su peso BGG × partite
  // (con il tetto). Per entrare in classifica contano le partite vere.
  const glob = [...globale].map(([k, g]) => ({
    profilo_id: k, gioco_id: '', ipg: Math.round(g.somma / g.pesoTot),
    mu: null, sigma: null, partite: g.partite,
  }))
  glob.filter((r) => r.partite >= MIN_PARTITE_GLOBALE)
    .sort((a, b) => b.ipg - a.ipg)
    .forEach((r, i) => { r.posizione = i + 1 })
  righeIpg.push(...glob)

  return righeIpg.map((r) => ({ posizione: null, ...r }))
}
