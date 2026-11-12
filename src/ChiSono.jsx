// Primo Giocatore - «Chi è questo ospite?»
// v1.1.0 - 202611122100 («vedi le partite»: con chi e a cosa ha giocato quell'ospite, per capire chi è)
//
// Gli ospiti che somigliano a un iscritto ma non abbastanza da collegarli
// da soli: solo il nome, un soprannome, un nome parziale, due omonimi.
// Li decide chi li ha inseriti, che sa con chi ha giocato (chi organizza
// li vede tutti). Un tocco sul nome giusto e le partite passano a
// quell'account; «nessuno di questi» e non viene più chiesto.
// Serve lo script riconoscimento_fase4.sql.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const giorno = (d) => new Date(d + 'T12:00').toLocaleDateString('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric',
})

const nomeIntero = (nome, cognome) => [nome, cognome].filter(Boolean).join(' ')

// Una voce per ospite, con gli iscritti che gli somigliano (i più simili prima).
function perOspite(righe) {
  const m = new Map()
  for (const r of righe) {
    if (!m.has(r.ospite_id)) m.set(r.ospite_id, { ...r, candidati: [] })
    m.get(r.ospite_id).candidati.push({ id: r.utente_id, chi: r.chi, forza: r.forza })
  }
  for (const o of m.values()) o.candidati.sort((a, b) => b.forza - a.forza || a.chi.localeCompare(b.chi, 'it'))
  return [...m.values()]
}

// Quanti ospiti aspettano una risposta: per l'avviso in cima all'app.
export async function contaOspitiDaRiconoscere() {
  const { data, error } = await supabase.rpc('ospiti_da_riconoscere')
  if (error) return 0
  return new Set((data || []).map((r) => r.ospite_id)).size
}

const PER_VOLTA = 15

// Le partite di un ospite: quando, a cosa, dove e con chi. Servono a
// riconoscerlo («ah, è il Gabriele di quella sera»).
function PartiteOspite({ ospiteId }) {
  const [partite, setPartite] = useState(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    let vivo = true
    supabase.rpc('partite_di_ospite', { p_ospite: ospiteId }).then(({ data, error }) => {
      if (!vivo) return
      if (error) {
        setErrore(/partite_di_ospite/.test(error.message || '')
          ? 'Manca lo script riconoscimento_fase4.sql aggiornato nel database.' : error.message)
        setPartite([])
      } else setPartite(data || [])
    })
    return () => { vivo = false }
  }, [ospiteId])

  if (partite === null) return <p className="aiuto">Carico le partite…</p>
  if (errore) return <div className="avviso errore">{errore}</div>
  if (partite.length === 0) return <p className="aiuto">Nessuna partita con questo nome.</p>
  return (
    <ul className="chi-sono-partite">
      {partite.map((p) => (
        <li key={p.partita_id}>
          <strong>{p.gioco || 'Gioco'}</strong>
          <span className="anno block">
            {giorno(String(p.giocata_il).slice(0, 10))}
            {p.luogo ? ` · ${p.luogo}` : ''}
            {p.registrata_da ? ` · registrata da ${p.registrata_da}` : ''}
          </span>
          {p.con && <span className="anno block">con {p.con}</span>}
        </li>
      ))}
      {partite.length >= 40 && <li className="anno">Sono le 40 più recenti.</li>}
    </ul>
  )
}

export default function ChiSono({ onCambio }) {
  const [ospiti, setOspiti] = useState(null)
  const [quanti, setQuanti] = useState(PER_VOLTA)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)
  const [aperto, setAperto] = useState(null)   // l'ospite di cui si guardano le partite

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase.rpc('ospiti_da_riconoscere')
    if (error) {
      // Senza lo script la sezione semplicemente non c'è.
      setErrore(/ospiti_da_riconoscere/.test(error.message || '') ? '' : error.message)
      setOspiti([])
      return
    }
    setOspiti(perOspite(data || []))
  }

  async function eLui(o, c) {
    const partite = `${o.partite} ${o.partite === 1 ? 'partita' : 'partite'}`
    if (!confirm(`«${nomeIntero(o.nome, o.cognome)}» è ${c.chi}?\n\n${o.partite ? `Le sue ${partite} passano` : 'La scheda passa'} a quell'account, e d'ora in poi questo nome sarà lui.`)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { error } = await supabase.rpc('riconosci_ospite', { p_ospite: o.ospite_id, p_utente: c.id })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(`«${nomeIntero(o.nome, o.cognome)}» ora è ${c.chi}.`)
    setOspiti((l) => l.filter((x) => x.ospite_id !== o.ospite_id))
    onCambio?.()
  }

  async function nessuno(o) {
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { error } = await supabase.rpc('ospite_non_e', { p_ospite: o.ospite_id, p_utenti: o.candidati.map((c) => c.id) })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setOspiti((l) => l.filter((x) => x.ospite_id !== o.ospite_id))
    onCambio?.()
  }

  if (!ospiti || (ospiti.length === 0 && !messaggio && !errore)) return null

  return (
    <>
      <h3 className="titolo-sezione">
        Chi sono questi ospiti? {ospiti.length > 0 && <span className="conteggio">{ospiti.length}</span>}
      </h3>
      {ospiti.length > 0 && (
        <p className="aiuto">
          Questi nomi somigliano a un iscritto, ma non abbastanza per esserne sicuri. Guarda le partite
          per capire chi è; se lo sai, tocca il suo nome: le partite passano al suo account. Se non è nessuno di loro, dillo e non
          te lo chiediamo più.
        </p>
      )}
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}
      <ul className="elenco chi-sono">
        {ospiti.slice(0, quanti).map((o) => (
          <li key={o.ospite_id}>
            <div className="nome-giocatore">
              <strong>«{nomeIntero(o.nome, o.cognome)}»</strong>
              <span className="anno block">
                {o.partite} {o.partite === 1 ? 'partita' : 'partite'}
                {o.ultima ? `, l'ultima il ${giorno(o.ultima)}` : ''}
                {!o.mio && o.creato_da ? ` · inserito da ${o.creato_da}` : ''}
              </span>
            </div>
            {o.partite > 0 && (
              <button type="button" className="bottone-piatto chi-sono-vedi"
                aria-expanded={aperto === o.ospite_id}
                onClick={() => setAperto(aperto === o.ospite_id ? null : o.ospite_id)}>
                {aperto === o.ospite_id ? 'nascondi le partite' : 'vedi le partite'}
              </button>
            )}
            {aperto === o.ospite_id && <PartiteOspite ospiteId={o.ospite_id} />}
            <div className="chi-sono-scelte">
              {o.candidati.map((c) => (
                <button key={c.id} type="button" className="tasto-piccolo" onClick={() => eLui(o, c)} disabled={lavorando}>
                  {c.chi}
                </button>
              ))}
              <button type="button" className="bottone-piatto" onClick={() => nessuno(o)} disabled={lavorando}>
                nessuno di questi
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ospiti.length > quanti && (
        <button type="button" className="bottone-piatto" onClick={() => setQuanti(quanti + PER_VOLTA)}>
          Mostra altri ({ospiti.length - quanti})
        </button>
      )}
    </>
  )
}
