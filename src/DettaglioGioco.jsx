// Primo Giocatore - la scheda di un gioco
// v1.1.0 - 202611011300 (giochi aggiunti a mano: anno, giocatori e durata letti dal database se la pagina non li ha)
//
// Si apre toccando un gioco in Giochi (collezione, «Chi ce l'ha?»,
// catalogo). Subito mostra quello che l'app sa già; il resto (peso,
// numero ideale di giocatori, età, voto, autori, meccaniche) arriva da
// BoardGameGeek tramite /api/bgg?azione=scheda.

import { useEffect, useState } from 'react'
import { supabase, fetchBgg } from './supabase'

const PESI = ['', 'leggero', 'medio-leggero', 'medio', 'medio-pesante', 'pesante']

const giorno = (d) =>
  new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

const decimale = (n, cifre = 1) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: cifre, maximumFractionDigits: cifre })

// [1, 2, 3, 4, 6] → «1–4, 6»
function intervalli(numeri) {
  const ordinati = [...new Set(numeri)].sort((a, b) => a - b)
  const pezzi = []
  for (let i = 0; i < ordinati.length; i++) {
    let j = i
    while (j + 1 < ordinati.length && ordinati[j + 1] === ordinati[j] + 1) j++
    pezzi.push(j > i ? `${ordinati[i]}\u2013${ordinati[j]}` : String(ordinati[i]))
    i = j
  }
  return pezzi.join(', ')
}

const daA = (min, max) => {
  if (!min && !max) return null
  if (!min || !max || min === max) return String(min || max)
  return `${min}\u2013${max}`
}

