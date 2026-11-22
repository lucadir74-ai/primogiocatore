// Primo Giocatore - trascina giù per aggiornare
// v1.0.0 - 202611230100
//
// Dall'inizio della pagina, trascinando giù col dito oltre la soglia e
// lasciando, l'app si ricarica e rifà subito le sincronizzazioni (BGA,
// partite e collezione BGG). Non parte se si sta scrivendo in un campo,
// se si trascina dentro un elenco che scorre per conto suo o dentro una
// finestra sopra la pagina: lì il gesto serve ad altro.

import { useEffect, useState } from 'react'
import { chiediSincroForzata } from './forzaSincro'

const SOGLIA = 70     // pixel (già rallentati) oltre i quali, lasciando, si aggiorna
const MASSIMO = 110

function campoInUso() {
  const a = document.activeElement
  return Boolean(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))
}

// Dentro un elenco già scorso, o dentro una finestra fissa sopra la pagina.
function gestoDiAltri(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0) return true
    const pos = getComputedStyle(n).position
    if (pos === 'fixed' || pos === 'sticky') return true
  }
  return false
}

export default function TiraPerAggiornare({ attivo }) {
  const [tirato, setTirato] = useState(0)
  const [aggiorno, setAggiorno] = useState(false)

  useEffect(() => {
    if (!attivo) return
    let inizio = null
    let tratto = 0
    const parti = (e) => {
      inizio = null
      if (e.touches.length !== 1 || window.scrollY > 0 || campoInUso() || gestoDiAltri(e.target)) return
      inizio = e.touches[0].clientY
      tratto = 0
    }
    const muovi = (e) => {
      if (inizio == null) return
      const d = e.touches[0].clientY - inizio
      if (d <= 0 || window.scrollY > 0) { tratto = 0; setTirato(0); return }
      tratto = Math.min(d * 0.5, MASSIMO)
      setTirato(tratto)
    }
    const lascia = () => {
      if (inizio == null) return
      inizio = null
      if (tratto >= SOGLIA) {
        setAggiorno(true)
        chiediSincroForzata()
        setTimeout(() => window.location.reload(), 150)
      } else {
        setTirato(0)
      }
    }
    window.addEventListener('touchstart', parti, { passive: true })
    window.addEventListener('touchmove', muovi, { passive: true })
    window.addEventListener('touchend', lascia)
    window.addEventListener('touchcancel', lascia)
    return () => {
      window.removeEventListener('touchstart', parti)
      window.removeEventListener('touchmove', muovi)
      window.removeEventListener('touchend', lascia)
      window.removeEventListener('touchcancel', lascia)
    }
  }, [attivo])

  if (!tirato && !aggiorno) return null
  const pronto = aggiorno || tirato >= SOGLIA
  const y = aggiorno ? SOGLIA : tirato
  return (
    <div className="tira-aggiorna" style={{ transform: `translate(-50%, ${y - 44}px)` }} role="status" aria-live="polite">
      <span className={'tira-aggiorna-giro' + (aggiorno ? ' gira' : '')}
        style={aggiorno ? undefined : { transform: `rotate(${tirato * 3}deg)` }} aria-hidden="true">&#x21bb;</span>
      <span>{aggiorno ? 'Aggiorno…' : pronto ? 'Lascia per aggiornare' : 'Trascina per aggiornare'}</span>
    </div>
  )
}
