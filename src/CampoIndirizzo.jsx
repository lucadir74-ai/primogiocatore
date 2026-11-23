// Primo Giocatore - campo indirizzo con «Trova»
// v1.1.0 - 202611231000 (senzaCasa)
//
// Si scrive l'indirizzo, si preme «Trova» e si tocca il risultato giusto.
// Niente risultati mentre si scrive: Nominatim (OpenStreetMap) non lo
// permette. La spunta «casa privata» decide chi vede l'indirizzo.
//
// valore: { indirizzo, zona, lat, lon, pubblica } oppure null
// onCambia(valore | null)

import { useState } from 'react'
import { cercaIndirizzo } from './indirizzo'

// senzaCasa: per i luoghi sempre pubblici (la sede di un evento), niente spunta «casa privata».
export default function CampoIndirizzo({ id = 'campo-indirizzo', valore, onCambia, casa = false, senzaCasa = false }) {
  const [testo, setTesto] = useState(valore?.indirizzo || '')
  const [risultati, setRisultati] = useState(null)
  const [cercando, setCercando] = useState(false)
  const [errore, setErrore] = useState('')

  async function trova() {
    setErrore('')
    if (testo.trim().length < 3) { setErrore('Scrivi via, numero e città.'); return }
    setCercando(true)
    try {
      const r = await cercaIndirizzo(testo)
      setRisultati(r)
      if (r.length === 0) setErrore('Nessun indirizzo trovato. Prova con meno parole (es. «Piazza Kennedy 28, Montesilvano») oppure col nome del posto («Grand Hotel Montesilvano»).')
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercando(false)
    }
  }

  function scegli(r) {
    onCambia({ indirizzo: r.indirizzo, zona: r.zona, lat: r.lat, lon: r.lon, pubblica: valore?.pubblica ?? !casa })
    setTesto(r.indirizzo)
    setRisultati(null)
  }

  return (
    <div className="campo-indirizzo">
      {valore ? (
        <p className="indirizzo-scelto">
          <strong>{valore.indirizzo}</strong>
          {valore.zona && <span className="anno block">{valore.zona}</span>}
          <button type="button" className="bottone-piatto" onClick={() => onCambia(null)}>cambia</button>
        </p>
      ) : (
        <>
          <div className="riga-trova">
            <input id={id} value={testo} onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); trova() } }}
              placeholder="Via, numero civico, città" autoComplete="street-address" />
            <button type="button" className="bottone bottone-secondario" onClick={trova} disabled={cercando}>
              {cercando ? 'Cerco…' : 'Trova'}
            </button>
          </div>
          {errore && <p className="aiuto errore-testo" role="alert">{errore}</p>}
          {risultati?.length > 0 && (
            <>
              <ul className="risultati-indirizzo">
                {risultati.map((r, i) => (
                  <li key={`${r.lat},${r.lon},${i}`}>
                    <button type="button" onClick={() => scegli(r)}>
                      <strong>{r.indirizzo}</strong>
                      <span>{r.descrizione}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="aiuto">Tocca quello giusto. Dati © OpenStreetMap contributors.</p>
            </>
          )}
        </>
      )}

      {valore && !senzaCasa && (
        <label className="spunta-fazioni">
          <input type="checkbox" checked={!valore.pubblica}
            onChange={(e) => onCambia({ ...valore, pubblica: !e.target.checked })} />
          Casa privata: l&rsquo;indirizzo lo vede solo chi ha l&rsquo;iscrizione confermata
        </label>
      )}
    </div>
  )
}
