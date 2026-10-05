// Primo Giocatore - Primeggio: il peso dei giochi da BoardGameGeek
// v1.0.0 - 202610061200
//
// Il peso BGG (averageweight, da 1 a 5) misura la complessità di un
// gioco. Il Primeggio lo usa per far contare di più, nell'IPG globale,
// i giochi più impegnativi.
//
// Lo usa solo il server (api/primeggio.js): serve il token BGG, che non
// deve finire nel browser. BGG accetta 20 giochi per chiamata e chiede
// circa 5 secondi fra una chiamata e l'altra, quindi i pesi mancanti si
// recuperano un po' alla volta, entro un tempo massimo per ogni ricalcolo.

import { XMLParser } from 'fast-xml-parser'

const BGG = 'https://boardgamegeek.com/xmlapi2'
const PAUSA = 5000
const PER_CHIAMATA = 20

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: true })
const elenco = (x) => (x == null ? [] : Array.isArray(x) ? x : [x])
const attesa = (ms) => new Promise((r) => setTimeout(r, ms))

async function chiama(ids, token) {
  const intestazioni = { 'User-Agent': 'PrimoGiocatore/1.0 (app per gruppi di gioco)' }
  if (token) intestazioni.Authorization = `Bearer ${token}`
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const r = await fetch(`${BGG}/thing?id=${ids.join(',')}&type=boardgame&stats=1`, { headers: intestazioni })
    // 202: BGG prepara i dati; 429: troppe richieste. In entrambi i casi si riprova.
    if (r.status === 202 || r.status === 429) { await attesa(PAUSA); continue }
    if (!r.ok) throw new Error(`BGG ha risposto ${r.status}`)
    return parser.parse(await r.text())
  }
  throw new Error('BGG non risponde, riprovo al prossimo ricalcolo')
}

// bggIds: numeri BGG dei giochi senza peso.
// Restituisce Map(bgg_id -> peso). Peso 0 = su BGG nessuno l'ha votato:
// si salva comunque, così non lo si richiede ogni notte.
export async function leggiPesiBgg(bggIds, { token, scadenza }) {
  const pesi = new Map()
  for (let i = 0; i < bggIds.length; i += PER_CHIAMATA) {
    if (Date.now() + PAUSA > scadenza) break   // il resto alla prossima volta
    if (i > 0) await attesa(PAUSA)
    const gruppo = bggIds.slice(i, i + PER_CHIAMATA)
    const dati = await chiama(gruppo, token)
    for (const item of elenco(dati?.items?.item)) {
      const p = Number(item?.statistics?.ratings?.averageweight?.value)
      pesi.set(Number(item.id), Number.isFinite(p) ? Math.round(p * 100) / 100 : 0)
    }
    // Un id che BGG non restituisce (gioco rimosso) vale 0: non si ritenta.
    for (const id of gruppo) if (!pesi.has(id)) pesi.set(id, 0)
  }
  return pesi
}
