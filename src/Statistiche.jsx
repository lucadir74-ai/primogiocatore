// Primo Giocatore - Statistiche
// v3.3.0 - 202609201400
// Un solo motore di calcolo, quattro soggetti: giocatore, gioco, luogo, gruppo.

import { useEffect, useMemo, useState } from 'react'
import { supabase, COLORI, daMostrare, tutteLeRighe } from './supabase'

const mese = (d) => new Date(d).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
const giorno = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
const perc = (parte, tutto) => (tutto === 0 ? '—' : `${Math.round((parte / tutto) * 100)}%`)

function mediana(numeri) {
  if (numeri.length === 0) return null
  const o = [...numeri].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

const durata = (min) => (min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`)

/* Riepilogo dei punteggi: il valore tipico e gli estremi toccati. */
function riepilogoPunteggi(punteggi) {
  if (!punteggi || punteggi.length === 0) return null
  const med = mediana(punteggi)
  const min = Math.min(...punteggi)
  const max = Math.max(...punteggi)
  if (min === max) return `punteggio ${min}`
  return `tipico ${med} · da ${min} a ${max}`
}

/* Un ospite collegato a un account è la stessa persona. */
const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
const nomeDi = (x) => (x.profili ? daMostrare(x.profili) : x.ospiti?.nome || 'Sconosciuto')
const coloreDi = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'

export default function Statistiche({ profilo, onModifica, mira }) {
  const [partite, setPartite] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')

  const [tipo, setTipo] = useState('persona')
  const [scelto, setScelto] = useState(profilo.id)
  const [cerca, setCerca] = useState('')

  useEffect(() => { carica() }, [])

  // Arrivo da un'altra scheda: apro direttamente su quel soggetto.
  useEffect(() => {
    if (!mira?.tipo || !mira?.id) return
    setTipo(mira.tipo)
    setScelto(mira.id)
    setCerca('')
  }, [mira?.tipo, mira?.id, mira?.quando])

  async function carica() {
    try {
      const righe = await tutteLeRighe(() => supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, tipo_punteggio, esito_coop, note, registrata_da,
        giochi ( id, nome ),
        luoghi ( id, nome ),
        partecipazioni (
          utente_id, ospite_id, punteggio_totale, posizione, vincitore, ruolo, ordine_turno,
          profili:utente_id ( nome, nickname, colore ),
          ospiti:ospite_id ( nome, utente_collegato )
        )
      `)
      .order('giocata_il', { ascending: true }))
      setPartite(righe)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCaricamento(false)
    }
  }

  /* ---------- Elenchi per le tendine ---------- */

  const elenchi = useMemo(() => {
    const persone = new Map()
    const giochi = new Map()
    const luoghi = new Map()
    for (const p of partite) {
      if (p.giochi) giochi.set(p.giochi.id, p.giochi.nome)
      if (p.luoghi) luoghi.set(p.luoghi.id, p.luoghi.nome)
      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        if (!persone.has(k)) persone.set(k, nomeDi(x))
      }
    }
    const ordina = (m) => [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'it'))
    return { persone: ordina(persone), giochi: ordina(giochi), luoghi: ordina(luoghi) }
  }, [partite])

  /* ---------- Motore di calcolo ---------- */

  const quanti = (p) => (p.partecipazioni || []).length

  // Statistiche di una persona, chiunque essa sia.
  function dellaPersona(chiave) {
    const suaRiga = (p) => (p.partecipazioni || []).find((x) => identita(x) === chiave)
    const sue = partite.filter((p) => suaRiga(p))
    const competitive = sue.filter((p) => p.tipo_punteggio !== 'coop')
    const cooperative = sue.filter((p) => p.tipo_punteggio === 'coop')
    const vinte = competitive.filter((p) => suaRiga(p)?.vincitore).length
    const attese = competitive.reduce((t, p) => t + (quanti(p) > 0 ? 1 / quanti(p) : 0), 0)

    const conPos = competitive.filter((p) => suaRiga(p)?.posizione != null && quanti(p) > 1)
    const piazz = conPos.length
      ? conPos.reduce((t, p) => t + (quanti(p) - suaRiga(p).posizione) / (quanti(p) - 1), 0) / conPos.length
      : null

    const distanze = []
    for (const p of competitive) {
      const r = suaRiga(p)
      if (!r || r.vincitore || r.punteggio_totale == null) continue
      const punteggi = (p.partecipazioni || []).map((x) => x.punteggio_totale).filter((v) => v != null)
      const massimo = Math.max(...punteggi)
      if (isFinite(massimo) && massimo > 0) distanze.push((massimo - r.punteggio_totale) / massimo)
    }

    let attuale = 0, record = 0, ultimoEsito = null
    for (const p of competitive) {
      const v = Boolean(suaRiga(p)?.vincitore)
      if (ultimoEsito === v) attuale++
      else { ultimoEsito = v; attuale = 1 }
      if (v) record = Math.max(record, attuale)
    }

    // Gioco per gioco
    const perGioco = new Map()
    for (const p of sue) {
      if (!p.giochi) continue
      const r = suaRiga(p)
      const v = perGioco.get(p.giochi.id) || { id: p.giochi.id, nome: p.giochi.nome, partite: 0, vinte: 0, attese: 0, punteggi: [], fazioni: new Map() }
      v.partite++
      if (r.vincitore) v.vinte++
      if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
      if (r.punteggio_totale != null) v.punteggi.push(r.punteggio_totale)
      const f = (r.ruolo || '').trim()
      if (f) {
        const fv = v.fazioni.get(f.toLowerCase()) || { nome: f, n: 0, vinte: 0 }
        fv.n++
        if (r.vincitore) fv.vinte++
        v.fazioni.set(f.toLowerCase(), fv)
      }
      perGioco.set(p.giochi.id, v)
    }

    // Testa a testa
    const contro = new Map()
    for (const p of competitive) {
      const r = suaRiga(p)
      for (const x of p.partecipazioni || []) {
        if (identita(x) === chiave) continue
        const k = identita(x)
        const v = contro.get(k) || { chiave: k, nome: nomeDi(x), colore: coloreDi(x), insieme: 0, sue: 0, altrui: 0 }
        v.insieme++
        if (r.vincitore) v.sue++
        if (x.vincitore) v.altrui++
        contro.set(k, v)
      }
    }

    const tuttiMiei = []
    for (const p of competitive) {
      const r = suaRiga(p)
      if (r?.punteggio_totale != null) tuttiMiei.push(r.punteggio_totale)
    }

    return {
      sue, competitive, cooperative,
      migliore: tuttiMiei.length ? Math.max(...tuttiMiei) : null,
      peggiore: tuttiMiei.length ? Math.min(...tuttiMiei) : null,
      coopVinte: cooperative.filter((p) => p.esito_coop === 'vinta').length,
      vinte, attese,
      rendimento: attese > 0 ? vinte / attese : null,
      piazz,
      distanza: distanze.length ? distanze.reduce((a, b) => a + b, 0) / distanze.length : null,
      serie: { attuale, vincente: ultimoEsito, record },
      minuti: sue.reduce((t, p) => t + (p.durata_minuti || 0), 0),
      giochiDiversi: new Set(sue.map((p) => p.giochi?.id).filter(Boolean)).size,
      perGioco: [...perGioco.values()].sort((a, b) => b.partite - a.partite),
      contro: [...contro.values()].sort((a, b) => b.insieme - a.insieme),
    }
  }

  // Statistiche di un gioco: chi lo domina, quanto dura, come si punteggia.
  function delGioco(idGioco) {
    const sue = partite.filter((p) => p.giochi?.id === idGioco)
    const competitive = sue.filter((p) => p.tipo_punteggio !== 'coop')

    // I punteggi di chi sta guardando, tenuti separati da quelli del tavolo.
    const mieiPunteggi = []
    for (const p of sue) {
      for (const x of p.partecipazioni || []) {
        if (x.utente_id === profilo.id && x.punteggio_totale != null) mieiPunteggi.push(x.punteggio_totale)
      }
    }

    const giocatori = new Map()
    const tuttiPunteggi = []
    let scarti = []

    for (const p of sue) {
      const punteggi = (p.partecipazioni || []).map((x) => x.punteggio_totale).filter((v) => v != null)
      tuttiPunteggi.push(...punteggi)
      if (punteggi.length > 1) scarti.push(Math.max(...punteggi) - Math.min(...punteggi))

      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        const v = giocatori.get(k) || { chiave: k, nome: nomeDi(x), colore: coloreDi(x), partite: 0, vinte: 0, attese: 0, punteggi: [] }
        v.partite++
        if (x.vincitore) v.vinte++
        if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
        if (x.punteggio_totale != null) v.punteggi.push(x.punteggio_totale)
        giocatori.set(k, v)
      }
    }

    // Fazioni: solo se in questo gioco qualcuno le ha scritte.
    const fazioni = new Map()
    for (const p of sue) {
      for (const x of p.partecipazioni || []) {
        const f = (x.ruolo || '').trim()
        if (!f) continue
        const v = fazioni.get(f.toLowerCase()) || { nome: f, partite: 0, vinte: 0, attese: 0, punteggi: [] }
        v.partite++
        if (x.vincitore) v.vinte++
        if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
        if (x.punteggio_totale != null) v.punteggi.push(x.punteggio_totale)
        fazioni.set(f.toLowerCase(), v)
      }
    }

    // Ordine di turno: quanto conta partire per primi in questo gioco.
    const turni = new Map()
    for (const p of competitive) {
      for (const x of p.partecipazioni || []) {
        if (x.ordine_turno == null) continue
        const v = turni.get(x.ordine_turno) || { ordine: x.ordine_turno, partite: 0, vinte: 0, attese: 0, punteggi: [] }
        v.partite++
        if (x.vincitore) v.vinte++
        if (quanti(p) > 0) v.attese += 1 / quanti(p)
        if (x.punteggio_totale != null) v.punteggi.push(x.punteggio_totale)
        turni.set(x.ordine_turno, v)
      }
    }

    const conDurata = sue.filter((p) => p.durata_minuti)
    return {
      sue, competitive,
      turni: [...turni.values()].sort((a, b) => a.ordine - b.ordine),
      fazioni: [...fazioni.values()].sort((a, b) => b.partite - a.partite),
      giocatori: [...giocatori.values()].sort((a, b) => b.partite - a.partite),
      punteggioTipico: mediana(tuttiPunteggi),
      punteggioMax: tuttiPunteggi.length ? Math.max(...tuttiPunteggi) : null,
      punteggioMin: tuttiPunteggi.length ? Math.min(...tuttiPunteggi) : null,
      mioMax: mieiPunteggi.length ? Math.max(...mieiPunteggi) : null,
      mioMin: mieiPunteggi.length ? Math.min(...mieiPunteggi) : null,
      mioTipico: mediana(mieiPunteggi),
      miePartite: mieiPunteggi.length,
      scartoMedio: scarti.length ? Math.round(scarti.reduce((a, b) => a + b, 0) / scarti.length) : null,
      durataMedia: conDurata.length
        ? Math.round(conDurata.reduce((t, p) => t + p.durata_minuti, 0) / conDurata.length)
        : null,
      ultima: sue.length ? sue[sue.length - 1].giocata_il : null,
      coopVinte: sue.filter((p) => p.esito_coop === 'vinta').length,
    }
  }

  // Statistiche di un luogo: cosa ci si gioca e chi ci viene.
  function delLuogo(idLuogo) {
    const sue = partite.filter((p) => (idLuogo === 'ignoto' ? !p.luoghi : p.luoghi?.id === idLuogo))
    const giochi = new Map()
    const persone = new Map()
    for (const p of sue) {
      if (p.giochi) giochi.set(p.giochi.id, { id: p.giochi.id, nome: p.giochi.nome, n: (giochi.get(p.giochi.id)?.n || 0) + 1 })
      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        persone.set(k, { chiave: k, nome: nomeDi(x), colore: coloreDi(x), n: (persone.get(k)?.n || 0) + 1 })
      }
    }
    const conDurata = sue.filter((p) => p.durata_minuti)
    return {
      sue,
      giochi: [...giochi.values()].sort((a, b) => b.n - a.n),
      persone: [...persone.values()].sort((a, b) => b.n - a.n),
      durataMedia: conDurata.length
        ? Math.round(conDurata.reduce((t, p) => t + p.durata_minuti, 0) / conDurata.length)
        : null,
      ultima: sue.length ? sue[sue.length - 1].giocata_il : null,
    }
  }

  function delGruppo() {
    const giochi = new Map()
    const persone = new Map()
    for (const p of partite) {
      if (p.giochi) giochi.set(p.giochi.id, { id: p.giochi.id, nome: p.giochi.nome, n: (giochi.get(p.giochi.id)?.n || 0) + 1 })
      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        const v = persone.get(k) || { chiave: k, nome: nomeDi(x), colore: coloreDi(x), n: 0, vinte: 0, attese: 0 }
        v.n++
        if (x.vincitore) v.vinte++
        if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
        persone.set(k, v)
      }
    }
    return {
      giochi: [...giochi.values()].sort((a, b) => b.n - a.n),
      persone: [...persone.values()].sort((a, b) => b.n - a.n),
      minuti: partite.reduce((t, p) => t + (p.durata_minuti || 0), 0),
    }
  }

  function istogramma(insieme) {
    const m = new Map()
    for (const p of insieme) m.set(mese(p.giocata_il), (m.get(mese(p.giocata_il)) || 0) + 1)
    const righe = [...m.entries()].slice(-12)
    return { righe, massimo: Math.max(1, ...righe.map(([, n]) => n)) }
  }

  /* ---------- Vista ---------- */

  if (caricamento) return <div className="scheda"><p>Conto&hellip;</p></div>

  const tutteOpzioni = tipo === 'persona' ? elenchi.persone
    : tipo === 'gioco' ? elenchi.giochi
    : tipo === 'luogo' ? [...elenchi.luoghi, ['ignoto', 'Non indicato']]
    : []

  const q = cerca.trim().toLowerCase()
  const opzioni = q ? tutteOpzioni.filter(([, nome]) => nome.toLowerCase().includes(q)) : tutteOpzioni

  // Se la ricerca esclude ciò che stavi guardando, mostro il primo risultato.
  // Calcolato, non impostato: cambiare stato qui romperebbe il disegno.
  const attivo = opzioni.some(([id]) => id === scelto) ? scelto : opzioni[0]?.[0] ?? null

  const vaiAlGiocatore = (chiave) => { setTipo('persona'); setCerca(''); setScelto(chiave) }
  const vaiAlGioco = (id) => { setTipo('gioco'); setCerca(''); setScelto(id) }

  function cambiaTipo(nuovo) {
    setTipo(nuovo)
    setCerca('')
    if (nuovo === 'persona') setScelto(profilo.id)
    else if (nuovo === 'gioco') setScelto(elenchi.giochi[0]?.[0] || null)
    else if (nuovo === 'luogo') setScelto(elenchi.luoghi[0]?.[0] || 'ignoto')
    else setScelto(null)
  }

  return (
    <div className="scheda">
      <h2>Statistiche</h2>

      {errore && <div className="avviso errore">{errore}</div>}

      <div className="sottoschede">
        {[['persona', 'Giocatore'], ['gioco', 'Gioco'], ['luogo', 'Luogo'], ['gruppo', 'Tutti']].map(([id, et]) => (
          <button key={id} className={tipo === id ? 'attiva' : ''} onClick={() => cambiaTipo(id)}>
            {et}
          </button>
        ))}
      </div>

      {tipo !== 'gruppo' && (
        <div className="campo">
          {tutteOpzioni.length > 1 && (
            <input
              className="campo-cerca"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder={tipo === 'persona' ? 'Cerca un giocatore' : tipo === 'gioco' ? 'Cerca un gioco' : 'Cerca un luogo'}
              aria-label="Filtra l'elenco"
            />
          )}
          {opzioni.length === 0 ? (
            <p className="aiuto">Nessun risultato per «{cerca}».</p>
          ) : (
          <select
            className="scelta-punteggio larga"
            value={attivo || ''}
            onChange={(e) => setScelto(e.target.value)}
            aria-label="Scegli di chi vedere le statistiche"
          >
            {opzioni.map(([id, nome]) => (
              <option key={id} value={id}>{nome}</option>
            ))}
          </select>
          )}
        </div>
      )}

      {partite.length === 0 ? (
        <p className="aiuto">Ancora nessuna partita registrata.</p>
      ) : tipo === 'persona' ? (
        <SchedaPersona
          d={dellaPersona(attivo)}
          istogramma={istogramma}
          vaiAlGioco={vaiAlGioco}
          vaiAlGiocatore={vaiAlGiocatore}
        />
      ) : tipo === 'gioco' ? (
        <SchedaGioco
          d={delGioco(attivo)}
          nome={elenchi.giochi.find((g) => g[0] === attivo)?.[1]}
          istogramma={istogramma}
          profilo={profilo}
          onModifica={onModifica}
          vaiAlGiocatore={vaiAlGiocatore}
        />
      ) : tipo === 'luogo' ? (
        <SchedaLuogo d={delLuogo(attivo)} istogramma={istogramma} vaiAlGiocatore={vaiAlGiocatore} vaiAlGioco={vaiAlGioco} />
      ) : (
        <SchedaGruppo d={delGruppo()} partite={partite} istogramma={istogramma} vaiAlGiocatore={vaiAlGiocatore} vaiAlGioco={vaiAlGioco} />
      )}
    </div>
  )
}

