// Primo Giocatore - ex soci (solo l'amministratore dell'app)
// v1.0.0 - 202611220000
//
// Indicazioni dell'associazione (punto 6): chi non è più socio va
// disattivato e i suoi dati cancellati o resi anonimi nei tempi decisi
// dall'associazione. Disattivato lo è già: tolto dall'elenco, resta «in
// attesa». Qui si vede da quanti giorni, e si elimina l'account come
// farebbe lui con «Elimina il mio account» (supabase/privacy_fase6.sql).

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const giorno = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ExSoci() {
  const [righe, setRighe] = useState(null)
  const [errore, setErrore] = useState('')
  const [ok, setOk] = useState('')
  const [lavoro, setLavoro] = useState(null)

  async function carica() {
    const { data, error } = await supabase.rpc('ex_soci')
    if (error) {
      setErrore(/ex_soci/.test(error.message) ? 'Al database manca lo script privacy_fase6.sql: va eseguito una volta in Supabase.' : error.message)
      setRighe([])
      return
    }
    setRighe(data || [])
  }
  useEffect(() => { carica() }, [])

  async function elimina(r) {
    const chi = r.nickname || [r.nome, r.cognome].filter(Boolean).join(' ') || r.email
    if (!confirm(`Eliminare l’account di ${chi}? Non è più socio dal ${giorno(r.non_socio_dal)}. Spariscono profilo e dati personali; le partite con altri giocatori restano con «Ex giocatore». Non si torna indietro.`)) return
    setErrore(''); setOk(''); setLavoro(r.id)
    const { error } = await supabase.rpc('elimina_account_ex_socio', { p_utente: r.id })
    setLavoro(null)
    if (error) { setErrore(`Eliminazione non riuscita: ${error.message}`); return }
    setOk(`Account di ${chi} eliminato.`)
    carica()
  }

  return (
    <>
      <p className="aiuto">
        Account tolti dall&rsquo;elenco soci: sono già bloccati (vedono solo il messaggio di attesa).
        Quando sono passati i giorni decisi con l&rsquo;associazione, elimina l&rsquo;account: i dati personali
        spariscono e le partite restano anonime. Se una persona torna socia, esce da qui da sola.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {ok && <div className="avviso ok">{ok}</div>}
      {righe === null ? <p className="aiuto">Carico…</p> : righe.length === 0 ? (
        <p className="aiuto">Nessun ex socio con un account.</p>
      ) : (
        <ul className="elenco">
          {righe.map((r) => (
            <li key={r.id}>
              <div className="nome-giocatore" style={{ flex: 1, minWidth: 0 }}>
                <strong>{r.nickname || [r.nome, r.cognome].filter(Boolean).join(' ') || '—'}</strong>
                <span className="anno block">
                  {[r.nickname && [r.nome, r.cognome].filter(Boolean).join(' '), r.email].filter(Boolean).join(' · ')}
                </span>
                <span className="anno block">
                  non socio dal {giorno(r.non_socio_dal)} · {r.giorni === 1 ? '1 giorno' : `${r.giorni} giorni`}
                </span>
              </div>
              <button className="bottone-piatto pericolo" onClick={() => elimina(r)} disabled={lavoro !== null}>
                {lavoro === r.id ? 'elimino…' : 'elimina account'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
