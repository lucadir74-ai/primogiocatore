// Primo Giocatore - intermediario verso BoardGameGeek
// v1.9.0 - 202610260130 (collezione: anche le espansioni, chieste a parte e segnate come tali)
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
//   /api/bgg?azione=partite&utente=lucadir74&dal=2026-09-01   (solo da quella data)

import { XMLParser } from 'fast-xml-parser'
import { createClient } from '@supabase/supabase-js'

// Con molte richieste in coda la pausa di 5 secondi fra una e l'altra
// richiede tempo: il massimo consentito su Vercel Hobby.
export const config = { maxDuration: 60 }

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY

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

// fresco: salta la memoria. Serve per le partite, che devono arrivare
// appena registrate e non dopo dodici ore.
async function chiamaBGG(percorso, { fresco = false } = {}) {
  const daCache = fresco ? null : cache.get(percorso)
  if (daCache && Date.now() - daCache.quando < DURATA_CACHE) {
    return daCache.xml
  }

  let risposta
  // La collezione può rispondere 202: significa "richiama fra poco".
  // 429: troppe richieste, si aspetta e si riprova.
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    // Rispetta la pausa richiesta da BGG. Ogni richiesta prenota il suo
    // turno prima di aspettare: con più richieste insieme sulla stessa
    // copia del server, prima partivano tutte nello stesso istante.
    const turno = Math.max(Date.now(), ultimaChiamata + PAUSA_MINIMA)
    ultimaChiamata = turno
    if (turno > Date.now()) await attesa(turno - Date.now())
    const intestazioni = { 'User-Agent': 'PrimoGiocatore/1.0 (app per gruppi di gioco)' }
    // "Bearer" seguito da uno spazio, nessun due punti.
    if (TOKEN) intestazioni.Authorization = `Bearer ${TOKEN}`

    risposta = await fetch(`${BGG}${percorso}`, { headers: intestazioni })
    if (risposta.status === 202) {
      await attesa(3000)
      continue
    }
    if (risposta.status === 429) {
      ultimaChiamata = Date.now() + PAUSA_MINIMA   // rallenta anche le altre in coda
      continue
    }
    break
  }

  if (risposta.status === 429) {
    const e = new Error('BoardGameGeek è sovraccarico di richieste. Riprova fra un minuto.')
    e.codice = 429
    throw e
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

// BGG conserva i titoli già scritti alla maniera dell'HTML: l'apostrofo di
// "Darwin's Journey" arriva come &#039;. Dentro l'XML quella & è a sua volta
// protetta, quindi dopo la lettura resta il codice in chiaro, che finirebbe
// nel database così com'è. Qui i codici tornano caratteri veri.
const NOMINATI = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', deg: '\u00b0',
  eacute: '\u00e9', egrave: '\u00e8', uuml: '\u00fc', ouml: '\u00f6', auml: '\u00e4',
}

function ripulisci(testo) {
  if (typeof testo !== 'string' || !testo.includes('&')) return testo
  let prima = testo
  // Due passate: i titoli di BGG possono avere la & a sua volta protetta.
  for (let giro = 0; giro < 2; giro++) {
    const dopo = prima.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (intero, corpo) => {
      if (corpo[0] === '#') {
        const n = corpo[1] === 'x' || corpo[1] === 'X'
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : intero
      }
      const c = NOMINATI[corpo.toLowerCase()]
      return c === undefined ? intero : c
    })
    if (dopo === prima) break
    prima = dopo
  }
  return prima.trim()
}

