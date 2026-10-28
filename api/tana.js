// Primo Giocatore - notizie dalla Tana dei Goblin nazionale
// v1.1.0 - 202610281700 (fino a 10 notizie, tutte quelle del feed, per la Home)
//
// Legge il feed ufficiale https://www.goblins.net/rss.xml e restituisce
// solo quello che serve alla striscia "Dalla Tana": titolo, riga
// d'introduzione, immagine, data e link all'articolo sul sito.
// Il browser non può leggere il feed direttamente (il sito non lo
// permette da altri domini), per questo passa da qui.
//
// Come si usa:
//   /api/tana            → le ultime notizie (il feed ne porta 10)
//
// Il risultato resta in memoria un'ora, qui e sulla rete di Vercel:
// goblins.net viene interpellato al massimo una volta all'ora.

import { XMLParser } from 'fast-xml-parser'

const FEED = 'https://www.goblins.net/rss.xml'
const SITO = 'https://www.goblins.net'
const QUANTE = 10
const DURATA_CACHE = 1000 * 60 * 60 // un'ora

let memoria = null // { quando, notizie }

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true })

// Il feed porta l'HTML dentro l'XML: dopo la prima decodifica restano
// entità come &#039; &rsquo; &nbsp; da sciogliere a mano.
const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\u2019', nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C',
  hellip: '\u2026', ndash: '\u2013', mdash: '\u2014', laquo: '\u00AB', raquo: '\u00BB',
  egrave: 'è', eacute: 'é', agrave: 'à', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Egrave: 'È', Agrave: 'À',
}

function decodifica(testo) {
  let t = String(testo ?? '')
  // Due giri: nel feed alcune entità sono codificate due volte (&amp;#39;).
  for (let giro = 0; giro < 2; giro++) {
    t = t
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&([a-z]+);/gi, (tutto, nome) => ENTITA[nome] ?? tutto)
  }
  return t
}

// Testo da mostrare: entità sciolte, apostrofi tipografici, spazi in ordine.
function sciogli(testo) {
  return decodifica(testo)
    .replace(/([\p{L}\d])'([\p{L}\d])/gu, '$1\u2019$2')
    .replace(/(^|\s)'(\d)/g, '$1\u2019$2')
    .replace(/\s+/g, ' ')
    .trim()
}

function senzaTag(html) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
}

function leggiVoce(voce) {
  const descrizione = decodifica(voce.description)
  const img = descrizione.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null
  const intro = descrizione.match(/class=["']feed_intro["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
  const link = String(voce.link ?? '')
  const data = voce.pubDate ? new Date(voce.pubDate) : null
  return {
    titolo: sciogli(senzaTag(voce.title)),
    intro: intro ? sciogli(senzaTag(intro)) : '',
    immagine: img ? new URL(img.trim(), SITO).href : null,
    link: link.startsWith('http') ? link : new URL(link, SITO).href,
    data: data && !Number.isNaN(data.getTime()) ? data.toISOString() : null,
  }
}

async function leggiFeed() {
  const risposta = await fetch(FEED, {
    headers: { 'User-Agent': 'PrimoGiocatore/1.0 (app della Tana dei Goblin Roma)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!risposta.ok) throw new Error(`goblins.net ha risposto ${risposta.status}`)
  const xml = await risposta.text()
  const dati = parser.parse(xml)
  let voci = dati?.rss?.channel?.item || []
  if (!Array.isArray(voci)) voci = [voci]
  return voci
    .map(leggiVoce)
    .filter((n) => n.titolo && n.link.startsWith(SITO))
    .slice(0, QUANTE)
}

export default async function handler(req, res) {
  try {
    if (!memoria || Date.now() - memoria.quando > DURATA_CACHE) {
      memoria = { quando: Date.now(), notizie: await leggiFeed() }
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ notizie: memoria.notizie })
  } catch (e) {
    // Se il sito non risponde si usa l'ultima lettura riuscita, se c'è.
    if (memoria) return res.status(200).json({ notizie: memoria.notizie, vecchie: true })
    return res.status(502).json({ errore: 'Le notizie della Tana non sono raggiungibili ora.' })
  }
}
