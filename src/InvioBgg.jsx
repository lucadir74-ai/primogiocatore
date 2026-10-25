// Primo Giocatore - collegamento per inviare le partite a BoardGameGeek
// v1.0.0 - 202610252330

import { useEffect, useState } from 'react'
import { chiamaInvioBgg, inviaABggSeServe, segnaCollegatoBgg } from './invioBgg'

const quando = (x) => new Date(x).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function InvioBgg({ profilo }) {
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
        setMessaggio(parti.length ? `Fatto: ${parti.join(', ')}.` : 'Niente da inviare: BGG è in pari.')
      }
      setStato(await chiamaInvioBgg('stato'))
    } catch (e) { setErrore(e.message) } finally { setOccupato(false) }
  }

  function collega() {
    esegui('collega', { password }, () => {
      setPassword('')
      setMessaggio('BGG collegato. Da ora le partite che registri qui partono da sole verso BGG.')
    })
  }

  const modulo = (etichetta) => (
    <>
      <div className="campo">
        <label htmlFor="bgg-password">Password BGG di {profilo.bgg_username}</label>
        <input id="bgg-password" type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && password) collega() }} />
      </div>
      <button className="bottone" onClick={collega} disabled={occupato || !password}>
        {occupato ? 'Collego…' : etichetta}
      </button>
    </>
  )

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 className="titolo-sezione">Invio a BGG</h3>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {!stato && !errore && <p className="aiuto">Controllo…</p>}

      {stato && !stato.collegato && (
        !profilo.bgg_username ? (
          <p className="aiuto">Per inviare le partite a BGG scrivi prima il tuo nome utente qui sopra e premi «Aggiorna da BGG».</p>
        ) : (
          <>
            <p className="aiuto">
              Le partite che registri in Primo Giocatore possono finire anche su BGG, come con BG Stats.
              La password serve una volta per entrare e non viene salvata: si conserva solo la sessione
              di BGG, cifrata, che puoi cancellare quando vuoi con «Scollega».
            </p>
            <p className="aiuto">
              Partono solo le partite registrate da ora in poi. Se registri le stesse partite anche su
              BG Stats con l&rsquo;invio a BGG acceso, non collegare: su BGG le troveresti due volte.
            </p>
            {modulo('Collega BGG')}
          </>
        )
      )}

      {stato?.collegato && (
        <>
          <p className="aiuto">
            Collegato come <strong>{stato.utente}</strong>. Le partite che registri qui partono da sole
            verso BGG; se ne modifichi o cancelli una, la correzione arriva anche lì.
            {stato.ultimo_invio && ` Ultimo invio: ${quando(stato.ultimo_invio)}.`}
            {stato.in_attesa > 0 && ` In attesa: ${stato.in_attesa}.`}
          </p>
          {stato.scaduta ? (
            <>
              <div className="avviso errore">La sessione BGG è scaduta: rimetti la password per ricollegare. Le partite in attesa partono subito dopo.</div>
              {modulo('Ricollega')}
            </>
          ) : (
            <button className="bottone" onClick={inviaOra} disabled={occupato}>
              {occupato ? 'Invio…' : 'Invia ora'}
            </button>
          )}
          {stato.con_errore > 0 && (
            <div className="avviso errore">
              {stato.con_errore === 1 ? '1 partita non è partita' : `${stato.con_errore} partite non sono partite`}
              {' '}(di solito: gioco non collegato a BGG). Se la correggi riparte da sola.
              {' '}<button className="bottone bottone-secondario" onClick={() => esegui('riprova')} disabled={occupato}>Riprova</button>
            </div>
          )}
          <details className="dettagli-piccoli">
            <summary>Altre impostazioni</summary>
            <label className="aiuto" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={Boolean(stato.invia_bga)} disabled={occupato}
                onChange={(e) => esegui('opzioni', { invia_bga: e.target.checked })} />
              <span>
                Invia anche le partite importate da Board Game Arena (da ora in poi).
                {' '}Lascialo spento se usi BG Stats: le manda già lui, e su BGG le troveresti due volte.
              </span>
            </label>
            <button className="bottone bottone-secondario" onClick={() => esegui('scollega')} disabled={occupato}>
              Scollega BGG
            </button>
          </details>
        </>
      )}
    </div>
  )
}
