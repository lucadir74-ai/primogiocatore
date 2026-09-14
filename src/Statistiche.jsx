// Primo Giocatore - Statistiche
// v1.12.0 - 202609151500

import { useEffect, useState } from 'react'
import { supabase, COLORI, daMostrare } from './supabase'

const mese = (d) => new Date(d).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
const perc = (parte, tutto) => (tutto === 0 ? '—' : `${Math.round((parte / tutto) * 100)}%`)

function mediana(numeri) {
  if (numeri.length === 0) return null
  const o = [...numeri].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

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

  const mie = partite.filter((p) =>
    (p.partecipazioni || []).some((x) => x.utente_id === profilo.id)
  )
  const miaRiga = (p) => (p.partecipazioni || []).find((x) => x.utente_id === profilo.id)
  const quanti = (p) => (p.partecipazioni || []).length

  // I cooperativi si contano a parte: lì non c'è nessuno da battere.
  const competitive = mie.filter((p) => p.tipo_punteggio !== 'coop')
  const cooperative = mie.filter((p) => p.tipo_punteggio === 'coop')
  const coopVinte = cooperative.filter((p) => p.esito_coop === 'vinta').length

  const vinte = competitive.filter((p) => miaRiga(p)?.vincitore).length

  /* --- Rendimento rispetto all'atteso ---
     In una partita fra n persone la vittoria "spettante" vale 1/n.
     Sommando le attese di tutte le partite si ottiene quante ne
     avrebbe vinte un giocatore qualunque al posto tuo. */
  const attese = competitive.reduce((t, p) => t + (quanti(p) > 0 ? 1 / quanti(p) : 0), 0)
  const rendimento = attese > 0 ? vinte / attese : null

  /* --- Piazzamento percentuale ---
     1 = primo, 0 = ultimo, indipendentemente da quanti erano al tavolo.
     Secondo su tre vale 0.50, secondo su sei vale 0.80. */
  const conPos = competitive.filter((p) => miaRiga(p)?.posizione != null && quanti(p) > 1)
  const piazzamentoPerc = conPos.length
    ? conPos.reduce((t, p) => t + (quanti(p) - miaRiga(p).posizione) / (quanti(p) - 1), 0) / conPos.length
    : null

  /* --- Distanza dal vincitore, in percentuale del suo punteggio --- */
  const distanze = []
  for (const p of competitive) {
    const io = miaRiga(p)
    if (!io || io.vincitore || io.punteggio_totale == null) continue
    const punteggi = (p.partecipazioni || []).map((x) => x.punteggio_totale).filter((v) => v != null)
    const massimo = Math.max(...punteggi)
    if (!isFinite(massimo) || massimo <= 0) continue
    distanze.push((massimo - io.punteggio_totale) / massimo)
  }
  const distanzaMedia = distanze.length
    ? distanze.reduce((a, b) => a + b, 0) / distanze.length
    : null

  /* --- Serie di vittorie --- */
  function serie() {
    let attuale = 0, record = 0, tipoAttuale = null
    for (const p of competitive) {
      const vinta = Boolean(miaRiga(p)?.vincitore)
      if (tipoAttuale === vinta) attuale++
      else { tipoAttuale = vinta; attuale = 1 }
      if (vinta) record = Math.max(record, attuale)
    }
    return { attuale, vincente: tipoAttuale, record }
  }
  const s = serie()

  const minuti = mie.reduce((t, p) => t + (p.durata_minuti || 0), 0)
  const oreTotali = minuti >= 60 ? `${Math.round(minuti / 60)} h` : `${minuti} min`
  const giochiDiversi = new Set(mie.map((p) => p.giochi?.id).filter(Boolean)).size

  const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
  const nomeDi = (x) => (x.profili ? daMostrare(x.profili) : x.ospiti?.nome || 'Sconosciuto')
  const coloreDi = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'

  function perMese() {
    const m = new Map()
    for (const p of mie) m.set(mese(p.giocata_il), (m.get(mese(p.giocata_il)) || 0) + 1)
    const righe = [...m.entries()].slice(-12)
    return { righe, massimo: Math.max(1, ...righe.map(([, n]) => n)) }
  }

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

  function perGioco() {
    const m = new Map()
    for (const p of mie) {
      if (!p.giochi) continue
      const io = miaRiga(p)
      const v = m.get(p.giochi.id) || {
        nome: p.giochi.nome, partite: 0, vinte: 0, attese: 0, punteggi: [], migliore: null,
      }
      v.partite++
      if (io.vincitore) v.vinte++
      if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
      if (io.punteggio_totale != null) {
        v.punteggi.push(io.punteggio_totale)
        if (v.migliore == null || io.punteggio_totale > v.migliore) v.migliore = io.punteggio_totale
      }
      m.set(p.giochi.id, v)
    }
    return [...m.values()].sort((a, b) => b.partite - a.partite)
  }

  const { righe: mesi, massimo } = perMese()

  return (
    <div className="scheda">
      <h2>Numeri</h2>
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
              <span className="didascalia">vinte ({perc(vinte, competitive.length)})</span>
            </div>
            <div className={`numerone${rendimento != null ? (rendimento >= 1 ? ' sopra' : ' sotto') : ''}`}>
              <span className="cifra">{rendimento != null ? `${rendimento.toFixed(2)}×` : '—'}</span>
              <span className="didascalia">rispetto all'atteso</span>
            </div>
            <div className="numerone">
              <span className="cifra">
                {piazzamentoPerc != null ? `${Math.round(piazzamentoPerc * 100)}` : '—'}
              </span>
              <span className="didascalia">piazzamento su 100</span>
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

          <div className="spiegone">
            <p>
              <strong>Rispetto all'atteso</strong> è il numero che conta più della percentuale di
              vittorie, perché tiene conto di quanti eravate: in quattro la vittoria "spettante"
              vale un quarto, in due metà. Nelle tue {competitive.length} partite competitive un
              giocatore qualunque ne avrebbe vinte {attese.toFixed(1)}; tu ne hai vinte {vinte}.
              Sopra 1,00 vai meglio del caso, sotto peggio.
            </p>
            <p>
              <strong>Piazzamento su 100</strong> vale 100 se arrivi sempre primo e 0 se sempre
              ultimo, qualunque sia il numero di giocatori. Secondo su tre fa 50, secondo su sei fa 80.
            </p>
          </div>

          {(distanzaMedia != null || s.record > 0 || cooperative.length > 0) && (
            <>
              <h3 className="titolo-sezione">Dettagli</h3>
              <ul className="elenco">
                {distanzaMedia != null && (
                  <li>
                    <div className="nome-giocatore">
                      <strong>Quando perdi</strong>
                      <span className="anno block">distanza media dal vincitore</span>
                    </div>
                    <span className="punti-finali">−{Math.round(distanzaMedia * 100)}%</span>
                  </li>
                )}
                {s.record > 0 && (
                  <li>
                    <div className="nome-giocatore">
                      <strong>Vittorie di fila</strong>
                      <span className="anno block">
                        {s.vincente && s.attuale > 0 ? `serie aperta: ${s.attuale}` : 'nessuna serie aperta'}
                      </span>
                    </div>
                    <span className="punti-finali">{s.record}</span>
                  </li>
                )}
                {cooperative.length > 0 && (
                  <li>
                    <div className="nome-giocatore">
                      <strong>Cooperativi</strong>
                      <span className="anno block">contati a parte: non c'è nessuno da battere</span>
                    </div>
                    <span className="punti-finali">{coopVinte}/{cooperative.length}</span>
                  </li>
                )}
              </ul>
            </>
          )}

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
            {perGioco().map((g) => {
              const r = g.attese > 0 ? g.vinte / g.attese : null
              const med = mediana(g.punteggi)
              return (
                <li key={g.nome}>
                  <div className="nome-giocatore">
                    <strong>{g.nome}</strong>
                    <span className="anno block">
                      {g.partite} {g.partite === 1 ? 'partita' : 'partite'} · {g.vinte} vinte
                      {r != null ? ` · ${r.toFixed(2)}× atteso` : ''}
                    </span>
                    {med != null && (
                      <span className="anno block">
                        punteggio tipico {med}{g.migliore != null ? ` · migliore ${g.migliore}` : ''}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
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
            Il testa a testa conta le vittorie tue e sue nelle partite giocate insieme: la somma
            non fa il totale, perché in mezzo ci sono gli altri giocatori.
          </p>
        </>
      )}
    </div>
  )
}
