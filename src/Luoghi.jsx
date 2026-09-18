// Primo Giocatore - gestione dei luoghi
// v4.1.0 - 202609221100

import { useEffect, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import { chiediPosizione } from './posizione'

const TIPI = [
  { id: 'sede', etichetta: 'Sede' },
  { id: 'casa', etichetta: 'Casa' },
  { id: 'online', etichetta: 'Online' },
  { id: 'altro', etichetta: 'Altro' },
]

// Nomi che quasi sempre indicano una piattaforma online: servono solo
// a proporre il tipo, la scelta resta di chi guarda.
const PAROLE_ONLINE = ['board game arena', 'bga', 'tabletopia', 'tabletop simulator',
  'yucata', 'boiteajeux', 'online', 'discord', 'zoom', 'steam']

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
        tutteLeRighe(() => supabase.from('luoghi')
          .select('id, nome, tipo, latitudine, longitudine, posizione_pubblica').order('nome')),
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

  async function cambiaTipo(id, tipo) {
    setErrore(''); setMessaggio('')
    const { error } = await supabase.from('luoghi').update({ tipo }).eq('id', id)
    if (error) setErrore(error.message)
    else setLuoghi((l) => l.map((x) => (x.id === id ? { ...x, tipo } : x)))
  }

  // Marca in un colpo solo tutti i luoghi che sembrano piattaforme.
  async function marcaOnline() {
    setErrore(''); setMessaggio('')
    const candidati = luoghi.filter(
      (l) => l.tipo !== 'online' && PAROLE_ONLINE.some((w) => l.nome.toLowerCase().includes(w))
    )
    if (candidati.length === 0) { setMessaggio('Nessun luogo da marcare.'); return }
    if (!confirm(`Marcare come online: ${candidati.map((l) => l.nome).join(', ')}?`)) return

    for (const l of candidati) {
      const { error } = await supabase.from('luoghi').update({ tipo: 'online' }).eq('id', l.id)
      if (error) { setErrore(error.message); return }
    }
    setMessaggio(`${candidati.length} luoghi marcati come online.`)
    carica()
  }

  // Si registra stando sul posto: nessun servizio esterno, nessun
  // indirizzo da cercare, e la precisione è quella del telefono.
  async function segnaPosizione(l) {
    setErrore(''); setMessaggio('')
    try {
      const p = await chiediPosizione()
      const { error } = await supabase.from('luoghi').update({
        latitudine: p.lat,
        longitudine: p.lon,
        // Una sede si può mostrare a tutti, una casa no.
        posizione_pubblica: l.tipo === 'sede',
      }).eq('id', l.id)
      if (error) throw error
      setMessaggio(`Posizione di «${l.nome}» registrata, precisa a circa ${Math.round(p.precisione)} metri.`)
      carica()
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function togliPosizione(l) {
    const { error } = await supabase.from('luoghi')
      .update({ latitudine: null, longitudine: null, posizione_pubblica: false }).eq('id', l.id)
    if (error) setErrore(error.message)
    else carica()
  }

  async function cambiaVisibilita(l, pubblica) {
    const { error } = await supabase.from('luoghi').update({ posizione_pubblica: pubblica }).eq('id', l.id)
    if (error) setErrore(error.message)
    else setLuoghi((righe) => righe.map((x) => (x.id === l.id ? { ...x, posizione_pubblica: pubblica } : x)))
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

      <button className="bottone bottone-secondario" onClick={marcaOnline}>
        Marca come online le piattaforme
      </button>
      <p className="aiuto">
        «Sono qui» registra la posizione del luogo usando il telefono: vai sul posto e
        premilo. Serve a mostrare i tavoli vicini a chi cerca dove giocare. Per le sedi
        la posizione è visibile a tutti; per le case resta nascosta, e chi non è iscritto
        al tavolo vede solo la distanza approssimativa.
      </p>
      <p className="aiuto">
        Il tipo serve alle statistiche: separa le partite giocate al tavolo da quelle
        a distanza, che sono esperienze diverse e non vanno confuse nei numeri.
      </p>

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
                  <span className="anno block">{l.usi} {l.usi === 1 ? 'volta' : 'volte'}</span>
                  <select className="scelta-punteggio" value={l.tipo || 'altro'}
                    onChange={(e) => cambiaTipo(l.id, e.target.value)}
                    aria-label={`Tipo di ${l.nome}`}>
                    {TIPI.map((t) => <option key={t.id} value={t.id}>{t.etichetta}</option>)}
                  </select>
                  {l.latitudine != null && (
                    <label className="spunta-fazioni">
                      <input type="checkbox" checked={Boolean(l.posizione_pubblica)}
                        onChange={(e) => cambiaVisibilita(l, e.target.checked)} />
                      posizione visibile a tutti
                    </label>
                  )}
                </div>
                <span className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setRinomina({ id: l.id, nome: l.nome })}>rinomina</button>
                  {l.tipo !== 'online' && (
                    l.latitudine != null ? (
                      <>
                        <span className="anno">posizione registrata</span>
                        <button className="bottone-piatto" onClick={() => segnaPosizione(l)}>aggiorna</button>
                        <button className="bottone-piatto pericolo" onClick={() => togliPosizione(l)}>togli</button>
                      </>
                    ) : (
                      <button className="bottone-piatto" onClick={() => segnaPosizione(l)}>
                        sono qui
                      </button>
                    )
                  )}
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
