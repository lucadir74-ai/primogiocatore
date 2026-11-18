// Primo Giocatore - l'app di chi partecipa solo a un evento
// v1.0.0 - 202611181700
//
// Chi non è socio della Tana entra con il link di un evento e vede solo
// i suoi eventi. Per ora l'elenco con date e stato: tavoli, partite e
// classifica dell'evento arrivano qui (fase 3).

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'
import { mieiEventi, statoEvento, dateEvento } from './evento'

const RUOLI = { organizzatore: 'organizzi', dimostratore: 'spieghi i giochi', partecipante: 'partecipi' }
const STATI = { in_arrivo: 'In arrivo', in_corso: 'In corso', concluso: 'Concluso' }

export default function EventoPartecipante({ profilo, avviso }) {
  const [eventi, setEventi] = useState(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    mieiEventi(profilo.id).then(setEventi, (e) => setErrore(e.message))
  }, [profilo.id])

  return (
    <div className="scheda">
      <h2>Ciao {daMostrare(profilo)}</h2>
      {avviso && <div className="avviso ok">{avviso}</div>}
      {errore && <div className="avviso errore">{errore}</div>}

      {!eventi ? (
        <p>Un attimo&hellip;</p>
      ) : eventi.length === 0 ? (
        <p className="sottotitolo">
          Non partecipi a nessun evento. Per entrare apri il link o inquadra il QR che ti ha dato chi organizza.
        </p>
      ) : (
        <ul className="elenco-eventi">
          {eventi.map((ev) => {
            const st = statoEvento(ev)
            return (
              <li key={ev.id} className="evento-riga">
                <div>
                  <strong>{ev.nome || 'Evento'}</strong>
                  <span className="anno block">{dateEvento(ev)} · {RUOLI[ev.ruolo] || ev.ruolo}</span>
                </div>
                <span className={'evento-stato' + (st !== 'concluso' ? ' aperto' : '')}>{STATI[st]}</span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="aiuto">
        Qui troverai i tavoli dell&rsquo;evento, le tue partite e la classifica: li stiamo preparando.
        A evento concluso restano visibili, ma non si possono più cambiare.
      </p>
      <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>Esci</button>
    </div>
  )
}
