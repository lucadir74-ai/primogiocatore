// Primo Giocatore - invio delle partite a BoardGameGeek
// v1.1.0 - 202610311300 (l'invio si può chiamare anche dalla sincronizzazione programmata, api/sincro.js)
//
// Come fa BG Stats: si entra su BGG con nome utente e password dell'iscritto
// e si registra la partita dalla pagina interna del sito (geekplay.php).
// L'interfaccia ufficiale di BGG serve solo a leggere: questa pagina non è
// documentata, e se BGG la cambia l'invio si ferma finché non si adatta.
// Le partite in Primo Giocatore restano comunque intatte.
//
// La password serve una volta per entrare e non viene salvata: si conserva
// solo la sessione di BGG, cifrata, in bgg_sessioni (che dall'app non si
// legge). Script SQL: supabase/invio_bgg.sql.
//
// Azioni (POST, JSON, con la sessione Supabase in Authorization):
//   stato                       -> collegamento, partite in attesa e con errore
//   collega   { password }      -> entra su BGG col nome utente del profilo
//   scollega                    -> cancella la sessione BGG
//   opzioni   { invia_bga }     -> invia anche le partite importate da BGA
//   riprova                     -> rimette in coda le partite andate in errore
//   invia                       -> manda a BGG le partite in attesa e toglie
//                                  quelle cancellate qui; { continua } se ne
//                                  restano

import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const config = { maxDuration: 60 }

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const BGG = 'https://boardgamegeek.com'
const AGENTE = 'PrimoGiocatore/1.0 (app per gruppi di gioco)'
const TEMPO_MAX = 40000     // poi si risponde «continua», per stare nei 60 secondi
const PAUSA = 1500          // fra un invio e l'altro, per non pesare su BGG
const PER_GIRO = 30

/* ---------------- Cifratura della sessione ---------------- */

function chiave() {
  const base = process.env.BGA_CHIAVE || `primo-giocatore:bga:${SERVIZIO}`
  return createHash('sha256').update(`bgg:${base}`).digest()
}
function cifra(testo) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chiave(), iv)
  const dati = Buffer.concat([c.update(testo, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), dati].map((b) => b.toString('base64')).join('.')
}
function decifra(testo) {
  const [iv, tag, dati] = testo.split('.').map((x) => Buffer.from(x, 'base64'))
  const d = createDecipheriv('aes-256-gcm', chiave(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(dati), d.final()]).toString('utf8')
}

const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms))

/* ---------------- BGG ---------------- */

function cookieDa(risposta) {
  const grezzi = typeof risposta.headers.getSetCookie === 'function'
    ? risposta.headers.getSetCookie()
    : (risposta.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_]+=)/)
  return grezzi
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c && !/=deleted$/i.test(c) && !/=$/.test(c))
    .join('; ')
}

