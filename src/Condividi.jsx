// Primo Giocatore - tasto per condividere l'app
// v1.0.0 - 202610211500
//
// Sul telefono apre il pannello di condivisione del sistema (WhatsApp,
// Telegram, email…). Dove non c'è, copia il link; se non riesce
// neanche quello, apre WhatsApp con il messaggio già scritto.

import { useState } from 'react'

export const TITOLO_APP = 'Primo Giocatore by TdG Roma'
export const TESTO_INVITO =
  'Primo Giocatore by TdG Roma: registra le partite, scala la classifica e iscriviti ai tavoli della Tana dei Goblin di Roma.'

function IconaCondividi() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4" />
    </svg>
  )
}

export default function Condividi({ variante = 'icona' }) {
  const [messaggio, setMessaggio] = useState('')

  function avvisa(testo) {
    setMessaggio(testo)
    setTimeout(() => setMessaggio(''), 3000)
  }

  async function condividi() {
    const url = window.location.origin
    if (navigator.share) {
      try {
        await navigator.share({ title: TITOLO_APP, text: TESTO_INVITO, url })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return   // ha chiuso il pannello: niente da fare
      }
    }
    try {
      await navigator.clipboard.writeText(`${TESTO_INVITO}\n${url}`)
      avvisa('Link copiato: incollalo dove vuoi.')
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${TESTO_INVITO}\n${url}`)}`, '_blank', 'noopener')
    }
  }

  return (
    <>
      {variante === 'icona' ? (
        <button type="button" className="tasto-condividi" onClick={condividi} aria-label="Condividi l'app">
          <IconaCondividi />
        </button>
      ) : (
        <button type="button" className="bottone bottone-secondario bottone-con-icona" onClick={condividi}>
          <IconaCondividi />
          <span>Condividi l&rsquo;app</span>
        </button>
      )}
      {messaggio && <div className="bolla-avviso" role="status">{messaggio}</div>}
    </>
  )
}
