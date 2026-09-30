// Primo Giocatore - scelta di giorno e ora
// v1.0.0 - 202609301800
//
// Il selettore di data e ora del telefono non fa capire come si
// conferma. Qui si tocca un giorno e un orario: la scelta vale subito e
// il riepilogo in alto dice cosa è stato scelto. Le serate in calendario
// sono segnate, e scegliendone una l'orario parte da quello della serata.
// Per giorni e orari fuori dall'elenco restano i campi del telefono.

import { useState } from 'react'

const ORE = ['10:00', '15:00', '18:00', '20:30', '21:00', '21:30']

const p2 = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

const nomeGiorno = (s, lungo = false) =>
  new Date(s + 'T12:00').toLocaleDateString('it-IT', lungo
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'short' })

function prossimiGiorni(n) {
  const oggi = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + i)
    return iso(d)
  })
}

// Solo l'orario: per chi ha già il giorno (per esempio la serata).
export function SceltaOra({ valore, onCambia, ore = ORE }) {
  const [altro, setAltro] = useState(false)
  const fuori = valore && !ore.includes(valore)
  return (
    <div className="pastiglie-persone">
      {ore.map((o) => (
        <button type="button" key={o}
          className={`pastiglia-nome${valore === o ? ' scelta' : ''}`}
          aria-pressed={valore === o}
          onClick={() => { setAltro(false); onCambia(o) }}>
          {o}
        </button>
      ))}
      {altro || fuori ? (
        <input type="time" className="campo-ora" value={valore || ''} autoFocus={altro && !fuori}
          onChange={(e) => onCambia(e.target.value)} aria-label="Altro orario" />
      ) : (
        <button type="button" className="pastiglia-nome ospite" onClick={() => setAltro(true)}>
          altro orario…
        </button>
      )}
    </div>
  )
}

// valore: 'AAAA-MM-GGTHH:MM' oppure ''. serate: [{ data, ora_inizio }].
export default function SceltaQuando({ valore, onCambia, serate = [], facoltativo = false, giorni = 14 }) {
  const [data, ora] = valore ? valore.split('T') : ['', '']
  const elenco = prossimiGiorni(giorni)
  const [altraData, setAltraData] = useState(false)
  const dataFuori = data && !elenco.includes(data)
  const serataDi = (d) => serate.find((s) => s.data === d)

  function scegliGiorno(d) {
    // Se è una serata e l'orario non è ancora deciso, parte da quello della serata.
    const oraSerata = serataDi(d)?.ora_inizio?.slice(0, 5)
    onCambia(`${d}T${ora || oraSerata || '21:00'}`)
  }

  return (
    <div>
      <p className={`riepilogo-quando${valore ? '' : ' vuoto'}`}>
        {valore
          ? <>✓ {nomeGiorno(data, true)}, alle {ora}</>
          : facoltativo ? 'Nessuna scadenza' : 'Tocca un giorno e un orario'}
        {valore && facoltativo && (
          <button type="button" className="bottone-piatto" onClick={() => onCambia('')}> togli</button>
        )}
      </p>

      <div className="giorni-scorrevoli">
        {elenco.map((d) => {
          const s = serataDi(d)
          return (
            <button type="button" key={d}
              className={`pastiglia-nome${data === d ? ' scelta' : ''}${s ? ' con-serata' : ''}`}
              aria-pressed={data === d}
              onClick={() => { setAltraData(false); scegliGiorno(d) }}>
              {d === elenco[0] ? 'oggi' : d === elenco[1] ? 'domani' : nomeGiorno(d)}
              {s && <span className="segno-serata" aria-label="serata in calendario"> ●</span>}
            </button>
          )
        })}
      </div>

      <div className="pastiglie-persone">
        {altraData || dataFuori ? (
          <input type="date" className="campo-ora" value={data || ''}
            onChange={(e) => e.target.value && scegliGiorno(e.target.value)} aria-label="Altra data" />
        ) : (
          <button type="button" className="pastiglia-nome ospite" onClick={() => setAltraData(true)}>
            altra data…
          </button>
        )}
      </div>

      {data && (
        <SceltaOra valore={ora} onCambia={(o) => onCambia(`${data}T${o}`)} />
      )}

      {serate.length > 0 && <p className="aiuto">● = serata in calendario</p>}
    </div>
  )
}
