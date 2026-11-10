// Primo Giocatore - invio delle partite a BoardGameGeek (riquadro)
// v1.2.0 - 202611110900 (cosa manca su BGG: confronto con l'archivio e invio delle partite vecchie che mancano)
//
// useInvioBgg tiene lo stato del collegamento; i tre pezzi sotto lo
// mostrano nei punti giusti della sezione, senza un secondo riquadro.

import { useEffect, useState } from 'react'
import { chiamaInvioBgg, inviaABggSeServe, segnaCollegatoBgg } from './invioBgg'
import CasellaPassword from './CasellaPassword.jsx'
import { confrontaConBgg } from './confrontoBgg'

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
        <CasellaPassword id="bgg-password" value={invio.password} autoComplete="current-password"
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

// Le partite dell'archivio che su BGG non ci sono (di solito arrivate
// da BG Stats o dallo storico di BGA, che l'invio normale non manda).
const ORIGINI = [
  ['bgstats', 'arrivate da BG Stats'],
  ['bga', 'importate da Board Game Arena'],
  ['mano', 'registrate qui'],
]

function CosaMancaSuBgg({ invio, profilo }) {
  const [esito, setEsito] = useState(null)
  const [scelte, setScelte] = useState({ bgstats: true, bga: true, mano: true })
  const [lavoro, setLavoro] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  async function confronta() {
    setErrore(''); setMessaggio(''); setEsito(null); setLavoro('Leggo da BGG…')
    try {
      setEsito(await confrontaConBgg({
        utente: profilo.bgg_username.trim(), profiloId: profilo.id,
        avanzamento: (a) => setLavoro(`${a.fase}… ${a.fatto ? `${a.fatto} di ${a.totale}` : ''}`),
      }))
    } catch (e) { setErrore(e.message) } finally { setLavoro('') }
  }

  const scelteOra = (esito?.mancanti || []).filter((m) => scelte[m.origine])

  async function manda() {
    const quante = scelteOra.length
    if (!quante) return
    if (!window.confirm(
      `Mandare a BGG ${quante === 1 ? 'questa partita' : `queste ${quante} partite`}?\n\n`
      + 'Su BGG non si annulla in blocco: se qualcuna c\u2019era già con un\u2019altra data o un altro gioco, la troverai due volte e andrà tolta a mano.')) return
    setErrore(''); setMessaggio(''); setLavoro('Metto in coda…')
    try {
      const ids = scelteOra.map((m) => m.id)
      for (let i = 0; i < ids.length; i += 1000) await chiamaInvioBgg('richiedi', { ids: ids.slice(i, i + 1000) })
      let inviate = 0
      let errori = 0
      let finito = false
      for (let giro = 0; giro < 400 && !finito; giro++) {
        setLavoro(`Invio a BGG… ${inviate} di ${quante}`)
        const r = await chiamaInvioBgg('invia')
        if (r.scaduta) throw new Error('La sessione BGG è scaduta: rimetti la password per ricollegare, poi le partite in coda partono da sole.')
        inviate += r.inviate || 0
        errori += r.errori || 0
        finito = !r.continua
      }
      setMessaggio(`Inviate a BGG ${inviate} partite${errori ? `, ${errori} con errore` : ''}.`
        + (finito ? '' : ' Le altre restano in coda e partono da sole alle prossime aperture dell\u2019app.'))
      setEsito(null)
    } catch (e) {
      setErrore(`${e.message} Le partite già messe in coda partono da sole alla prossima apertura dell\u2019app.`)
    } finally { setLavoro('') }
  }

  return (
    <details className="dettagli-piccoli">
      <summary>Cosa manca su BGG?</summary>
      <p className="aiuto">
        Da sole partono verso BGG solo le partite registrate qui dopo aver attivato l&rsquo;invio. Quelle arrivate
        da BG Stats o dallo storico di Board Game Arena no: di solito su BGG le ha già messe BG Stats, ma non sempre.
        Qui si confronta il tuo archivio con quello che c&rsquo;è davvero su BGG e si mandano solo quelle che mancano.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}
      <button className="bottone bottone-secondario" onClick={confronta} disabled={Boolean(lavoro) || invio.occupato}>
        {lavoro || 'Confronta con BGG'}
      </button>

      {esito && (
        <>
          <p className="aiuto">
            Su BGG hai {esito.suBgg} partite. Del tuo archivio, {esito.giaSuBgg} ci sono già
            {esito.senzaBgg > 0 && `, ${esito.senzaBgg} sono di giochi non collegati a BGG (non si possono mandare)`}
            {' '}e <strong>{esito.mancanti.length} mancano</strong>.
          </p>
          {esito.mancanti.length > 0 && (
            <>
              {ORIGINI.map(([k, testo]) => {
                const n = esito.mancanti.filter((m) => m.origine === k).length
                if (!n) return null
                return (
                  <label key={k} className="aiuto" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={scelte[k]} disabled={Boolean(lavoro)}
                      onChange={(e) => setScelte({ ...scelte, [k]: e.target.checked })} />
                    <span>{n} {testo}</span>
                  </label>
                )
              })}
              <ul className="elenco-scorrevole" style={{ maxHeight: '14rem', overflowY: 'auto' }}>
                {scelteOra.slice(0, 300).map((m) => (
                  <li key={m.id}>{m.giorno.split('-').reverse().join('/')} · {m.gioco}{m.richiesta ? ' (già in coda)' : ''}</li>
                ))}
                {scelteOra.length > 300 && <li>… e altre {scelteOra.length - 300}</li>}
              </ul>
              <p className="aiuto">
                Controlla l&rsquo;elenco prima di mandare: se una partita su BGG c&rsquo;è già con un&rsquo;altra data
                o sotto un altro gioco (per esempio un&rsquo;espansione), qui risulta mancante. Ogni invio prende
                un paio di secondi: con molte partite conviene lasciare l&rsquo;app aperta.
              </p>
              <button className="bottone" onClick={manda} disabled={Boolean(lavoro) || invio.occupato || !scelteOra.length}>
                {lavoro || `Manda a BGG ${scelteOra.length === 1 ? 'la partita scelta' : `le ${scelteOra.length} scelte`}`}
              </button>
            </>
          )}
        </>
      )}
    </details>
  )
}

// Dentro «Altre azioni».
export function InvioBggAzioni({ invio, profilo }) {
  const s = invio.stato
  if (!s?.collegato) return null
  return (
    <>
      {!s.scaduta && profilo?.bgg_username?.trim() && <CosaMancaSuBgg invio={invio} profilo={profilo} />}
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
