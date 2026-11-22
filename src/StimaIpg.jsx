// Primo Giocatore - quanto cambia l'IPG con la partita appena registrata
// v1.0.0 - 202611231600
//
// Subito dopo il salvataggio, per ogni giocatore con un account: l'IPG di
// quel gioco prima e dopo, e di quanto si muove l'IPG globale. È una
// STIMA: parte dai valori dell'ultimo ricalcolo (tabella ipg, con forza
// mu e incertezza sigma per gioco) e applica la sola partita nuova con
// lo stesso motore del server (openskill, src/primeggioCalcolo.js). Il
// valore vero arriva col ricalcolo, di notte o dal tasto in Statistiche:
// può differire un poco se intanto sono entrate altre partite, o se la
// partita è più vecchia di altre già registrate. Gli ospiti senza account
// giocano come avversari nuovi (la loro forza non è salvata).
//
// Non compare per cooperative, partite a squadre e partite senza un
// vincitore riconoscibile: il Primeggio non le conta.

import { useEffect, useState } from 'react'
import { rating, rate } from 'openskill'
import { supabase, tutteLeRighe } from './supabase'
import { posti, ipgDa, pesoEffettivo, TETTO_PARTITE } from './primeggioCalcolo.js'

const segno = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

// Media pesata come sul server: peso BGG × partite (con il tetto).
function globale(righe, pesi) {
  let somma = 0
  let tot = 0
  for (const r of righe) {
    const w = pesoEffettivo(pesi.get(String(r.gioco_id))) * Math.min(r.partite, TETTO_PARTITE)
    somma += r.ipg * w
    tot += w
  }
  return tot ? somma / tot : null
}

// giocatori: [{ nome, utente_id, ospite_id, posizione, punteggio_totale, vincitore }]
export async function calcolaStimaIpg(giocoId, giocatori) {
  const gioco = String(giocoId)
  // Una persona una volta sola, come nel calcolo del server.
  const viste = new Set()
  const righe = giocatori.filter((g) => {
    const k = g.utente_id || (g.ospite_id ? `ospite:${g.ospite_id}` : null)
    if (!k || viste.has(k)) return false
    viste.add(k)
    return true
  })
  if (righe.length < 2) return null
  const rank = posti(righe)
  if (!rank) return null
  const account = [...new Set(righe.map((r) => r.utente_id).filter(Boolean))]
  if (!account.length) return null

  // Tutte le righe IPG per gioco di chi ha un account (servono per il globale).
  const ipg = await tutteLeRighe(() => supabase.from('ipg')
    .select('profilo_id, gioco_id, ipg, partite, mu, sigma')
    .in('profilo_id', account).neq('gioco_id', '').order('gioco_id'), 1000, null)
  const idGiochi = [...new Set([...ipg.map((r) => String(r.gioco_id)), gioco])]
  const pesi = new Map()
  for (let i = 0; i < idGiochi.length; i += 150) {
    const { data, error } = await supabase.from('giochi').select('id, peso_bgg').in('id', idGiochi.slice(i, i + 150))
    if (error) throw error
    for (const g of data || []) pesi.set(String(g.id), g.peso_bgg)
  }

  const qui = (id) => ipg.find((r) => r.profilo_id === id && String(r.gioco_id) === gioco)
  const prima = righe.map((r) => {
    const v = r.utente_id && qui(r.utente_id)
    return v && v.mu != null && v.sigma != null ? rating({ mu: Number(v.mu), sigma: Number(v.sigma) }) : rating()
  })
  const dopo = rate(prima.map((x) => [x]), { rank }).map((t) => t[0])

  return righe.map((r, i) => {
    if (!r.utente_id) return null
    const v = qui(r.utente_id)
    const ipgPrima = v ? v.ipg : ipgDa(prima[i])
    const ipgDopo = ipgDa(dopo[i])
    const mie = ipg.filter((x) => x.profilo_id === r.utente_id)
    const altre = mie.filter((x) => String(x.gioco_id) !== gioco)
    const gPrima = globale(mie, pesi)
    const gDopo = globale([...altre, { gioco_id: gioco, ipg: ipgDopo, partite: (v?.partite || 0) + 1 }], pesi)
    return {
      nome: r.nome,
      prima: ipgPrima,
      dopo: ipgDopo,
      delta: ipgDopo - ipgPrima,
      globale: gPrima == null ? null : Math.round(gDopo) - Math.round(gPrima),
      nuovo: !v,
    }
  }).filter(Boolean)
}

export default function StimaIpg({ giocoId, giocoNome, giocatori }) {
  const [righe, setRighe] = useState(null)

  useEffect(() => {
    let vivo = true
    calcolaStimaIpg(giocoId, giocatori)
      .then((r) => { if (vivo) setRighe(r || []) })
      .catch(() => { if (vivo) setRighe([]) })   // tabella non leggibile: non si mostra niente
    return () => { vivo = false }
  }, [giocoId, giocatori])

  if (!righe?.length) return null
  return (
    <div className="scheda stima-ipg">
      <h3>Primeggio</h3>
      <ul>
        {righe.map((r) => (
          <li key={r.nome}>
            <span className="stima-ipg-nome">{r.nome}</span>
            <span className="stima-ipg-numeri">
              {giocoNome}: {r.nuovo ? `${r.dopo} (prima partita)` : `${r.prima} → ${r.dopo}`}
              {' '}<strong className={r.delta > 0 ? 'su' : r.delta < 0 ? 'giu' : ''}>{segno(r.delta)}</strong>
              {r.globale != null && <> · globale <strong className={r.globale > 0 ? 'su' : r.globale < 0 ? 'giu' : ''}>{segno(r.globale)}</strong></>}
            </span>
          </li>
        ))}
      </ul>
      <p className="aiuto">
        Stima sull&rsquo;ultimo ricalcolo. Il valore vero arriva col prossimo ricalcolo, stanotte
        (può differire di poco). Gli ospiti senza account non hanno IPG.
      </p>
    </div>
  )
}
