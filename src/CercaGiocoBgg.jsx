// Primo Giocatore - scelta del gioco di un tavolo
// v1.2.0 - 202609302000
//
// Il gioco di un tavolo non viene dalla collezione di chi lo pubblica:
// il gioco lo porta il dimostratore. Mentre scrivi cerca fra tutti i
// giochi già presenti nell'app; se non c'è, un tasto lo cerca su BGG e
// lo aggiunge al catalogo condiviso, senza metterlo nella collezione di
// nessuno. Si usa solo da chi organizza.
// Si tocca il nome del gioco per sceglierlo.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { assicuraGiocoBgg } from './giochiMiei'

const CAMPI = 'id, bgg_id, nome, anno, immagine_url, max_giocatori'

// Prima il nome identico, poi quelli che iniziano così, poi il resto;
// a parità, il più recente.
function ordina(elenco, testo) {
  const q = testo.trim().toLowerCase()
  const peso = (n) => {
    const x = (n || '').toLowerCase()
    if (x === q) return 0
    if (x.startsWith(q)) return 1
    if (x.includes(q)) return 2
    return 3
  }
  return [...elenco].sort((a, b) =>
    peso(a.nome) - peso(b.nome) || (Number(b.anno) || 0) - (Number(a.anno) || 0))
}

function Voce({ gioco, onClick, disabled, nota }) {
  return (
    <li>
      <button type="button" className="voce-scelta" onClick={onClick} disabled={disabled}>
        {gioco.immagine_url
          ? <img src={gioco.immagine_url} alt="" className="copertina" />
          : <span className="copertina copertina-vuota" aria-hidden="true" />}
        <span className="voce-testo">
          <strong>{gioco.nome}</strong>
          {gioco.anno ? <span className="anno"> {gioco.anno}</span> : null}
          {nota && <span className="anno block">{nota}</span>}
        </span>
      </button>
    </li>
  )
}

export default function CercaGiocoBgg({ profilo, onScegli, autoFocus = false }) {
  const [testo, setTesto] = useState('')
  const [locali, setLocali] = useState([])
  const [suBgg, setSuBgg] = useState(null)          // null = ricerca BGG non fatta
  const [cercando, setCercando] = useState(false)
  const [prendendo, setPrendendo] = useState(null)  // bgg_id in arrivo
  const [errore, setErrore] = useState('')

  // Mentre scrivi: i giochi già nell'app.
  useEffect(() => {
    setSuBgg(null)
    const q = testo.trim().replace(/[%*,()]/g, '')
    if (q.length < 2) { setLocali([]); return }
    const attesa = setTimeout(async () => {
      const { data } = await supabase.from('giochi').select(CAMPI)
        .ilike('nome', `%${q}%`).limit(30)
      setLocali(ordina(data || [], q).slice(0, 8))
    }, 200)
    return () => clearTimeout(attesa)
  }, [testo])

  async function cercaSuBgg() {
    const q = testo.trim()
    if (q.length < 2) return
    setErrore(''); setCercando(true)
    try {
      const r = await fetch(`/api/bgg?azione=cerca&q=${encodeURIComponent(q)}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Ricerca su BoardGameGeek non riuscita.')
      const giaQui = new Set(locali.map((g) => g.bgg_id))
      setSuBgg(ordina((dati.risultati || []).filter((x) => !giaQui.has(x.bgg_id)), q).slice(0, 15))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercando(false)
    }
  }

  async function scegliDaBgg(r) {
    setErrore(''); setPrendendo(r.bgg_id)
    try {
      const risposta = await fetch(`/api/bgg?azione=dettagli&id=${r.bgg_id}`)
      const dati = await risposta.json()
      if (!risposta.ok) throw new Error(dati.errore || 'Non sono riuscito a leggere il gioco da BGG.')
      const g = dati.giochi?.[0]
      if (!g) throw new Error('BGG non ha restituito il gioco.')
      onScegli(await assicuraGiocoBgg(g))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setPrendendo(null)
    }
  }

  const q = testo.trim()

  return (
    <div>
      <input className="campo-cerca" value={testo} autoFocus={autoFocus}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cercaSuBgg() } }}
        placeholder="Scrivi le prime lettere del gioco" aria-label="Cerca il gioco" />

      {locali.length > 0 && (
        <ul className="elenco">
          {locali.map((g) => <Voce key={g.id} gioco={g} onClick={() => onScegli(g)} />)}
        </ul>
      )}

      {q.length >= 2 && suBgg === null && (
        <>
          {locali.length === 0 && !cercando && (
            <p className="aiuto">Nell&rsquo;app non c&rsquo;è ancora un gioco con questo nome.</p>
          )}
          <button type="button" className="bottone bottone-secondario" onClick={cercaSuBgg} disabled={cercando}>
            {cercando ? 'Cerco su BGG… può volerci qualche secondo'
              : locali.length ? 'Non è questo? Cerca su BoardGameGeek' : 'Cerca su BoardGameGeek'}
          </button>
        </>
      )}

      {errore && <div className="avviso errore">{errore}</div>}

      {suBgg && (
        suBgg.length === 0 ? (
          <p className="aiuto">Nessun altro gioco con questo nome su BoardGameGeek.</p>
        ) : (
          <>
            <h3 className="titolo-sezione">Da BoardGameGeek</h3>
            <ul className="elenco">
              {suBgg.map((r) => (
                <Voce key={r.bgg_id} gioco={r} onClick={() => scegliDaBgg(r)} disabled={prendendo != null}
                  nota={prendendo === r.bgg_id ? 'Lo prendo da BGG…' : null} />
              ))}
            </ul>
          </>
        )
      )}
    </div>
  )
}