// Il nome principale. BGG lo restituisce in tre forme diverse a seconda
// della chiamata: testo puro, oggetto con "value", oppure oggetto con
// attributi e il testo dentro "#text" (è il caso della collezione).
function nomePrincipale(nome) {
  const nomi = elenco(nome)
  const primario = nomi.find((n) => n?.type === 'primary') || nomi[0]
  if (primario == null) return null
  if (typeof primario === 'string') return ripulisci(primario)
  if (typeof primario === 'number') return String(primario)
  return ripulisci(primario.value ?? primario['#text'] ?? null)
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
  const { azione, q, id, utente, pagina, dal } = req.query

  // Solo per chi è entrato nell'app: senza questo controllo chiunque
  // poteva usare il nostro token BGG, e se BGG lo blocca si fermano
  // ricerca giochi e import per tutti.
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token || !SUPABASE || !SERVIZIO) {
    return res.status(401).json({ errore: 'Entra nell\u2019app per usare la ricerca su BGG.' })
  }
  try {
    const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false } })
    const { data, error } = await db.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ errore: 'Sessione scaduta: esci e rientra nell\u2019app.' })
    }
  } catch {
    return res.status(503).json({ errore: 'Controllo dell\u2019accesso non riuscito. Riprova fra poco.' })
  }

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
      // Solo numeri separati da virgole: niente parametri aggiunti di nascosto.
      if (!/^\d+(,\d+)*$/.test(String(id))) return res.status(400).json({ errore: 'Id del gioco non valido.' })
      // BGG accetta al massimo 20 id per volta.
      const ids = String(id).split(',').slice(0, 20).join(',')
      // Anche le espansioni: chi gioca un'espansione da sola (es. Hitster:
      // Movies & TV Soundtracks) altrimenti non avrebbe mai la copertina.
      const xml = await chiamaBGG(`/thing?id=${ids}&type=boardgame,boardgameexpansion`)
      const dati = parser.parse(xml)
      const giochi = elenco(dati?.items?.item).map(semplificaGioco).filter((g) => g.nome)
      return res.status(200).json({ giochi })
    }

    if (azione === 'collezione') {
      if (!utente) return res.status(400).json({ errore: 'Manca il nome utente BGG.' })
      // Giochi base ed espansioni si chiedono separati: mescolati, BGG
      // etichetta le espansioni come giochi base.
      const radice = `/collection?username=${encodeURIComponent(utente)}&own=1&brief=1`
      const datiBase = parser.parse(await chiamaBGG(`${radice}&excludesubtype=boardgameexpansion`))
      if (datiBase?.errors) {
        return res.status(404).json({ errore: 'Utente BGG non trovato.' })
      }
      const datiEsp = parser.parse(await chiamaBGG(`${radice}&subtype=boardgameexpansion`))
      const leggi = (dati, espansione) => elenco(dati?.items?.item)
        .map((i) => ({
          bgg_id: Number(i.objectid),
          nome: nomePrincipale(i.name),
          anno: i.yearpublished ?? null,
          espansione,
        }))
        // Senza nome la riga è inutile e il database la rifiuterebbe.
        .filter((g) => g.nome && Number.isFinite(g.bgg_id))
      const base = leggi(datiBase, false)
      const idBase = new Set(base.map((g) => g.bgg_id))
      const espansioni = leggi(datiEsp, true).filter((g) => !idBase.has(g.bgg_id))
      const giochi = [...base, ...espansioni]
      return res.status(200).json({
        giochi,
        totale: giochi.length,
        unici: new Set(giochi.map((g) => g.bgg_id)).size,
        espansioni: new Set(espansioni.map((g) => g.bgg_id)).size,
      })
    }

    if (azione === 'partite') {
      if (!utente) return res.status(400).json({ errore: 'Manca il nome utente BGG.' })
      // BGG restituisce cento partite per pagina.
      const n = Math.max(1, Number(pagina) || 1)
      const daData = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? `&mindate=${dal}` : ''
      const xml = await chiamaBGG(
        `/plays?username=${encodeURIComponent(utente)}&page=${n}${daData}`,
        { fresco: true }
      )
      const dati = parser.parse(xml)
      if (dati?.errors) return res.status(404).json({ errore: 'Utente BGG non trovato.' })

      const partite = elenco(dati?.plays?.play).map((p) => ({
        bgg_play_id: Number(p.id),
        data: p.date ?? null,
        durata_minuti: Number(p.length) || null,
        luogo: ripulisci(p.location) || null,
        note: ripulisci(typeof p.comments === 'string' ? p.comments : (p.comments?.['#text'] ?? null)),
        incompleta: p.incomplete === 1 || p.incomplete === '1',
        senza_punteggi: p.nowinstats === 1 || p.nowinstats === '1',
        gioco: p.item
          ? { bgg_id: Number(p.item.objectid), nome: ripulisci(p.item.name) ?? null }
          : null,
        giocatori: elenco(p.players?.player).map((g) => ({
          nome: ripulisci(g.name ?? g.username ?? 'Sconosciuto'),
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
    const codice = [202, 401, 429].includes(e.codice) ? e.codice : 502
    return res.status(codice).json({ errore: e.message })
  }
}