/* ---------- Riquadri riutilizzabili ---------- */

function Numerone({ cifra, testo, tono }) {
  return (
    <div className={`numerone${tono ? ` ${tono}` : ''}`}>
      <span className="cifra">{cifra}</span>
      <span className="didascalia">{testo}</span>
    </div>
  )
}

function Istogramma({ dati }) {
  if (dati.righe.length < 2) return null
  return (
    <>
      <h3 className="titolo-sezione">Nel tempo</h3>
      <div className="istogramma">
        {dati.righe.map(([etichetta, n]) => (
          <div className="colonna" key={etichetta}>
            <span className="valore">{n}</span>
            <div className="barra" style={{ height: `${(n / dati.massimo) * 100}%` }} />
            <span className="etichetta">{etichetta}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Giocatore ---------- */

function SchedaPersona({ d, istogramma, vaiAlGioco, vaiAlGiocatore }) {
  if (d.sue.length === 0) return <p className="aiuto">Nessuna partita per questo giocatore.</p>
  return (
    <>
      <div className="numeroni">
        <Numerone cifra={d.sue.length} testo="partite" />
        <Numerone cifra={d.vinte} testo={`vinte (${perc(d.vinte, d.competitive.length)})`} />
        <Numerone
          cifra={d.rendimento != null ? `${d.rendimento.toFixed(2)}×` : '—'}
          testo="rispetto all'atteso"
          tono={d.rendimento != null ? (d.rendimento >= 1 ? 'sopra' : 'sotto') : null}
        />
        <Numerone cifra={d.piazz != null ? Math.round(d.piazz * 100) : '—'} testo="piazzamento su 100" />
        <Numerone cifra={d.giochiDiversi} testo="giochi diversi" />
        <Numerone cifra={durata(d.minuti)} testo="al tavolo" />
      </div>

      <div className="spiegone">
        <p>
          <strong>Rispetto all'atteso</strong> pesa le vittorie sul numero di giocatori: in quattro
          la vittoria spettante vale un quarto, in due metà. In queste {d.competitive.length} partite
          competitive un giocatore qualunque ne avrebbe vinte {d.attese.toFixed(1)}. Sopra 1,00 è
          meglio del caso.
        </p>
        <p>
          <strong>Piazzamento su 100</strong> vale 100 arrivando sempre primo e 0 sempre ultimo,
          qualunque sia il numero di giocatori.
        </p>
      </div>

      <h3 className="titolo-sezione">Dettagli</h3>
      <ul className="elenco">
        {d.distanza != null && (
          <li>
            <div className="nome-giocatore">
              <strong>Quando perde</strong>
              <span className="anno block">distanza media dal vincitore</span>
            </div>
            <span className="punti-finali">−{Math.round(d.distanza * 100)}%</span>
          </li>
        )}
        {d.serie.record > 0 && (
          <li>
            <div className="nome-giocatore">
              <strong>Vittorie di fila</strong>
              <span className="anno block">
                {d.serie.vincente ? `serie aperta: ${d.serie.attuale}` : 'nessuna serie aperta'}
              </span>
            </div>
            <span className="punti-finali">{d.serie.record}</span>
          </li>
        )}
        {d.cooperative.length > 0 && (
          <li>
            <div className="nome-giocatore">
              <strong>Cooperativi</strong>
              <span className="anno block">contati a parte: non c'è nessuno da battere</span>
            </div>
            <span className="punti-finali">{d.coopVinte}/{d.cooperative.length}</span>
          </li>
        )}
      </ul>

      <Istogramma dati={istogramma(d.sue)} />

      <h3 className="titolo-sezione">Gioco per gioco</h3>
      <ul className="elenco">
        {d.perGioco.map((g) => {
          const r = g.attese > 0 ? g.vinte / g.attese : null
          const rip = riepilogoPunteggi(g.punteggi)
          return (
            <li key={g.nome}>
              <div className="nome-giocatore">
                <button className="nome-cliccabile" onClick={() => vaiAlGioco(g.id)}>
                  {g.nome}
                </button>
                <span className="anno block">
                  {g.partite} {g.partite === 1 ? 'partita' : 'partite'} · {g.vinte} vinte
                  {r != null ? ` · ${r.toFixed(2)}× atteso` : ''}
                </span>
                {rip && <span className="anno block">{rip}</span>}
                {g.fazioni?.size > 0 && (
                  <span className="anno block fazione-nota">
                    {[...g.fazioni.values()]
                      .sort((a, b) => b.n - a.n)
                      .map((f) => `${f.nome} ${f.vinte}/${f.n}`)
                      .join(' · ')}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <h3 className="titolo-sezione">Testa a testa</h3>
      <ul className="elenco">
        {d.contro.map((a) => (
          <li key={a.nome}>
            <span className="pallino" style={{ background: a.colore }} aria-hidden="true" />
            <div className="nome-giocatore">
              <button className="nome-cliccabile" onClick={() => vaiAlGiocatore(a.chiave)}>{a.nome}</button>
              <span className="anno block">{a.insieme} partite insieme</span>
            </div>
            <span className={`bilancio${a.sue > a.altrui ? ' avanti' : a.sue < a.altrui ? ' indietro' : ''}`}>
              {a.sue} – {a.altrui}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------- Gioco ---------- */

function PartiteDelGioco({ partite, profilo, onModifica }) {
  const [aperta, setAperta] = useState(null)

  // Raggruppate per giorno: le serate di gioco stanno insieme.
  const perGiorno = new Map()
  for (const p of [...partite].reverse()) {
    const k = p.giocata_il.slice(0, 10)
    if (!perGiorno.has(k)) perGiorno.set(k, [])
    perGiorno.get(k).push(p)
  }

  const nomeDiRiga = (x) => (x.profili ? daMostrare(x.profili) : x.ospiti?.nome || 'Sconosciuto')
  const coloreDiRiga = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'

  return (
    <>
      <h3 className="titolo-sezione">
        Tutte le partite <span className="conteggio">{partite.length}</span>
      </h3>

      {[...perGiorno.entries()].map(([data, delGiorno]) => (
        <div className="gruppo-giorno" key={data}>
          <h4 className="giorno">
            {giorno(data)}
            {delGiorno.length > 1 && <span className="conteggio"> {delGiorno.length} partite</span>}
          </h4>

          {delGiorno.map((p) => {
            const apertaQui = aperta === p.id
            const classifica = [...(p.partecipazioni || [])].sort((a, b) => {
              if (a.posizione != null && b.posizione != null) return a.posizione - b.posizione
              if (a.posizione != null) return -1
              if (b.posizione != null) return 1
              return (b.punteggio_totale ?? -Infinity) - (a.punteggio_totale ?? -Infinity)
            })
            const vincitori = classifica.filter((x) => x.vincitore).map(nomeDiRiga)

            return (
              <div className={`riga-partita${apertaQui ? ' aperta' : ''}`} key={p.id}>
                <button className="testa-partita" onClick={() => setAperta(apertaQui ? null : p.id)}>
                  <div className="dati-partita">
                    <strong>
                      {p.luoghi?.nome || 'Luogo non indicato'}
                      {p.durata_minuti ? ` · ${p.durata_minuti} min` : ''}
                    </strong>
                    <span className="anno">
                      {(p.partecipazioni || []).length} giocatori
                      {vincitori.length
                        ? p.tipo_punteggio === 'coop'
                          ? p.esito_coop === 'vinta' ? ' · vinta insieme' : ' · persa insieme'
                          : ` · vince ${vincitori.join(', ')}`
                        : ''}
                    </span>
                  </div>
                  <span className="freccia" aria-hidden="true">{apertaQui ? '−' : '+'}</span>
                </button>

                {apertaQui && (
                  <div className="dettaglio">
                    <ul className="elenco elenco-giocatori">
                      {classifica.map((x, i) => (
                        <li key={i} className={x.vincitore ? 'vincitore' : ''}>
                          {p.tipo_punteggio !== 'coop' && (
                            <span className="posto">{x.posizione ? `${x.posizione}°` : '–'}</span>
                          )}
                          <span className="pallino" style={{ background: coloreDiRiga(x) }} aria-hidden="true" />
                          <div className="nome-giocatore">
                            <strong>{nomeDiRiga(x)}</strong>
                            {x.ospite_id && <span className="anno"> ospite</span>}
                            {(x.ruolo || x.ordine_turno != null) && (
                              <span className="anno block fazione-nota">
                                {x.ruolo}
                                {x.ruolo && x.ordine_turno != null ? ' · ' : ''}
                                {x.ordine_turno != null ? `${x.ordine_turno}° di turno` : ''}
                              </span>
                            )}
                          </div>
                          {x.punteggio_totale != null && (
                            <span className="punti-finali">{x.punteggio_totale}</span>
                          )}
                        </li>
                      ))}
                    </ul>

                    {p.note && <p className="aiuto note-partita">{p.note}</p>}

                    {p.registrata_da === profilo.id && onModifica && (
                      <button className="bottone-piatto" onClick={() => onModifica(p.id)}>
                        Modifica
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function SchedaGioco({ d, nome, istogramma, profilo, onModifica, vaiAlGiocatore }) {
  if (d.sue.length === 0) return <p className="aiuto">Nessuna partita a questo gioco.</p>
  return (
    <>
      <div className="numeroni">
        <Numerone cifra={d.sue.length} testo="partite" />
        <Numerone cifra={d.giocatori.length} testo="giocatori" />
        {d.punteggioTipico != null && <Numerone cifra={d.punteggioTipico} testo="tipico al tavolo" />}
        {d.mioTipico != null && <Numerone cifra={d.mioTipico} testo="il tuo tipico" />}
        {d.mioMax != null && <Numerone cifra={d.mioMax} testo="il tuo migliore" tono="sopra" />}
        {d.mioMin != null && d.mioMin !== d.mioMax && (
          <Numerone cifra={d.mioMin} testo="il tuo peggiore" tono="sotto" />
        )}
        {d.durataMedia != null && <Numerone cifra={durata(d.durataMedia)} testo="durata media" />}
      </div>

      <div className="spiegone">
        <p>
          <strong>Punteggio tipico</strong> è la mediana: metà delle volte si è fatto più
          di così, metà di meno. Non è la media, che una singola partita anomala
          sposterebbe.
          {d.punteggioMax != null && ` Il massimo mai visto a questo gioco è ${d.punteggioMax}, il minimo ${d.punteggioMin}.`}
          {d.scartoMedio != null && ` Fra primo e ultimo passano in media ${d.scartoMedio} punti.`}
        </p>
        {d.ultima && <p>Ultima volta: {giorno(d.ultima)}.</p>}
      </div>

      <PartiteDelGioco partite={d.sue} profilo={profilo} onModifica={onModifica} />

      <h3 className="titolo-sezione">Chi lo domina</h3>
      <ul className="elenco">
        {d.giocatori.map((g) => {
          const r = g.attese > 0 ? g.vinte / g.attese : null
          const rip = riepilogoPunteggi(g.punteggi)
          return (
            <li key={g.nome}>
              <span className="pallino" style={{ background: g.colore }} aria-hidden="true" />
              <div className="nome-giocatore">
                <button className="nome-cliccabile" onClick={() => vaiAlGiocatore(g.chiave)}>{g.nome}</button>
                <span className="anno block">
                  {g.partite} giocate · {g.vinte} vinte
                </span>
                {rip && <span className="anno block">{rip}</span>}
              </div>
              {r != null && (
                <span className={`bilancio${r >= 1 ? ' avanti' : ' indietro'}`}>{r.toFixed(2)}×</span>
              )}
            </li>
          )
        })}
      </ul>


      <Istogramma dati={istogramma(d.sue)} />

      {d.turni.length > 1 && (
        <>
          <h3 className="titolo-sezione">Ordine di turno</h3>
          <ul className="elenco">
            {d.turni.map((t) => {
              const r = t.attese > 0 ? t.vinte / t.attese : null
              const rip = riepilogoPunteggi(t.punteggi)
              return (
                <li key={t.ordine}>
                  <span className="posto">{t.ordine}°</span>
                  <div className="nome-giocatore">
                    <strong>{t.ordine === 1 ? 'Chi inizia' : `${t.ordine}° di turno`}</strong>
                    <span className="anno block">
                      {t.partite} {t.partite === 1 ? 'volta' : 'volte'} · {t.vinte} vinte
                    </span>
                    {rip && <span className="anno block">{rip}</span>}
                  </div>
                  {r != null && (
                    <span className={`bilancio${r >= 1 ? ' avanti' : ' indietro'}`}>{r.toFixed(2)}×</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="aiuto">
            Sopra 1,00 significa che da quella posizione si vince più del dovuto. Serve
            parecchie partite prima che il dato smetta di essere rumore.
          </p>
        </>
      )}

      {d.fazioni.length > 0 && (
        <>
          <h3 className="titolo-sezione">
            Fazioni <span className="conteggio">{d.fazioni.length}</span>
          </h3>
          <ul className="elenco">
            {d.fazioni.map((f) => {
              const r = f.attese > 0 ? f.vinte / f.attese : null
              const rip = riepilogoPunteggi(f.punteggi)
              return (
                <li key={f.nome}>
                  <div className="nome-giocatore">
                    <strong>{f.nome}</strong>
                    <span className="anno block">
                      {f.partite} {f.partite === 1 ? 'volta' : 'volte'} · {f.vinte} vinte
                    </span>
                    {rip && <span className="anno block">{rip}</span>}
                  </div>
                  {r != null && (
                    <span className={`bilancio${r >= 1 ? ' avanti' : ' indietro'}`}>{r.toFixed(2)}×</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="aiuto">
            Con poche partite questi numeri dicono poco: una fazione vista due volte
            può sembrare fortissima per caso.
          </p>
        </>
      )}

    </>
  )
}

/* ---------- Luogo ---------- */

function SchedaLuogo({ d, istogramma, vaiAlGiocatore, vaiAlGioco }) {
  if (d.sue.length === 0) return <p className="aiuto">Nessuna partita in questo luogo.</p>
  return (
    <>
      <div className="numeroni">
        <Numerone cifra={d.sue.length} testo="partite" />
        <Numerone cifra={d.giochi.length} testo="giochi diversi" />
        <Numerone cifra={d.persone.length} testo="giocatori" />
        {d.durataMedia != null && <Numerone cifra={durata(d.durataMedia)} testo="durata media" />}
      </div>

      {d.ultima && <p className="aiuto">Ultima volta: {giorno(d.ultima)}.</p>}

      <Istogramma dati={istogramma(d.sue)} />

      <h3 className="titolo-sezione">Cosa ci si gioca</h3>
      <ul className="elenco">
        {d.giochi.map((g) => (
          <li key={g.nome}>
            <button className="nome-cliccabile" onClick={() => vaiAlGioco(g.id)}>{g.nome}</button>
            <span className="anno">{g.n}</span>
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Chi ci viene</h3>
      <ul className="elenco">
        {d.persone.map((p) => (
          <li key={p.nome}>
            <span className="pallino" style={{ background: p.colore }} aria-hidden="true" />
            <div className="nome-giocatore">
              <button className="nome-cliccabile" onClick={() => vaiAlGiocatore(p.chiave)}>{p.nome}</button>
            </div>
            <span className="anno">{p.n}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------- Tutti ---------- */

function SchedaGruppo({ d, partite, istogramma, vaiAlGiocatore, vaiAlGioco }) {
  return (
    <>
      <div className="numeroni">
        <Numerone cifra={partite.length} testo="partite" />
        <Numerone cifra={d.giochi.length} testo="giochi diversi" />
        <Numerone cifra={d.persone.length} testo="giocatori" />
        <Numerone cifra={durata(d.minuti)} testo="al tavolo" />
      </div>

      <Istogramma dati={istogramma(partite)} />

      <h3 className="titolo-sezione">Giochi più giocati</h3>
      <ul className="elenco">
        {d.giochi.slice(0, 25).map((g) => (
          <li key={g.nome}>
            <button className="nome-cliccabile" onClick={() => vaiAlGioco(g.id)}>{g.nome}</button>
            <span className="anno">{g.n}</span>
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Classifica</h3>
      <ul className="elenco">
        {d.persone
          .filter((p) => p.attese > 0)
          .sort((a, b) => b.vinte / b.attese - a.vinte / a.attese)
          .map((p) => {
            const r = p.vinte / p.attese
            return (
              <li key={p.nome}>
                <span className="pallino" style={{ background: p.colore }} aria-hidden="true" />
                <div className="nome-giocatore">
                  <button className="nome-cliccabile" onClick={() => vaiAlGiocatore(p.chiave)}>{p.nome}</button>
                  <span className="anno block">{p.n} partite · {p.vinte} vinte</span>
                </div>
                <span className={`bilancio${r >= 1 ? ' avanti' : ' indietro'}`}>{r.toFixed(2)}×</span>
              </li>
            )
          })}
      </ul>
      <p className="aiuto">
        La classifica ordina per rendimento rispetto all'atteso, non per numero di vittorie:
        così chi gioca sempre in due non parte avvantaggiato su chi gioca in cinque.
      </p>
    </>
  )
}
