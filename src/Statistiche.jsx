// Primo Giocatore - Statistiche
// v1.11.0 - 202609151300

import { useEffect, useState } from 'react'
import { supabase, COLORI, daMostrare } from './supabase'

const mese = (d) => new Date(d).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
const perc = (parte, tutto) => (tutto === 0 ? '—' : `${Math.round((parte / tutto) * 100)}%`)

export default function Statistiche({ profilo }) {
  const [partite, setPartite] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, tipo_punteggio, esito_coop,
        giochi ( id, nome ),
        partecipazioni (
          utente_id, ospite_id, punteggio_totale, posizione, vincitore,
          profili:utente_id ( nome, nickname, colore ),
          ospiti:ospite_id ( nome, utente_collegato )
        )
      `)
      .order('giocata_il', { ascending: true })

    if (error) setErrore(error.message)
    else setPartite(data || [])
    setCaricamento(false)
  }

  if (caricamento) return <div className="scheda"><p>Conto&hellip;</p></div>

  // Solo le partite in cui c'ero davvero.
  const mie = partite.filter((p) =>
    (p.partecipazioni || []).some((x) => x.utente_id === profilo.id)
  )

  const miaRiga = (p) => (p.partecipazioni || []).find((x) => x.utente_id === profilo.id)

  const vinte = mie.filter((p) => miaRiga(p)?.vincitore).length
  const competitive = mie.filter((p) => p.tipo_punteggio !== 'coop')
  const conPosizione = competitive.filter((p) => miaRiga(p)?.posizione != null)
  const piazzamentoMedio = conPosizione.length
    ? (conPosizione.reduce((t, p) => t + miaRiga(p).posizione, 0) / conPosizione.length).toFixed(1)
    : '—'
  const minuti = mie.reduce((t, p) => t + (p.durata_minuti || 0), 0)
  const oreTotali = minuti >= 60 ? `${Math.round(minuti / 60)} h` : `${minuti} min`
  const giochiDiversi = new Set(mie.map((p) => p.giochi?.id).filter(Boolean)).size

  // Identità unica: un ospite collegato a un account è la stessa persona.
  const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
  const nomeDi = (x) => (x.profili ? daMostrare(x.profili) : x.ospiti?.nome || 'Sconosciuto')
  const coloreDi = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'

  /* --- Partite per mese, ultimi 12 --- */
  function perMese() {
    const m = new Map()
    for (const p of mie) {
      const k = mese(p.giocata_il)
      m.set(k, (m.get(k) || 0) + 1)
    }
    const righe = [...m.entries()].slice(-12)
    const massimo = Math.max(1, ...righe.map(([, n]) => n))
    return { righe, massimo }
  }

  /* --- Testa a testa con ogni avversario --- */
  function avversari() {
    const m = new Map()
    for (const p of competitive) {
      const io = miaRiga(p)
      if (!io) continue
      for (const x of p.partecipazioni || []) {
        if (x.utente_id === profilo.id) continue
        const k = identita(x)
        const v = m.get(k) || { nome: nomeDi(x), colore: coloreDi(x), insieme: 0, mie: 0, sue: 0 }
        v.insieme++
        if (io.vincitore) v.mie++
        if (x.vincitore) v.sue++
        m.set(k, v)
      }
    }
    return [...m.values()].sort((a, b) => b.insieme - a.insieme)
  }

  /* --- I tuoi numeri gioco per gioco --- */
  function perGioco() {
    const m = new Map()
    for (const p of mie) {
      if (!p.giochi) continue
      const io = miaRiga(p)
      const v = m.get(p.giochi.id) || { nome: p.giochi.nome, partite: 0, vinte: 0, migliore: null }
      v.partite++
      if (io.vincitore) v.vinte++
      if (io.punteggio_totale != null && (v.migliore == null || io.punteggio_totale > v.migliore))
        v.migliore = io.punteggio_totale
      m.set(p.giochi.id, v)
    }
    return [...m.values()].sort((a, b) => b.partite - a.partite)
  }

  const { righe: mesi, massimo } = perMese()

  return (
    <div className="scheda">
      <h2>Statistiche</h2>
      <p className="sottotitolo">Solo le partite in cui hai giocato tu.</p>

      {errore && <div className="avviso errore">{errore}</div>}

      {mie.length === 0 ? (
        <p className="aiuto">Nessuna partita con te dentro, per ora.</p>
      ) : (
        <>
          <div className="numeroni">
            <div className="numerone">
              <span className="cifra">{mie.length}</span>
              <span className="didascalia">partite</span>
            </div>
            <div className="numerone">
              <span className="cifra">{vinte}</span>
              <span className="didascalia">vinte ({perc(vinte, mie.length)})</span>
            </div>
            <div className="numerone">
              <span className="cifra">{piazzamentoMedio}</span>
              <span className="didascalia">piazzamento medio</span>
            </div>
            <div className="numerone">
              <span className="cifra">{giochiDiversi}</span>
              <span className="didascalia">giochi diversi</span>
            </div>
            <div className="numerone">
              <span className="cifra">{oreTotali}</span>
              <span className="didascalia">al tavolo</span>
            </div>
          </div>

          {mesi.length > 1 && (
            <>
              <h3 className="titolo-sezione">Quanto giochi</h3>
              <div className="istogramma">
                {mesi.map(([etichetta, n]) => (
                  <div className="colonna" key={etichetta}>
                    <span className="valore">{n}</span>
                    <div className="barra" style={{ height: `${(n / massimo) * 100}%` }} />
                    <span className="etichetta">{etichetta}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="titolo-sezione">Gioco per gioco</h3>
          <ul className="elenco">
            {perGioco().map((g) => (
              <li key={g.nome}>
                <div className="nome-giocatore">
                  <strong>{g.nome}</strong>
                  <span className="anno block">
                    {g.partite} {g.partite === 1 ? 'partita' : 'partite'} · {g.vinte} vinte ({perc(g.vinte, g.partite)})
                  </span>
                </div>
                {g.migliore != null && (
                  <span className="punti-finali" title="Il tuo punteggio migliore">{g.migliore}</span>
                )}
              </li>
            ))}
          </ul>

          <h3 className="titolo-sezione">Testa a testa</h3>
          {avversari().length === 0 ? (
            <p className="aiuto">Per ora nessun avversario.</p>
          ) : (
            <ul className="elenco">
              {avversari().map((a) => (
                <li key={a.nome}>
                  <span className="pallino" style={{ background: a.colore }} aria-hidden="true" />
                  <div className="nome-giocatore">
                    <strong>{a.nome}</strong>
                    <span className="anno block">{a.insieme} partite insieme</span>
                  </div>
                  <span className={`bilancio${a.mie > a.sue ? ' avanti' : a.mie < a.sue ? ' indietro' : ''}`}>
                    {a.mie} – {a.sue}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="aiuto">
            Il punteggio del testa a testa conta le vittorie tue e sue nelle partite giocate insieme,
            quindi non è detto che la somma faccia il totale: in mezzo ci sono gli altri giocatori.
          </p>
        </>
      )}
    </div>
  )
}
