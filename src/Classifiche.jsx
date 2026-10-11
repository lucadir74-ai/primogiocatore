// Primo Giocatore - Classifiche
// v1.0.0 - 202610112300
//
// Le classifiche Primeggio di tutti gli iscritti: generale e per gioco.
// Legge solo la tabella ipg, che il server riempie con i numeri (IPG,
// partite, vittorie, nomi): le partite restano riservate come prima.
// Ci si arriva da Statistiche.

import { useEffect, useMemo, useState } from 'react'
import { supabase, COLORI, tutteLeRighe } from './supabase'

// Le stesse soglie del calcolo sul server (src/primeggioCalcolo.js).
const MIN_GIOCO = 5
const MIN_GLOBALE = 20
const QUANTI_GIOCHI = 30

const coloreHex = (id) => COLORI.find((c) => c.id === id)?.hex || '#C9D1D8'
const perc = (parte, tutto) => (tutto > 0 ? `${Math.round((parte / tutto) * 100)}%` : '—')
const partiteTesto = (n) => `${n} ${n === 1 ? 'partita' : 'partite'}`
const vinteTesto = (r) => (r.vittorie != null ? ` · ${r.vittorie} vinte (${perc(r.vittorie, r.partite)})` : '')

function Classifica({ righe, profilo, onPersona }) {
  const [tutte, setTutte] = useState(false)
  const mostrate = tutte ? righe : righe.slice(0, 20)
  return (
    <>
      <ul className="elenco">
        {mostrate.map((r) => (
          <li key={r.profilo_id} className={r.profilo_id === profilo.id ? 'io' : ''}>
            <span className="posto">{r.posizione}°</span>
            <span className="pallino" style={{ background: coloreHex(r.colore) }} aria-hidden="true" />
            <div className="nome-giocatore">
              <button className="nome-cliccabile" onClick={() => onPersona(r.profilo_id)}>{r.nome}</button>
              <span className="anno block">{partiteTesto(r.partite)}{vinteTesto(r)}</span>
            </div>
            <span className="punti-finali">{r.ipg}</span>
          </li>
        ))}
      </ul>
      {righe.length > 20 && (
        <button className="bottone-piatto mostra-tutti" onClick={() => setTutte(!tutte)}>
          {tutte ? 'Mostra meno' : `Mostra tutti (${righe.length})`}
        </button>
      )}
    </>
  )
}

