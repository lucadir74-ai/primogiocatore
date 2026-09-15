// Primo Giocatore - unione degli ospiti doppi
// v1.22.0 - 202609161600

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UnisciOspiti({ profilo }) {
  const [ospiti, setOspiti] = useState([])
  const [daUnire, setDaUnire] = useState('')   // sparisce
  const [verso, setVerso] = useState('')       // resta
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    const [o, p] = await Promise.all([
      supabase.from('ospiti').select('id, nome, utente_collegato').order('nome'),
      supabase.from('partecipazioni').select('ospite_id').not('ospite_id', 'is', null),
    ])
    if (o.error) { setErrore(o.error.message); return }
    const conteggio = new Map()
    for (const r of p.data || []) conteggio.set(r.ospite_id, (conteggio.get(r.ospite_id) || 0) + 1)
    setOspiti((o.data || []).map((x) => ({ ...x, partite: conteggio.get(x.id) || 0 })))
  }

  async function unisci() {
    setErrore(''); setMessaggio('')
    if (!daUnire || !verso || daUnire === verso) {
      setErrore('Scegli due ospiti diversi.')
      return
    }
    const a = ospiti.find((x) => x.id === daUnire)
    const b = ospiti.find((x) => x.id === verso)
    if (!confirm(`Unire «${a.nome}» dentro «${b.nome}»? «${a.nome}» sparisce e le sue ${a.partite} partite passano a «${b.nome}». Non si torna indietro.`)) return

    setLavorando(true)
    try {
      // Se i due compaiono nella stessa partita, una delle due righe va
      // eliminata: nel database una persona non può stare due volte
      // allo stesso tavolo.
      const { data: righeA } = await supabase
        .from('partecipazioni').select('id, partita_id').eq('ospite_id', daUnire)
      const { data: righeB } = await supabase
        .from('partecipazioni').select('partita_id').eq('ospite_id', verso)

      const partiteDiB = new Set((righeB || []).map((r) => r.partita_id))
      const doppie = (righeA || []).filter((r) => partiteDiB.has(r.partita_id))

      if (doppie.length) {
        const { error } = await supabase
          .from('partecipazioni').delete().in('id', doppie.map((r) => r.id))
        if (error) throw error
      }

      const { error: e1 } = await supabase
        .from('partecipazioni').update({ ospite_id: verso }).eq('ospite_id', daUnire)
      if (e1) throw e1

      await supabase.from('iscrizioni_tavolo').update({ ospite_id: verso }).eq('ospite_id', daUnire)

      const { error: e3 } = await supabase.from('ospiti').delete().eq('id', daUnire)
      if (e3) throw e3

      setMessaggio(
        `«${a.nome}» unito in «${b.nome}»` +
        (doppie.length ? `, ${doppie.length} doppioni nella stessa partita eliminati` : '') + '.'
      )
      setDaUnire(''); setVerso('')
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  const q = cerca.trim().toLowerCase()
  const elenco = q ? ospiti.filter((o) => o.nome.toLowerCase().includes(q)) : ospiti

  return (
    <div className="scheda">
      <h2>Ospiti doppi</h2>
      <p className="sottotitolo">
        Quando la stessa persona è finita in archivio con due nomi diversi.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {ospiti.length > 8 && (
        <input
          className="campo-cerca"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un nome"
          aria-label="Cerca fra gli ospiti"
        />
      )}

      <div className="campo">
        <label htmlFor="u-da">Questo sparisce</label>
        <select id="u-da" className="scelta-punteggio larga" value={daUnire}
          onChange={(e) => setDaUnire(e.target.value)}>
          <option value="">—</option>
          {elenco.map((o) => (
            <option key={o.id} value={o.id}>{o.nome} ({o.partite})</option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="u-verso">E confluisce in questo</label>
        <select id="u-verso" className="scelta-punteggio larga" value={verso}
          onChange={(e) => setVerso(e.target.value)}>
          <option value="">—</option>
          {elenco.filter((o) => o.id !== daUnire).map((o) => (
            <option key={o.id} value={o.id}>{o.nome} ({o.partite})</option>
          ))}
        </select>
      </div>

      <button className="bottone" onClick={unisci} disabled={lavorando || !daUnire || !verso}>
        {lavorando ? 'Unisco…' : 'Unisci'}
      </button>

      <p className="aiuto">
        Il numero fra parentesi è quante partite ha quell&rsquo;ospite. Tieni quello con più
        partite come destinazione: è la scelta che tocca meno righe.
      </p>
    </div>
  )
}
