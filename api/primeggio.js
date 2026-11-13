// Primo Giocatore - Primeggio: ricalcolo dell'IPG sul server
// v1.3.0 - 202611131200 (partite in forma compatta, giochi letti una volta, di notte niente ricalcolo se nulla è cambiato)
//
// Legge TUTTE le partite (con la chiave di servizio, che vede oltre la
// riservatezza), calcola l'IPG e riscrive la tabella ipg. Le partite
// non escono da qui: nella tabella finiscono solo i numeri.
//
// Chi può avviarlo:
// - Vercel, ogni notte (vercel.json), con CRON_SECRET;
// - un organizzatore dall'app, con il suo accesso.
//
// Variabili d'ambiente su Vercel (senza prefisso VITE_):
//   SUPABASE_SERVICE_ROLE_KEY  chiave di servizio di Supabase
//   CRON_SECRET                una stringa a caso, lunga
//   BGG_TOKEN                  lo stesso già usato da api/bgg.js
//
// Prima del calcolo recupera da BGG il peso dei giochi che ancora non
// l'hanno, entro un tempo massimo: quelli che restano arrivano al
// ricalcolo successivo e intanto valgono come un gioco medio.
// L'indirizzo del database è lo stesso dell'app (VITE_SUPABASE_URL).
//
// Il traffico verso Supabase era quasi tutto qui. Ora:
// - le partite arrivano dalla funzione primeggio_partite
//   (supabase/primeggio_leggero.sql) in forma compatta e si ricompongono
//   qui (src/primeggioDati.js); se la funzione non c'è ancora si legge
//   come prima;
// - i giochi si leggono una volta sola, non dentro ogni partita;
// - di notte, se dall'ultimo ricalcolo nessuna partita è cambiata o è
//   stata cancellata, non si ricalcola (vedi daRicalcolare). Il tasto
//   degli organizzatori ricalcola sempre.

import { createClient } from '@supabase/supabase-js'
import { calcolaPrimeggio } from '../src/primeggioCalcolo.js'
import { leggiPesiBgg } from '../src/pesoBgg.js'
import { decodificaBlocco, idGiochi, aggiungiGiochi } from '../src/primeggioDati.js'

export const config = { maxDuration: 60 }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGINA = 1000
const BLOCCO = 2000        // partite per ogni chiamata a primeggio_partite
const TEMPO_PESI = 30000   // al massimo 30 secondi per i pesi, su 60 disponibili
// L'ora scritta nella tabella è un po' indietro rispetto all'inizio della
// lettura: una partita salvata mentre si legge risulta comunque «dopo»,
// e la notte seguente si ricalcola.
const MARGINE = 5 * 60000
// Anche senza partite nuove, almeno una volta a settimana si ricalcola:
// porta nella tabella i nomi e le immagini dei giochi cambiati nel
// frattempo e i nomi degli iscritti presenti solo come ospiti collegati.
const AL_MASSIMO_OGNI = 7 * 86400000

// 'notte' (CRON_SECRET), 'organizzatore', oppure null.
async function autorizzato(req, db) {
  const intestazione = req.headers.authorization || ''
  if (process.env.CRON_SECRET && intestazione === `Bearer ${process.env.CRON_SECRET}`) return 'notte'
  const token = intestazione.replace(/^Bearer /, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  if (!data?.user) return null
  const { data: p } = await db.from('profili').select('organizzatore').eq('id', data.user.id).single()
  return p?.organizzatore ? 'organizzatore' : null
}

// La funzione del database non c'è (script SQL non ancora lanciato).
const funzioneMancante = (e) => e?.code === 'PGRST202' || e?.code === '42883'

// Come prima: le partite in forma piena, a pagine di mille.
export async function partiteComePrima(db) {
  const tutte = []
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db.from('partite')
      .select(`
        id, giocata_il, registrata_da, tipo_punteggio,
        giochi ( id, bgg_id, peso_bgg, nome, immagine_url ),
        partecipazioni ( utente_id, ospite_id, punteggio_totale, posizione, vincitore,
                         ospiti:ospite_id ( utente_collegato ) )
      `)
      .order('id')
      .range(da, da + PAGINA - 1)
    if (error) throw error
    tutte.push(...data)
    if (data.length < PAGINA) return tutte
  }
}

