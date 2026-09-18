// Primo Giocatore - gestione degli ospiti
// v2.10.0 - 202609191000
//
// Rinominare, unire i doppioni e trasformare un ospite nell'account
// con cui quella persona si è iscritta.

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
  const [persone, setPersone] = useState([])
  const [rinomina, setRinomina] = useState(null)      // { id, nome }
  const [collega, setCollega] = useState(null)        // { ospite, cerca }

  useEffect(() => { carica() }, [])

  async function carica() {
    const [o, p, pr] = await Promise.all([
      supabase.from('ospiti').select('id, nome, utente_collegato').order('nome'),
      supabase.from('partecipazioni').select('ospite_id').not('ospite_id', 'is', null),
      supabase.from('profili').select('id, nome, nickname').order('nome'),
    ])
    if (o.error) { setErrore(o.error.message); return }
    if (pr.data) setPersone(pr.data)
    const conteggio = new Map()
    for (const r of p.data || []) conteggio.set(r.ospite_id, (conteggio.get(r.ospite_id) || 0) + 1)
    setOspiti((o.data || []).map((x) => ({ ...x, partite: conteggio.get(x.id) || 0 })))
  }

  async function salvaNome() {
    setErrore(''); setMessaggio('')
    if (!rinomina.nome.trim()) { setErrore('Il nome non può restare vuoto.'); return }
    const { error } = await supabase
      .from('ospiti').update({ nome: rinomina.nome.trim() }).eq('id', rinomina.id)
    if (error) setErrore(error.message)
    else { setMessaggio('Nome corretto.'); setRinomina(null); carica() }
  }

  // L'ospite si è iscritto: le sue partite passano all'account vero e
  // la voce ospite sparisce. Da qui in poi è una persona sola ovunque.
  async function diventaAccount(ospite, utente) {
    setErrore(''); setMessaggio('')
    const nomeUtente = utente.nickname || utente.nome
    if (!confirm(`«${ospite.nome}» è ${nomeUtente}? Le sue ${ospite.partite} partite passano a quell'account e la voce ospite sparisce.`)) return

    setLavorando(true)
    try {
      // Se in una partita compaiono sia l'ospite sia l'account, una
      // delle due righe va tolta: la stessa persona non può essere
      // due volte allo stesso tavolo.
      const { data: righeOspite } = await supabase
        .from('partecipazioni').select('id, partita_id').eq('ospite_id', ospite.id)
      const { data: righeUtente } = await supabase
        .from('partecipazioni').select('partita_id').eq('utente_id', utente.id)

      const partiteUtente = new Set((righeUtente || []).map((r) => r.partita_id))
      const doppie = (righeOspite || []).filter((r) => partiteUtente.has(r.partita_id))
      if (doppie.length) {
        const { error } = await supabase
          .from('partecipazioni').delete().in('id', doppie.map((r) => r.id))
        if (error) throw error
      }

      const { error: e1 } = await supabase
        .from('partecipazioni')
        .update({ utente_id: utente.id, ospite_id: null })
        .eq('ospite_id', ospite.id)
      if (e1) throw e1

      await supabase.from('iscrizioni_tavolo')
        .update({ utente_id: utente.id, ospite_id: null }).eq('ospite_id', ospite.id)

      const { error: e3 } = await supabase.from('ospiti').delete().eq('id', ospite.id)
      if (e3) throw e3

      setMessaggio(
        `«${ospite.nome}» ora è ${nomeUtente}` +
        (doppie.length ? `, ${doppie.length} doppioni nella stessa partita eliminati` : '') + '.'
      )
      setCollega(null)
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
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
      <h2>Ospiti</h2>
      <p className="sottotitolo">
        Chi gioca senza account. Correggi i nomi, unisci i doppioni, e quando
        qualcuno si iscrive trasformalo nel suo account.
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

      <ul className="elenco elenco-scorrevole">
        {elenco.slice(0, 60).map((o) => (
          <li key={o.id}>
            {rinomina?.id === o.id ? (
              <>
                <input className="campo-cerca" value={rinomina.nome} autoFocus
                  onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && salvaNome()} />
                <span className="azioni-iscritto">
                  <button className="bottone-piatto" onClick={salvaNome}>salva</button>
                  <button className="bottone-piatto" onClick={() => setRinomina(null)}>annulla</button>
                </span>
              </>
            ) : collega?.ospite?.id === o.id ? (
              <div className="nome-giocatore">
                <strong>{o.nome}</strong>
                <span className="anno block">Con quale account si è iscritto?</span>
                <input className="campo-cerca" value={collega.cerca} autoFocus
                  onChange={(e) => setCollega({ ...collega, cerca: e.target.value })}
                  placeholder="Cerca il suo account" />
                <div className="pastiglie-persone">
                  {persone
                    .filter((p) => (p.nickname || p.nome || '').toLowerCase()
                      .includes(collega.cerca.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((p) => (
                      <button key={p.id} className="pastiglia-nome"
                        onClick={() => diventaAccount(o, p)} disabled={lavorando}>
                        {p.nickname || p.nome}
                      </button>
                    ))}
                </div>
                <button className="bottone-piatto" onClick={() => setCollega(null)}>annulla</button>
              </div>
            ) : (
              <>
                <div className="nome-giocatore">
                  <strong>{o.nome}</strong>
                  <span className="anno block">
                    {o.partite} {o.partite === 1 ? 'partita' : 'partite'}
                  </span>
                </div>
                <span className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setRinomina({ id: o.id, nome: o.nome })}>rinomina</button>
                  <button className="bottone-piatto"
                    onClick={() => setCollega({ ospite: o, cerca: '' })}>si è iscritto</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Unisci due ospiti</h3>

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
        partite come destinazione: è la scelta che tocca meno righe. Le partite registrate
        da altri non si possono spostare: quelle le deve sistemare chi le ha inserite.
      </p>
    </div>
  )
}
