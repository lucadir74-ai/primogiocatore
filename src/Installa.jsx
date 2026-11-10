// Primo Giocatore - mettere l'app sul telefono
// v1.0.0 - 202611101200
//
// Android e computer (Chrome, Edge): il browser offre l'installazione e
// qui c'è il tasto che la fa partire.
// iPhone e iPad: Apple non permette un tasto. L'unica strada è
// Condividi → «Aggiungi alla schermata Home», quindi si mostrano i passi
// giusti per il browser in uso. Dentro WhatsApp, Instagram e simili non
// si può proprio: lì si dice di aprire la pagina in Safari.
// Ad app già installata non si mostra niente.
//
// variante «avviso»: riga compatta in cima alla Home, si può chiudere
//   (e non torna più su questo telefono);
// variante «scheda»: riquadro con i passi, nel Profilo e nel Benvenuto.
// sempre: mostra il riquadro anche dove non si riconosce il telefono
//   (pagina di benvenuto aperta dal computer).

import { useEffect, useState } from 'react'

const CHIAVE_CHIUSO = 'primo-giocatore:installa-chiuso'

/* ---------- Dove siamo ---------- */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
// L'iPad si presenta come un Mac: lo tradisce lo schermo a tocco.
const iOS = /iPad|iPhone|iPod/.test(ua)
  || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const android = /Android/i.test(ua)
// Pagine aperte dentro un'altra app: da lì non si installa niente.
const dentroAltraApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|Telegram|TikTok|LinkedInApp|Snapchat|Pinterest|GSA\//i.test(ua)
const altroBrowserIOS = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)

export function giaInstallata() {
  if (typeof window === 'undefined') return false
  return window.navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || false
}

/* ---------- L'offerta del browser (Android, computer) ---------- */
// Arriva una volta sola, spesso prima che la pagina sia disegnata: si
// prende qui, appena il file è caricato, e si tiene da parte.

let offerta = null
const ascoltatori = new Set()
const avvisa = () => { for (const f of ascoltatori) f(offerta) }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()   // niente striscia del browser: il tasto è il nostro
    offerta = e
    avvisa()
  })
  window.addEventListener('appinstalled', () => { offerta = null; avvisa() })
  // Ad app installata si chiede al telefono di non buttare via i dati
  // tenuti da parte (partite in attesa, archivio) quando ha poco spazio.
  if (giaInstallata()) { try { navigator.storage?.persist?.() } catch { /* niente */ } }
}

function IconaCondividiIOS() {
  return (
    <svg className="installa-icona" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Condividi">
      <path d="M12 15V3 M8 7l4-4 4 4 M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1" />
    </svg>
  )
}

function IconaAggiungi() {
  return (
    <svg className="installa-icona" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Più">
      <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8 M8 12h8" />
    </svg>
  )
}

function PassiIOS() {
  if (dentroAltraApp) {
    return (
      <>
        <p>Da qui dentro l&rsquo;iPhone non lo permette: questa pagina è aperta dentro un&rsquo;altra app.</p>
        <ol className="installa-passi">
          <li>Tocca il menu <strong>&hellip;</strong> o l&rsquo;icona della bussola e scegli <strong>Apri in Safari</strong> (o &laquo;Apri nel browser&raquo;).</li>
          <li>In Safari tocca <IconaCondividiIOS /> <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong>.</li>
        </ol>
      </>
    )
  }
  return (
    <>
      <ol className="installa-passi">
        <li>
          Tocca <IconaCondividiIOS /> <strong>Condividi</strong>
          {altroBrowserIOS
            ? ', in alto accanto all’indirizzo.'
            : ', nella barra in basso. Se non lo vedi, tocca prima i tre puntini ⋯.'}
        </li>
        <li>Scorri l&rsquo;elenco e scegli <IconaAggiungi /> <strong>Aggiungi alla schermata Home</strong>.</li>
        <li>Conferma con <strong>Aggiungi</strong>: l&rsquo;icona di Primo compare fra le app.</li>
      </ol>
      <p className="aiuto">
        La prima volta che la apri dall&rsquo;icona ti chiede di nuovo email e password: per l&rsquo;iPhone
        è un&rsquo;app nuova. Poi resta dentro, e funziona anche senza rete.
      </p>
    </>
  )
}

export default function Installa({ variante = 'scheda', sempre = false }) {
  const [evento, setEvento] = useState(offerta)
  const [aperta, setAperta] = useState(false)
  const [chiusa, setChiusa] = useState(() => {
    try { return localStorage.getItem(CHIAVE_CHIUSO) === '1' } catch { return false }
  })
  const [installata, setInstallata] = useState(giaInstallata)

  useEffect(() => {
    const f = (e) => { setEvento(e); if (!e) setInstallata(giaInstallata()) }
    ascoltatori.add(f)
    setEvento(offerta)
    return () => ascoltatori.delete(f)
  }, [])

  async function installa() {
    if (!evento) return
    try {
      evento.prompt()
      const scelta = await evento.userChoice
      if (scelta?.outcome === 'accepted') setInstallata(true)
    } catch { /* ha chiuso: niente */ }
    offerta = null
    avvisa()
  }

  function chiudi() {
    setChiusa(true)
    try { localStorage.setItem(CHIAVE_CHIUSO, '1') } catch { /* resta chiusa solo per ora */ }
  }

  if (installata) return null
  const sa = evento ? 'tasto' : iOS ? 'ios' : android ? 'android' : null
  if (!sa && !sempre) return null

  if (variante === 'avviso') {
    if (chiusa) return null
    return (
      <div className="scheda scheda-sottile installa-avviso">
        <div className="installa-testa">
          <img src="/icona-192.png" alt="" width="40" height="40" />
          <p>
            <strong>Metti Primo sul telefono</strong><br />
            Si apre come un&rsquo;app e funziona anche senza rete.
          </p>
          <button type="button" className="installa-chiudi" aria-label="Chiudi" onClick={chiudi}>&times;</button>
        </div>
        {sa === 'tasto' ? (
          <button type="button" className="bottone" onClick={installa}>Installa</button>
        ) : !aperta ? (
          <button type="button" className="bottone bottone-secondario" onClick={() => setAperta(true)}>Come si fa</button>
        ) : sa === 'ios' ? (
          <PassiIOS />
        ) : (
          <p>Apri il menu <strong>&#8942;</strong> del browser e scegli <strong>Installa app</strong> o <strong>Aggiungi a schermata Home</strong>.</p>
        )}
      </div>
    )
  }

  return (
    <section className="scheda benvenuto-installa">
      <h3>Mettila sul telefono</h3>
      <p>Non serve lo store: si aggiunge dal browser, si apre come un&rsquo;app e funziona anche senza rete.</p>
      {sa === 'tasto' ? (
        <p><button type="button" className="bottone" onClick={installa}>Installa l&rsquo;app</button></p>
      ) : sa === 'ios' ? (
        <PassiIOS />
      ) : sa === 'android' ? (
        <p>Apri il menu <strong>&#8942;</strong> del browser e scegli <strong>Installa app</strong> o <strong>Aggiungi a schermata Home</strong>.</p>
      ) : (
        <>
          <p><strong>iPhone</strong> (Safari): tasto <IconaCondividiIOS /> Condividi, poi &laquo;Aggiungi alla schermata Home&raquo;.</p>
          <p><strong>Android</strong> (Chrome): menu &#8942;, poi &laquo;Installa app&raquo; o &laquo;Aggiungi a schermata Home&raquo;.</p>
        </>
      )}
    </section>
  )
}