export default function Classifiche({ profilo, onIndietro }) {
  const [righe, setRighe] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [vista, setVista] = useState('generale')   // generale | giochi
  const [cerca, setCerca] = useState('')
  const [giocoAperto, setGiocoAperto] = useState(null)
  const [personaAperta, setPersonaAperta] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await tutteLeRighe(() => supabase.from('ipg')
          .select('profilo_id, gioco_id, ipg, partite, vittorie, posizione, nome, colore, gioco_nome, gioco_immagine, aggiornato_il')
          .order('profilo_id').order('gioco_id'))
        if (vivo) setRighe(r)
      } catch (e) {
        if (vivo) setErrore(e.message)
      } finally {
        if (vivo) setCaricamento(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  const generale = useMemo(() => righe
    .filter((r) => r.gioco_id === '' && r.posizione != null)
    .sort((a, b) => a.posizione - b.posizione), [righe])

  // Un gioco compare se almeno una persona ha il posto in classifica.
  const giochi = useMemo(() => {
    const m = new Map()
    for (const r of righe) {
      if (r.gioco_id === '') continue
      const g = m.get(r.gioco_id) || { id: r.gioco_id, nome: r.gioco_nome || 'Gioco', immagine: r.gioco_immagine, classifica: [], giocatori: 0 }
      g.giocatori++
      if (r.posizione != null) g.classifica.push(r)
      m.set(r.gioco_id, g)
    }
    return [...m.values()]
      .filter((g) => g.classifica.length > 0)
      .map((g) => ({ ...g, classifica: g.classifica.sort((a, b) => a.posizione - b.posizione) }))
      .sort((a, b) => b.classifica.length - a.classifica.length || a.nome.localeCompare(b.nome, 'it'))
  }, [righe])

  const q = cerca.trim().toLowerCase()
  const giochiTrovati = q ? giochi.filter((g) => g.nome.toLowerCase().includes(q)) : giochi.slice(0, QUANTI_GIOCHI)

  const aggiornato = righe[0]?.aggiornato_il
  const io = generale.find((r) => r.profilo_id === profilo.id)

  // --- Scheda di un giocatore: il suo IPG e i giochi in cui è più forte.
  if (personaAperta) {
    const sue = righe.filter((r) => r.profilo_id === personaAperta)
    const glob = sue.find((r) => r.gioco_id === '')
    const perGioco = sue.filter((r) => r.gioco_id !== '').sort((a, b) => b.ipg - a.ipg)
    const chi = sue[0]
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setPersonaAperta(null)}>← Indietro</button>
        <h2>{chi?.nome || 'Giocatore'}</h2>
        {glob && (
          <div className="numeroni">
            <div className="numerone">
              <span className="cifra">{glob.ipg}</span>
              <span className="didascalia">
                {glob.posizione ? `IPG · ${glob.posizione}° su ${generale.length}` : `IPG · in classifica da ${MIN_GLOBALE} partite`}
              </span>
            </div>
            <div className="numerone">
              <span className="cifra">{glob.partite}</span>
              <span className="didascalia">partite</span>
            </div>
            {glob.vittorie != null && (
              <div className="numerone">
                <span className="cifra">{glob.vittorie}</span>
                <span className="didascalia">vinte ({perc(glob.vittorie, glob.partite)})</span>
              </div>
            )}
          </div>
        )}
        <h3 className="titolo-sezione">I suoi giochi</h3>
        <ul className="elenco">
          {perGioco.map((r) => (
            <li key={r.gioco_id}>
              {r.gioco_immagine && <img src={r.gioco_immagine} alt="" className="copertina" />}
              <div className="nome-giocatore">
                <button className="nome-cliccabile" onClick={() => { setPersonaAperta(null); setVista('giochi'); setGiocoAperto(r.gioco_id) }}>
                  {r.gioco_nome || 'Gioco'}
                </button>
                <span className="anno block">
                  {r.posizione ? `${r.posizione}° · ` : ''}{partiteTesto(r.partite)}{vinteTesto(r)}
                </span>
              </div>
              <span className="punti-finali">{r.ipg}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // --- Classifica di un gioco.
  const gioco = giocoAperto ? giochi.find((g) => g.id === giocoAperto) : null
  if (gioco) {
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setGiocoAperto(null)}>← Tutti i giochi</button>
        <h2>{gioco.nome}</h2>
        {gioco.immagine && <img src={gioco.immagine} alt="" className="copertina-grande" />}
        <Classifica righe={gioco.classifica} profilo={profilo} onPersona={setPersonaAperta} />
        <p className="aiuto">
          In classifica chi ha un account e almeno {MIN_GIOCO} partite a questo gioco
          ({gioco.classifica.length} su {gioco.giocatori} iscritti che ci hanno giocato).
        </p>
      </div>
    )
  }

  return (
    <div className="scheda">
      {onIndietro && <button className="bottone-piatto" onClick={onIndietro}>← Statistiche</button>}
      <h2>Classifiche</h2>

      {errore && <div className="avviso errore">{errore}</div>}

      <div className="sottoschede">
        {[['generale', 'Generale'], ['giochi', 'Per gioco']].map(([id, et]) => (
          <button key={id} className={vista === id ? 'attiva' : ''} onClick={() => setVista(id)}>{et}</button>
        ))}
      </div>

      {caricamento ? (
        <p className="aiuto">Carico le classifiche…</p>
      ) : righe.length === 0 ? (
        <p className="aiuto">Le classifiche non sono ancora state calcolate.</p>
      ) : vista === 'generale' ? (
        <>
          {io && <p className="aiuto">Sei {io.posizione}° su {generale.length}.</p>}
          {generale.length > 0
            ? <Classifica righe={generale} profilo={profilo} onPersona={setPersonaAperta} />
            : <p className="aiuto">Nessuno ha ancora {MIN_GLOBALE} partite competitive.</p>}
          <p className="aiuto">
            Tutti gli iscritti con almeno {MIN_GLOBALE} partite competitive. L'IPG globale è la media
            degli IPG di ogni gioco: contano di più i giochi complessi e quelli giocati spesso.
          </p>
        </>
      ) : (
        <>
          <input
            className="campo-cerca"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca un gioco"
            aria-label="Cerca un gioco"
          />
          {giochiTrovati.length === 0 ? (
            <p className="aiuto">{q ? `Nessuna classifica per «${cerca}».` : 'Nessun gioco ha ancora una classifica.'}</p>
          ) : (
            <ul className="elenco">
              {giochiTrovati.map((g) => (
                <li key={g.id}>
                  {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
                  <div className="nome-giocatore">
                    <button className="nome-cliccabile" onClick={() => setGiocoAperto(g.id)}>{g.nome}</button>
                    <span className="anno block">
                      1° {g.classifica[0].nome} · {g.classifica.length} in classifica
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!q && giochi.length > QUANTI_GIOCHI && (
            <p className="aiuto">Mostrati i {QUANTI_GIOCHI} giochi con più classificati. Gli altri si trovano cercando.</p>
          )}
        </>
      )}

      {aggiornato && (
        <p className="aiuto">
          Aggiornate il {new Date(aggiornato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
    </div>
  )
}