export default function DettaglioGioco({ gioco, mio, onChiudi }) {
  const [s, setS] = useState(null)               // scheda da BGG
  const [stato, setStato] = useState('carico')   // carico | pronto | senza | errore
  const [errore, setErrore] = useState('')
  const [spiega, setSpiega] = useState(null)     // la casella di cui si legge la spiegazione
  const [dalDb, setDalDb] = useState(null)       // per i giochi aggiunti a mano

  useEffect(() => {
    let vivo = true
    setStato('carico'); setS(null); setErrore(''); setSpiega(null); setDalDb(null)
    ;(async () => {
      try {
        const r = await fetchBgg(`/api/bgg?azione=scheda&gioco=${encodeURIComponent(gioco.id)}`)
        const dati = await r.json()
        if (!vivo) return
        if (!r.ok) throw new Error(dati.errore || 'BoardGameGeek non ha risposto.')
        if (!dati.scheda) {
          setStato('senza')
          // Gioco aggiunto a mano: quel che sappiamo è nel database. Lo
          // vedi perché è tuo o ci hai giocato; se non arriva, pazienza.
          if (gioco.min_giocatori == null && gioco.durata_minuti == null) {
            const { data: riga } = await supabase.from('giochi')
              .select('anno, min_giocatori, max_giocatori, durata_minuti').eq('id', gioco.id).maybeSingle()
            if (vivo && riga) setDalDb(riga)
          }
          return
        }
        setS(dati.scheda)
        setStato('pronto')
      } catch (e) {
        if (vivo) { setErrore(e.message); setStato('errore') }
      }
    })()
    return () => { vivo = false }
  }, [gioco.id])

  useEffect(() => {
    const tasto = (e) => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])

  const nome = s?.nome || gioco.nome
  const anno = s?.anno || gioco.anno || dalDb?.anno
  const base = { ...dalDb, ...Object.fromEntries(Object.entries(gioco).filter(([, v]) => v != null)) }
  // La miniatura basta per la copertina piccola: l'immagine piena di BGG pesa molto.
  const immagine = gioco.immagine || s?.miniatura || s?.immagine
  const espansione = s ? s.tipo === 'boardgameexpansion' : Boolean(gioco.espansione)

  const giocatori = daA(s?.min_giocatori ?? base.min_giocatori, s?.max_giocatori ?? base.max_giocatori)
  const durata = s
    ? daA(s.durata_min || s.durata, s.durata_max || s.durata)
    : (base.durata_minuti ? String(base.durata_minuti) : null)
  const sondaggio = s?.giocatori_bgg
  const peso = s?.peso > 0 ? s.peso : null

  // Le caselle: valore, etichetta, spiegazione che si apre toccandole.
  const caselle = [
    giocatori && {
      id: 'giocatori', valore: giocatori, etichetta: 'giocatori',
      spiegazione: 'Il numero di giocatori indicato su BoardGameGeek, di solito quello della scatola.',
    },
    sondaggio?.ideale?.length > 0 && {
      id: 'ideale', valore: intervalli(sondaggio.ideale), etichetta: 'ideale',
      nota: sondaggio.consigliato.length ? `consigliato ${intervalli(sondaggio.consigliato)}` : null,
      spiegazione: `Dal sondaggio degli utenti BGG (${sondaggio.voti.toLocaleString('it-IT')} voti). `
        + '«Ideale» è il numero che la maggioranza giudica il migliore; «consigliato» '
        + 'sono i numeri in cui chi ha votato dice che il gioco funziona bene.',
    },
    durata && {
      id: 'durata', valore: durata, etichetta: 'minuti',
      spiegazione: 'Il tempo di gioco indicato su BoardGameGeek, di solito quello della scatola.',
    },
    peso && {
      id: 'peso', valore: decimale(peso), etichetta: PESI[Math.min(5, Math.max(1, Math.round(peso)))],
      barra: peso,
      spiegazione: 'Quanto è impegnativo il gioco secondo gli utenti BGG, da 1 (leggero) a 5 (pesante)'
        + (s?.voti_peso ? `, su ${s.voti_peso.toLocaleString('it-IT')} voti` : '')
        + '. È lo stesso peso che il Primeggio usa per l\u2019IPG globale.',
    },
    s?.eta > 0 && {
      id: 'eta', valore: `${s.eta}+`, etichetta: 'anni',
      spiegazione: 'L\u2019età minima indicata su BoardGameGeek, di solito quella della scatola.',
    },
    s?.voto > 0 && {
      id: 'voto', valore: decimale(s.voto), etichetta: s.posizione ? `n. ${s.posizione.toLocaleString('it-IT')} su BGG` : 'voto BGG',
      spiegazione: `Il voto medio degli utenti BGG, da 1 a 10`
        + (s.votanti ? ` (${s.votanti.toLocaleString('it-IT')} voti)` : '')
        + (s.posizione ? `. Il numero è la posizione nella classifica generale dei giochi da tavolo di BGG.` : '.'),
    },
  ].filter(Boolean)

  const aperta = caselle.find((c) => c.id === spiega)

  // Una riga su di te: se ce l'hai e quante partite ci hai fatto.
  let suDiTe = null
  if (mio) {
    const pezzi = [mio.posseduto ? 'Nella tua collezione' : 'Non è nella tua collezione']
    if (mio.volte != null) {
      pezzi.push(mio.volte === 0 ? 'mai giocato' : mio.volte === 1 ? '1 partita' : `${mio.volte} partite`)
      if (mio.volte > 0 && mio.ultima) pezzi.push(`ultima ${giorno(mio.ultima)}`)
    }
    suDiTe = pezzi.join(' · ')
  }

  const indirizzoBgg = s?.bgg_id ? `https://boardgamegeek.com/${s.tipo || 'boardgame'}/${s.bgg_id}` : null

  return (
    <div className="finestra-sfondo" onClick={onChiudi}>
      <div className="finestra dg" role="dialog" aria-modal="true" aria-label={nome}
        onClick={(e) => e.stopPropagation()}>
        <div className="finestra-testa">
          <div className="dg-testa">
            {immagine
              ? <img src={immagine} alt="" className="dg-copertina" />
              : <span className="dg-copertina dg-copertina-vuota" aria-hidden="true" />}
            <div>
              <h3>{nome}</h3>
              <p className="anno">
                {[anno, espansione ? 'espansione' : null].filter(Boolean).join(' · ')}
              </p>
              {s?.autori?.length > 0 && (
                <p className="dg-autori">di {s.autori.slice(0, 4).join(', ')}{s.autori.length > 4 ? ' e altri' : ''}</p>
              )}
            </div>
          </div>
          <button type="button" className="finestra-chiudi" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>

        <div className="finestra-corpo">
          {suDiTe && <p className="dg-tu">{suDiTe}</p>}

          {caselle.length > 0 && (
            <div className="dg-dati">
              {caselle.map((c) => (
                <button key={c.id} type="button"
                  className={`dg-casella${spiega === c.id ? ' attiva' : ''}`}
                  aria-expanded={spiega === c.id}
                  onClick={() => setSpiega(spiega === c.id ? null : c.id)}>
                  <span className="dg-valore">{c.valore}</span>
                  <span className="dg-etichetta">{c.etichetta}</span>
                  {c.barra && (
                    <span className="dg-barra" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (c.barra / 5) * 100)}%` }} />
                    </span>
                  )}
                  {c.nota && <span className="dg-nota">{c.nota}</span>}
                </button>
              ))}
            </div>
          )}
          {aperta && <p className="dg-spiega" role="status">{aperta.spiegazione}</p>}
          {caselle.length > 0 && !aperta && stato === 'pronto' && (
            <p className="dg-suggerimento">Tocca una casella per sapere da dove viene il dato.</p>
          )}

          {stato === 'carico' && <p role="status">Prendo i dati da BoardGameGeek…</p>}
          {stato === 'senza' && <p>Gioco aggiunto a mano: su BoardGameGeek non c&rsquo;è, quindi non ci sono altri dati.</p>}
          {stato === 'errore' && <div className="avviso errore">{errore}</div>}

          {s?.meccaniche?.length > 0 && (
            <>
              <h4 className="finestra-sottotitolo">Meccaniche</h4>
              <p className="dg-voci">{s.meccaniche.map((m) => <span key={m} className="dg-voce">{m}</span>)}</p>
            </>
          )}
          {s?.categorie?.length > 0 && (
            <>
              <h4 className="finestra-sottotitolo">Categorie</h4>
              <p className="dg-voci">{s.categorie.map((m) => <span key={m} className="dg-voce">{m}</span>)}</p>
            </>
          )}

          {s?.descrizione && (
            <details className="dg-descrizione">
              <summary>Descrizione da BGG (in inglese)</summary>
              <p>{s.descrizione}</p>
            </details>
          )}

          {indirizzoBgg && (
            <p className="dg-link">
              <a href={indirizzoBgg} target="_blank" rel="noopener noreferrer">Apri la pagina su BoardGameGeek</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
