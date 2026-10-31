// Primo Giocatore - sincronizzazione programmata con Board Game Arena
// v1.2.0 - 202610312000 (più leggera: prima si guarda su BGA, e si entra come l'iscritto solo se c'è qualcosa da importare)
//
// Gira sul server, chiamata da Supabase (pg_cron) ogni 10 minuti: così
// le partite BGA entrano anche a telefono spento, su iPhone come su
// Android. Ogni iscritto con BGA collegato viene sincronizzato al
// massimo una volta all'ora; a ogni chiamata si servono quelli fermi da
// più tempo, finché c'è tempo (gli iscritti sono scaglionati, BGA non
// riceve una raffica di accessi tutti insieme).
//
// Per ogni iscritto:
// 1. si entra in Primo Giocatore COME LUI (link di accesso generato dal
//    server, mai inviato per email): valgono le sue regole di accesso,
//    esattamente come nell'app;
// 2. si leggono da BGA le partite nuove (o lo storico, a pezzi, se è un
//    iscritto nuovo: si riprende dalla pagina salvata in bga_esiti);
// 3. si importano solo le partite sicure, con lo stesso codice dell'app
//    (src/bga.js). Quelle incerte restano da confermare in Dati e import;
// 4. se ha attivato l'invio a BGG, si mandano subito anche a BGG.
//
// Protezioni:
// - risponde solo a chi conosce SINCRO_SECRET (variabile di Vercel);
// - una sessione BGA scaduta non si ritenta: aspetta che l'iscritto
//   ricolleghi BGA;
// - se BGA risponde male per 3 iscritti di fila, il giro si ferma.

import { createClient } from '@supabase/supabase-js'
import { leggi } from './bga.js'
import { invia } from './bgginvio.js'
import { usaClient } from '../src/supabase.js'
import { archivio, baseSegnalibro, importaSicure } from '../src/bga.js'

export const config = { maxDuration: 60 }

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUBBLICA = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SEGRETO = process.env.SINCRO_SECRET
const VERSIONE = 'server 1.2.0'

const OGNI = 55 * 60000          // ogni iscritto al massimo una volta all'ora
const NUOVO_ISCRITTO_FINO = 30000 // dopo 30 secondi non si comincia un altro iscritto
const LETTURA_FINO = 40000        // dopo 40 secondi si smette di leggere da BGA
const FINE = 52000                // tutto chiuso entro 52 secondi (limite 60)
const MAX_ERRORI_DI_FILA = 3

// Entra in Primo Giocatore come l'iscritto, senza email e senza password.
async function accediCome(db, utenteId) {
  const { data: u, error: e1 } = await db.auth.admin.getUserById(utenteId)
  if (e1 || !u?.user?.email) throw new Error('account non trovato')
  const { data: link, error: e2 } = await db.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
  if (e2 || !link?.properties?.hashed_token) throw new Error('accesso non riuscito')
  const client = createClient(SUPABASE, PUBBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: e3 } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' })
  if (e3) throw new Error(`accesso non riuscito (${e3.message})`)
  return client
}

