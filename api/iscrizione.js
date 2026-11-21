// Primo Giocatore - iscrizione dei soci
// v1.0.0 - 202611212000
//
// Come vuole l'associazione (indicazioni privacy, punto 2):
// - il socio scrive il suo nick oppure l'email con cui si è associato;
// - se è nell'elenco soci, il link per attivare l'account va all'email
//   DELL'ELENCO, non a un indirizzo scritto da chi si iscrive: anche se
//   qualcuno usa il nick di un altro, l'account lo attiva solo il vero socio;
// - a schermo si dice solo «ti abbiamo mandato una mail» oppure «non
//   risulti fra i soci»: l'email trovata non esce mai da qui;
// - limite ai tentativi (supabase/privacy_fase3.sql).
//
// Se il socio ha già un account, invece dell'invito parte il link per
// scegliere una password nuova: il messaggio a schermo è lo stesso.
//
//   POST /api/iscrizione   { chi: "nick o email" }
//   → { esito: "inviata" | "non_socio" | "ambiguo" }   (429 se troppi tentativi)

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY

// Dove riporta il link della mail: solo indirizzi dell'app.
const SITO = 'https://www.tdgroma.it'
const AMMESSI = [/^https:\/\/(www\.)?tdgroma\.it$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/]

// Impronta: nel database non finiscono né l'IP né quello che si è scritto.
const impronta = (t) => createHash('sha256').update(`${SERVIZIO || ''}|${t}`).digest('hex').slice(0, 32)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
  if (!SUPABASE || !SERVIZIO) return res.status(503).json({ errore: 'Iscrizione non configurata sul server.' })

  let corpo = req.body
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo) } catch { corpo = {} } }
  const chi = String(corpo?.chi || '').trim().slice(0, 120)
  if (chi.length < 2) return res.status(400).json({ errore: 'Scrivi il tuo nick o la tua email.' })

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()
  const origine = String(req.headers.origin || '')
  const ritorno = AMMESSI.some((r) => r.test(origine)) ? origine : SITO

  const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    const { data: puoi, error: e1 } = await db.rpc('tentativo_iscrizione', { p_ip: impronta(ip), p_chiave: impronta(chi.toLowerCase()) })
    if (e1) throw e1
    if (!puoi) return res.status(429).json({ errore: 'Troppi tentativi. Riprova fra un’ora o contatta l’associazione.' })

    const { data: trovati, error: e2 } = await db.rpc('socio_per_iscrizione', { p_chi: chi })
    if (e2) throw e2
    if (!trovati?.length) return res.status(200).json({ esito: 'non_socio' })
    // Lo stesso nick per soci con email diverse: serve l'email.
    if (trovati.length > 1) return res.status(200).json({ esito: 'ambiguo' })

    const s = trovati[0]
    if (s.ha_account) {
      const { error } = await db.auth.resetPasswordForEmail(s.email, { redirectTo: ritorno })
      if (error) throw error
    } else {
      const { error } = await db.auth.admin.inviteUserByEmail(s.email, {
        redirectTo: ritorno,
        data: { nickname: s.nickname || '', nome: s.nome || '', cognome: s.cognome || '', da_elenco_soci: true },
      })
      if (error) throw error
    }
    return res.status(200).json({ esito: 'inviata' })
  } catch (e) {
    // Nel registro di Vercel senza l'email: basta il messaggio.
    console.error('iscrizione:', e?.message || e)
    return res.status(502).json({ errore: 'Invio non riuscito. Riprova fra poco o contatta l’associazione.' })
  }
}
