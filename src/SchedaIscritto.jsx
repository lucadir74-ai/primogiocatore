// Primo Giocatore - scheda di un iscritto vista dagli organizzatori
// v1.0.0 - 202610211945
// Si apre toccando un nome nella pagina Ruoli. Dati base dell'account e
// a che punto è con la sincronizzazione: solo numeri, nessun titolo né
// avversario, così la riservatezza delle partite resta intatta.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

const STATI = { socio: 'socio', in_attesa: 'in attesa', eccezione: 'entra come eccezione', escluso: 'non ammesso' }

const giorno = (d) => (d
  ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  : null)

function Riga({ etichetta, valore, tono }) {
  return (
    <li>
      <span className="anno">{etichetta}</span>
      <strong style={{ textAlign: 'right', color: tono === 'no' ? 'var(--inchiostro-tenue)' : undefined, fontWeight: tono === 'no' ? 400 : undefined }}>
        {valore}
      </strong>
    </li>
  )
}

export default function SchedaIscritto({ id, onChiudi }) {
  const [s, setS] = useState(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    let vivo = true
    supabase.rpc('scheda_iscritto', { p_utente: id }).then(({ data, error }) => {
      if (!vivo) return
      if (error) {
        setErrore(/scheda_iscritto/.test(error.message)
          ? 'Al database manca lo script SQL della scheda iscritto (scheda_iscritto.sql). Va eseguito una volta in Supabase.'
          : error.message)
      } else if (!data) setErrore('Account non trovato.')
      else setS(data)
    })
    return () => { vivo = false }
  }, [id])

  useEffect(() => {
    const tasto = (e) => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('keydown', tasto)
    const prima = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tasto); document.body.style.overflow = prima }
  }, [onChiudi])

  const p = s?.profilo || {}
  const r = s?.registrate || {}
  const bga = s?.bga_collegato
  const titolo = s ? daMostrare(p) : 'Scheda iscritto'

  return (
    <div className="finestra-sfondo" onClick={onChiudi}>
      <div className="finestra" role="dialog" aria-modal="true" aria-label={titolo} onClick={(e) => e.stopPropagation()}>
        <div className="finestra-testa">
          <h3>{titolo}</h3>
          <button type="button" className="finestra-chiudi" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>

        <div className="finestra-corpo">
          {errore && <div className="avviso errore">{errore}</div>}
          {!s && !errore && <p>Carico la scheda…</p>}

          {s && (
            <>
              {(p.organizzatore || p.dimostratore) && (
                <p>
                  {p.organizzatore && <span className="distintivo">Organizzatore</span>}
                  {p.dimostratore && <span className="distintivo verde">Dimostratore</span>}
                </p>
              )}

              <h4 className="finestra-sottotitolo">Dati base</h4>
              <ul className="elenco">
                {p.nickname && p.nome && p.nome !== p.nickname && <Riga etichetta="Nome" valore={p.nome} />}
                <Riga etichetta="Email" valore={s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : '—'} />
                <Riga etichetta="Città" valore={p.citta || 'non indicata'} tono={p.citta ? null : 'no'} />
                <Riga etichetta="Iscritto il" valore={giorno(p.creato_il) || '—'} />
                <Riga etichetta="Ultimo accesso" valore={giorno(s.ultimo_accesso) || 'mai'} />
                {p.stato_socio && <Riga etichetta="Tana" valore={STATI[p.stato_socio] || p.stato_socio} />}
              </ul>

              <h4 className="finestra-sottotitolo">BoardGameGeek</h4>
              <ul className="elenco">
                <Riga etichetta="Utente" valore={p.bgg_username || 'non indicato'} tono={p.bgg_username ? null : 'no'} />
                <Riga etichetta="Collezione"
                  valore={s.collezione ? `${s.collezione} giochi sincronizzati` : 'non sincronizzata'}
                  tono={s.collezione ? null : 'no'} />
                <Riga etichetta="Partite importate da BGG"
                  valore={r.bgg ? `${r.bgg}${r.ultima_bgg ? ` · la più recente del ${giorno(r.ultima_bgg)}` : ''}` : 'nessuna'}
                  tono={r.bgg ? null : 'no'} />
                {r.bgstats > 0 && <Riga etichetta="Da BG Stats" valore={r.bgstats} />}
              </ul>

              <h4 className="finestra-sottotitolo">Board Game Arena</h4>
              <ul className="elenco">
                <Riga etichetta="Utente" valore={p.bga_username || 'non indicato'} tono={p.bga_username ? null : 'no'} />
                <Riga etichetta="Sincronizzazione automatica"
                  valore={!bga ? 'non collegata'
                    : bga.ultimo_errore === 'scaduta' ? 'scaduta, va ricollegata'
                    : `attiva dal ${giorno(bga.collegata_il)}`}
                  tono={bga && !bga.ultimo_errore ? null : 'no'} />
                {bga?.ultima_lettura && <Riga etichetta="Ultima lettura" valore={giorno(bga.ultima_lettura)} />}
                <Riga etichetta="Partite importate da BGA"
                  valore={r.bga ? `${r.bga}${r.ultima_bga ? ` · la più recente del ${giorno(r.ultima_bga)}` : ''}` : 'nessuna'}
                  tono={r.bga ? null : 'no'} />
              </ul>

              <h4 className="finestra-sottotitolo">Partite</h4>
              <ul className="elenco">
                <Riga etichetta="Presente in" valore={`${s.giocate || 0} partite`} />
                <Riga etichetta="Registrate a mano" valore={r.mano || 0} />
                <Riga etichetta="Ultima partita" valore={giorno(s.ultima_giocata) || 'nessuna'} tono={s.ultima_giocata ? null : 'no'} />
              </ul>

              <p className="aiuto">
                Solo numeri: titoli e compagni di gioco restano visibili a chi ha giocato insieme.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
