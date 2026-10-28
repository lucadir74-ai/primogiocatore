// Primo Giocatore - striscia "Dalla Tana nazionale"
// v1.0.1 - 202610281300 (tolta la riga di spiegazione sotto la striscia)
//
// Una fila compatta in fondo alla pagina Tavoli. Non è una sezione
// dell'app: niente menu, niente notifiche. Le notizie si leggono sul
// sito della Tana; qui ci sono solo titolo, immagine e data.
// Si carica quando arriva in vista; se il sito non risponde sparisce.

import { useEffect, useRef, useState } from 'react'

const QUANTE = 3
const TUTTE = 'https://www.goblins.net/articoli'

const giorno = (iso) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export default function DallaTana() {
  const contenitore = useRef(null)
  const fila = useRef(null)
  const [notizie, setNotizie] = useState(null) // null = non ancora caricate
  const [nascosta, setNascosta] = useState(false)
  const [bordi, setBordi] = useState({ sinistra: false, destra: false })

  // Si chiede al server solo quando la striscia sta per entrare in vista.
  useEffect(() => {
    const el = contenitore.current
    if (!el) return
    let finito = false
    const carica = async () => {
      try {
        const r = await fetch('/api/tana')
        const d = await r.json()
        if (finito) return
        if (!r.ok || !Array.isArray(d.notizie) || d.notizie.length === 0) setNascosta(true)
        else setNotizie(d.notizie.slice(0, QUANTE))
      } catch {
        if (!finito) setNascosta(true)
      }
    }
    if (!('IntersectionObserver' in window)) { carica(); return () => { finito = true } }
    const osserva = new IntersectionObserver((voci) => {
      if (voci.some((v) => v.isIntersecting)) { osserva.disconnect(); carica() }
    }, { rootMargin: '300px' })
    osserva.observe(el)
    return () => { finito = true; osserva.disconnect() }
  }, [])

  function misura() {
    const el = fila.current
    if (!el) return
    setBordi({
      sinistra: el.scrollLeft > 4,
      destra: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }

  useEffect(() => {
    misura()
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [notizie])

  const sposta = (verso) =>
    fila.current?.scrollBy({ left: verso * fila.current.clientWidth * 0.8, behavior: 'smooth' })

  if (nascosta) return null

  return (
    <section className="dalla-tana" ref={contenitore} aria-labelledby="dalla-tana-titolo">
      <h3 className="titolo-sezione" id="dalla-tana-titolo">Dalla Tana nazionale</h3>

      {notizie && (
        <div className="menu-scorrevole">
          {bordi.sinistra && (
            <button type="button" className="freccia-menu sinistra" onClick={() => sposta(-1)}
              aria-label="Notizie precedenti">‹</button>
          )}
          <ul className="tana-fila" ref={fila} onScroll={misura}>
            {notizie.map((n) => (
              <li key={n.link}>
                <a className="tana-notizia" href={n.link} target="_blank" rel="noopener noreferrer">
                  <span className="tana-foto">
                    {n.immagine && <img src={n.immagine} alt="" loading="lazy" decoding="async" />}
                  </span>
                  <span className="tana-testo">
                    {n.data && <span className="tana-data">{giorno(n.data)}</span>}
                    <span className="tana-titolo">{n.titolo}</span>
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a className="tana-notizia tana-tutte" href={TUTTE} target="_blank" rel="noopener noreferrer">
                Tutte le notizie su goblins.net
              </a>
            </li>
          </ul>
          {bordi.destra && (
            <button type="button" className="freccia-menu destra" onClick={() => sposta(1)}
              aria-label="Altre notizie">›</button>
          )}
        </div>
      )}
    </section>
  )
}