async function leggiGiochi(db, ids) {
  const giochi = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('giochi')
      .select('id, bgg_id, peso_bgg, nome, immagine_url').in('id', ids.slice(i, i + 200))
    if (error) throw error
    giochi.push(...data)
  }
  return giochi
}

// Le partite in forma compatta, un blocco dopo l'altro (in ordine di id),
// poi i giochi una volta sola. Restituisce anche quanti byte sono arrivati.
export async function tutteLePartite(db) {
  const partite = []
  let dopo = null
  let byte = 0
  for (;;) {
    const { data, error } = await db.rpc('primeggio_partite', { p_dopo: dopo, p_limite: BLOCCO })
    if (error) {
      if (dopo === null && funzioneMancante(error)) return { partite: await partiteComePrima(db), compatta: false }
      throw error
    }
    byte += JSON.stringify(data).length
    partite.push(...decodificaBlocco(data))
    if (!data?.quante || data.quante < BLOCCO || !data.ultimo) break
    dopo = data.ultimo
  }
  aggiungiGiochi(partite, await leggiGiochi(db, idGiochi(partite)))
  return { partite, compatta: true, byte }
}

// Di notte: serve ricalcolare? Sì se dopo l'ultimo ricalcolo una partita
// è cambiata (o è nuova: anche i giocatori, gli ospiti collegati e i nomi
// degli iscritti la segnano come cambiata) o è stata cancellata. Nel
// dubbio, o con un errore, si ricalcola. Restituisce il motivo, oppure
// null se si può saltare.
export async function daRicalcolare(db, adesso = Date.now()) {
  try {
    const { data: ultima, error: e1 } = await db.from('ipg')
      .select('aggiornato_il').order('aggiornato_il', { ascending: false }).limit(1)
    if (e1) throw e1
    const dal = ultima?.[0]?.aggiornato_il
    if (!dal) return 'tabella vuota'
    if (adesso - Date.parse(dal) > AL_MASSIMO_OGNI) return 'ultimo ricalcolo più vecchio di una settimana'

    const { data: cambiate, error: e2 } = await db.from('partite')
      .select('id').gt('aggiornata_il', dal).limit(1)
    if (e2) throw e2
    if (cambiate.length) return 'partite cambiate'

    const { data: cancellate, error: e3 } = await db.from('partite_cancellate')
      .select('id').gt('cancellata_il', dal).limit(1)
    if (e3) throw e3
    if (cancellate.length) return 'partite cancellate'

    // Giochi giocati che hanno il numero BGG ma ancora non il peso: il
    // ricalcolo prova a recuperarlo, come faceva ogni notte.
    const { data: senzaPeso, error: e4 } = await db.from('giochi')
      .select('id').not('bgg_id', 'is', null).is('peso_bgg', null).limit(1000)
    if (e4) throw e4
    if (senzaPeso.length >= 1000) return 'molti giochi senza peso'
    for (let i = 0; i < senzaPeso.length; i += 200) {
      const { data, error } = await db.from('partite')
        .select('id').in('gioco_id', senzaPeso.slice(i, i + 200).map((g) => g.id)).limit(1)
      if (error) throw error
      if (data.length) return 'giochi senza peso BGG'
    }

    // Giochi che in classifica non hanno ancora il nome e nel frattempo
    // l'hanno avuto.
    const { data: senzaNome, error: e5 } = await db.from('ipg')
      .select('gioco_id').neq('gioco_id', '').is('gioco_nome', null).limit(1000)
    if (e5) throw e5
    const ids = [...new Set(senzaNome.map((r) => r.gioco_id))]
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from('giochi')
        .select('id').in('id', ids.slice(i, i + 200)).not('nome', 'is', null).limit(1)
      if (error) throw error
      if (data.length) return 'giochi con il nome nuovo'
    }
    return null
  } catch (e) {
    return `nel dubbio (${e.message})`
  }
}

// L'ora del database, non quella di Vercel: è con quella che vengono
// segnate le partite cambiate.
async function oraDelDatabase(db) {
  const { data, error } = await db.rpc('archivio_ora')
  const t = !error && data ? Date.parse(data) : NaN
  return Number.isFinite(t) ? t : Date.now()
}

