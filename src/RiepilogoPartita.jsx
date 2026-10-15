// Primo Giocatore - riepilogo a fine partita
// v1.0.0 - 202610160200
//
// Appena registrata una partita a punti, per ogni giocatore al tavolo:
// il suo miglior punteggio a quel gioco con quel numero di giocatori e
// il suo migliore in assoluto, segnalando i record nuovi o eguagliati.
// In fondo i record del gioco, con quel numero di giocatori e assoluto.
//
// Riservatezza: si contano solo le partite che chi registra può già
// vedere (le sue e quelle giocate insieme). La stessa partita registrata
// da più persone conta una volta sola, come in Storico e Statistiche.

import { useEffect, useState } from 'react'
import { supabase, COLORI, daMostrare, tutteLeRighe } from './supabase'
import { unisciCondivise } from './condivise'

// Se l'ospite si è iscritto, da qui in poi è la stessa persona.
const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
const nomeDi = (x) => (x.profili ? daMostrare(x.profili) : (x.ospiti?.nome || 'Sconosciuto'))
const coloreDi = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'
const data = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

// Confronto fra il punteggio di oggi e il migliore di prima.
function esito(oggi, prima) {
  if (prima == null) return 'primo'
  if (oggi > prima) return 'nuovo'
  if (oggi === prima) return 'pari'
  return null
}

function Distintivo({ e, cosa }) {
  if (e === 'nuovo') return <span className="distintivo verde">nuovo record {cosa}</span>
  if (e === 'pari') return <span className="distintivo">record {cosa} eguagliato</span>
  return null
}

export default function RiepilogoPartita({ profilo, partitaId, giocoId, giocoNome, onChiudi }) {
  const [stato, setStato] = useState({ caricamento: true, errore: '', dati: null })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const righe = await tutteLeRighe(() => supabase
          .from('partite')
          .select(`
            id, giocata_il, tipo_punteggio, registrata_da,
            giochi ( id ),
            partecipazioni (
              utente_id, ospite_id, punteggio_totale, posizione,
              profili:utente_id ( nome, nickname, colore ),
              ospiti:ospite_id ( nome, utente_collegato )
            )
          `)
          .eq('gioco_id', giocoId)
          .order('giocata_il', { ascending: true }))
        if (vivo) setStato({ caricamento: false, errore: '', dati: calcola(righe, partitaId, profilo.id) })
      } catch (e) {
        if (vivo) setStato({ caricamento: false, errore: e.message, dati: null })
      }
    })()
    return () => { vivo = false }
  }, [partitaId, giocoId, profilo.id])

  const { caricamento, errore, dati } = stato

  return (
    <div className="scheda">
      <h2>Partita registrata</h2>
      <p className="aiuto">{giocoNome}</p>

      {caricamento && <p>Calcolo i record&hellip;</p>}
      {errore && <div className="avviso errore">Record non disponibili: {errore}</div>}

      {dati && (
        <>
          <h3 className="titolo-sezione">I giocatori</h3>
          <ul className="elenco elenco-giocatori">
            {dati.giocatori.map((g) => (
              <li key={g.chiave} className={g.nuovo ? 'vincitore' : ''}>
                <span className="posto" aria-hidden="true">{g.posizione ? `${g.posizione}°` : '–'}</span>
                <span className="pallino" style={{ background: g.colore }} aria-hidden="true" />
                <div className="nome-giocatore">
                  <strong>{g.nome}</strong>
                  {g.punti == null ? (
                    <span className="anno block">senza punteggio</span>
                  ) : g.precedenti === 0 ? (
                    <span className="anno block">primo punteggio registrato a questo gioco</span>
                  ) : (
                    <>
                      <span className="anno block">
                        Migliore con {dati.n} giocatori: {g.meglioN ?? '—'}
                        {g.meglioN != null && g.meglioNPrima == null && ' (prima volta in ' + dati.n + ')'}
                      </span>
                      <span className="anno block">Migliore in assoluto: {g.meglioTot}</span>
                      <Distintivo e={g.esitoN} cosa={`in ${dati.n}`} />{' '}
                      <Distintivo e={g.esitoTot} cosa="personale" />
                    </>
                  )}
                </div>
                {g.punti != null && <span className="punti-finali">{g.punti}</span>}
              </li>
            ))}
          </ul>

          <h3 className="titolo-sezione">Record del gioco</h3>
          <ul className="elenco">
            <RecordGioco titolo={`Con ${dati.n} giocatori`} r={dati.recordN} />
            <RecordGioco titolo="In assoluto" r={dati.recordTot} />
          </ul>

          <p className="aiuto">
            Calcolati su {dati.quante} {dati.quante === 1 ? 'partita' : 'partite'} a questo
            gioco fra quelle che vedi: le tue e quelle giocate insieme.
          </p>
        </>
      )}

      <button className="bottone" onClick={onChiudi}>Nuova partita</button>
    </div>
  )
}

