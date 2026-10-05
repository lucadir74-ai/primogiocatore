// Primo Giocatore - Primeggio: ricalcolo dell'IPG sul server
// v1.0.0 - 202610042300
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
// L'indirizzo del database è lo stesso dell'app (VITE_SUPABASE_URL).

import { createClient } from '@supabase/supabase-js'
import { calcolaPrimeggio } from '../src/primeggioCalcolo.js'

export const config = { maxDuration: 60 }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGINA = 1000

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
        giochi ( id ),
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

export default async function handler(req, res) {
  if (!URL || !SERVIZIO) return res.status(500).json({ errore: 'Manca SUPABASE_SERVICE_ROLE_KEY su Vercel.' })
  const db = createClient(URL, SERVIZIO, { auth: { persistSession: false } })

  try {
    if (!(await autorizzato(req, db))) return res.status(401).json({ errore: 'Non autorizzato.' })

    const inizio = Date.now()
    const partite = await tutteLePartite(db)
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
      secondi: Math.round((Date.now() - inizio) / 100) / 10,
    })
  } catch (e) {
    return res.status(500).json({ errore: e.message })
  }
}
