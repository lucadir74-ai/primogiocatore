// Primo Giocatore - segnapunti con i parziali
// v1.0.0 - 202610202100
//
// Una tabella giocatori × righe che si apre sopra la partita. Due modi:
//   «per voci»  le voci di punteggio del gioco (il modello), salvate
//               sul gioco e quindi pronte per tutti la volta dopo;
//   «a mani»    una riga per mano o round, aggiunte al volo.
// Il totale di ciascuno torna nella partita; i parziali si salvano
// con la partita in dettagli_punteggio.

import { useMemo, useRef, useState } from 'react'

const PREFISSO_MANO = 'mano-'

const eMano = (chiave) => chiave.startsWith(PREFISSO_MANO)

// "−5", "-5", "3,5" → numero; vuoto o non numero → null
function numero(testo) {
  if (testo == null) return null
  const t = String(testo).trim().replace(',', '.').replace('−', '-')
  if (t === '' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function chiaveNuova(etichetta, usate) {
  const base = 'v-' + (etichetta || 'voce')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 30)
  let c = base || 'v-voce'
  let i = 2
  while (usate.has(c)) c = `${base}-${i++}`
  return c
}

const vociDelGioco = (gioco) =>
  (Array.isArray(gioco?.categorie_punteggio) ? gioco.categorie_punteggio : [])
    .filter((v) => v && v.chiave && v.etichetta)

export default function Segnapunti({ gioco, giocatori, possoModificareVoci, onSalvaVoci, onConferma, onChiudi }) {
  const vociSalvate = vociDelGioco(gioco)

  // Valori di partenza: quelli già segnati in questa partita.
  const [valori, setValori] = useState(() => {
    const v = {}
    for (const g of giocatori) {
      v[g.chiave] = {}
      for (const [k, x] of Object.entries(g.parziali || {})) v[g.chiave][k] = String(x)
    }
    return v
  })

  const maniGiaSegnate = useMemo(() => {
    let n = 0
    for (const g of giocatori) {
      for (const k of Object.keys(g.parziali || {})) {
        if (eMano(k)) n = Math.max(n, Number(k.slice(PREFISSO_MANO.length)) || 0)
      }
    }
    return n
  }, [giocatori])

  const [modo, setModo] = useState(() =>
    maniGiaSegnate > 0 ? 'mani' : vociSalvate.length > 0 ? 'voci' : 'mani')
  const [mani, setMani] = useState(Math.max(1, maniGiaSegnate))
  const [voci, setVoci] = useState(vociSalvate)
  const [modificaVoci, setModificaVoci] = useState(false)
  const [salvandoVoci, setSalvandoVoci] = useState(false)
  const [errore, setErrore] = useState('')
  const ultimaCella = useRef(null)   // { giocatore, chiave } per il tasto ±

  const righeMani = Array.from({ length: mani }, (_, i) => ({
    chiave: `${PREFISSO_MANO}${i + 1}`, etichetta: `Mano ${i + 1}`, tipo: 'voce',
  }))
  const righe = modo === 'mani' ? righeMani : voci
  const righeNumeriche = righe.filter((r) => r.tipo !== 'sezione')

  // Una voce «in negativo» (penalità, debiti) si scrive positiva e si toglie.
  function totale(chiaveGiocatore) {
    let somma = 0, qualcosa = false
    for (const r of righeNumeriche) {
      const n = numero(valori[chiaveGiocatore]?.[r.chiave])
      if (n == null) continue
      qualcosa = true
      somma += r.negativa ? -Math.abs(n) : n
    }
    return qualcosa ? Math.round(somma * 100) / 100 : null
  }

  function scrivi(chiaveGiocatore, chiave, testo) {
    setValori((v) => ({ ...v, [chiaveGiocatore]: { ...v[chiaveGiocatore], [chiave]: testo } }))
  }

  // Le tastiere numeriche del telefono spesso non hanno il meno.
  function cambiaSegno() {
    const c = ultimaCella.current
    if (!c) return
    const attuale = valori[c.giocatore]?.[c.chiave] || ''
    const n = numero(attuale)
    if (n == null) scrivi(c.giocatore, c.chiave, attuale.startsWith('-') ? '' : '-')
    else scrivi(c.giocatore, c.chiave, String(-n))
    document.getElementById(`sp-${c.giocatore}-${c.chiave}`)?.focus()
  }

  function conferma() {
    const chiaviValide = new Set(righeNumeriche.map((r) => r.chiave))
    const esito = {}
    for (const g of giocatori) {
      const parziali = {}
      for (const r of righeNumeriche) {
        const n = numero(valori[g.chiave]?.[r.chiave])
        if (n != null && chiaviValide.has(r.chiave)) parziali[r.chiave] = n
      }
      const t = totale(g.chiave)
      esito[g.chiave] = {
        parziali: Object.keys(parziali).length ? parziali : null,
        punteggio: t == null ? '' : String(t),
      }
    }
    onConferma(esito)
  }

  /* ---------- Modifica delle voci del gioco ---------- */

  function aggiungiVoce(tipo) {
    const usate = new Set(voci.map((v) => v.chiave))
    const etichetta = tipo === 'sezione' ? 'Nuova sezione' : 'Nuova voce'
    setVoci([...voci, { chiave: chiaveNuova(etichetta, usate), etichetta, tipo }])
  }

  const cambiaVoce = (i, campi) => setVoci(voci.map((v, j) => (j === i ? { ...v, ...campi } : v)))

  function sposta(i, verso) {
    const j = i + verso
    if (j < 0 || j >= voci.length) return
    const nuove = [...voci]
    ;[nuove[i], nuove[j]] = [nuove[j], nuove[i]]
    setVoci(nuove)
  }

  async function salvaVoci() {
    setErrore('')
    const pulite = voci
      .map((v) => ({ ...v, etichetta: v.etichetta.trim() }))
      .filter((v) => v.etichetta)
    if (!pulite.some((v) => v.tipo !== 'sezione')) {
      setErrore('Serve almeno una voce di punteggio.')
      return
    }
    // Le chiavi restano quelle di prima anche se cambi il nome:
    // così le partite già salvate continuano a ritrovare le loro voci.
    const normalizzate = pulite.map((v, i) => ({
      chiave: v.chiave, etichetta: v.etichetta, ordine: i + 1,
      ...(v.tipo === 'sezione' ? { tipo: 'sezione' } : {}),
      ...(v.negativa ? { negativa: true } : {}),
    }))
    setSalvandoVoci(true)
    try {
      await onSalvaVoci(normalizzate)
      setVoci(normalizzate)
      setModificaVoci(false)
    } catch (e) {
      setErrore(e.message || 'Non sono riuscito a salvare le voci.')
    } finally {
      setSalvandoVoci(false)
    }
  }

  function annullaModificaVoci() {
    setVoci(vociSalvate.length ? vociSalvate : voci)
    setModificaVoci(false)
    setErrore('')
  }

  const senzaVoci = modo === 'voci' && voci.length === 0

  return (
    <div className="finestra-sfondo" onClick={onChiudi}>
      <div className="finestra segnapunti" role="dialog" aria-modal="true"
        aria-label={`Segnapunti di ${gioco.nome}`} onClick={(e) => e.stopPropagation()}>
        <div className="finestra-testa">
          <div>
            <span className="anno block">Segnapunti</span>
            <h3>{gioco.nome}</h3>
          </div>
          <button type="button" className="finestra-chiudi" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>

        {!modificaVoci && (
          <div className="sp-modi" role="tablist">
            <button role="tab" aria-selected={modo === 'voci'}
              className={modo === 'voci' ? 'attivo' : ''} onClick={() => setModo('voci')}>
              Per voci
            </button>
            <button role="tab" aria-selected={modo === 'mani'}
              className={modo === 'mani' ? 'attivo' : ''} onClick={() => setModo('mani')}>
              A mani
            </button>
          </div>
        )}

        {errore && <div className="avviso errore">{errore}</div>}

        {modificaVoci ? (
          <div className="sp-voci-modifica">
            <p className="aiuto">
              Le voci valgono per tutte le partite a {gioco.nome}, anche per gli altri.
              «In negativo» si usa per penalità e debiti: si scrivono positivi e vengono tolti.
            </p>
            <ul className="sp-elenco-voci">
              {voci.map((v, i) => (
                <li key={v.chiave} className={v.tipo === 'sezione' ? 'sezione' : ''}>
                  <input
                    className="sp-etichetta"
                    value={v.etichetta}
                    onChange={(e) => cambiaVoce(i, { etichetta: e.target.value })}
                    aria-label={v.tipo === 'sezione' ? 'Titolo della sezione' : 'Nome della voce'}
                  />
                  <div className="sp-azioni-voce">
                    {v.tipo !== 'sezione' && (
                      <label className="spunta-fazioni">
                        <input type="checkbox" checked={Boolean(v.negativa)}
                          onChange={(e) => cambiaVoce(i, { negativa: e.target.checked })} />
                        in negativo
                      </label>
                    )}
                    <button className="bottone-piatto" onClick={() => sposta(i, -1)} disabled={i === 0}
                      aria-label="Sposta su">↑</button>
                    <button className="bottone-piatto" onClick={() => sposta(i, 1)} disabled={i === voci.length - 1}
                      aria-label="Sposta giù">↓</button>
                    <button className="bottone-piatto pericolo" onClick={() => setVoci(voci.filter((_, j) => j !== i))}
                      aria-label={`Togli ${v.etichetta}`}>×</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="sp-aggiungi">
              <button className="bottone-piatto" onClick={() => aggiungiVoce('voce')}>+ voce</button>
              <button className="bottone-piatto" onClick={() => aggiungiVoce('sezione')}>+ titolo di sezione</button>
            </div>
            <button className="bottone" onClick={salvaVoci} disabled={salvandoVoci}>
              {salvandoVoci ? 'Salvo…' : 'Salva le voci'}
            </button>
            <button className="bottone bottone-secondario" onClick={annullaModificaVoci}>Annulla</button>
          </div>
        ) : senzaVoci ? (
          <div className="sp-vuoto">
            <p className="aiuto">
              {gioco.nome} non ha ancora le sue voci di punteggio. Copiale dal blocchetto
              segnapunti o dalla pagina del punteggio finale del regolamento: una volta
              salvate, le trovano pronte tutti.
            </p>
            {possoModificareVoci ? (
              <button className="bottone" onClick={() => { setModificaVoci(true); aggiungiVoce('voce') }}>
                Crea le voci
              </button>
            ) : (
              <p className="aiuto">Le può creare chi ha aggiunto il gioco o un organizzatore.</p>
            )}
          </div>
        ) : (
          <>
            <div className="sp-scorri">
              <table className="sp-tabella">
                <thead>
                  <tr>
                    <th className="sp-voce" scope="col"><span className="visivamente-nascosto">Voce</span></th>
                    {giocatori.map((g) => <th key={g.chiave} scope="col">{g.nome}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => r.tipo === 'sezione' ? (
                    <tr key={r.chiave} className="sp-sezione">
                      <th colSpan={giocatori.length + 1} scope="colgroup">{r.etichetta}</th>
                    </tr>
                  ) : (
                    <tr key={r.chiave}>
                      <th className="sp-voce" scope="row">
                        {r.etichetta}
                        {r.negativa && <span className="sp-meno" aria-label="in negativo"> −</span>}
                      </th>
                      {giocatori.map((g) => (
                        <td key={g.chiave}>
                          <input
                            id={`sp-${g.chiave}-${r.chiave}`}
                            className="sp-cella"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={valori[g.chiave]?.[r.chiave] ?? ''}
                            onFocus={() => { ultimaCella.current = { giocatore: g.chiave, chiave: r.chiave } }}
                            onChange={(e) => scrivi(g.chiave, r.chiave, e.target.value.replace(/[^0-9,.\-−]/g, ''))}
                            aria-label={`${r.etichetta}, ${g.nome}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th className="sp-voce" scope="row">Totale</th>
                    {giocatori.map((g) => {
                      const t = totale(g.chiave)
                      return <td key={g.chiave} className="sp-totale">{t == null ? '–' : t}</td>
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="sp-strumenti">
              <button className="bottone-piatto" onMouseDown={(e) => e.preventDefault()} onClick={cambiaSegno}>
                ± cambia segno
              </button>
              {modo === 'mani' ? (
                <>
                  <button className="bottone-piatto" onClick={() => setMani(mani + 1)}>+ mano</button>
                  {mani > 1 && (
                    <button className="bottone-piatto" onClick={() => setMani(mani - 1)}>− ultima mano</button>
                  )}
                </>
              ) : possoModificareVoci ? (
                <button className="bottone-piatto" onClick={() => setModificaVoci(true)}>modifica le voci</button>
              ) : null}
            </div>

            <button className="bottone" onClick={conferma}>Usa questi totali</button>
            <p className="aiuto">
              I totali vanno nella partita; i parziali si salvano con lei quando la registri.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
