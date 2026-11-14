// Primo Giocatore - Classifiche
// v1.4.0 - 202611141800 (nell'elenco per gioco c'è anche la tua posizione: «tu sei 3° su 7»)
//
// Le classifiche Primeggio di tutti gli iscritti: generale e per gioco.
// Legge solo la tabella ipg, che il server riempie con i numeri (IPG,
// partite, vittorie, nomi): le partite restano riservate come prima.
// Ci si arriva da Statistiche.
//
// Prima si scaricava a ogni apertura l'intera tabella ipg. Ora
// (src/ipgDati.js):
// - all'apertura la classifica generale e i primi 30 giochi;
// - la ricerca di un gioco la fa il database, al massimo 100 risultati;
// - le righe di un gioco o di un giocatore solo quando se ne apre la scheda.

import { useEffect, useState } from 'react'
import { COLORI } from './supabase'
import { ipgGenerale, ipgGioco, ipgPersona, giochiClassifiche, giochiSenzaNome } from './ipgDati'
import BarraScorrevole from './BarraScorrevole.jsx'

// Le stesse soglie del calcolo sul server (src/primeggioCalcolo.js).
const MIN_GIOCO = 5
const MIN_GLOBALE = 20
const QUANTI_GIOCHI = 30
const QUANTI_TROVATI = 100
const PAUSA_RICERCA = 300

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

// Le righe di una scheda (gioco o giocatore), lette quando la si apre.
// Si tengono insieme all'id a cui appartengono: aprendo un'altra scheda
// non si vedono mai, nemmeno per un attimo, le righe di quella di prima.
function useRighe(id, leggi) {
  const [stato, setStato] = useState({ id: null, righe: null, errore: '' })
  useEffect(() => {
    if (!id) return
    let vivo = true
    leggi(id).then(
      (righe) => { if (vivo) setStato({ id, righe, errore: '' }) },
      (e) => { if (vivo) setStato({ id, righe: [], errore: e.message }) },
    )
    return () => { vivo = false }
  }, [id])
  return stato.id === id ? stato : { id, righe: null, errore: '' }
}

// La mia posizione in un gioco dell'elenco: niente se non ci ho mai giocato.
function mioPosto(mia, g) {
  if (!mia) return null
  if (mia.posizione != null) {
    return <strong className="mio-posto"> · {mia.posizione === 1 ? 'il 1° sei tu' : `tu sei ${mia.posizione}°`}</strong>
  }
  const mancano = MIN_GIOCO - (mia.partite || 0)
  if (g.classificati > 0 && mancano > 0) return ` · a te ${mancano === 1 ? 'manca 1 partita' : `mancano ${mancano} partite`}`
  return null
}

