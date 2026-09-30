// Primo Giocatore - cronometro della partita
// v1.0.0 - 202609302330
//
// Prima era una barra con play e tempo, e sembrava un lettore musicale.
// Ora è un quadrante da cronometro: sessanta tacche, l'arco che gira
// con i secondi, le cifre grandi al centro. Il colore è il giallo del
// segnalino del primo giocatore, e si accende solo quando corre.

const TACCHE = Array.from({ length: 60 }, (_, i) => i)
const R = 52                        // raggio dell'arco dei secondi
const CIRCONFERENZA = 2 * Math.PI * R

function cifre(secondi) {
  const o = Math.floor(secondi / 3600)
  const m = Math.floor((secondi % 3600) / 60)
  const s = secondi % 60
  const due = (n) => String(n).padStart(2, '0')
  return o > 0 ? `${o}:${due(m)}:${due(s)}` : `${due(m)}:${due(s)}`
}

export default function Cronometro({ secondi, inCorso, onAvviaFerma, onAzzera }) {
  const nelMinuto = secondi % 60
  // A minuto pieno l'arco resta chiuso invece di sparire.
  const frazione = secondi > 0 && nelMinuto === 0 ? 1 : nelMinuto / 60
  const stato = inCorso ? 'in corso' : secondi > 0 ? 'in pausa' : 'pronto'

  return (
    <div className={`cronometro${inCorso ? ' corre' : ''}`}>
      <div className="quadrante" role="timer" aria-live="off"
        aria-label={`Cronometro ${stato}: ${cifre(secondi)}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          {TACCHE.map((i) => {
            const lunga = i % 5 === 0
            const a = (i / 60) * 2 * Math.PI
            const r1 = lunga ? 44 : 46.5
            const r2 = 49
            return (
              <line key={i}
                x1={60 + r1 * Math.sin(a)} y1={60 - r1 * Math.cos(a)}
                x2={60 + r2 * Math.sin(a)} y2={60 - r2 * Math.cos(a)}
                className={lunga ? 'tacca lunga' : 'tacca'} />
            )
          })}
          <circle cx="60" cy="60" r={R} className="pista" />
          {/* Una chiave per minuto: al giro nuovo l'arco riparte da zero senza tornare indietro. */}
          {frazione > 0 && <circle key={Math.floor(Math.max(0, secondi - 1) / 60)} cx="60" cy="60" r={R} className="arco"
            strokeDasharray={`${CIRCONFERENZA * frazione} ${CIRCONFERENZA}`}
            transform="rotate(-90 60 60)" />}
        </svg>
        <div className="cifre">
          <span className={`tempo${secondi >= 3600 ? ' con-ore' : ''}`}>{cifre(secondi)}</span>
          <span className="stato-cronometro">{stato}</span>
        </div>
      </div>

      <div className="comandi-cronometro">
        <button type="button" className="tasto-cronometro principale" onClick={onAvviaFerma}>
          {inCorso ? 'Pausa' : secondi > 0 ? 'Riprendi' : 'Avvia'}
        </button>
        {secondi > 0 && !inCorso && (
          <button type="button" className="tasto-cronometro" onClick={onAzzera}>Azzera</button>
        )}
      </div>
    </div>
  )
}
