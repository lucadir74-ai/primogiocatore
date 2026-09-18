// Primo Giocatore - gestione dei luoghi
// v3.3.0 - 202609201400

import { useEffect, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'

export default function Luoghi({ profilo }) {
  const [luoghi, setLuoghi] = useState([])
  const [cerca, setCerca] = useState('')
  const [rinomina, setRinomina] = useState(null)  // { id, nome }
  const [daUnire, setDaUnire] = useState('')
  const [verso, setVerso] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    try {
      const [l, p, t] = await Promise.all([
        tutteLeRighe(() => supabase.from('luoghi').select('id, nome, tipo').order('nome')),
        tutteLeRighe(() => supabase.from('partite').select('luogo_id').not('luogo_id', 'is', null)),
        tutteLeRighe(() => supabase.from('tavoli').select('luogo_id').not('luogo_id', 'is', null)),
      ])
      const conta = new Map()
      for (const r of [...p, ...t]) conta.set(r.luogo_id, (conta.get(r.luogo_id) || 0) + 1)
      setLuoghi(l.map((x) => ({ ...x, usi: conta.get(x.id) || 0 })))
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function salvaNome() {
    setErrore(''); setMessaggio('')
    if (!rinomina.nome.trim()) { setErrore('Il nome non può restare vuoto.'); return }
    const { error } = await supabase
      .from('luoghi').update({ nome: rinomina.nome.trim() }).eq('id', rinomina.id)
    if (error) setErrore(error.message)
    else { setMessaggio('Luogo rinominato.'); setRinomina(null); carica() }
  }

  async function unisci() {
    setErrore(''); setMessaggio('')
    if (!daUnire || !verso || daUnire === verso) { setErrore('Scegli due luoghi diversi.'); return }
    const a = luoghi.find((x) => x.id === daUnire)
    const b = luoghi.find((x) => x.id === verso)
    if (!confirm(`Unire «${a.nome}» dentro «${b.nome}»? «${a.nome}» sparisce e le sue ${a.usi} voci passano a «${b.nome}».`)) return

    setLavorando(true)
    try {
      const { error: e1 } = await supabase.from('partite').update({ luogo_id: verso }).eq('luogo_id', daUnire)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('tavoli').update({ luogo_id: verso }).eq('luogo_id', daUnire)
      if (e2) throw e2
      await supabase.from('serate').update({ luogo_id: verso }).eq('luogo_id', daUnire)

      const { error: e4 } = await supabase.from('luoghi').delete().eq('id', daUnire)
      if (e4) throw e4

      setMessaggio(`«${a.nome}» unito in «${b.nome}».`)
      setDaUnire(''); setVerso('')
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  async function elimina(l) {
    if (l.usi > 0) { setErrore('Questo luogo è usato: prima uniscilo a un altro.'); return }
    if (!confirm(`Eliminare «${l.nome}»?`)) return
    const { error } = await supabase.from('luoghi').delete().eq('id', l.id)
    if (error) setErrore(error.message)
    else carica()
  }

  const q = cerca.trim().toLowerCase()
  const elenco = q ? luoghi.filter((l) => l.nome.toLowerCase().includes(q)) : luoghi

  return (
    <div className="scheda">
      <h2>Luoghi</h2>
      <p className="sottotitolo">
        Dove si gioca. Unisci i doppioni e correggi i nomi scritti male.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {luoghi.length > 8 && (
        <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un luogo" aria-label="Cerca fra i luoghi" />
      )}

      <ul className="elenco">
        {elenco.map((l) => (
          <li key={l.id}>
            {rinomina?.id === l.id ? (
              <>
                <input className="campo-cerca" value={rinomina.nome} autoFocus
                  onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && salvaNome()} />
                <span className="azioni-iscritto">
                  <button className="bottone-piatto" onClick={salvaNome}>salva</button>
                  <button className="bottone-piatto" onClick={() => setRinomina(null)}>annulla</button>
                </span>
              </>
            ) : (
              <>
                <div className="nome-giocatore">
                  <strong>{l.nome}</strong>
                  <span className="anno block">
                    {l.usi} {l.usi === 1 ? 'volta' : 'volte'}
                    {l.tipo !== 'altro' ? ` · ${l.tipo}` : ''}
                  </span>
                </div>
                <span className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setRinomina({ id: l.id, nome: l.nome })}>rinomina</button>
                  {l.usi === 0 && (
                    <button className="bottone-piatto pericolo" onClick={() => elimina(l)}>elimina</button>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Unisci due luoghi</h3>

      <div className="campo">
        <label htmlFor="l-da">Questo sparisce</label>
        <select id="l-da" className="scelta-punteggio larga" value={daUnire}
          onChange={(e) => setDaUnire(e.target.value)}>
          <option value="">—</option>
          {elenco.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.usi})</option>)}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="l-verso">E confluisce in questo</label>
        <select id="l-verso" className="scelta-punteggio larga" value={verso}
          onChange={(e) => setVerso(e.target.value)}>
          <option value="">—</option>
          {elenco.filter((l) => l.id !== daUnire).map((l) => (
            <option key={l.id} value={l.id}>{l.nome} ({l.usi})</option>
          ))}
        </select>
      </div>

      <button className="bottone" onClick={unisci} disabled={lavorando || !daUnire || !verso}>
        {lavorando ? 'Unisco…' : 'Unisci'}
      </button>
    </div>
  )
}
