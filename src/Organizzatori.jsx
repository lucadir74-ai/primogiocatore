// Primo Giocatore - gestione degli organizzatori
// v3.10.0 - 202609211400

import { useEffect, useState } from 'react'
import { supabase, daMostrare, tutteLeRighe } from './supabase'

export default function Organizzatori({ profilo }) {
  const [persone, setPersone] = useState([])
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    try {
      const righe = await tutteLeRighe(() => supabase
        .from('profili')
        .select('id, nome, nickname, citta, organizzatore, dimostratore, creato_il')
        .order('nome'))
      setPersone(righe)
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function cambia(id, campo, valore) {
    setErrore(''); setMessaggio('')
    const { error } = await supabase
      .from('profili').update({ [campo]: valore }).eq('id', id)
    if (error) { setErrore(error.message); return }
    setPersone((p) => p.map((x) => (x.id === id ? { ...x, [campo]: valore } : x)))
    setMessaggio(valore ? 'Permesso assegnato.' : 'Permesso revocato.')
  }

  if (!profilo.organizzatore) return null

  const q = cerca.trim().toLowerCase()
  const elenco = q
    ? persone.filter((p) => (p.nickname || p.nome || '').toLowerCase().includes(q))
    : persone
  const attuali = persone.filter((p) => p.organizzatore)
  const dimostratori = persone.filter((p) => p.dimostratore)

  // Chi si è iscritto di recente: non arriva nessuna notifica, quindi
  // è qui che ci si accorge di una persona nuova.
  const settimanaFa = Date.now() - 7 * 86400000
  const recenti = [...persone]
    .filter((p) => p.creato_il)
    .sort((a, b) => new Date(b.creato_il) - new Date(a.creato_il))
    .slice(0, 10)
  const nuoviQuestaSettimana = recenti.filter(
    (p) => new Date(p.creato_il).getTime() > settimanaFa
  ).length

  return (
    <div className="scheda">
      <h2>Ruoli</h2>
      <p className="sottotitolo">
        Gli organizzatori pubblicano tavoli e vedono i contatti degli iscritti.
        I dimostratori spiegano i giochi e usano il calendario interno.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <h3 className="titolo-sezione">
        Ultimi iscritti <span className="conteggio">{persone.length} in tutto</span>
      </h3>

      {nuoviQuestaSettimana > 0 && (
        <div className="avviso ok">
          {nuoviQuestaSettimana === 1
            ? 'Una persona si è iscritta negli ultimi sette giorni.'
            : `${nuoviQuestaSettimana} persone si sono iscritte negli ultimi sette giorni.`}
        </div>
      )}

      <ul className="elenco">
        {recenti.map((p) => {
          const nuovo = new Date(p.creato_il).getTime() > settimanaFa
          return (
            <li key={p.id}>
              <div className="nome-giocatore">
                <strong>{daMostrare(p)}</strong>
                {nuovo && <span className="distintivo verde">Nuovo</span>}
                <span className="anno block">
                  {new Date(p.creato_il).toLocaleDateString('it-IT', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {p.citta ? ` · ${p.citta}` : ''}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <h3 className="titolo-sezione">
        Organizzatori <span className="conteggio">{attuali.length}</span>
      </h3>
      <ul className="elenco">
        {attuali.map((p) => (
          <li key={p.id}>
            <div className="nome-giocatore">
              <strong>{daMostrare(p)}</strong>
              {p.id === profilo.id && <span className="anno"> · tu</span>}
            </div>
            {p.id !== profilo.id && (
              <button className="bottone-piatto pericolo" onClick={() => cambia(p.id, 'organizzatore', false)}>
                revoca
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">
        Dimostratori <span className="conteggio">{dimostratori.length}</span>
      </h3>
      {dimostratori.length === 0 ? (
        <p className="aiuto">Nessun dimostratore ufficiale.</p>
      ) : (
        <ul className="elenco">
          {dimostratori.map((p) => (
            <li key={p.id}>
              <div className="nome-giocatore"><strong>{daMostrare(p)}</strong></div>
              <button className="bottone-piatto pericolo" onClick={() => cambia(p.id, 'dimostratore', false)}>
                revoca
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="titolo-sezione">Assegna i ruoli</h3>
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
        {elenco.slice(0, 25).map((p) => (
          <li key={p.id}>
            <div className="nome-giocatore">
              <strong>{daMostrare(p)}</strong>
              {p.citta && <span className="anno block">{p.citta}</span>}
            </div>
            <span className="azioni-iscritto">
              {!p.dimostratore && (
                <button className="bottone-piatto" onClick={() => cambia(p.id, 'dimostratore', true)}>
                  dimostratore
                </button>
              )}
              {!p.organizzatore && (
                <button className="bottone-piatto" onClick={() => cambia(p.id, 'organizzatore', true)}>
                  organizzatore
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="aiuto">
        Compaiono solo le persone con un account. Il ruolo di organizzatore dà accesso
        ai contatti di chi si iscrive ai tavoli: assegnalo a chi ha davvero bisogno di
        telefonare o scrivere ai partecipanti. Il tuo non puoi revocartelo da solo.
      </p>
    </div>
  )
}
