// Primo Giocatore - "Sei tu su Board Game Arena?"
// v1.0.0 - 202610042130
//
// Il riquadro che compare quando nelle tue partite da BGG c'è un nome
// che quasi certamente sei tu (il tuo nome su Board Game Arena). Un
// tocco su Sì e le partite tornano tue; No e non viene più chiesto.

import { useEffect, useState } from 'react'
import { cercaNomeBga, confermaNomeBga, scartaNomeBga } from './sincroBgg'

export default function NomeBga({ profilo, quando }) {
  const [trovato, setTrovato] = useState(null)
  const [lavorando, setLavorando] = useState(false)
  const [esito, setEsito] = useState('')

  useEffect(() => {
    if (!profilo?.bgg_username) return
    // La ricerca legge tutte le partite da BGG: con archivi grandi è
    // pesante. Si fa una volta al giorno, e subito dopo un import.
    const chiave = `primo-giocatore:controllo-nome-bga:${profilo.id}`
    try {
      const ultimo = Number(localStorage.getItem(chiave) || 0)
      if (!quando && Date.now() - ultimo < 24 * 3600000) return
      localStorage.setItem(chiave, String(Date.now()))
    } catch { /* senza memoria si controlla lo stesso */ }
    let vivo = true
    cercaNomeBga(profilo.id)
      .then((t) => { if (vivo) setTrovato(t) })
      .catch(() => { /* si riprova alla prossima occasione */ })
    return () => { vivo = false }
  }, [profilo?.id, quando])

  async function si() {
    setLavorando(true)
    try {
      await confermaNomeBga(profilo.id, trovato)
      setEsito(`Fatto: ${trovato.partite} ${trovato.partite === 1 ? 'partita è' : 'partite sono'} tornate tue, e le prossime ti riconosceranno da sole.`)
      setTrovato(null)
    } catch (e) {
      setEsito(`Non ci sono riuscito: ${e.message}`)
    } finally {
      setLavorando(false)
    }
  }

  function no() {
    scartaNomeBga(profilo.id, trovato.nome)
    setTrovato(null)
  }

  if (esito) {
    return (
      <div className="scheda scheda-sottile">
        <p className="aiuto" style={{ margin: 0 }}>
          {esito} <button className="bottone-piatto" onClick={() => setEsito('')}>ok</button>
        </p>
      </div>
    )
  }
  if (!trovato) return null

  return (
    <div className="scheda scheda-sottile">
      <p className="aiuto" style={{ margin: 0 }}>
        In {trovato.partite} partite arrivate da BGG non compari tu, ma compare
        sempre «<strong>{trovato.nome}</strong>»: probabilmente è il tuo nome su
        Board Game Arena. Sei tu?{' '}
        <button className="bottone-piatto" onClick={si} disabled={lavorando}>
          {lavorando ? 'Sposto…' : 'Sì, sono io'}
        </button>{' '}
        <button className="bottone-piatto" onClick={no} disabled={lavorando}>No</button>
      </p>
    </div>
  )
}