function RecordGioco({ titolo, r }) {
  if (!r) return null
  return (
    <li className={r.oggi ? 'io' : ''}>
      <div className="nome-giocatore">
        <strong>{titolo}</strong>
        <span className="anno block">
          {r.nomi.join(', ')} · {data(r.quando)}
          {r.oggi && (r.pari ? ' · eguagliato oggi' : ' · stabilito oggi')}
        </span>
      </div>
      <span className="punti-finali">{r.punti}</span>
    </li>
  )
}

/* ---------- Calcolo ---------- */

function calcola(righe, partitaId, mioId) {
  // La copia da tenere è la mia, così la partita appena salvata c'è.
  const uniche = unisciCondivise(righe, [mioId])
  const questa = uniche.find((p) => p.id === partitaId) || righe.find((p) => p.id === partitaId)
  if (!questa) throw new Error('la partita appena salvata non si trova.')

  const n = (questa.partecipazioni || []).length
  const conPunti = (p) => p.tipo_punteggio !== 'coop'
  const altre = uniche.filter((p) => p.id !== partitaId && conPunti(p))

  // Tutti i punteggi a questo gioco, uno per riga.
  const voci = []
  for (const p of [...altre, questa]) {
    const quanti = (p.partecipazioni || []).length
    for (const x of p.partecipazioni || []) {
      if (x.punteggio_totale == null) continue
      voci.push({
        chi: identita(x), nome: nomeDi(x), punti: Number(x.punteggio_totale),
        quanti, quando: p.giocata_il, oggi: p.id === partitaId,
      })
    }
  }
  const massimo = (lista) => (lista.length ? Math.max(...lista.map((v) => v.punti)) : null)

  const giocatori = [...(questa.partecipazioni || [])]
    .sort((a, b) => (a.posizione ?? 99) - (b.posizione ?? 99)
      || (b.punteggio_totale ?? -Infinity) - (a.punteggio_totale ?? -Infinity))
    .map((x) => {
      const chi = identita(x)
      const punti = x.punteggio_totale == null ? null : Number(x.punteggio_totale)
      const sue = voci.filter((v) => v.chi === chi)
      const prima = sue.filter((v) => !v.oggi)
      const primaN = prima.filter((v) => v.quanti === n)
      const meglioNPrima = massimo(primaN)
      const meglioTotPrima = massimo(prima)
      const esitoN = punti == null || meglioNPrima == null ? null : esito(punti, meglioNPrima)
      const esitoTot = punti == null ? null : esito(punti, meglioTotPrima)
      return {
        chiave: chi,
        nome: nomeDi(x),
        colore: coloreDi(x),
        posizione: x.posizione,
        punti,
        precedenti: prima.length,
        meglioN: massimo(sue.filter((v) => v.quanti === n)),
        meglioNPrima,
        meglioTot: massimo(sue),
        esitoN,
        esitoTot: esitoTot === 'primo' ? null : esitoTot,
        nuovo: esitoN === 'nuovo' || esitoTot === 'nuovo',
      }
    })

  // Record del gioco: chi ha il punteggio più alto, con la data della
  // prima volta che è stato fatto. A pari punti si citano tutti.
  function record(lista) {
    const top = massimo(lista)
    if (top == null) return null
    const migliori = lista.filter((v) => v.punti === top)
    const prime = migliori.filter((v) => !v.oggi)
    const quando = (prime.length ? prime : migliori)
      .map((v) => v.quando).sort()[0]
    return {
      punti: top,
      nomi: [...new Set(migliori.map((v) => v.nome))],
      quando,
      oggi: migliori.some((v) => v.oggi),
      pari: prime.length > 0 && migliori.some((v) => v.oggi),
    }
  }

  return {
    n,
    quante: altre.length + 1,
    giocatori,
    recordN: record(voci.filter((v) => v.quanti === n)),
    recordTot: record(voci),
  }
}
