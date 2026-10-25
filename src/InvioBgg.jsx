// Primo Giocatore - invio delle partite a BoardGameGeek (riquadro)
// v1.1.0 - 202610260000 (un solo riquadro BGG: i pezzi dell'invio si inseriscono nella sezione BoardGameGeek di Dati e import)
//
// useInvioBgg tiene lo stato del collegamento; i tre pezzi sotto lo
// mostrano nei punti giusti della sezione, senza un secondo riquadro.

import { useEffect, useState } from 'react'
import { chiamaInvioBgg, inviaABggSeServe, segnaCollegatoBgg } from './invioBgg'

const quando = (x) => new Date(x).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function useInvioBgg(profilo) {
  const [stato, setStato] = useState(null)
  const [password, setPassword] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  async function esegui(azione, extra, dopo) {
    setErrore(''); setMessaggio(''); setOccupato(true)
    try {
      const s = await chiamaInvioBgg(azione, extra)
      setStato(s)
      segnaCollegatoBgg(profilo.id, Boolean(s.collegato))
      dopo?.(s)
    } catch (e) { setErrore(e.message) } finally { setOccupato(false) }
  }

  useEffect(() => { esegui('stato') }, [profilo.id])

  async function inviaOra() {
    setErrore(''); setMessaggio(''); setOccupato(true)
    try {
      const r = await inviaABggSeServe(profilo)
      if (r?.scaduta) setErrore('La sessione BGG è scaduta: rimetti la password per ricollegare.')
      else if (r) {
        const parti = []
        if (r.inviate) parti.push(`${r.inviate} inviate`)
        if (r.aggiornate) parti.push(`${r.aggiornate} corrette`)
        if (r.eliminate) parti.push(`${r.eliminate} tolte da BGG`)
        if (r.errori) parti.push(`${r.errori} con errore`)
        setMessaggio(parti.length ? `Invio a BGG: ${parti.join(', ')}.` : 'Invio a BGG: niente da mandare, BGG è in pari.')
      }
      setStato(await chiamaInvioBgg('stato'))
    } catch (e) { setErrore(e.message) } finally { setOccupato(false) }
  }

  function collega() {
    esegui('collega', { password }, () => {
      setPassword('')
      setMessaggio('Invio a BGG attivo: da ora le partite che registri qui partono da sole anche verso BGG.')
    })
  }

  return {
    stato, password, setPassword, occupato, errore, messaggio, inviaOra, collega,
    riprova: () => esegui('riprova'),
    scollega: () => esegui('scollega'),
    cambiaBga: (si) => esegui('opzioni', { invia_bga: si }),
  }
}

function CampoPassword({ invio, profilo, etichetta }) {
  return (
    <>
      <div className="campo">
        <label htmlFor="bgg-password">Password BGG di {profilo.bgg_username}</label>
        <input id="bgg-password" type="password" value={invio.password} autoComplete="current-password"
          onChange={(e) => invio.setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && invio.password) invio.collega() }} />
      </div>
      <button className="bottone bottone-secondario" onClick={invio.collega} disabled={invio.occupato || !invio.password}>
        {invio.occupato ? 'Collego…' : etichetta}
      </button>
    </>
  )
}

// Sotto «Aggiorna da BGG»: com'è messo l'invio e i suoi avvisi.
export function InvioBggStato({ invio, profilo }) {
  const s = invio.stato
  return (
    <>
      {invio.errore && <div className="avviso errore">{invio.errore}</div>}
      {invio.messaggio && <div className="avviso ok">{invio.messaggio}</div>}

      {s && !s.collegato && profilo.bgg_username && (
        <details className="dettagli-piccoli">
          <summary>Invia a BGG anche le partite registrate qui</summary>
          <p className="aiuto">
            Come con BG Stats. La password serve una volta per entrare e non viene salvata: si conserva
            solo la sessione di BGG, cifrata, che puoi cancellare quando vuoi. Partono solo le partite
            registrate da quel momento; se le modifichi o le cancelli, la correzione arriva anche su BGG.
          </p>
          <p className="aiuto">
            Se registri le stesse partite anche su BG Stats con l&rsquo;invio a BGG acceso, non attivarlo:
            su BGG le troveresti due volte.
          </p>
          <CampoPassword invio={invio} profilo={profilo} etichetta="Attiva l’invio a BGG" />
        </details>
      )}

      {s?.collegato && (
        <p className="aiuto">
          Invio a BGG attivo: le partite che registri qui partono da sole anche verso BGG.
          {s.ultimo_invio && ` Ultimo invio: ${quando(s.ultimo_invio)}.`}
          {s.in_attesa > 0 && ` In attesa: ${s.in_attesa}.`}
        </p>
      )}

      {s?.collegato && s.scaduta && (
        <>
          <div className="avviso errore">La sessione BGG è scaduta: rimetti la password per ricollegare. Le partite in attesa partono subito dopo.</div>
          <CampoPassword invio={invio} profilo={profilo} etichetta="Ricollega" />
        </>
      )}

      {s?.collegato && s.con_errore > 0 && (
        <div className="avviso errore">
          {s.con_errore === 1 ? '1 partita non è partita verso BGG' : `${s.con_errore} partite non sono partite verso BGG`}
          {' '}(di solito: gioco non collegato a BGG). Se la correggi riparte da sola.
          {' '}<button className="bottone bottone-secondario" onClick={invio.riprova} disabled={invio.occupato}>Riprova</button>
        </div>
      )}
    </>
  )
}

// Dentro «Altre azioni».
export function InvioBggAzioni({ invio }) {
  const s = invio.stato
  if (!s?.collegato) return null
  return (
    <>
      {!s.scaduta && (
        <button className="bottone bottone-secondario" onClick={invio.inviaOra} disabled={invio.occupato}>
          {invio.occupato ? 'Invio…' : 'Invia ora a BGG'}
        </button>
      )}
      <label className="aiuto" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={Boolean(s.invia_bga)} disabled={invio.occupato}
          onChange={(e) => invio.cambiaBga(e.target.checked)} />
        <span>
          Invia a BGG anche le partite importate da Board Game Arena (da ora in poi).
          {' '}Lascialo spento se usi BG Stats: le manda già lui, e su BGG le troveresti due volte.
        </span>
      </label>
      <button className="bottone bottone-secondario" onClick={invio.scollega} disabled={invio.occupato}>
        Disattiva l&rsquo;invio a BGG
      </button>
    </>
  )
}
