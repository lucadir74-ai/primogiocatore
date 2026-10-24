// Primo Giocatore - collegamento con Board Game Arena
// v1.2.0 - 202610242100 (risposte più frequenti: ogni chiamata legge al massimo ~15 secondi, così il telefono non resta in attesa a lungo e la connessione non cade)
//
// Chi vuole collega il proprio account BGA una volta, con nome e
// password. Il server entra su BGA come farebbe il browser, prende il
// numero giocatore e i cookie di sessione «ricordami», e li conserva
// CIFRATI. La password non viene mai scritta da nessuna parte: si usa
// per l'accesso e si dimentica.
//
// Azioni (POST, JSON, con la sessione Supabase in Authorization):
//   { azione: 'collega', utente, password }  entra su BGA e salva la sessione
//   { azione: 'stato' }                      collegato? da quando? errori?
//   { azione: 'leggi', fino, da }            partite finite dopo «fino» (secondi),
//                                            dalla pagina «da»; se il tempo non
//                                            basta risponde con «continua»
//   { azione: 'scollega' }                   cancella la sessione salvata
//
// La tabella bga_sessioni non ha regole di accesso per gli utenti: la
// legge e la scrive solo questo server, con la chiave di servizio.
//
// Chiave di cifratura: BGA_CHIAVE fra le variabili di Vercel; se manca,
// è derivata dalla chiave di servizio di Supabase (che resta segreta
// sul server). Cambiarla scollega tutti: basterà ricollegarsi.

import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { compattaTavolo } from '../src/bgaFormato.js'

export const config = { maxDuration: 60 }

const SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const BGA = 'https://boardgamearena.com'
const UA = 'Mozilla/5.0 (Linux; Android 14) PrimoGiocatore/1.0'
// Poi si risponde «continua». Non di più: una connessione che resta
// muta per decine di secondi, su alcune reti mobili e Wi-Fi, viene
// tagliata e il browser dice «Failed to fetch» anche se il server ha
// finito bene (successo con lo storico lungo di un iscritto, 24/10).
const TEMPO_LETTURA = 15000
const PAUSA_PAGINE = 700

/* ---------------- Cifratura dei cookie ---------------- */

function chiave() {
  const base = process.env.BGA_CHIAVE || `primo-giocatore:bga:${SERVIZIO}`
  return createHash('sha256').update(base).digest()
}
function cifra(oggetto) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chiave(), iv)
  const dati = Buffer.concat([c.update(JSON.stringify(oggetto), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), dati].map((b) => b.toString('base64')).join('.')
}
function decifra(testo) {
  const [iv, tag, dati] = testo.split('.').map((x) => Buffer.from(x, 'base64'))
  const d = createDecipheriv('aes-256-gcm', chiave(), iv)
  d.setAuthTag(tag)
  return JSON.parse(Buffer.concat([d.update(dati), d.final()]).toString('utf8'))
}

/* ---------------- Un piccolo browser ---------------- */

// Cookie e reindirizzamenti come nel browser: fetch da solo perderebbe
// i cookie dei passaggi intermedi.
function browser(cookieIniziali = {}) {
  const cookie = new Map(Object.entries(cookieIniziali))
  let origine = BGA

  function prendi(r) {
    const righe = typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : (r.headers.get('set-cookie') || '').split(/,(?=[^;]+=)/)
    for (const riga of righe) {
      const [coppia] = riga.split(';')
      const i = coppia.indexOf('=')
      if (i <= 0) continue
      const nome = coppia.slice(0, i).trim()
      const valore = coppia.slice(i + 1).trim()
      if (!valore || valore === 'deleted') cookie.delete(nome)
      else cookie.set(nome, valore)
    }
  }

  async function chiama(percorso, opzioni = {}) {
    let indirizzo = percorso.startsWith('http') ? percorso : origine + percorso
    let metodo = opzioni.method || 'GET'
    let corpo = opzioni.body
    for (let salto = 0; salto < 6; salto++) {
      const r = await fetch(indirizzo, {
        method: metodo,
        body: corpo,
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9',
          Cookie: [...cookie].map(([n, v]) => `${n}=${v}`).join('; '),
          ...(opzioni.headers || {}),
        },
      })
      prendi(r)
      const dove = r.headers.get('location')
      if (r.status >= 300 && r.status < 400 && dove) {
        indirizzo = new globalThis.URL(dove, indirizzo).toString()
        if (r.status !== 307 && r.status !== 308) { metodo = 'GET'; corpo = undefined }
        continue
      }
      origine = new globalThis.URL(indirizzo).origin   // es. https://it.boardgamearena.com
      return r
    }
    throw new Error('BGA rimanda da una pagina all’altra senza fermarsi')
  }

  return { chiama, cookie: () => Object.fromEntries(cookie), origine: () => origine }
}