async function sincronizzaUno(db, utenteId, precedente, partenza) {
  const tempo = () => Date.now() - partenza
  const esito = (campi) => db.from('bga_esiti').upsert(
    { utente_id: utenteId, quando: new Date().toISOString(), versione: VERSIONE, dal_server: true, ...campi },
    { onConflict: 'utente_id' })

  let nuove = 0
  let inSospeso = 0
  await esito({ in_corso: true, importate: 0, in_sospeso: 0, errore: null, storico: 'avvio (server)' })

  // Prima, senza entrare come l'iscritto: c'è qualcosa di nuovo su BGA?
  // Quasi sempre no, e il giro finisce qui in un paio di secondi.
  const { data: ultima } = await db.from('partite').select('giocata_il')
    .eq('registrata_da', utenteId).not('bga_tavolo', 'is', null)
    .order('giocata_il', { ascending: false }).limit(1)
  const ultimaBga = ultima?.[0]?.giocata_il ? Math.floor(new Date(ultima[0].giocata_il).getTime() / 1000) : 0
  let primaLettura = null
  if (ultimaBga) {
    const r = await leggi(db, utenteId, { fino: ultimaBga - 7 * 86400, da: 1 })
    if (r.scaduta) {
      await esito({ in_corso: false, importate: 0, in_sospeso: 0, errore: 'sessione BGA scaduta', storico: 'solo le novità' })
      return { scaduta: true }
    }
    if (r.collegato === false) {
      await esito({ in_corso: false, importate: 0, in_sospeso: 0, errore: 'BGA non collegato', storico: 'solo le novità' })
      return { nuove: 0 }
    }
    const numeri = [...new Set((r.tavoli || []).map((t) => Number(t.t)).filter(Boolean))]
    let giaDentro = new Set()
    if (numeri.length) {
      const { data: presenti, error: e } = await db.from('partite').select('bga_tavolo')
        .eq('registrata_da', utenteId).in('bga_tavolo', numeri)
      if (e) throw e
      giaDentro = new Set((presenti || []).map((x) => Number(x.bga_tavolo)))
    }
    if (!r.continua && numeri.every((n) => giaDentro.has(n))) {
      await esito({ in_corso: false, importate: 0, in_sospeso: 0, sospese_dal: null, errore: null, storico: 'solo le novità' })
      return { nuove: 0, leggero: true }
    }
    primaLettura = r   // c'è da fare: si usa questa lettura, senza ripeterla
  }

  const client = await accediCome(db, utenteId)
  usaClient(client)
  try {
    const { data: profilo, error } = await client.from('profili').select('*').eq('id', utenteId).single()
    if (error) throw error

    const base = await baseSegnalibro(profilo)
    const storico = !base.fino
    const fino = storico ? 0 : base.fino - 7 * 86400
    let da = storico ? (precedente?.pagina_storico || 1) : 1
    const dal = fino ? new Date((fino - 30 * 86400) * 1000).toISOString().slice(0, 10) : null
    const memoria = { righe: null }
    const aPunto = () => (storico ? `storico fino a pagina ${da}` : 'solo le novità')

    let finito = false
    while (tempo() < LETTURA_FINO) {
      // Il primo giro delle novità è già stato letto qui sopra.
      const r = (primaLettura && !storico && da === 1) ? primaLettura : await leggi(db, utenteId, { fino, da })
      primaLettura = null
      if (r.scaduta) {
        await esito({ in_corso: false, importate: nuove, in_sospeso: inSospeso, errore: 'sessione BGA scaduta', storico: aPunto() })
        return { scaduta: true }
      }
      if (r.collegato === false) {
        await esito({ in_corso: false, importate: nuove, in_sospeso: inSospeso, errore: 'BGA non collegato', storico: aPunto() })
        return { nuove }
      }
      if (r.tavoli?.length) {
        if (!memoria.righe) memoria.righe = await archivio(profilo.id, dal)
        const e = await importaSicure(profilo, { giocatore: r.giocatore, nome: r.nome, tavoli: r.tavoli, completo: false }, memoria)
        nuove += e.nuove
        inSospeso += e.inSospeso
      }
      if (!r.continua) { finito = true; break }
      da = r.continua
      if (storico) await esito({ in_corso: true, importate: nuove, in_sospeso: inSospeso, errore: null, storico: aPunto(), pagina_storico: da })
    }

    await esito({
      in_corso: false, importate: nuove, in_sospeso: inSospeso, errore: null,
      // Da quando rileggere per ritrovarle (null: tutto lo storico).
      sospese_dal: inSospeso && fino ? new Date(fino * 1000).toISOString() : null,
      storico: finito ? (storico ? 'storico completo' : 'solo le novità') : `${aPunto()}, riprende al prossimo giro`,
      pagina_storico: finito ? null : (storico ? da : null),
    })
  } finally {
    usaClient(null)
  }

  // Le partite appena entrate vanno subito anche a BGG, se l'iscritto
  // ha attivato l'invio (altrimenti invia risponde «non collegato»).
  const resta = FINE - tempo() - 5000
  if (resta > 8000) {
    try { await invia(db, utenteId, Math.min(resta, 25000)) } catch (e) {
      console.log(`[sincro] invio BGG ${utenteId.slice(0, 8)}: ${String(e?.message || e).slice(0, 120)}`)
    }
  }
  return { nuove }
}

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!SEGRETO || token !== SEGRETO) return res.status(401).json({ errore: 'Non autorizzato' })
  if (!SUPABASE || !SERVIZIO || !PUBBLICA) return res.status(500).json({ errore: 'Mancano le variabili di Supabase su Vercel.' })

  const partenza = Date.now()
  const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false } })

  // Chi ha BGA collegato e una sessione ancora valida.
  const { data: sessioni, error } = await db.from('bga_sessioni').select('utente_id, ultimo_errore')
  if (error) return res.status(500).json({ errore: error.message })
  const { data: esiti } = await db.from('bga_esiti').select('utente_id, quando, in_corso, pagina_storico')
  const perUtente = new Map((esiti || []).map((e) => [e.utente_id, e]))
  const ora = Date.now()
  const daFare = (sessioni || [])
    .filter((s) => s.ultimo_errore !== 'scaduta')
    .map((s) => ({ id: s.utente_id, e: perUtente.get(s.utente_id) }))
    .filter(({ e }) => {
      const fa = e?.quando ? ora - new Date(e.quando).getTime() : Infinity
      if (e?.in_corso && fa < 10 * 60000) return false   // sta già girando (app o server)
      return fa >= OGNI
    })
    .sort((a, b) => new Date(a.e?.quando || 0) - new Date(b.e?.quando || 0))

  const riepilogo = { iscritti: daFare.length, fatti: 0, leggeri: 0, nuove: 0, errori: 0 }
  let erroriDiFila = 0
  for (const { id, e } of daFare) {
    if (Date.now() - partenza > NUOVO_ISCRITTO_FINO) break
    try {
      const r = await sincronizzaUno(db, id, e, partenza)
      riepilogo.fatti += 1
      if (r.leggero) riepilogo.leggeri += 1
      riepilogo.nuove += r.nuove || 0
      erroriDiFila = 0
    } catch (err) {
      riepilogo.errori += 1
      erroriDiFila += 1
      const msg = String(err?.message || err).slice(0, 300)
      console.log(`[sincro] ${id.slice(0, 8)} errore: ${msg}`)
      await db.from('bga_esiti').upsert({ utente_id: id, quando: new Date().toISOString(), versione: VERSIONE,
        dal_server: true, in_corso: false, errore: msg }, { onConflict: 'utente_id' })
      if (erroriDiFila >= MAX_ERRORI_DI_FILA) { riepilogo.fermato = 'troppi errori di fila'; break }
    }
  }
  console.log(`[sincro] ${riepilogo.fatti}/${riepilogo.iscritti} iscritti, ${riepilogo.nuove} partite nuove, ${riepilogo.errori} errori${riepilogo.fermato ? ', fermato' : ''} in ${Date.now() - partenza}ms`)
  return res.status(200).json(riepilogo)
}
