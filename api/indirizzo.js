// Primo Giocatore - da un indirizzo (o una zona) alle coordinate
// v1.0.0 - 202610282000 (prima versione: Nominatim di OpenStreetMap)
//
// Serve in due momenti, sempre su richiesta di chi usa l'app:
// - chi pubblica un tavolo scrive l'indirizzo e preme «Trova»;
// - chi cerca i tavoli vicini scrive una zona invece di usare il GPS.
// Niente ricerca mentre si scrive: la regola d'uso di Nominatim la vieta.
//
// Come si usa:
//   /api/indirizzo?q=via%20appia%20nuova%201%20roma   → fino a 3 risultati
//
// Regole d'uso di Nominatim (operations.osmfoundation.org/policies/nominatim):
// al massimo una richiesta al secondo per tutta l'app, un User-Agent che
// identifichi l'app, risultati tenuti in memoria, citazione di OpenStreetMap
// (la mostra l'app sotto i risultati). Il servizio si cambia senza toccare
// il codice con la variabile d'ambiente GEOCODER_URL.

import { createClient } from '@supabase/supabase-js'

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org'
const AGENTE = 'PrimoGiocatore/1.0 (app della Tana dei Goblin Roma; +https://primogiocatore.vercel.app)'

const PAUSA_MINIMA = 1100
let ultimaChiamata = 0
const cache = new Map()
const DURATA_CACHE = 1000 * 60 * 60 * 24 * 7 // una settimana

const attesa = (ms) => new Promise((r) => setTimeout(r, ms))

function leggiRisultato(r) {
  const a = r.address || {}
  const citta = a.city || a.town || a.village || a.municipality || null
  const quartiere = a.suburb || a.quarter || a.neighbourhood || a.city_district || null
  const strada = [a.road || a.pedestrian || a.square, a.house_number].filter(Boolean).join(' ')
  const zona = [...new Set([quartiere, citta].filter(Boolean))].join(', ') || null
  return {
    indirizzo: [strada, citta].filter(Boolean).join(', ') || r.display_name,
    zona,
    descrizione: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }
}

async function cerca(q) {
  const chiave = q.toLowerCase()
  const daCache = cache.get(chiave)
  if (daCache && Date.now() - daCache.quando < DURATA_CACHE) return daCache.risultati

  const aspetta = ultimaChiamata + PAUSA_MINIMA - Date.now()
  if (aspetta > 0) await attesa(aspetta)
  ultimaChiamata = Date.now()

  const p = new URLSearchParams({
    q, format: 'jsonv2', addressdetails: '1', limit: '3',
    countrycodes: 'it', 'accept-language': 'it',
  })
  const r = await fetch(`${BASE}/search?${p}`, {
    headers: { 'User-Agent': AGENTE, Referer: 'https://primogiocatore.vercel.app' },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`il servizio delle mappe ha risposto ${r.status}`)
  const dati = await r.json()
  const risultati = (Array.isArray(dati) ? dati : []).map(leggiRisultato)
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))
  cache.set(chiave, { quando: Date.now(), risultati })
  return risultati
}

export default async function handler(req, res) {
  // Solo per chi è entrato nell'app: il servizio è gratuito e condiviso.
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token || !SUPABASE || !SERVIZIO) {
    return res.status(401).json({ errore: 'Entra nell\u2019app per cercare un indirizzo.' })
  }
  try {
    const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false } })
    const { data, error } = await db.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ errore: 'Sessione scaduta: esci e rientra nell\u2019app.' })
  } catch {
    return res.status(503).json({ errore: 'Controllo dell\u2019accesso non riuscito. Riprova fra poco.' })
  }

  const q = String(req.query.q || '').trim().slice(0, 200)
  if (q.length < 3) return res.status(400).json({ errore: 'Scrivi almeno via e città, o il nome di una zona.' })

  try {
    const risultati = await cerca(q)
    return res.status(200).json({ risultati })
  } catch (e) {
    return res.status(502).json({ errore: `Ricerca dell\u2019indirizzo non riuscita: ${e.message}.` })
  }
}
