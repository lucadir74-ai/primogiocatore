// Primo Giocatore - informazioni sull'app
// v1.0.0 - 202611181200
//
// Profilo → Info: versione, autore e novità di ogni uscita (src/novita.js).

import { VERSIONE, FIRMA, NOVITA } from './novita'

const dataBreve = (s) =>
  new Date(`${s}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

function Voci({ voci }) {
  return (
    <ul className="info-voci">
      {voci.map((v) => <li key={v}>{v}</li>)}
    </ul>
  )
}

export default function Info() {
  const [ultima, ...prima] = NOVITA
  return (
    <div className="scheda info">
      <div className="info-testa">
        <img src="/logo-primo-giocatore.svg" alt="" width="56" height="56" />
        <div>
          <h2>Primo Giocatore</h2>
          <p className="info-versione">
            Versione {VERSIONE}
            {ultima && <> · {dataBreve(ultima.data)}</>}
          </p>
        </div>
      </div>

      <p className="info-firma">
        Ideata e sviluppata da <strong>{FIRMA.nome}</strong>, aka <em>{FIRMA.soprannome}</em>
      </p>

      <h3>Novità</h3>
      {ultima && (
        <section className="info-uscita">
          <h4>
            {ultima.versione}
            <span className="info-data">{dataBreve(ultima.data)}</span>
          </h4>
          <Voci voci={ultima.voci} />
        </section>
      )}

      {prima.map((u) => (
        <details key={u.versione} className="info-uscita">
          <summary>
            <span className="info-numero">{u.versione}</span>
            <span className="info-data">{dataBreve(u.data)}</span>
          </summary>
          <Voci voci={u.voci} />
        </details>
      ))}

      <p className="info-piede">© {new Date().getFullYear()} {FIRMA.nome}</p>
    </div>
  )
}
