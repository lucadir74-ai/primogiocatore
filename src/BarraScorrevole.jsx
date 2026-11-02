// Primo Giocatore - barra orizzontale che scorre
// v1.0.0 - 202611030600
//
// Avvolge una barra di schede o di filtri che può non stare nello
// schermo (per esempio <div className="sottoschede">…</div>):
// - le frecce ‹ › compaiono quando c'è altro da vedere da quel lato;
// - da PC la rotella del mouse fa scorrere la barra di lato (prima
//   muoveva solo la pagina, e le voci nascoste erano irraggiungibili);
// - col mouse si può anche trascinare;
// - la voce scelta resta in vista.
// La barra è il primo figlio: il suo aspetto resta quello di prima.

import { useEffect, useRef, useState } from 'react'

export default function BarraScorrevole({ children }) {
  const guscio = useRef(null)
  const [stato, setStato] = useState({ sinistra: false, destra: false, top: 0, altezza: 0 })
  const barra = () => guscio.current?.querySelector(':scope > :not(.freccia-menu)')

  function misura() {
    const el = barra()
    if (!el) return
    const nuovo = {
      sinistra: el.scrollLeft > 4,
      destra: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      top: el.offsetTop,
      altezza: el.offsetHeight,
    }
    setStato((s) => (s.sinistra === nuovo.sinistra && s.destra === nuovo.destra && s.top === nuovo.top && s.altezza === nuovo.altezza ? s : nuovo))
  }

  // La voce scelta in vista, solo in orizzontale (la pagina non si muove).
  function mostraScelta() {
    const el = barra()
    const a = el?.querySelector('.attiva, [aria-current="page"], [aria-pressed="true"]')
    if (!el || !a) return
    const ra = a.getBoundingClientRect()
    const re = el.getBoundingClientRect()
    if (ra.left < re.left) el.scrollLeft -= re.left - ra.left + 12
    else if (ra.right > re.right) el.scrollLeft += ra.right - re.right + 12
  }

  useEffect(() => {
    const el = barra()
    if (!el) return undefined
    misura()
    mostraScelta()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(misura) : null
    ro?.observe(el)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { misura(); mostraScelta() }) : null
    mo?.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-pressed'] })
    window.addEventListener('resize', misura)
    el.addEventListener('scroll', misura, { passive: true })

    // Rotella: se la barra ha altro da mostrare, il movimento verticale
    // la fa scorrere di lato; arrivati in fondo torna a muovere la pagina.
    const ruota = (e) => {
      if (el.scrollWidth <= el.clientWidth + 2 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const prima = el.scrollLeft
      el.scrollLeft += e.deltaY
      if (el.scrollLeft !== prima) e.preventDefault()
    }
    el.addEventListener('wheel', ruota, { passive: false })

    // Trascinare col mouse; un trascinamento non vale come tocco su una voce.
    let presa = null
    let trascinato = false
    const premi = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      presa = { x: e.clientX, s: el.scrollLeft }
      trascinato = false
    }
    const muovi = (e) => {
      if (!presa) return
      const dx = e.clientX - presa.x
      if (Math.abs(dx) > 6) { trascinato = true; el.scrollLeft = presa.s - dx }
    }
    const lascia = () => { presa = null }
    const clic = (e) => { if (trascinato) { e.preventDefault(); e.stopPropagation(); trascinato = false } }
    el.addEventListener('pointerdown', premi)
    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', lascia)
    el.addEventListener('click', clic, true)

    return () => {
      ro?.disconnect(); mo?.disconnect()
      window.removeEventListener('resize', misura)
      el.removeEventListener('scroll', misura)
      el.removeEventListener('wheel', ruota)
      el.removeEventListener('pointerdown', premi)
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', lascia)
      el.removeEventListener('click', clic, true)
    }
  }, [])

  const sposta = (verso) => {
    const el = barra()
    el?.scrollBy({ left: verso * el.clientWidth * 0.7, behavior: 'smooth' })
  }
  const posto = { top: stato.top, height: stato.altezza, bottom: 'auto' }

  return (
    <div className="menu-scorrevole" ref={guscio}>
      {stato.sinistra && (
        <button type="button" className="freccia-menu sinistra" style={posto} onClick={() => sposta(-1)} aria-label="Voci precedenti">‹</button>
      )}
      {children}
      {stato.destra && (
        <button type="button" className="freccia-menu destra" style={posto} onClick={() => sposta(1)} aria-label="Altre voci">›</button>
      )}
    </div>
  )
}