export default function Classifiche({ profilo, onIndietro }) {
  const [tutti, setTutti] = useState([])          // righe della classifica generale
  const [primiGiochi, setPrimiGiochi] = useState([])
  const [senzaNomi, setSenzaNomi] = useState(false)
  const [mie, setMie] = useState(() => new Map())   // gioco_id -> la mia riga
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [vista, setVista] = useState('generale')   // generale | giochi
  const [cerca, setCerca] = useState('')
  const [trovati, setTrovati] = useState({ q: '', giochi: [], errore: '' })
  const [giocoAperto, setGiocoAperto] = useState(null)
  const [personaAperta, setPersonaAperta] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // Uno in più del necessario: così si sa se ce ne sono altri.
        const [g, giochi] = await Promise.all([ipgGenerale(), giochiClassifiche('', QUANTI_GIOCHI + 1)])
        if (vivo) { setTutti(g); setPrimiGiochi(giochi) }
      } catch (e) {
        if (vivo) setErrore(e.message)
      } finally {
        if (vivo) setCaricamento(false)
      }
    })()
    giochiSenzaNome().then((s) => { if (vivo) setSenzaNomi(s) }, () => {})
    // Le mie posizioni gioco per gioco, per l'elenco «Per gioco».
    ipgPersona(profilo.id).then((righe) => {
      if (vivo) setMie(new Map(righe.filter((r) => r.gioco_id !== '').map((r) => [String(r.gioco_id), r])))
    }, () => {})
    return () => { vivo = false }
  }, [])

  // La ricerca parte quando si smette di scrivere per un attimo.
  const q = cerca.trim().toLowerCase()
  useEffect(() => {
    if (!q) return
    let vivo = true
    const sveglia = setTimeout(() => {
      giochiClassifiche(q, QUANTI_TROVATI + 1).then(
        (giochi) => { if (vivo) setTrovati({ q, giochi, errore: '' }) },
        (e) => { if (vivo) setTrovati({ q, giochi: [], errore: e.message }) },
      )
    }, PAUSA_RICERCA)
    return () => { vivo = false; clearTimeout(sveglia) }
  }, [q])

  const generale = tutti
    .filter((r) => r.posizione != null)
    .sort((a, b) => a.posizione - b.posizione)

  const persona = useRighe(personaAperta, ipgPersona)
  const delGioco = useRighe(giocoAperto, ipgGioco)

  const aggiornato = tutti[0]?.aggiornato_il
  const io = generale.find((r) => r.profilo_id === profilo.id)

  // --- Scheda di un giocatore: il suo IPG e i giochi in cui è più forte.
  if (personaAperta) {
    const sue = persona.righe || []
    const glob = sue.find((r) => r.gioco_id === '')
    const perGioco = sue.filter((r) => r.gioco_id !== '').sort((a, b) => b.ipg - a.ipg)
    const chi = sue[0]
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setPersonaAperta(null)}>← Indietro</button>
        {persona.righe === null ? <p className="aiuto">Carico…</p> : (
          <>
            <h2>{chi?.nome || 'Giocatore'}</h2>
            {persona.errore && <div className="avviso errore">{persona.errore}</div>}
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
          </>
        )}
      </div>
    )
  }

  // --- Classifica di un gioco.
  if (giocoAperto && delGioco.righe === null) {
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setGiocoAperto(null)}>← Tutti i giochi</button>
        <p className="aiuto">Carico…</p>
      </div>
    )
  }
  const righeGioco = giocoAperto ? delGioco.righe : []
  if (giocoAperto && (righeGioco.length > 0 || delGioco.errore)) {
    const classifica = righeGioco.filter((r) => r.posizione != null).sort((a, b) => a.posizione - b.posizione)
    const fuori = righeGioco.filter((r) => r.posizione == null).sort((a, b) => b.partite - a.partite || b.ipg - a.ipg)
    const nome = righeGioco[0]?.gioco_nome || 'Gioco'
    const immagine = righeGioco[0]?.gioco_immagine
    const giocatori = classifica.length + fuori.length
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setGiocoAperto(null)}>← Tutti i giochi</button>
        {delGioco.errore && <div className="avviso errore">{delGioco.errore}</div>}
        <h2>{nome}</h2>
        {immagine && <img src={immagine} alt="" className="copertina-grande" />}
        {classifica.length > 0
          ? <Classifica righe={classifica} profilo={profilo} onPersona={setPersonaAperta} />
          : <p className="aiuto">Nessuno ha ancora {MIN_GIOCO} partite a questo gioco: la classifica parte da lì.</p>}
        <p className="aiuto">
          In classifica chi ha un account e almeno {MIN_GIOCO} partite a questo gioco
          ({classifica.length} su {giocatori} iscritti che ci hanno giocato).
        </p>
        {fuori.length > 0 && (
          <>
            <h3 className="titolo-sezione">Non ancora in classifica</h3>
            <ul className="elenco">
              {fuori.map((r) => (
                <li key={r.profilo_id} className={r.profilo_id === profilo.id ? 'io' : ''}>
                  <span className="pallino" style={{ background: coloreHex(r.colore) }} aria-hidden="true" />
                  <div className="nome-giocatore">
                    <button className="nome-cliccabile" onClick={() => setPersonaAperta(r.profilo_id)}>{r.nome}</button>
                    <span className="anno block">
                      {partiteTesto(r.partite)}{vinteTesto(r)} · ne mancano {MIN_GIOCO - r.partite}
                    </span>
                  </div>
                  <span className="punti-finali">{r.ipg}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  // L'elenco dei giochi: i primi 30, oppure quelli trovati cercando
  // (solo quando la risposta è proprio per ciò che c'è scritto adesso).
  const inAttesa = q && trovati.q !== q
  const elenco = q ? (inAttesa ? [] : trovati.giochi.slice(0, QUANTI_TROVATI)) : primiGiochi.slice(0, QUANTI_GIOCHI)
  const altri = q ? !inAttesa && trovati.giochi.length > QUANTI_TROVATI : primiGiochi.length > QUANTI_GIOCHI

  return (
    <div className="scheda">
      {onIndietro && <button className="bottone-piatto" onClick={onIndietro}>← Statistiche</button>}
      <h2>Classifiche</h2>

      {errore && <div className="avviso errore">{errore}</div>}

      <BarraScorrevole><div className="sottoschede">
        {[['generale', 'Generale'], ['giochi', 'Per gioco']].map(([id, et]) => (
          <button key={id} className={vista === id ? 'attiva' : ''} onClick={() => setVista(id)}>{et}</button>
        ))}
      </div></BarraScorrevole>

      {caricamento ? (
        <p className="aiuto">Carico le classifiche…</p>
      ) : tutti.length === 0 && primiGiochi.length === 0 ? (
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
          {q && trovati.q === q && trovati.errore && <div className="avviso errore">{trovati.errore}</div>}
          {inAttesa ? (
            <p className="aiuto">Cerco…</p>
          ) : elenco.length === 0 ? (
            <p className="aiuto">{q ? `Nessun gioco trovato per «${cerca}».` : 'Nessun gioco ancora.'}</p>
          ) : (
            <ul className="elenco">
              {elenco.map((g) => (
                <li key={g.id}>
                  {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
                  <div className="nome-giocatore">
                    <button className="nome-cliccabile" onClick={() => setGiocoAperto(g.id)}>{g.nome}</button>
                    <span className="anno block">
                      {g.classificati > 0
                        ? `1° ${g.primo} · ${g.classificati} in classifica`
                        : `${g.giocatori} ${g.giocatori === 1 ? 'iscritto' : 'iscritti'} · classifica da ${MIN_GIOCO} partite`}
                      {mioPosto(mie.get(String(g.id)), g)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!q && altri && (
            <p className="aiuto">Mostrati i {QUANTI_GIOCHI} giochi con più classificati. Gli altri si trovano cercando.</p>
          )}
          {q && altri && (
            <p className="aiuto">Mostrati i primi {QUANTI_TROVATI} giochi trovati: scrivi qualche lettera in più per restringere.</p>
          )}
          {senzaNomi && (
            <p className="aiuto">
              Alcuni giochi non hanno ancora il nome: compariranno nella ricerca dopo il prossimo
              ricalcolo del Primeggio.
            </p>
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