// I giochi delle partite che hanno un numero BGG ma non ancora il peso.
// Il peso trovato si salva nel database e si scrive anche nelle partite
// già lette, così questo stesso ricalcolo lo usa subito.
async function completaPesi(db, partite, scadenza) {
  const senza = new Map()   // bgg_id -> [oggetti giochi da aggiornare]
  for (const p of partite) {
    const g = p.giochi
    if (!g?.bgg_id || g.peso_bgg != null) continue
    if (!senza.has(g.bgg_id)) senza.set(g.bgg_id, [])
    senza.get(g.bgg_id).push(g)
  }
  if (senza.size === 0) return { recuperati: 0, mancanti: 0 }

  let pesi = new Map()
  try {
    pesi = await leggiPesiBgg([...senza.keys()], { token: process.env.BGG_TOKEN, scadenza })
  } catch (e) {
    // BGG giù: il Primeggio si calcola lo stesso, con il peso neutro.
    console.warn('Pesi BGG non recuperati:', e.message)
  }

  for (const [bggId, peso] of pesi) {
    const { error } = await db.from('giochi').update({ peso_bgg: peso }).eq('bgg_id', bggId)
    if (error) throw error
    for (const g of senza.get(bggId) || []) g.peso_bgg = peso
  }
  return { recuperati: pesi.size, mancanti: senza.size - pesi.size }
}

// Il calcolo vero e proprio, senza la parte web: lo usa anche la prova
// in locale. Restituisce il riepilogo e le righe scritte.
export async function ricalcola(db) {
  const inizio = Date.now()
  const ora = new Date((await oraDelDatabase(db)) - MARGINE).toISOString()
  const { partite, compatta, byte } = await tutteLePartite(db)
  const pesi = await completaPesi(db, partite, inizio + TEMPO_PESI)
  const righe = calcolaPrimeggio(partite)

  // Nome e colore vanno nella tabella: chi guarda la classifica può
  // non avere accesso al profilo di persone con cui non ha giocato.
  const ids = [...new Set(righe.map((r) => r.profilo_id))]
  const profili = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('profili')
      .select('id, nome, nickname, colore').in('id', ids.slice(i, i + 200))
    if (error) throw error
    for (const p of data) profili.set(p.id, p)
  }
  for (const r of righe) {
    const p = profili.get(r.profilo_id)
    r.nome = (p?.nickname && p.nickname.trim()) || p?.nome || 'Sconosciuto'
    r.colore = p?.colore || null
  }

  // Lo stesso per il gioco: la pagina Classifiche mostra anche giochi
  // che chi guarda non ha mai giocato, e che quindi non può leggere.
  const giochi = new Map()
  for (const p of partite) if (p.giochi?.id) giochi.set(String(p.giochi.id), p.giochi)
  for (const r of righe) {
    const g = r.gioco_id ? giochi.get(String(r.gioco_id)) : null
    r.gioco_nome = g?.nome || null
    r.gioco_immagine = g?.immagine_url || null
  }

  // Si riscrive tutto: prima si cancella, poi si inserisce a blocchi.
  const { error: e1 } = await db.from('ipg').delete().gte('partite', 0)
  if (e1) throw e1
  for (let i = 0; i < righe.length; i += 500) {
    const { error } = await db.from('ipg').insert(righe.slice(i, i + 500).map((r) => ({ ...r, aggiornato_il: ora })))
    if (error) throw error
  }

  return {
    partite: partite.length,
    righe: righe.length,
    pesi_recuperati: pesi.recuperati,
    pesi_mancanti: pesi.mancanti,
    lettura: compatta ? 'compatta' : 'come prima',
    kb_partite: byte ? Math.round(byte / 1024) : undefined,
    secondi: Math.round((Date.now() - inizio) / 100) / 10,
  }
}

export default async function handler(req, res) {
  if (!URL || !SERVIZIO) return res.status(500).json({ errore: 'Manca SUPABASE_SERVICE_ROLE_KEY su Vercel.' })
  const db = createClient(URL, SERVIZIO, { auth: { persistSession: false } })

  try {
    const chi = await autorizzato(req, db)
    if (!chi) return res.status(401).json({ errore: 'Non autorizzato.' })

    if (chi === 'notte') {
      const motivo = await daRicalcolare(db)
      if (!motivo) return res.status(200).json({ saltato: true, motivo: 'nessuna partita cambiata dall’ultimo ricalcolo' })
    }

    return res.status(200).json(await ricalcola(db))
  } catch (e) {
    return res.status(500).json({ errore: e.message })
  }
}