function trovaToken(html) {
  for (const re of [
    /requestToken['"]?\s*[:=]\s*['"]([A-Za-z0-9]+)['"]/,
    /id=['"]request_token['"]\s+value=['"]([A-Za-z0-9]+)['"]/,
    /name=['"]request_token['"][^>]*value=['"]([A-Za-z0-9]+)['"]/,
  ]) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

/* ---------------- Azioni ---------------- */

async function collega(db, utenteId, { utente, password }) {
  if (!utente?.trim() || !password) return { errore: 'Servono nome utente (o email) e password di BGA.' }
  const b = browser()
  const r1 = await b.chiama('/account')
  const token = trovaToken(await r1.text())
  if (!token) return { errore: 'BGA non ha aperto la pagina di accesso. Riprova fra qualche minuto.' }

  const r2 = await b.chiama('/account/auth/loginUserWithPassword.html', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': token,
      Referer: `${b.origine()}/account`,
      Origin: b.origine(),
    },
    body: new URLSearchParams({ username: utente.trim(), password, remember_me: 'true', request_token: token }),
  })
  let risposta = null
  try { risposta = JSON.parse(await r2.text()) } catch { /* non è JSON */ }
  const dati = risposta?.data
  if (String(risposta?.status) !== '1' || !dati?.success || !/^\d+$/.test(String(dati.user_id || ''))) {
    const motivo = typeof risposta?.error === 'string' ? risposta.error : ''
    return { errore: `BGA non ha accettato l’accesso${motivo ? `: ${motivo}` : '. Controlla nome e password.'}` }
  }

  const bgaId = Number(dati.user_id)
  const nome = String(dati.username || '')

  // Un account BGA appartiene a una persona sola in Primo Giocatore.
  const { data: altro } = await db.from('profili').select('id').eq('bga_id', bgaId).neq('id', utenteId).maybeSingle()
  if (altro) return { errore: 'Questo account BGA è già collegato a un altro iscritto di Primo Giocatore.' }

  const { error: e1 } = await db.from('bga_sessioni').upsert({
    utente_id: utenteId,
    bga_id: bgaId,
    bga_nome: nome,
    cookie_cifrati: cifra(b.cookie()),
    collegata_il: new Date().toISOString(),
    ultimo_errore: null,
  }, { onConflict: 'utente_id' })
  if (e1) throw e1

  const { data: p } = await db.from('profili').select('bga_username').eq('id', utenteId).single()
  const cambi = { bga_id: bgaId }
  if (!p?.bga_username?.trim() && nome) cambi.bga_username = nome
  const { error: e2 } = await db.from('profili').update(cambi).eq('id', utenteId)
  if (e2) throw e2

  return { collegato: true, bgaId, nome }
}

async function stato(db, utenteId) {
  const { data } = await db.from('bga_sessioni')
    .select('bga_id, bga_nome, collegata_il, ultima_lettura, ultimo_errore')
    .eq('utente_id', utenteId).maybeSingle()
  if (!data) return { collegato: false }
  const { bga_id, bga_nome, collegata_il, ultima_lettura, ultimo_errore } = data
  return { collegato: true, bga_id, bga_nome, collegata_il, ultima_lettura, ultimo_errore }
}

async function leggi(db, utenteId, { fino = 0, da = 1 }) {
  const { data: s } = await db.from('bga_sessioni').select('*').eq('utente_id', utenteId).maybeSingle()
  if (!s) return { collegato: false }

  let cookie
  try { cookie = decifra(s.cookie_cifrati) } catch {
    await db.from('bga_sessioni').update({ ultimo_errore: 'scaduta' }).eq('utente_id', utenteId)
    return { scaduta: true }
  }
  const b = browser(cookie)
  const id = String(s.bga_id)
  const scaduta = async () => {
    await db.from('bga_sessioni').update({ ultimo_errore: 'scaduta' }).eq('utente_id', utenteId)
    return { scaduta: true }
  }

  const r = await b.chiama(`/gamestats?player=${id}`)
  const token = trovaToken(await r.text())
  if (!token) return scaduta()

  const inizio = Date.now()
  const tavoli = []
  let pagina = Number(da) || 1
  let continua = null
  for (; pagina <= 1000; pagina++) {
    if (Date.now() - inizio > TEMPO_LETTURA) { continua = pagina; break }
    const rp = await b.chiama(`/gamestats/gamestats/getGames.html?player=${id}&opponent_id=0&finished=1&page=${pagina}&updateStats=0`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': token, Referer: `${b.origine()}/gamestats?player=${id}` },
    })
    let j = null
    try { j = JSON.parse(await rp.text()) } catch { /* non è JSON */ }
    if (String(j?.status) !== '1') {
      // Sessione non più valida (BGA risponde con un errore di sessione).
      if (pagina === Number(da || 1)) return scaduta()
      continua = pagina   // un intoppo a metà: si riprende da qui
      break
    }
    const lista = j.data?.tables || []
    if (!lista.length) break
    let vecchie = false
    for (const t of lista) {
      if (fino && Number(t.end) < fino) { vecchie = true; continue }
      const c = compattaTavolo(t)
      if (c) tavoli.push(c)
    }
    if (vecchie) break
    await new Promise((ok) => setTimeout(ok, PAUSA_PAGINE))
  }

  // BGA a volte rinnova i cookie: si salva la versione aggiornata.
  await db.from('bga_sessioni').update({
    cookie_cifrati: cifra(b.cookie()),
    ultima_lettura: new Date().toISOString(),
    ultimo_errore: null,
  }).eq('utente_id', utenteId)

  return { giocatore: id, nome: s.bga_nome || '', tavoli, completo: !fino, continua }
}

