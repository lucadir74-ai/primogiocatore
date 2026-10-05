// Primo Giocatore - Primeggio: ricalcolo dell'IPG sul server
// v1.1.0 - 202610061200
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

import { createClient } from '@supabase/supabase-js'
import { calcolaPrimeggio } from '../src/primeggioCalcolo.js'
import { leggiPesiBgg } from '../src/pesoBgg.js'

export const config = { maxDuration: 60 }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGINA = 1000
const TEMPO_PESI = 30000   // al massimo 30 secondi per i pesi, su 60 disponibili

async function autorizzato(req, db) {
  const intestazione = req.headers.authorization || ''
  if (process.env.CRON_SECRET && intestazione === `Bearer ${process.env.CRON_SECRET}`) return true
  const token = intestazione.replace(/^Bearer /, '')
  if (!token) return false
  const { data } = await db.auth.getUser(token)
  if (!data?.user) return false
  const { data: p } = await db.from('profili').select('organizzatore').eq('id', data.user.id).single()
  return Boolean(p?.organizzatore)
}

async function tutteLePartite(db) {
  const tutte = []
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db.from('partite')
      .select(`
        id, giocata_il, registrata_da, tipo_punteggio,
        giochi ( id, bgg_id, peso_bgg ),
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

export default async function handler(req, res) {
  if (!URL || !SERVIZIO) return res.status(500).json({ errore: 'Manca SUPABASE_SERVICE_ROLE_KEY su Vercel.' })
  const db = createClient(URL, SERVIZIO, { auth: { persistSession: false } })

  try {
    if (!(await autorizzato(req, db))) return res.status(401).json({ errore: 'Non autorizzato.' })

    const inizio = Date.now()
    const partite = await tutteLePartite(db)
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
    const ora = new Date().toISOString()

    // Si riscrive tutto: prima si cancella, poi si inserisce a blocchi.
    const { error: e1 } = await db.from('ipg').delete().gte('partite', 0)
    if (e1) throw e1
    for (let i = 0; i < righe.length; i += 500) {
      const { error } = await db.from('ipg').insert(righe.slice(i, i + 500).map((r) => ({ ...r, aggiornato_il: ora })))
      if (error) throw error
    }

    return res.status(200).json({
      partite: partite.length,
      righe: righe.length,
      pesi_recuperati: pesi.recuperati,
      pesi_mancanti: pesi.mancanti,
      secondi: Math.round((Date.now() - inizio) / 100) / 10,
    })
  } catch (e) {
    return res.status(500).json({ errore: e.message })
  }
}