async function entra(username, password) {
  let r
  try {
    r = await fetch(`${BGG}/login/api/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify({ credentials: { username, password } }),
      redirect: 'manual',
    })
  } catch {
    return { errore: 'BGG non risponde. Riprova fra qualche minuto.' }
  }
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    return { errore: 'BGG ha rifiutato nome utente o password.' }
  }
  if (r.status >= 300) return { errore: `BGG ha risposto ${r.status} all'accesso.` }
  const cookie = cookieDa(r)
  if (!/SessionID=|bggpassword=/i.test(cookie)) {
    return { errore: 'BGG non ha aperto la sessione: controlla nome utente e password.' }
  }
  return { cookie }
}

// Una chiamata a geekplay.php. { dati } se BGG risponde, { scaduta } se
// la sessione non vale più, { errore } altrimenti.
async function geekplay(cookie, corpo) {
  let r
  try {
    r = await fetch(`${BGG}/geekplay.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'User-Agent': AGENTE },
      body: JSON.stringify(corpo),
      redirect: 'manual',
    })
  } catch {
    return { errore: 'BGG non risponde.' }
  }
  const testo = await r.text()
  let dati = null
  try { dati = JSON.parse(testo) } catch { /* pagina HTML */ }
  if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) return { scaduta: true }
  if (!dati) {
    if (/login|sign in/i.test(testo)) return { scaduta: true }
    return { errore: `BGG ha risposto ${r.status}.` }
  }
  if (dati.error) {
    const msg = String(dati.error)
    if (/log ?in|logged/i.test(msg)) return { scaduta: true }
    return { errore: `BGG: ${msg.slice(0, 200)}` }
  }
  return { dati }
}

// La data della partita come la vede chi gioca a Roma.
const dataRoma = (istante) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(istante))

/* ---------------- Preparazione di una partita ---------------- */

async function corpoPartita(db, partitaId, io) {
  const { data: p, error } = await db.from('partite')
    .select('id, registrata_da, gioco_id, luogo_id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop, bgg_play_id')
    .eq('id', partitaId).maybeSingle()
  if (error) throw error
  if (!p || p.registrata_da !== io.utente_id) return { salta: true }

  const { data: gioco } = p.gioco_id
    ? await db.from('giochi').select('bgg_id, nome').eq('id', p.gioco_id).maybeSingle()
    : { data: null }
  if (!gioco?.bgg_id) return { errore: 'il gioco non è collegato a BGG' }

  const { data: luogo } = p.luogo_id
    ? await db.from('luoghi').select('nome').eq('id', p.luogo_id).maybeSingle()
    : { data: null }

  const { data: righe, error: e2 } = await db.from('partecipazioni')
    .select('utente_id, ospite_id, punteggio_totale, posizione, vincitore')
    .eq('partita_id', p.id)
  if (e2) throw e2

  const idOspiti = [...new Set(righe.map((r) => r.ospite_id).filter(Boolean))]
  const { data: ospiti } = idOspiti.length
    ? await db.from('ospiti').select('id, nome, utente_collegato').in('id', idOspiti)
    : { data: [] }
  const perOspite = new Map((ospiti || []).map((o) => [o.id, o]))
  const idProfili = [...new Set([
    ...righe.map((r) => r.utente_id),
    ...(ospiti || []).map((o) => o.utente_collegato),
  ].filter(Boolean))]
  const { data: profili } = idProfili.length
    ? await db.from('profili').select('id, nome, nickname, bgg_username').in('id', idProfili)
    : { data: [] }
  const perProfilo = new Map((profili || []).map((x) => [x.id, x]))

  const coop = p.tipo_punteggio === 'coop'
  const giocatori = righe.map((r) => {
    const o = r.ospite_id ? perOspite.get(r.ospite_id) : null
    const idAccount = r.utente_id || o?.utente_collegato || null
    const acc = idAccount ? perProfilo.get(idAccount) : null
    // Chi ha il nome utente BGG viene indicato con quello: la partita
    // compare anche sul suo profilo BGG, come con BG Stats.
    const username = idAccount === io.utente_id ? io.bgg_username : (acc?.bgg_username || '')
    const nome = acc ? (acc.nickname || acc.nome || username || 'Giocatore') : (o?.nome || 'Giocatore')
    return {
      name: nome,
      username: username || '',
      score: r.punteggio_totale == null ? '' : String(r.punteggio_totale),
      win: coop ? p.esito_coop === 'vinta' : Boolean(r.vincitore),
      new: false,
    }
  })

  return {
    p,
    corpo: {
      ajax: 1,
      action: 'save',
      objecttype: 'thing',
      objectid: gioco.bgg_id,
      playdate: dataRoma(p.giocata_il),
      length: p.durata_minuti || 0,
      location: luogo?.nome || '',
      comments: p.note || '',
      quantity: 1,
      ...(p.bgg_play_id ? { playid: p.bgg_play_id } : {}),
      players: giocatori,
    },
  }
}

/* ---------------- Azioni ---------------- */

async function stato(db, utenteId) {
  const { data: s } = await db.from('bgg_sessioni')
    .select('bgg_username, collegata_il, invia_bga, ultimo_invio, ultimo_errore')
    .eq('utente_id', utenteId).maybeSingle()
  if (!s) return { collegato: false }
  const { data: attesa } = await db.rpc('bgg_da_inviare', { p_utente: utenteId, p_limite: 1000 })
  const { count: conErrore } = await db.from('partite')
    .select('id', { count: 'exact', head: true })
    .eq('registrata_da', utenteId).not('bgg_errore', 'is', null)
  return {
    collegato: true,
    utente: s.bgg_username,
    collegata_il: s.collegata_il,
    invia_bga: s.invia_bga,
    ultimo_invio: s.ultimo_invio,
    scaduta: s.ultimo_errore === 'scaduta',
    ultimo_errore: s.ultimo_errore && s.ultimo_errore !== 'scaduta' ? s.ultimo_errore : null,
    in_attesa: (attesa || []).length,
    con_errore: conErrore || 0,
  }
}

async function collega(db, utenteId, { password }) {
  const { data: prof } = await db.from('profili').select('bgg_username').eq('id', utenteId).maybeSingle()
  const username = (prof?.bgg_username || '').trim()
  if (!username) return { errore: 'Scrivi prima il tuo nome utente BGG qui sopra e premi «Aggiorna da BGG».' }
  if (!password) return { errore: 'Scrivi la password di BGG.' }
  const e = await entra(username, password)
  if (e.errore) return { errore: e.errore }
  // Un nuovo collegamento dopo una sessione scaduta tiene la data del
  // primo: le partite registrate nel frattempo partono comunque.
  const { data: c } = await db.from('bgg_sessioni').select('utente_id').eq('utente_id', utenteId).maybeSingle()
  const riga = { bgg_username: username, cookie_cifrati: cifra(e.cookie), ultimo_errore: null }
  const { error } = c
    ? await db.from('bgg_sessioni').update(riga).eq('utente_id', utenteId)
    : await db.from('bgg_sessioni').insert({ utente_id: utenteId, ...riga })
  if (error) throw error
  return stato(db, utenteId)
}

export async function invia(db, utenteId, tempoMax = TEMPO_MAX) {
  const partenza = Date.now()
  const { data: s } = await db.from('bgg_sessioni').select('*').eq('utente_id', utenteId).maybeSingle()
  if (!s) return { collegato: false }
  if (s.ultimo_errore === 'scaduta') return { collegato: true, scaduta: true }
  let cookie
  try { cookie = decifra(s.cookie_cifrati) } catch {
    await db.from('bgg_sessioni').update({ ultimo_errore: 'scaduta' }).eq('utente_id', utenteId)
    return { collegato: true, scaduta: true }
  }
  const io = { utente_id: utenteId, bgg_username: s.bgg_username }
  const esito = { collegato: true, inviate: 0, aggiornate: 0, eliminate: 0, errori: 0, continua: false }
  const tempo = () => Date.now() - partenza < tempoMax

  const scaduta = async () => {
    await db.from('bgg_sessioni').update({ ultimo_errore: 'scaduta' }).eq('utente_id', utenteId)
    return { ...esito, scaduta: true }
  }

  // Prima le cancellazioni: altrimenti la sincronizzazione da BGG
  // rimetterebbe in Primo Giocatore partite tolte apposta.
  const { data: daTogliere } = await db.from('bgg_da_eliminare')
    .select('bgg_play_id').eq('utente_id', utenteId).limit(PER_GIRO)
  for (const { bgg_play_id: playid } of daTogliere || []) {
    if (!tempo()) { esito.continua = true; break }
    const r = await geekplay(cookie, { ajax: 1, action: 'delete', playid, finalize: 1 })
    if (r.scaduta) return scaduta()
    // Anche «partita non trovata» va bene: su BGG non c'è più.
    if (r.dati || /not found|invalid/i.test(r.errore || '')) {
      await db.from('bgg_da_eliminare').delete().eq('bgg_play_id', playid)
      esito.eliminate += 1
    } else {
      esito.errori += 1
    }
    await attesa(PAUSA)
  }

  const { data: ids, error } = await db.rpc('bgg_da_inviare', { p_utente: utenteId, p_limite: PER_GIRO })
  if (error) throw error
  for (const id of ids || []) {
    if (!tempo()) { esito.continua = true; break }
    const pronta = await corpoPartita(db, id, io)
    if (pronta.salta) continue
    if (pronta.errore) {
      await db.from('partite').update({ bgg_errore: pronta.errore }).eq('id', id)
      esito.errori += 1
      continue
    }
    const r = await geekplay(cookie, pronta.corpo)
    if (r.scaduta) return scaduta()
    if (r.errore) {
      await db.from('partite').update({ bgg_errore: r.errore }).eq('id', id)
      esito.errori += 1
    } else {
      const playid = Number(r.dati.playid) || pronta.p.bgg_play_id || null
      await db.from('partite').update({
        bgg_play_id: playid, bgg_inviata_il: new Date().toISOString(), bgg_errore: null,
      }).eq('id', id)
      if (pronta.p.bgg_play_id) esito.aggiornate += 1
      else esito.inviate += 1
    }
    await attesa(PAUSA)
  }
  if ((ids || []).length === PER_GIRO || (daTogliere || []).length === PER_GIRO) esito.continua = true

  if (esito.inviate || esito.aggiornate || esito.eliminate) {
    await db.from('bgg_sessioni').update({ ultimo_invio: new Date().toISOString(), ultimo_errore: null })
      .eq('utente_id', utenteId)
  }
  return esito
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST' })
  if (!SUPABASE || !SERVIZIO) return res.status(500).json({ errore: 'Mancano le variabili di Supabase su Vercel.' })
  const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false } })
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const { data } = token ? await db.auth.getUser(token) : { data: null }
  const utenteId = data?.user?.id
  if (!utenteId) return res.status(401).json({ errore: 'Sessione scaduta: esci e rientra nell\u2019app.' })

  const corpo = req.body || {}
  const partenza = Date.now()
  const rispondi = (dati) => {
    // Una riga per chiamata nei log di Vercel, mai password né cookie.
    const riassunto = dati?.errore ? `errore: ${String(dati.errore).slice(0, 120)}`
      : dati?.scaduta ? 'sessione scaduta'
        : corpo.azione === 'invia' ? `${dati?.inviate || 0} inviate, ${dati?.aggiornate || 0} aggiornate, ${dati?.eliminate || 0} tolte, ${dati?.errori || 0} errori${dati?.continua ? ', continua' : ''}`
          : 'ok'
    console.log(`[bgginvio] ${corpo.azione || '?'} utente=${utenteId.slice(0, 8)} ${Date.now() - partenza}ms → ${riassunto}`)
    return res.status(200).json(dati)
  }

  try {
    switch (corpo.azione) {
      case 'stato': return rispondi(await stato(db, utenteId))
      case 'collega': return rispondi(await collega(db, utenteId, corpo))
      case 'scollega':
        await db.from('bgg_sessioni').delete().eq('utente_id', utenteId)
        return rispondi({ collegato: false })
      case 'opzioni': {
        const si = Boolean(corpo.invia_bga)
        const { error } = await db.from('bgg_sessioni')
          .update({ invia_bga: si, invia_bga_dal: si ? new Date().toISOString() : null })
          .eq('utente_id', utenteId)
        if (error) throw error
        return rispondi(await stato(db, utenteId))
      }
      case 'riprova': {
        const { error } = await db.from('partite').update({ bgg_errore: null })
          .eq('registrata_da', utenteId).not('bgg_errore', 'is', null)
        if (error) throw error
        return rispondi(await stato(db, utenteId))
      }
      case 'invia': return rispondi(await invia(db, utenteId))
      default: return res.status(400).json({ errore: 'Azione sconosciuta' })
    }
  } catch (e) {
    const msg = String(e?.message || e)
    if (/bgg_sessioni|bgg_da_inviare|bgg_play_id|bgg_da_eliminare/.test(msg)) {
      return rispondi({ errore: 'Al database manca lo script SQL per l\u2019invio a BGG (invio_bgg.sql).' })
    }
    return rispondi({ errore: `Errore: ${msg.slice(0, 200)}` })
  }
}
