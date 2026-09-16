// Primo Giocatore - gestione degli organizzatori
// v2.0.1 - 202609171100

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

export default function Organizzatori({ profilo }) {
  const [persone, setPersone] = useState([])
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase
      .from('profili')
      .select('id, nome, nickname, citta, organizzatore')
      .order('nome')
    if (error) setErrore(error.message)
    else setPersone(data || [])
  }

  async function cambia(id, valore) {
    setErrore(''); setMessaggio('')
    const { error } = await supabase
      .from('profili').update({ organizzatore: valore }).eq('id', id)
    if (error) { setErrore(error.message); return }
    setPersone((p) => p.map((x) => (x.id === id ? { ...x, organizzatore: valore } : x)))
    setMessaggio(valore ? 'Permesso assegnato.' : 'Permesso revocato.')
  }

  if (!profilo.organizzatore) return null

  const q = cerca.trim().toLowerCase()
  const elenco = q
    ? persone.filter((p) => (p.nickname || p.nome || '').toLowerCase().includes(q))
    : persone
  const attuali = persone.filter((p) => p.organizzatore)

  return (
    <div className="scheda">
      <h2>Organizzatori</h2>
      <p className="sottotitolo">
        Chi può pubblicare tavoli e vedere i contatti degli iscritti.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <h3 className="titolo-sezione">
        In carica <span className="conteggio">{attuali.length}</span>
      </h3>
      <ul className="elenco">
        {attuali.map((p) => (
          <li key={p.id}>
            <div className="nome-giocatore">
              <strong>{daMostrare(p)}</strong>
              {p.id === profilo.id && <span className="anno"> · tu</span>}
            </div>
            {p.id !== profilo.id && (
              <button className="bottone-piatto pericolo" onClick={() => cambia(p.id, false)}>
                revoca
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Nomina qualcuno</h3>
      {persone.length > 8 && (
        <input
          className="campo-cerca"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un iscritto"
          aria-label="Cerca fra gli iscritti"
        />
      )}
      <ul className="elenco">
        {elenco.filter((p) => !p.organizzatore).slice(0, 20).map((p) => (
          <li key={p.id}>
            <div className="nome-giocatore">
              <strong>{daMostrare(p)}</strong>
              {p.citta && <span className="anno block">{p.citta}</span>}
            </div>
            <button className="bottone-piatto" onClick={() => cambia(p.id, true)}>
              nomina
            </button>
          </li>
        ))}
      </ul>

      <p className="aiuto">
        Compaiono solo le persone con un account. Il permesso dà accesso ai dati di
        contatto di chi si iscrive ai tavoli: assegnalo a chi ha davvero bisogno di
        telefonare o scrivere ai partecipanti. Il tuo non puoi revocartelo da solo.
      </p>
    </div>
  )
}
