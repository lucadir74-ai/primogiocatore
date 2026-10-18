// Primo Giocatore - casella unica per cercare e scegliere
// v1.0.0 - 202610181930
//
// Prende il posto della coppia «casella di ricerca + menu a tendina».
// Una casella sola: mostra la scelta attuale; toccandola si scrive e
// sotto compare l'elenco dei risultati, che scorre se sono tanti. Si
// sceglie toccando un nome, o con frecce e Invio da tastiera.
//
// opzioni: [{ id, nome, nota? }]  (nota: testo grigio a destra, es. «12 partite»)

import { useEffect, useId, useMemo, useRef, useState } from 'react'

// «Ark Nova», «ark nova» e «arknova» si trovano allo stesso modo;
// gli accenti non contano.
const normale = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Quanti nomi disegnare al massimo: oltre, si chiede di scrivere ancora.
const MASSIMO = 200

export default function CercaScegli({
  opzioni, valore, onScegli, id, etichetta,
  segnaposto = 'Scrivi per cercare', svuotabile = false,
}) {
  const [testo, setTesto] = useState('')
  const [aperta, setAperta] = useState(false)
  const [evidenza, setEvidenza] = useState(0)
  const radice = useRef(null)
  const casella = useRef(null)
  const elenco = useRef(null)
  const idElenco = useId()

  const scelta = opzioni.find((o) => String(o.id) === String(valore)) || null

  // Prima i nomi che iniziano con quello che scrivi, poi quelli che lo contengono.
  const risultati = useMemo(() => {
    const q = normale(testo.trim())
    if (!q) return opzioni
    const inizio = []
    const dentro = []
    for (const o of opzioni) {
      const n = normale(o.nome)
      if (n.startsWith(q)) inizio.push(o)
      else if (n.includes(q) || n.replace(/[^a-z0-9]/g, '').includes(q.replace(/[^a-z0-9]/g, ''))) dentro.push(o)
    }
    return [...inizio, ...dentro]
  }, [opzioni, testo])

  // Un tocco fuori chiude l'elenco senza cambiare la scelta.
  useEffect(() => {
    if (!aperta) return
    const fuori = (e) => { if (radice.current && !radice.current.contains(e.target)) chiudi() }
    document.addEventListener('pointerdown', fuori)
    return () => document.removeEventListener('pointerdown', fuori)
  }, [aperta])

  // La voce evidenziata resta visibile mentre ci si muove con le frecce.
  useEffect(() => {
    if (!aperta || !elenco.current) return
    elenco.current.querySelector(`[data-indice="${evidenza}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [evidenza, aperta])

  function apri() {
    setTesto('')
    setEvidenza(Math.max(0, opzioni.findIndex((o) => String(o.id) === String(valore))))
    setAperta(true)
    // Sul telefono la tastiera copre metà schermo: la casella sale in
    // alto, così l'elenco sotto resta visibile.
    setTimeout(() => casella.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250)
  }

  function chiudi() {
    setAperta(false)
    setTesto('')
  }

  function scegli(o) {
    onScegli(o.id)
    chiudi()
    casella.current?.blur()
  }

  function tasto(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!aperta) apri()
      else setEvidenza((i) => Math.min(i + 1, Math.min(risultati.length, MASSIMO) - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setEvidenza((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (aperta && risultati[evidenza]) { e.preventDefault(); scegli(risultati[evidenza]) }
    } else if (e.key === 'Escape') {
      chiudi()
      casella.current?.blur()
    }
  }

  const visibili = risultati.slice(0, MASSIMO)

  return (
    <div className={`cerca-scegli${aperta ? ' aperta' : ''}`} ref={radice}>
      <input
        ref={casella}
        id={id}
        className="campo-cerca"
        value={aperta ? testo : scelta?.nome || ''}
        placeholder={aperta && scelta ? scelta.nome : segnaposto}
        onFocus={() => { if (!aperta) apri() }}
        onClick={() => { if (!aperta) apri() }}
        onChange={(e) => { setTesto(e.target.value); setEvidenza(0); setAperta(true) }}
        onKeyDown={tasto}
        role="combobox"
        aria-expanded={aperta}
        aria-controls={idElenco}
        aria-autocomplete="list"
        aria-label={etichetta}
        autoComplete="off"
        spellCheck="false"
      />
      {!aperta && scelta && svuotabile && (
        <button type="button" className="cerca-scegli-via" aria-label="Togli la scelta"
          onClick={() => onScegli('')}>×</button>
      )}
      {!aperta && !scelta && <span className="cerca-scegli-freccia" aria-hidden="true">⌄</span>}

      {aperta && (
        <ul className="tendina" role="listbox" id={idElenco} ref={elenco}>
          {visibili.length === 0 ? (
            <li className="tendina-vuota">Nessun risultato per «{testo.trim()}»</li>
          ) : visibili.map((o, i) => (
            <li key={o.id} role="option" aria-selected={String(o.id) === String(valore)}>
              <button
                type="button"
                data-indice={i}
                className={`${i === evidenza ? 'evidenziata' : ''}${String(o.id) === String(valore) ? ' scelta' : ''}`}
                onPointerEnter={() => setEvidenza(i)}
                onClick={() => scegli(o)}
              >
                <span className="tendina-nome">{o.nome}</span>
                {o.nota != null && <span className="tendina-nota">{o.nota}</span>}
              </button>
            </li>
          ))}
          {risultati.length > MASSIMO && (
            <li className="tendina-vuota">Altri {risultati.length - MASSIMO}: continua a scrivere</li>
          )}
        </ul>
      )}
    </div>
  )
}
