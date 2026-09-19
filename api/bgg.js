// Primo Giocatore - intermediario verso BoardGameGeek
// v1.5.0 - 202609221700
//
// Il browser chiama questo indirizzo, questo chiama BGG.
// Serve perché BGG risponde in XML, limita la frequenza delle richieste
// e per la collezione risponde 202 ("sto preparando, richiama fra poco").
//
// Come si usa:
//   /api/bgg?azione=cerca&q=scythe
//   /api/bgg?azione=dettagli&id=169786,224517
//   /api/bgg?azione=collezione&utente=lucadir74
//   /api/bgg?azione=partite&utente=lucadir74&pagina=1

import { XMLParser } from 'fast-xml-parser'

const BGG = 'https://boardgamegeek.com/xmlapi2'

// Da autunno 2025 BGG richiede l'autorizzazione su quasi tutte le chiamate.
// Il token si ottiene registrando l'applicazione su
// https://boardgamegeek.com/applications
// Va messo fra le variabili d'ambiente di Vercel come BGG_TOKEN
// (senza prefisso VITE_: deve restare sul server, non finire nel browser).
const TOKEN = process.env.BGG_TOKEN

// BGG chiede circa 5 secondi fra una richiesta e l'altra.
const PAUSA_MINIMA = 5000
let ultimaChiamata = 0

// Memoria della singola istanza: evita di ripetere la stessa domanda a BGG.
const cache = new Map()
const DURATA_CACHE = 1000 * 60 * 60 * 12 // 12 ore

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
})

function attesa(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function chiamaBGG(percorso) {
  const daCache = cache.get(percorso)
  if (daCache && Date.now() - daCache.quando < DURATA_CACHE) {
    return daCache.xml
  }

  // Rispetta la pausa richiesta da BGG.
  const passato = Date.now() - ultimaChiamata
  if (passato < PAUSA_MINIMA) await attesa(PAUSA_MINIMA - passato)

  let risposta
  // La collezione può rispondere 202: significa "richiama fra poco".
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    ultimaChiamata = Date.now()
    const intestazioni = { 'User-Agent': 'PrimoGiocatore/1.0 (app per gruppi di gioco)' }
    // "Bearer" seguito da uno spazio, nessun due punti.
    if (TOKEN) intestazioni.Authorization = `Bearer ${TOKEN}`

    risposta = await fetch(`${BGG}${percorso}`, { headers: intestazioni })
    if (risposta.status === 202) {
      await attesa(3000)
      continue
    }
    break
  }

  if (risposta.status === 202) {
    const e = new Error('BGG sta ancora preparando i dati. Riprova fra qualche secondo.')
    e.codice = 202
    throw e
  }
  if (risposta.status === 401) {
    const e = new Error(
      TOKEN
        ? 'BGG ha rifiutato il token. Controlla che sia scritto per intero e senza spazi.'
        : 'Manca il token di BoardGameGeek. Registra l\u2019applicazione su boardgamegeek.com/applications e aggiungi BGG_TOKEN fra le variabili di Vercel.'
    )
    e.codice = 401
    throw e
  }
  if (!risposta.ok) {
    const e = new Error(`BoardGameGeek ha risposto ${risposta.status}.`)
    e.codice = risposta.status
    throw e
  }

  const xml = await risposta.text()
  cache.set(percorso, { xml, quando: Date.now() })
  return xml
}

const elenco = (x) => (x == null ? [] : Array.isArray(x) ? x : [x])

// Il nome principale. BGG lo restituisce in tre forme diverse a seconda
// della chiamata: testo puro, oggetto con "value", oppure oggetto con
// attributi e il testo dentro "#text" (è il caso della collezione).
function nomePrincipale(nome) {
  const nomi = elenco(nome)
  const primario = nomi.find((n) => n?.type === 'primary') || nomi[0]
  if (primario == null) return null
  if (typeof primario === 'string') return primario
  if (typeof primario === 'number') return String(primario)
  return primario.value ?? primario['#text'] ?? null
}

function semplificaGioco(item) {
  return {
    bgg_id: Number(item.id),
    nome: nomePrincipale(item.name),
    anno: item.yearpublished?.value ?? null,
    min_giocatori: item.minplayers?.value ?? null,
    max_giocatori: item.maxplayers?.value ?? null,
    durata_minuti: item.playingtime?.value ?? null,
    // La miniatura per gli elenchi, l'immagine piena per la pagina
    // del tavolo: la prima sgranerebbe a tutta larghezza.
    immagine_url: item.thumbnail ?? item.image ?? null,
    immagine_grande: item.image ?? item.thumbnail ?? null,
    tipo: item.type ?? 'boardgame',
  }
}

