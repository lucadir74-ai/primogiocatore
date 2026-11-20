// Primo Giocatore - classifica di un evento
// v1.2.0 - 202611202300 (il campione di un gioco si conta solo nelle partite competitive)
//
// Solo le partite dell'evento, con tutti quelli che le hanno giocate:
// soci, partecipanti e ospiti senza account. Si calcola qui, al
// momento, con lo stesso metodo del Primeggio (src/primeggioCalcolo.js):
// è sempre aggiornata, anche mentre l'evento è in corso.
// Le partite arrivano dal database (classifica_evento, eventi_fase5.sql).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { calcolaPrimeggio } from './primeggioCalcolo'
import BarraScorrevole from './BarraScorrevole.jsx'

// In tre giorni si giocano poche partite: per entrare in classifica ne bastano 3.
export const MIN_PARTITE_EVENTO = 3

// Prima le vittorie: si capiscono subito. L'IPG dell'evento, con poche
// partite, può mettere davanti chi ne ha vinte meno (pesa avversari e giochi).
const VISTE = [['vittorie', 'Più vittorie'], ['ipg', 'IPG evento'], ['partite', 'Più partite'], ['giochi', 'Giochi']]
const partiteTesto = (n) => `${n} ${n === 1 ? 'partita' : 'partite'}`
const vinteTesto = (n) => `${n} ${n === 1 ? 'vinta' : 'vinte'}`

export default function ClassificaEvento({ evento, profilo }) {
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState('')
  const [vista, setVista] = useState('vittorie')

  useEffect(() => {
    setDati(null); setErrore('')
    supabase.rpc('classifica_evento', { p_evento: evento.id }).then(({ data, error }) => {
      if (error) setErrore(/classifica_evento/.test(error.message) ? 'Manca lo script eventi_fase5.sql nel database.' : error.message)
      else setDati(data || { partite: [], persone: {} })
    })
  }, [evento.id])

  const conti = useMemo(() => {
    if (!dati) return null
    const righe = calcolaPrimeggio(dati.partite || [], { minGlobale: MIN_PARTITE_EVENTO, ancheOspiti: true })
    const nome = (k) => dati.persone?.[k] || 'Giocatore'
    const globali = righe.filter((r) => r.gioco_id === '').map((r) => ({ ...r, nome: nome(r.profilo_id) }))
    const giochi = new Map()
    for (const p of dati.partite || []) {
      const g = giochi.get(p.giochi.id) || { id: p.giochi.id, nome: p.giochi.nome, partite: 0, vincitori: new Map() }
      g.partite++
      for (const x of p.partecipazioni || []) {
        const k = x.utente_id || x.ospiti?.utente_collegato || (x.ospite_id ? `ospite:${x.ospite_id}` : null)
        // Il campione di un gioco si fa nelle competitive: una cooperativa la vincono tutti.
        if (k && x.vincitore && p.tipo_punteggio !== 'coop') g.vincitori.set(k, (g.vincitori.get(k) || 0) + 1)
      }
      giochi.set(p.giochi.id, g)
    }
    return {
      classificati: globali.filter((r) => r.posizione).sort((a, b) => a.posizione - b.posizione),
      inAttesa: globali.filter((r) => !r.posizione).sort((a, b) => b.partite - a.partite),
      vittorie: [...globali].filter((r) => r.vittorie > 0).sort((a, b) => b.vittorie - a.vittorie || a.partite - b.partite),
      partite: [...globali].sort((a, b) => b.partite - a.partite),
      giochi: [...giochi.values()].sort((a, b) => b.partite - a.partite)
        .map((g) => ({ ...g, campione: [...g.vincitori].sort((a, b) => b[1] - a[1])[0] })),
      nome,
      totale: (dati.partite || []).length,
    }
  }, [dati])

  if (errore) return <div className="avviso errore">{errore}</div>
  if (!conti) return <p>Un attimo&hellip;</p>
  if (conti.totale === 0) return <p className="sottotitolo">Ancora nessuna partita registrata nell&rsquo;evento: la classifica parte con la prima.</p>

  const io = (k) => k === profilo.id
  const riga = (r, posto, valore, sotto) => (
    <li key={r.profilo_id} className={io(r.profilo_id) ? 'io' : ''}>
      <span className="posto">{posto}</span>
      <div className="nome-giocatore">
        <strong>{r.nome}</strong>{io(r.profilo_id) ? ' (tu)' : ''}
        <span className="anno block">{sotto}</span>
      </div>
      <span className="punti-finali">{valore}</span>
    </li>
  )

  return (
    <>
      <p className="aiuto">{partiteTesto(conti.totale)} nell&rsquo;evento. Si aggiorna a ogni partita registrata.</p>
      <BarraScorrevole><div className="sottoschede">
        {VISTE.map(([id, t]) => <button key={id} className={vista === id ? 'attiva' : ''} onClick={() => setVista(id)}>{t}</button>)}
      </div></BarraScorrevole>

      {vista === 'ipg' && (
        <>
          <p className="aiuto">
            L&rsquo;IPG dell&rsquo;evento: lo stesso calcolo del Primeggio, solo sulle partite dell&rsquo;evento.
            Conta contro chi hai giocato, non solo quante ne hai vinte. In classifica da {MIN_PARTITE_EVENTO} partite.
          </p>
          {conti.classificati.length === 0
            ? <p className="sottotitolo">Nessuno ha ancora {MIN_PARTITE_EVENTO} partite.</p>
            : <ul className="elenco">{conti.classificati.map((r) => riga(r, `${r.posizione}°`, r.ipg,
                `${partiteTesto(r.partite)} · ${vinteTesto(r.vittorie)}`))}</ul>}
          {conti.inAttesa.length > 0 && (
            <>
              <h3 className="titolo-sezione">Ancora poche partite</h3>
              <ul className="elenco">{conti.inAttesa.map((r) => riga(r, '', '—',
                `${partiteTesto(r.partite)}: ne mancano ${MIN_PARTITE_EVENTO - r.partite}`))}</ul>
            </>
          )}
        </>
      )}

      {vista === 'vittorie' && (
        conti.vittorie.length === 0 ? <p className="sottotitolo">Ancora nessuna vittoria.</p>
          : <ul className="elenco">{conti.vittorie.map((r, i) => riga(r, `${i + 1}°`, r.vittorie,
              `su ${partiteTesto(r.partite)} · ${Math.round((r.vittorie / r.partite) * 100)}%`))}</ul>
      )}

      {vista === 'partite' && (
        <ul className="elenco">{conti.partite.map((r, i) => riga(r, `${i + 1}°`, r.partite, vinteTesto(r.vittorie)))}</ul>
      )}

      {vista === 'giochi' && (
        <ul className="elenco">
          {conti.giochi.map((g) => (
            <li key={g.id}>
              <div className="nome-giocatore">
                <strong>{g.nome}</strong>
                <span className="anno block">
                  {partiteTesto(g.partite)}
                  {g.campione ? ` · più vittorie: ${conti.nome(g.campione[0])} (${g.campione[1]})` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
