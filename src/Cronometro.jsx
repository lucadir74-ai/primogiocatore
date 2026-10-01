// Primo Giocatore - cronometro della partita
// v2.0.0 - 202609301830
//
// Compatto, come quello di BG Stats ma più leggibile: un riquadro con
// l'icona del cronometro e il tempo. Si tocca per avviare e mettere in
// pausa. Il giallo del segnalino si accende solo mentre il tempo corre.

function cifre(secondi) {
  const o = Math.floor(secondi / 3600)
  const m = Math.floor((secondi % 3600) / 60)
  const s = secondi % 60
  const due = (n) => String(n).padStart(2, '0')
  return `${o}:${due(m)}:${due(s)}`
}

// Cassa del cronometro con dentro play o pausa.
function Icona({ inCorso }) {
  return (
    <svg viewBox="0 0 24 24" className="icona-cronometro" aria-hidden="true">
      <circle cx="12" cy="13.5" r="8" fill="none" strokeWidth="2" />
      <path d="M10 2.5h4M12 2.5v3M18.2 6.3l1.4-1.4" fill="none" strokeWidth="2" strokeLinecap="round" />
      {inCorso ? (
        <path d="M10.3 10.5v6M13.7 10.5v6" fill="none" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M10.5 10.2l4.6 3.3-4.6 3.3z" className="pieno" />
      )}
    </svg>
  )
}

export default function Cronometro({ secondi, inCorso, onAvviaFerma, onAzzera }) {
  const stato = inCorso ? 'in corso' : secondi > 0 ? 'in pausa' : 'fermo'
  return (
    <div className="cronometro">
      <button type="button" className={`tasto-cronometro${inCorso ? ' corre' : ''}`} onClick={onAvviaFerma}
        aria-label={`${inCorso ? 'Metti in pausa' : secondi > 0 ? 'Riprendi' : 'Avvia'} il cronometro, ${stato}: ${cifre(secondi)}`}>
        <Icona inCorso={inCorso} />
        <span className="tempo-cronometro">{cifre(secondi)}</span>
      </button>
      {secondi > 0 && !inCorso && (
        <button type="button" className="azzera-cronometro" onClick={onAzzera} aria-label="Azzera il cronometro">
          azzera
        </button>
      )}
    </div>
  )
}
