// Primo Giocatore - Statistiche
// v1.14.2 - 202609151900
// Un solo motore di calcolo, quattro soggetti: giocatore, gioco, luogo, gruppo.

import { useEffect, useMemo, useState } from 'react'
import { supabase, COLORI, daMostrare } from './supabase'

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

/* Un ospite collegato a un account è la stessa persona. */
const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
const nomeDi = (x) => (x.profili ? daMostrare(x.profili) : x.ospiti?.nome || 'Sconosciuto')
const coloreDi = (x) => COLORI.find((c) => c.id === x.profili?.colore)?.hex || '#C9D1D8'

export default function Statistiche({ profilo }) {
  const [partite, setPartite] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')

  const [tipo, setTipo] = useState('persona')
  const [scelto, setScelto] = useState(profilo.id)
  const [cerca, setCerca] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, tipo_punteggio, esito_coop,
        giochi ( id, nome ),
        luoghi ( id, nome ),
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
      const v = perGioco.get(p.giochi.id) || { nome: p.giochi.nome, partite: 0, vinte: 0, attese: 0, punteggi: [] }
      v.partite++
      if (r.vincitore) v.vinte++
      if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
      if (r.punteggio_totale != null) v.punteggi.push(r.punteggio_totale)
      perGioco.set(p.giochi.id, v)
    }

    // Testa a testa
    const contro = new Map()
    for (const p of competitive) {
      const r = suaRiga(p)
      for (const x of p.partecipazioni || []) {
        if (identita(x) === chiave) continue
        const k = identita(x)
        const v = contro.get(k) || { nome: nomeDi(x), colore: coloreDi(x), insieme: 0, sue: 0, altrui: 0 }
        v.insieme++
        if (r.vincitore) v.sue++
        if (x.vincitore) v.altrui++
        contro.set(k, v)
      }
    }

    return {
      sue, competitive, cooperative,
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

    const giocatori = new Map()
    const tuttiPunteggi = []
    let scarti = []

    for (const p of sue) {
      const punteggi = (p.partecipazioni || []).map((x) => x.punteggio_totale).filter((v) => v != null)
      tuttiPunteggi.push(...punteggi)
      if (punteggi.length > 1) scarti.push(Math.max(...punteggi) - Math.min(...punteggi))

      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        const v = giocatori.get(k) || { nome: nomeDi(x), colore: coloreDi(x), partite: 0, vinte: 0, attese: 0, punteggi: [] }
        v.partite++
        if (x.vincitore) v.vinte++
        if (p.tipo_punteggio !== 'coop' && quanti(p) > 0) v.attese += 1 / quanti(p)
        if (x.punteggio_totale != null) v.punteggi.push(x.punteggio_totale)
        giocatori.set(k, v)
      }
    }

    const conDurata = sue.filter((p) => p.durata_minuti)
    return {
      sue, competitive,
      giocatori: [...giocatori.values()].sort((a, b) => b.partite - a.partite),
      punteggioTipico: mediana(tuttiPunteggi),
      punteggioMax: tuttiPunteggi.length ? Math.max(...tuttiPunteggi) : null,
      punteggioMin: tuttiPunteggi.length ? Math.min(...tuttiPunteggi) : null,
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
      if (p.giochi) giochi.set(p.giochi.id, { nome: p.giochi.nome, n: (giochi.get(p.giochi.id)?.n || 0) + 1 })
      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        persone.set(k, { nome: nomeDi(x), colore: coloreDi(x), n: (persone.get(k)?.n || 0) + 1 })
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
      if (p.giochi) giochi.set(p.giochi.id, { nome: p.giochi.nome, n: (giochi.get(p.giochi.id)?.n || 0) + 1 })
      for (const x of p.partecipazioni || []) {
        const k = identita(x)
        const v = persone.get(k) || { nome: nomeDi(x), colore: coloreDi(x), n: 0, vinte: 0, attese: 0 }
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
        <SchedaPersona d={dellaPersona(attivo)} istogramma={istogramma} />
      ) : tipo === 'gioco' ? (
        <SchedaGioco d={delGioco(attivo)} nome={elenchi.giochi.find((g) => g[0] === attivo)?.[1]} istogramma={istogramma} />
      ) : tipo === 'luogo' ? (
        <SchedaLuogo d={delLuogo(attivo)} istogramma={istogramma} />
      ) : (
        <SchedaGruppo d={delGruppo()} partite={partite} istogramma={istogramma} />
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

function SchedaPersona({ d, istogramma }) {
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
          const med = mediana(g.punteggi)
          return (
            <li key={g.nome}>
              <div className="nome-giocatore">
                <strong>{g.nome}</strong>
                <span className="anno block">
                  {g.partite} {g.partite === 1 ? 'partita' : 'partite'} · {g.vinte} vinte
                  {r != null ? ` · ${r.toFixed(2)}× atteso` : ''}
                </span>
                {med != null && <span className="anno block">punteggio tipico {med}</span>}
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
              <strong>{a.nome}</strong>
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

function SchedaGioco({ d, nome, istogramma }) {
  if (d.sue.length === 0) return <p className="aiuto">Nessuna partita a questo gioco.</p>
  return (
    <>
      <div className="numeroni">
        <Numerone cifra={d.sue.length} testo="partite" />
        <Numerone cifra={d.giocatori.length} testo="giocatori" />
        {d.punteggioTipico != null && <Numerone cifra={d.punteggioTipico} testo="punteggio tipico" />}
        {d.durataMedia != null && <Numerone cifra={durata(d.durataMedia)} testo="durata media" />}
      </div>

      <div className="spiegone">
        <p>
          <strong>Punteggio tipico</strong> è la mediana, non la media: risponde a «quanto serve
          per essere in partita» meglio di qualunque altro numero.
          {d.punteggioMin != null && ` Finora si è andati da ${d.punteggioMin} a ${d.punteggioMax}.`}
          {d.scartoMedio != null && ` Fra primo e ultimo passano in media ${d.scartoMedio} punti.`}
        </p>
        {d.ultima && <p>Ultima volta: {giorno(d.ultima)}.</p>}
      </div>

      <Istogramma dati={istogramma(d.sue)} />

      <h3 className="titolo-sezione">Chi lo domina</h3>
      <ul className="elenco">
        {d.giocatori.map((g) => {
          const r = g.attese > 0 ? g.vinte / g.attese : null
          const med = mediana(g.punteggi)
          return (
            <li key={g.nome}>
              <span className="pallino" style={{ background: g.colore }} aria-hidden="true" />
              <div className="nome-giocatore">
                <strong>{g.nome}</strong>
                <span className="anno block">
                  {g.partite} giocate · {g.vinte} vinte
                  {med != null ? ` · tipico ${med}` : ''}
                </span>
              </div>
              {r != null && (
                <span className={`bilancio${r >= 1 ? ' avanti' : ' indietro'}`}>{r.toFixed(2)}×</span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* ---------- Luogo ---------- */

function SchedaLuogo({ d, istogramma }) {
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
            <strong>{g.nome}</strong>
            <span className="anno">{g.n}</span>
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Chi ci viene</h3>
      <ul className="elenco">
        {d.persone.map((p) => (
          <li key={p.nome}>
            <span className="pallino" style={{ background: p.colore }} aria-hidden="true" />
            <div className="nome-giocatore"><strong>{p.nome}</strong></div>
            <span className="anno">{p.n}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------- Tutti ---------- */

function SchedaGruppo({ d, partite, istogramma }) {
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
        {d.giochi.slice(0, 15).map((g) => (
          <li key={g.nome}>
            <strong>{g.nome}</strong>
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
                  <strong>{p.nome}</strong>
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
