// Primo Giocatore - l'avviso «c'è una versione nuova»
// v1.0.0 - 202611132100 (vedi aggiornamento.js)

import { useEffect, useState } from 'react'
import { versioneNuovaPronta, seguiAggiornamento, aggiornaOra } from './aggiornamento'

export default function Aggiornamento() {
  const [pronta, setPronta] = useState(versioneNuovaPronta)
  const [attesa, setAttesa] = useState(false)
  useEffect(() => seguiAggiornamento(setPronta), [])
  if (!pronta) return null
  return (
    <div className="scheda scheda-sottile" role="status">
      <p className="aiuto" style={{ margin: 0 }}>
        È pronta una versione nuova dell&rsquo;app.{' '}
        <button type="button" className="bottone-piatto" disabled={attesa}
          onClick={() => { setAttesa(true); aggiornaOra() }}>
          {attesa ? 'Aggiorno\u2026' : 'Aggiorna'}
        </button>
      </p>
    </div>
  )
}
