// Primo Giocatore - "Sei tu?"
// v1.1.0 - 202610031200 (organizzatori: approvano le proprie richieste)
//
// Chi si registra spesso ha già giocato come ospite. L'app cerca gli
// ospiti con lo stesso nome (o la stessa email usata per un tavolo) e
// chiede se è lui. Con l'email uguale e confermata il collegamento è
// immediato; con il solo nome parte una richiesta che approva chi
// organizza o chi aveva inserito l'ospite.
//
// compatto: il riquadro in cima alle pagine, che si può chiudere.
// Senza compatto: la sezione nel profilo, sempre visibile.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const chiaveChiusi = (id) => `primo-giocatore:sei-tu-chiusi:${id}`

function leggiChiusi(id) {
  try { return JSON.parse(localStorage.getItem(chiaveChiusi(id)) || '[]') } catch { return [] }
}

const giorno = (d) => new Date(d + 'T12:00').toLocaleDateString('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric',
})

export default function SeiTu({ profilo, compatto = false }) {
  const [ospiti, setOspiti] = useState([])
  const [richieste, setRichieste] = useState([])
  const [chiusi, setChiusi] = useState(() => leggiChiusi(profilo.id))
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [profilo.id])

  async function carica() {
    const [o, r] = await Promise.all([
      supabase.rpc('ospiti_simili'),
      supabase.from('richieste_collegamento')
        .select('id, ospite_nome, stato, creata_il')
        .eq('utente_id', profilo.id)
        .order('creata_il', { ascending: false }),
    ])
    // Senza la migrazione v4.5 la funzione non c'è: il riquadro resta muto.
    if (!o.error) setOspiti(o.data || [])
    if (!r.error) setRichieste(r.data || [])
  }

  async function sonoIo(o) {
    const conferma = o.email_uguale
      ? `Collegare «${o.nome}» al tuo account? Le sue partite diventano tue.`
      : `Chiedere di collegare «${o.nome}» al tuo account? Lo approva chi organizza.`
    if (!confirm(conferma)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { data, error } = await supabase.rpc('sono_io', { p_ospite: o.id })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(data === 'collegato'
      ? `Fatto: le partite di «${o.nome}» ora sono tue.`
      : `Richiesta inviata. Quando viene approvata, le partite di «${o.nome}» passano a te.`)
    carica()
  }

  // Chi organizza può approvare le proprie richieste (decidi_richiesta lo consente).
  async function approvaMia(r) {
    if (!confirm(`Collegare «${r.ospite_nome}» al tuo account? Le sue partite diventano tue.`)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { error } = await supabase.rpc('decidi_richiesta', { p_richiesta: r.id, p_approva: true })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(`Fatto: le partite di «${r.ospite_nome}» ora sono tue.`)
    carica()
  }

  function nessuno() {
    const tutti = [...new Set([...chiusi, ...ospiti.map((o) => o.id)])]
    try { localStorage.setItem(chiaveChiusi(profilo.id), JSON.stringify(tutti)) } catch { /* pazienza */ }
    setChiusi(tutti)
  }

  // Da proporre: non già chiesti e, nel riquadro, non già scartati.
  const daProporre = ospiti.filter((o) => !o.richiesta && (!compatto || !chiusi.includes(o.id)))
  const inAttesa = richieste.filter((r) => r.stato === 'attesa')

  if (compatto && daProporre.length === 0 && !messaggio) return null

  const elenco = (
    <ul className="elenco">
      {daProporre.map((o) => (
        <li key={o.id}>
          <div className="nome-giocatore">
            <strong>{o.nome}</strong>
            <span className="anno block">
              {o.partite} {o.partite === 1 ? 'partita' : 'partite'}
              {o.ultima ? `, l'ultima il ${giorno(o.ultima)}` : ''}
              {o.email_uguale ? ' · stessa email' : ''}
            </span>
          </div>
          <button className="bottone-piatto" onClick={() => sonoIo(o)} disabled={lavorando}>
            Sono io
          </button>
        </li>
      ))}
    </ul>
  )

  if (compatto) {
    return (
      <div className="scheda">
        {messaggio ? (
          <>
            <div className="avviso ok">{messaggio}</div>
            <button className="bottone-piatto" onClick={() => setMessaggio('')}>chiudi</button>
          </>
        ) : (
          <>
            <h3 className="titolo-sezione">Hai già giocato come ospite?</h3>
            <p className="aiuto">
              Qualcuno ha registrato partite con un nome simile al tuo. Se sei tu, collegale al tuo account.
            </p>
            {errore && <div className="avviso errore">{errore}</div>}
            {elenco}
            <button className="bottone-piatto" onClick={nessuno}>Nessuno di questi sono io</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="scheda">
      <h2>Le tue partite da ospite</h2>
      <p className="sottotitolo">
        Se hai giocato prima di registrarti, qui colleghi quelle partite al tuo account.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {daProporre.length > 0 ? elenco : (
        <p className="aiuto">Nessun ospite con un nome simile al tuo.</p>
      )}

      {richieste.length > 0 && (
        <>
          <h3 className="titolo-sezione">Richieste fatte</h3>
          <ul className="elenco">
            {richieste.map((r) => (
              <li key={r.id}>
                <span>{r.ospite_nome}</span>
                {r.stato === 'attesa' && profilo.organizzatore ? (
                  <button className="bottone-piatto" onClick={() => approvaMia(r)} disabled={lavorando}>approva</button>
                ) : (
                  <span className="anno">
                    {r.stato === 'attesa' ? 'in attesa' : r.stato === 'approvata' ? 'collegato' : 'non approvata'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {inAttesa.length > 0 && !profilo.organizzatore && (
            <p className="aiuto">Le richieste in attesa le approva chi organizza.</p>
          )}
        </>
      )}
    </div>
  )
}

// Per chi organizza (o ha inserito l'ospite): le richieste da decidere.
export function RichiesteDaApprovare({ profilo, onCambio }) {
  const [richieste, setRichieste] = useState([])
  const [errore, setErrore] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase
      .from('richieste_collegamento')
      .select('id, ospite_id, ospite_nome, creata_il, profili:richieste_collegamento_utente_id_fkey ( nome, nickname )')
      .eq('stato', 'attesa')
      .neq('utente_id', profilo.id)
      .order('creata_il')
    if (!error) setRichieste(data || [])
  }

  async function decidi(r, approva) {
    const chi = r.profili?.nickname || r.profili?.nome || 'questa persona'
    const testo = approva
      ? `«${r.ospite_nome}» è ${chi}? Tutte le sue partite, i tavoli e le disponibilità passano a quell'account.`
      : `Rifiutare la richiesta di ${chi} per «${r.ospite_nome}»?`
    if (!confirm(testo)) return
    setErrore(''); setLavorando(true)
    const { error } = await supabase.rpc('decidi_richiesta', { p_richiesta: r.id, p_approva: approva })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    carica()
    onCambio?.()
  }

  if (richieste.length === 0) return null

  return (
    <>
      <h3 className="titolo-sezione">
        Richieste «sono io» <span className="conteggio">{richieste.length}</span>
      </h3>
      {errore && <div className="avviso errore">{errore}</div>}
      <ul className="elenco">
        {richieste.map((r) => (
          <li key={r.id}>
            <div className="nome-giocatore">
              <strong>{r.profili?.nickname || r.profili?.nome || 'Utente'}</strong>
              <span className="anno block">dice di essere «{r.ospite_nome}»</span>
            </div>
            <span className="azioni-iscritto">
              <button className="bottone-piatto" onClick={() => decidi(r, true)} disabled={lavorando}>approva</button>
              <button className="bottone-piatto pericolo" onClick={() => decidi(r, false)} disabled={lavorando}>rifiuta</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Quante richieste aspettano una decisione: per l'avviso in cima all'app.
export async function contaRichiesteDaApprovare(profiloId) {
  const { count, error } = await supabase
    .from('richieste_collegamento')
    .select('id', { count: 'exact', head: true })
    .eq('stato', 'attesa')
    .neq('utente_id', profiloId)
  return error ? 0 : count || 0
}
