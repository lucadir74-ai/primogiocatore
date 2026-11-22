// Primo Giocatore - barra di avanzamento, uguale in tutta l'app
// v1.0.0 - 202611231400
//
// Tre modi, a seconda di quello che si sa:
// - fatto e totale (totale > 1): barra piena per la parte fatta, e «12 / 40»;
// - stima (secondi): barra che avanza col tempo, rallentando verso la fine
//   (serve quando aspetta il server, che non dice a che punto è);
// - niente: barra che scorre, per dire «sto lavorando».
// Prima, nelle fasi senza totale, la barra restava vuota e sembrava ferma.

import { useEffect, useState } from 'react'

export default function Avanzamento({ fase, fatto = 0, totale = 1, stima = 0 }) {
  const determinata = totale > 1
  const [trascorsi, setTrascorsi] = useState(0)

  useEffect(() => {
    if (determinata || !stima) return
    const inizio = Date.now()
    setTrascorsi(0)
    const id = setInterval(() => setTrascorsi((Date.now() - inizio) / 1000), 250)
    return () => clearInterval(id)
  }, [determinata, stima, fase])

  // Con la stima: a quel tempo la barra è a circa tre quarti, poi rallenta
  // e non arriva mai in fondo da sola (in fondo ci va quando ha finito).
  const quota = determinata
    ? Math.min(1, fatto / totale)
    : stima ? 0.95 * (1 - Math.exp(-1.4 * trascorsi / stima)) : null

  return (
    <div className="avanzamento" role="progressbar" aria-label={fase}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota == null ? undefined : Math.round(quota * 100)}>
      <span>{fase}</span>
      <div className={'barra-avanzamento' + (quota == null ? ' indeterminata' : '')}>
        <div style={quota == null ? undefined : { width: `${quota * 100}%` }} />
      </div>
      {determinata && <span className="anno">{fatto} / {totale}</span>}
    </div>
  )
}
