// Primo Giocatore - tempi dell'app, per capire dove rallenta
// v1.0.0 - 202611041200

import { useState } from 'react'
import { leggiMisure, azzeraMisure, descriviDispositivo } from './misure'

const ora = (q) => new Date(q).toLocaleString('it-IT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const secondi = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)

function testo(m) {
  const righe = [`Dispositivo: ${descriviDispositivo()}`, '', 'FASI']
  for (const f of m.fasi.slice().reverse()) righe.push(`${ora(f.q)}  ${secondi(f.ms)}  ${f.nome}${f.d ? ` (${f.d})` : ''}`)
  righe.push('', 'BLOCCHI DELLO SCHERMO (oltre 50 ms)')
  for (const b of m.blocchi.slice().reverse()) righe.push(`${ora(b.q)}  ${secondi(b.ms)}  a ${b.dopo} s dall'apertura  pagina: ${b.pagina || '?'}  fasi: ${b.fasi || '-'}`)
  return righe.join('\n')
}

export default function Tempi() {
  const [m, setM] = useState(() => leggiMisure())
  const [esito, setEsito] = useState('')
  const lunghi = m.blocchi.filter((b) => b.ms >= 200).length
  const maxBlocco = m.blocchi.reduce((x, b) => Math.max(x, b.ms), 0)

  async function copia() {
    try { await navigator.clipboard.writeText(testo(m)); setEsito('Copiato: incollalo dove ti serve.') } catch { setEsito('Non riesco a copiare: tieni premuto sul testo e copialo a mano.') }
  }

  return (
    <>
      <p className="aiuto">
        Qui l&rsquo;app segna quanto durano le sincronizzazioni e quando lo schermo si blocca.
        I numeri restano su questo telefono; non vanno a nessuno finché non li copi tu.
      </p>
      <p className="aiuto">{descriviDispositivo()}</p>
      <p className="aiuto">
        {m.blocchi.length
          ? `Blocchi registrati: ${m.blocchi.length} (${lunghi} oltre 200 ms, il peggiore ${secondi(maxBlocco)}).`
          : 'Nessun blocco registrato finora.'}
      </p>

      <details className="dettagli-piccoli">
        <summary>Blocchi dello schermo</summary>
        {m.blocchi.length === 0 && <p className="aiuto">Niente da mostrare.</p>}
        <ul className="aiuto" style={{ paddingLeft: '1.1rem' }}>
          {m.blocchi.slice().reverse().slice(0, 25).map((b, i) => (
            <li key={i}>
              <strong>{secondi(b.ms)}</strong> · {ora(b.q)} · pagina {b.pagina || '?'}
              {b.fasi ? ` · durante: ${b.fasi}` : ''}
            </li>
          ))}
        </ul>
      </details>

      <details className="dettagli-piccoli">
        <summary>Fasi di lavoro</summary>
        {m.fasi.length === 0 && <p className="aiuto">Niente da mostrare.</p>}
        <ul className="aiuto" style={{ paddingLeft: '1.1rem' }}>
          {m.fasi.slice().reverse().slice(0, 25).map((f, i) => (
            <li key={i}>
              <strong>{secondi(f.ms)}</strong> · {f.nome}{f.d ? ` (${f.d})` : ''} · {ora(f.q)}
            </li>
          ))}
        </ul>
      </details>

      <button className="bottone" onClick={copia}>Copia tutto</button>
      <button className="bottone bottone-secondario" onClick={() => { azzeraMisure(); setM(leggiMisure()); setEsito('Azzerato.') }}>
        Azzera
      </button>
      <button className="bottone bottone-secondario" onClick={() => setM(leggiMisure())}>Aggiorna</button>
      {esito && <p className="aiuto">{esito}</p>}
    </>
  )
}
