// Primo Giocatore - scelta del gioco di un tavolo da BoardGameGeek
// v1.0.0 - 202609301500
//
// Il gioco di un tavolo non viene dalla collezione di chi lo pubblica:
// il gioco lo porta il dimostratore, non l'organizzatore. Si cerca su
// BGG e, se il gioco non è ancora nell'app, lo si aggiunge al catalogo
// condiviso. Non entra nella collezione di nessuno: posseduti e giocati
// restano distinti.

import { useState } from 'react'
import { supabase } from './supabase'

const CAMPI = 'id, bgg_id, nome, immagine_url, max_giocatori'

// BGG restituisce i risultati senza un ordine utile: prima il nome
// identico, poi quelli che iniziano così, poi il resto; a parità, il
// più recente.
function ordina(risultati, testo) {
  const q = testo.trim().toLowerCase()
  const peso = (n) => {
    const x = n.toLowerCase()
    if (x === q) return 0
    if (x.startsWith(q)) return 1
    if (x.includes(q)) return 2
    return 3
  }
  return [...risultati].sort((a, b) =>
    peso(a.nome) - peso(b.nome) || (Number(b.anno) || 0) - (Number(a.anno) || 0))
}

export default function CercaGiocoBgg({ profilo, onScegli, autoFocus = false }) {
  const [testo, setTesto] = useState('')
  const [risultati, setRisultati] = useState(null)   // null = ricerca non fatta
  const [cercando, setCercando] = useState(false)
  const [prendendo, setPrendendo] = useState(null)   // bgg_id in arrivo
  const [errore, setErrore] = useState('')

  async function cerca() {
    const q = testo.trim()
    if (q.length < 2) { setErrore('Scrivi almeno due lettere.'); return }
    setErrore(''); setCercando(true); setRisultati(null)
    try {
      const r = await fetch(`/api/bgg?azione=cerca&q=${encodeURIComponent(q)}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Ricerca su BoardGameGeek non riuscita.')
      setRisultati(ordina(dati.risultati || [], q).slice(0, 15))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercando(false)
    }
  }

  // Se il gioco c'è già nell'app si usa quello; altrimenti si leggono
  // i dettagli da BGG e lo si aggiunge al catalogo.
  async function scegli(r) {
    setErrore(''); setPrendendo(r.bgg_id)
    try {
      const { data: esistente } = await supabase
        .from('giochi').select(CAMPI).eq('bgg_id', r.bgg_id).maybeSingle()
      if (esistente) { onScegli(esistente); return }

      const risposta = await fetch(`/api/bgg?azione=dettagli&id=${r.bgg_id}`)
      const dati = await risposta.json()
      if (!risposta.ok) throw new Error(dati.errore || 'Non sono riuscito a leggere il gioco da BGG.')
      const g = dati.giochi?.[0]
      if (!g) throw new Error('BGG non ha restituito il gioco.')

      const { data: creato, error } = await supabase.from('giochi').insert({
        bgg_id: g.bgg_id,
        nome: g.nome,
        anno: g.anno,
        min_giocatori: g.min_giocatori,
        max_giocatori: g.max_giocatori,
        durata_minuti: g.durata_minuti,
        immagine_url: g.immagine_url,
        immagine_grande: g.immagine_grande,
        creato_da: profilo.id,
      }).select(CAMPI).single()

      if (error) {
        // Qualcun altro può averlo aggiunto nel frattempo.
        const { data: ancora } = await supabase
          .from('giochi').select(CAMPI).eq('bgg_id', r.bgg_id).maybeSingle()
        if (!ancora) throw error
        onScegli(ancora)
        return
      }
      onScegli(creato)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setPrendendo(null)
    }
  }

  return (
    <div>
      <div className="riga-bottoni" style={{ alignItems: 'center' }}>
        <input className="campo-cerca" style={{ flex: 1, margin: 0 }} value={testo} autoFocus={autoFocus}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cerca() } }}
          placeholder="Nome del gioco" aria-label="Cerca il gioco su BoardGameGeek" />
        <button type="button" className="bottone-piatto" onClick={cerca} disabled={cercando}>
          {cercando ? 'Cerco…' : 'Cerca su BGG'}
        </button>
      </div>

      {cercando && <p className="aiuto">BoardGameGeek risponde lentamente: può volerci qualche secondo.</p>}
      {errore && <div className="avviso errore">{errore}</div>}

      {risultati && risultati.length === 0 && (
        <p className="aiuto">Nessun gioco con questo nome su BoardGameGeek.</p>
      )}

      {risultati && risultati.length > 0 && (
        <ul className="elenco">
          {risultati.map((r) => (
            <li key={r.bgg_id}>
              <span>{r.nome}{r.anno ? <span className="anno"> ({r.anno})</span> : null}</span>
              <button type="button" className="bottone-piatto" onClick={() => scegli(r)}
                disabled={prendendo != null}>
                {prendendo === r.bgg_id ? 'Un attimo…' : 'Scegli'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