/* ---------------- Ingresso ---------------- */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Usa POST' })
  const db = createClient(SUPABASE, SERVIZIO, { auth: { persistSession: false } })
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const { data } = token ? await db.auth.getUser(token) : { data: null }
  const utenteId = data?.user?.id
  if (!utenteId) return res.status(401).json({ errore: 'Accesso a Primo Giocatore scaduto: rientra.' })

  const corpo = req.body || {}
  const partenza = Date.now()
  // Una riga per chiamata nei log di Vercel: senza, le chiamate andate
  // bene non lasciano traccia. Mai la password né i cookie.
  const traccia = (esito) => {
    const extra = corpo.azione === 'leggi' ? ` da=${corpo.da ?? 1} fino=${corpo.fino ?? 0}` : ''
    console.log(`[bga] ${corpo.azione || '?'} utente=${utenteId.slice(0, 8)}${extra} ${Date.now() - partenza}ms → ${esito}`)
  }
  const rispondi = (dati) => {
    let esito = 'ok'
    if (dati?.errore) esito = `errore: ${String(dati.errore).slice(0, 120)}`
    else if (dati?.scaduta) esito = 'sessione scaduta'
    else if (Array.isArray(dati?.tavoli)) esito = `${dati.tavoli.length} partite${dati.continua ? `, continua da pagina ${dati.continua}` : ', fine'}`
    traccia(esito)
    return res.status(200).json(dati)
  }
  try {
    if (corpo.azione === 'collega') return rispondi(await collega(db, utenteId, corpo))
    if (corpo.azione === 'stato') return rispondi(await stato(db, utenteId))
    if (corpo.azione === 'leggi') return rispondi(await leggi(db, utenteId, corpo))
    if (corpo.azione === 'scollega') {
      await db.from('bga_sessioni').delete().eq('utente_id', utenteId)
      return rispondi({ collegato: false })
    }
    return res.status(400).json({ errore: 'Azione sconosciuta' })
  } catch (e) {
    // Mai la password nei messaggi: qui non c'è, ma per prudenza niente corpo.
    const msg = String(e?.message || e)
    if (/bga_sessioni/.test(msg)) return rispondi({ errore: 'Al database manca lo script SQL per il collegamento BGA (bga_sessioni.sql).' })
    return rispondi({ errore: `Errore: ${msg.slice(0, 200)}` })
  }
}
