// Primo Giocatore - PROVA: accesso a Board Game Arena dal server
// v0.2.0 - 202610200220 (segue i reindirizzamenti di BGA conservando i cookie)
//
// Serve solo a capire se BGA accetta un accesso con nome e password
// fatto dai server di Vercel, e se poi lascia leggere lo storico.
// Non salva niente: la password arriva, si usa per questa sola prova
// e non viene scritta da nessuna parte (né nel database, né nei log,
// né nella risposta). Usabile solo dagli organizzatori.
//
// Il login di BGA non è documentato. Si provano due strade:
// A) /account/auth/loginUserWithPassword.html  (sito attuale, ipotesi)
// B) /account/account/login.html               (usato da progetti open
//    source negli anni passati)
// La risposta racconta ogni passo, così si vede dove si ferma.

import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 30 }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const BGA = 'https://boardgamearena.com'
const UA = 'Mozilla/5.0 (Linux; Android 14) PrimoGiocatore/1.0 (prova accesso)'

async function organizzatore(req, db) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) return false
  const { data } = await db.auth.getUser(token)
  if (!data?.user) return false
  const { data: p } = await db.from('profili').select('organizzatore').eq('id', data.user.id).single()
  return Boolean(p?.organizzatore)
}

// Un piccolo «barattolo» di cookie, come quello del browser.
function barattolo() {
  const cookie = new Map()
  return {
    prendi(risposta) {
      const righe = typeof risposta.headers.getSetCookie === 'function'
        ? risposta.headers.getSetCookie()
        : (risposta.headers.get('set-cookie') || '').split(/,(?=[^;]+=)/)
      for (const r of righe) {
        const [coppia] = r.split(';')
        const i = coppia.indexOf('=')
        if (i > 0) {
          const nome = coppia.slice(0, i).trim()
          const valore = coppia.slice(i + 1).trim()
          if (valore === 'deleted' || valore === '') cookie.delete(nome)
          else cookie.set(nome, valore)
        }
      }
    },
    intestazione: () => [...cookie].map(([n, v]) => `${n}=${v}`).join('; '),
    nomi: () => [...cookie.keys()],
  }
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Usa POST' })
  const db = createClient(URL, SERVIZIO, { auth: { persistSession: false } })
  if (!(await organizzatore(req, db))) return res.status(403).json({ errore: 'Solo per gli organizzatori' })

  const { utente, password, giocatore } = req.body || {}
  if (!utente || !password) return res.status(400).json({ errore: 'Servono nome (o email) e password BGA' })

  const passi = []
  // Niente password né email nei dettagli che tornano indietro.
  const pulisci = (t) => String(t || '')
    .split(password).join('***')
    .split(utente).join('[utente]')
    .replace(/\s+/g, ' ')
    .slice(0, 220)
  const segna = (passo, risposta, dettaglio) => passi.push({
    passo, http: risposta?.status ?? null, dettaglio: pulisci(dettaglio),
  })

  const jar = barattolo()
  // Segue i reindirizzamenti a mano, così i cookie di ogni passaggio
  // restano nel barattolo (fetch da solo li perderebbe). r.percorso
  // racconta dove è finita la richiesta.
  async function chiama(percorso, opzioni = {}) {
    let indirizzo = percorso.startsWith('http') ? percorso : BGA + percorso
    let metodo = opzioni.method || 'GET'
    let corpo = opzioni.body
    const giro = []
    for (let salto = 0; salto < 6; salto++) {
      const r = await fetch(indirizzo, {
        method: metodo,
        body: corpo,
        redirect: 'manual',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'it-IT,it;q=0.9', Cookie: jar.intestazione(), ...(opzioni.headers || {}) },
      })
      jar.prendi(r)
      const dove = r.headers.get('location')
      if (r.status >= 300 && r.status < 400 && dove) {
        indirizzo = new globalThis.URL(dove, indirizzo).toString()
        giro.push(`${r.status} → ${indirizzo.replace(/^https:\/\//, '')}`)
        // Dopo un reindirizzamento il browser rifà la richiesta in GET.
        if (r.status !== 307 && r.status !== 308) { metodo = 'GET'; corpo = undefined }
        continue
      }
      r.percorso = giro.length ? giro.join(' · ') : 'diretto'
      return r
    }
    throw new Error(`Troppi reindirizzamenti: ${giro.join(' · ')}`)
  }

  try {
    // 1. Pagina di accesso: cookie di sessione e token anti-falsificazione.
    //    Se /account non lo dà, si prova la home.
    let r, html, token = null
    for (const pagina of ['/account', '/']) {
      r = await chiama(pagina)
      html = await r.text()
      token = trovaToken(html)
      segna(`1. pagina ${pagina}`, r, `${r.percorso}; ${token ? 'token trovato' : 'token NON trovato'}; cookie: ${jar.nomi().join(', ') || 'nessuno'}${token ? '' : `; inizio: ${html.slice(0, 120)}`}`)
      if (token) break
    }
    if (!token) return res.status(200).json({ esito: 'fermo al passo 1', passi })

    const comuni = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Request-Token': token,
      Referer: `${BGA}/account`,
      Origin: BGA,
    }

    // 2A. Accesso, strada A.
    r = await chiama('/account/auth/loginUserWithPassword.html', {
      method: 'POST', headers: comuni,
      body: new URLSearchParams({ username: utente, password, remember_me: 'true', request_token: token }),
    })
    let testo = await r.text()
    let entrato = /"status"\s*:\s*"?1"?/.test(testo) && !/"error"/.test(testo)
    segna('2A. accesso (strada attuale)', r, testo)

    // 2B. Se la A non è andata, la strada B.
    if (!entrato) {
      r = await chiama(`/account/account/login.html?dojo.preventCache=${Date.now()}`, {
        method: 'POST', headers: comuni,
        body: new URLSearchParams({
          email: utente, password, rememberme: 'on', redirect: '', request_token: token, form_id: 'loginform',
        }),
      })
      testo = await r.text()
      entrato = /"status"\s*:\s*"?1"?/.test(testo) && !/"error"/.test(testo)
      segna('2B. accesso (strada vecchia)', r, testo)
    }

    // 3. Siamo dentro? Una pagina riservata deve riconoscerci e dare un token nuovo.
    const id = /^\d+$/.test(String(giocatore || '')) ? String(giocatore) : ''
    r = await chiama(id ? `/gamestats?player=${id}` : '/gamestats')
    html = await r.text()
    const tokenDentro = trovaToken(html)
    const riconosciuto = /logout|disconnect|esci/i.test(html)
    segna('3. pagina della cronologia', r, `${r.percorso}; token: ${tokenDentro ? 'sì' : 'no'}; sembra entrato: ${riconosciuto ? 'sì' : 'no'}; cookie: ${jar.nomi().join(', ')}`)

    // 4. Lettura dello storico, come fa il segnalibro.
    if (id && tokenDentro) {
      r = await chiama(`/gamestats/gamestats/getGames.html?player=${id}&opponent_id=0&finished=1&page=1&updateStats=0`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Request-Token': tokenDentro, Referer: `${BGA}/gamestats?player=${id}` },
      })
      testo = await r.text()
      let quante = null
      try { quante = JSON.parse(testo)?.data?.tables?.length ?? null } catch { /* non è JSON */ }
      segna('4. lettura storico', r, quante != null ? `OK: ${quante} partite nella prima pagina` : testo)
      return res.status(200).json({ esito: quante != null ? 'FUNZIONA' : 'accesso forse riuscito, lettura rifiutata', passi })
    }
    return res.status(200).json({ esito: entrato ? 'accesso riuscito, manca il numero giocatore per leggere' : 'accesso rifiutato', passi })
  } catch (e) {
    passi.push({ passo: 'errore', http: null, dettaglio: pulisci(e.message) })
    return res.status(200).json({ esito: 'errore di rete', passi })
  }
}