export default async function handler(req, res) {
  const { azione, q, id, utente, pagina } = req.query

  try {
    if (azione === 'cerca') {
      if (!q || q.trim().length < 2) {
        return res.status(400).json({ errore: 'Scrivi almeno due lettere.' })
      }
      const xml = await chiamaBGG(
        `/search?query=${encodeURIComponent(q.trim())}&type=boardgame`
      )
      const dati = parser.parse(xml)
      const risultati = elenco(dati?.items?.item)
        .map((i) => ({
          bgg_id: Number(i.id),
          nome: nomePrincipale(i.name),
          anno: i.yearpublished?.value ?? i.yearpublished ?? null,
        }))
        .filter((g) => g.nome)
      return res.status(200).json({ risultati })
    }

    if (azione === 'dettagli') {
      if (!id) return res.status(400).json({ errore: 'Manca l\u2019id del gioco.' })
      // BGG accetta al massimo 20 id per volta.
      const ids = String(id).split(',').slice(0, 20).join(',')
      const xml = await chiamaBGG(`/thing?id=${ids}&type=boardgame`)
      const dati = parser.parse(xml)
      const giochi = elenco(dati?.items?.item).map(semplificaGioco).filter((g) => g.nome)
      return res.status(200).json({ giochi })
    }

    if (azione === 'collezione') {
      if (!utente) return res.status(400).json({ errore: 'Manca il nome utente BGG.' })
      // Le espansioni vengono escluse: BGG le etichetta in modo scorretto
      // se mescolate ai giochi base.
      const xml = await chiamaBGG(
        `/collection?username=${encodeURIComponent(utente)}` +
          '&own=1&excludesubtype=boardgameexpansion&brief=1'
      )
      const dati = parser.parse(xml)
      if (dati?.errors) {
        return res.status(404).json({ errore: 'Utente BGG non trovato.' })
      }
      const giochi = elenco(dati?.items?.item)
        .map((i) => ({
          bgg_id: Number(i.objectid),
          nome: nomePrincipale(i.name),
          anno: i.yearpublished ?? null,
        }))
        // Senza nome la riga è inutile e il database la rifiuterebbe.
        .filter((g) => g.nome && Number.isFinite(g.bgg_id))
      return res.status(200).json({ giochi, totale: giochi.length })
    }

    if (azione === 'partite') {
      if (!utente) return res.status(400).json({ errore: 'Manca il nome utente BGG.' })
      // BGG restituisce cento partite per pagina.
      const n = Math.max(1, Number(pagina) || 1)
      const xml = await chiamaBGG(
        `/plays?username=${encodeURIComponent(utente)}&page=${n}`
      )
      const dati = parser.parse(xml)
      if (dati?.errors) return res.status(404).json({ errore: 'Utente BGG non trovato.' })

      const partite = elenco(dati?.plays?.play).map((p) => ({
        bgg_play_id: Number(p.id),
        data: p.date ?? null,
        durata_minuti: Number(p.length) || null,
        luogo: p.location || null,
        note: typeof p.comments === 'string' ? p.comments : (p.comments?.['#text'] ?? null),
        incompleta: p.incomplete === 1 || p.incomplete === '1',
        senza_punteggi: p.nowinstats === 1 || p.nowinstats === '1',
        gioco: p.item
          ? { bgg_id: Number(p.item.objectid), nome: p.item.name ?? null }
          : null,
        giocatori: elenco(p.players?.player).map((g) => ({
          nome: g.name ?? g.username ?? 'Sconosciuto',
          username: g.username || null,
          punteggio: g.score === '' || g.score == null ? null : Number(g.score),
          posizione: Number(g.startposition) || null,
          vincitore: g.win === 1 || g.win === '1',
          colore: g.color || null,
        })),
      }))

      return res.status(200).json({
        partite,
        pagina: n,
        totale: Number(dati?.plays?.total) || partite.length,
      })
    }

    return res.status(400).json({ errore: 'Azione sconosciuta.' })
  } catch (e) {
    const codice = e.codice === 202 ? 202 : e.codice === 401 ? 401 : 502
    return res.status(codice).json({ errore: e.message })
  }
}
