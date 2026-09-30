// Primo Giocatore - scelta del dimostratore di un tavolo
// v1.0.0 - 202609301500
//
// Il dimostratore si prende fra i dimostratori: chi ha un account ed è
// segnato come tale, oppure un ospite dimostratore. Se la persona c'è
// già nell'app ma non è ancora dimostratore (un giocatore delle partite,
// un utente registrato) lo diventa nel momento in cui la scegli. Se non
// c'è proprio, si crea un ospite: lo stesso che poi potrà comparire
// nelle partite e passare al suo account quando si registra.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

const daProfilo = (x) => ({ chiave: `p:${x.id}`, tipo: 'profilo', id: x.id, nome: daMostrare(x) })
const daOspite = (x) => ({ chiave: `o:${x.id}`, tipo: 'ospite', id: x.id, nome: x.nome })

export default function CercaDimostratore({ profilo, disponibili = [], onScegli, onErrore }) {
  const [testo, setTesto] = useState('')
  const [trovati, setTrovati] = useState({ dimostratori: [], altri: [] })
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => {
    // Virgole e parentesi romperebbero il filtro di Supabase.
    const q = testo.trim().replace(/[,()%*]/g, '')
    if (q.length < 2) { setTrovati({ dimostratori: [], altri: [] }); return }
    const attesa = setTimeout(async () => {
      const [p, o] = await Promise.all([
        supabase.from('profili').select('id, nome, nickname, dimostratore')
          .or(`nome.ilike.%${q}%,nickname.ilike.%${q}%`).limit(12),
        supabase.from('ospiti').select('id, nome, dimostratore')
          .ilike('nome', `%${q}%`).is('utente_collegato', null).limit(12),
      ])
      const tutti = [
        ...(p.data || []).map((x) => ({ ...daProfilo(x), dimostratore: x.dimostratore })),
        ...(o.data || []).map((x) => ({ ...daOspite(x), dimostratore: x.dimostratore })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
      setTrovati({
        dimostratori: tutti.filter((x) => x.dimostratore),
        altri: tutti.filter((x) => !x.dimostratore),
      })
    }, 250)
    return () => clearTimeout(attesa)
  }, [testo])

  function scelto(persona) {
    setTesto('')
    onScegli({ chiave: persona.chiave, tipo: persona.tipo, id: persona.id, nome: persona.nome })
  }

  // Chi c'è già nell'app diventa dimostratore adesso.
  async function nomina(persona) {
    setLavorando(true)
    const tabella = persona.tipo === 'profilo' ? 'profili' : 'ospiti'
    const { error } = await supabase.from(tabella).update({ dimostratore: true }).eq('id', persona.id)
    setLavorando(false)
    if (error) { onErrore?.(error.message); return }
    scelto(persona)
  }

  async function aggiungi() {
    const nome = testo.trim()
    if (!nome) return
    setLavorando(true)
    const { data, error } = await supabase.from('ospiti')
      .insert({ nome, creato_da: profilo.id, dimostratore: true })
      .select('id, nome').single()
    setLavorando(false)
    if (error) { onErrore?.(error.message); return }
    scelto(daOspite(data))
  }

  const q = testo.trim()
  const identico = [...trovati.dimostratori, ...trovati.altri]
    .some((x) => x.nome.toLowerCase() === q.toLowerCase())

  return (
    <div>
      {disponibili.length > 0 && (
        <>
          <p className="aiuto">Si sono dati disponibili per questa serata:</p>
          <div className="pastiglie-persone">
            {disponibili.map((d) => (
              <button type="button" key={d.chiave}
                className={`pastiglia-nome${d.stato === 'forse' ? ' ospite' : ''}`}
                onClick={() => scelto(d)}>
                {d.nome}{d.stato === 'forse' ? ' (forse)' : ''}
              </button>
            ))}
          </div>
        </>
      )}

      <input className="campo-cerca" value={testo} onChange={(e) => setTesto(e.target.value)}
        placeholder="Cerca fra i dimostratori" aria-label="Cerca il dimostratore" />

      {q.length >= 2 && (
        <div className="pastiglie-persone">
          {trovati.dimostratori.map((p) => (
            <button type="button" key={p.chiave} className="pastiglia-nome" onClick={() => scelto(p)}>
              {p.nome}<span className="stellina" aria-label="dimostratore"> ★</span>
              {p.tipo === 'ospite' && <span className="anno"> · senza account</span>}
            </button>
          ))}
          {trovati.altri.map((p) => (
            <button type="button" key={p.chiave} className="pastiglia-nome ospite"
              onClick={() => nomina(p)} disabled={lavorando}>
              {p.nome} <span className="anno">(nuovo dimostratore{p.tipo === 'ospite' ? ', senza account' : ''})</span>
            </button>
          ))}
          {!identico && (
            <button type="button" className="pastiglia-nome nuovo" onClick={aggiungi} disabled={lavorando}>
              + Aggiungi «{q}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
