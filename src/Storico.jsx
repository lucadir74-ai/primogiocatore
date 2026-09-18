// Primo Giocatore - Storico
// v2.11.0 - 202609191200

import { useEffect, useState } from 'react'
import { supabase, COLORI, daMostrare } from './supabase'

const SEZIONI = [
  { id: 'partite', etichetta: 'Partite' },
  { id: 'giochi', etichetta: 'Giochi' },
  { id: 'giocatori', etichetta: 'Giocatori' },
  { id: 'luoghi', etichetta: 'Luoghi' },
]

const data = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Storico({ profilo, onModifica, onApri }) {
  const [sezione, setSezione] = useState('partite')
  const [partite, setPartite] = useState([])
  const [aperta, setAperta] = useState(null)
  const [caricamento, setCaricamento] = useState(true)
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    setCaricamento(true)
    const { data: righe, error } = await supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop, registrata_da,
        giochi ( id, nome, immagine_url ),
        luoghi ( id, nome ),
        partecipazioni (
          id, utente_id, ospite_id, punteggio_totale, posizione, vincitore, spareggio, ruolo, ordine_turno,
          profili:utente_id ( nome, nickname, colore ),
          ospiti:ospite_id ( nome, utente_collegato )
        )
      `)
      .order('giocata_il', { ascending: false })

    if (error) setErrore(error.message)
    else setPartite(righe || [])
    setCaricamento(false)
  }

  async function cancella(id) {
    if (!confirm('Cancellare questa partita? Non si torna indietro.')) return
    const { error } = await supabase.from('partite').delete().eq('id', id)
    if (error) setErrore(error.message)
    else {
      setPartite((p) => p.filter((x) => x.id !== id))
      setAperta(null)
    }
  }

  // Nome e colore di un partecipante, ospiti compresi.
  const chi = (p) => ({
    nome: p.profili ? daMostrare(p.profili) : (p.ospiti?.nome || 'Sconosciuto'),
    colore: COLORI.find((c) => c.id === p.profili?.colore)?.hex || '#C9D1D8',
    ospite: Boolean(p.ospite_id),
    // Se l'ospite si è iscritto, da qui in poi è la stessa persona.
    identita: p.utente_id || p.ospiti?.utente_collegato || `ospite:${p.ospite_id}`,
  })

  const mieiId = new Set([profilo.id])

  /* ---------- Aggregazioni ---------- */

  function perGioco() {
    const m = new Map()
    for (const p of partite) {
      if (!p.giochi) continue
      const k = p.giochi.id
      const v = m.get(k) || { id: k, nome: p.giochi.nome, immagine: p.giochi.immagine_url, partite: 0, vittorie: 0, ultima: null }
      v.partite++
      const mia = p.partecipazioni?.find((x) => mieiId.has(x.utente_id))
      if (mia?.vincitore) v.vittorie++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      m.set(k, v)
    }
    return [...m.values()].sort((a, b) => b.partite - a.partite)
  }

  function perGiocatore() {
    const m = new Map()
    for (const p of partite) {
      for (const par of p.partecipazioni || []) {
        const c = chi(par)
        if (mieiId.has(par.utente_id)) continue // non conto me stesso
        const v = m.get(c.identita) || { chiave: c.identita, nome: c.nome, colore: c.colore, ospite: c.ospite, partite: 0, vittorie: 0 }
        v.partite++
        if (par.vincitore) v.vittorie++
        m.set(c.identita, v)
      }
    }
    return [...m.values()].sort((a, b) => b.partite - a.partite)
  }

  function perLuogo() {
    const m = new Map()
    for (const p of partite) {
      const k = p.luoghi?.id || 'ignoto'
      const v = m.get(k) || { id: k, nome: p.luoghi?.nome || 'Non indicato', partite: 0, ultima: null }
      v.partite++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      m.set(k, v)
    }
    return [...m.values()].sort((a, b) => b.partite - a.partite)
  }

  /* ---------- Vista ---------- */

  const q = cerca.trim().toLowerCase()
  const filtrate = !q ? partite : partite.filter((p) => {
    const pezzi = [
      p.giochi?.nome,
      p.luoghi?.nome,
      p.note,
      ...(p.partecipazioni || []).map((x) => chi(x).nome),
    ]
    return pezzi.filter(Boolean).some((t) => t.toLowerCase().includes(q))
  })

  const filtraNome = (righe) => (!q ? righe : righe.filter((r) => r.nome.toLowerCase().includes(q)))

  if (caricamento) return <div className="scheda"><p>Carico lo storico&hellip;</p></div>

  return (
    <div className="scheda">
      <h2>Storico</h2>

      {errore && <div className="avviso errore">{errore}</div>}

      <div className="sottoschede">
        {SEZIONI.map((s) => (
          <button
            key={s.id}
            className={sezione === s.id ? 'attiva' : ''}
            onClick={() => setSezione(s.id)}
          >
            {s.etichetta}
          </button>
        ))}
      </div>

      {partite.length > 1 && (
        <input
          className="campo-cerca"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder={
            sezione === 'partite' ? 'Cerca per gioco, giocatore, luogo o nota'
            : sezione === 'giochi' ? 'Cerca un gioco'
            : sezione === 'giocatori' ? 'Cerca un giocatore'
            : 'Cerca un luogo'
          }
          aria-label="Cerca"
        />
      )}

      {partite.length === 0 && <p className="aiuto">Ancora nessuna partita registrata.</p>}

      {cerca.trim() && sezione === 'partite' && filtrate.length === 0 && (
        <p className="aiuto">Nessuna partita per «{cerca}».</p>
      )}

      {/* --- Partite --- */}
      {sezione === 'partite' && filtrate.map((p) => {
        const apertaQui = aperta === p.id
        // Ordina per piazzamento; dove manca (partite registrate prima
        // della classifica automatica) ripiega sul punteggio.
        const classifica = [...(p.partecipazioni || [])].sort((a, b) => {
          if (a.posizione != null && b.posizione != null) return a.posizione - b.posizione
          if (a.posizione != null) return -1
          if (b.posizione != null) return 1
          return (b.punteggio_totale ?? -Infinity) - (a.punteggio_totale ?? -Infinity)
        })
        const vincitori = classifica.filter((x) => x.vincitore).map((x) => chi(x).nome)

        return (
          <div key={p.id} className={`riga-partita${apertaQui ? ' aperta' : ''}`}>
            <button className="testa-partita" onClick={() => setAperta(apertaQui ? null : p.id)}>
              {p.giochi?.immagine_url && <img src={p.giochi.immagine_url} alt="" className="copertina" />}
              <div className="dati-partita">
                <strong>{p.giochi?.nome || 'Gioco'}</strong>
                <span className="anno">
                  {data(p.giocata_il)}
                  {p.luoghi?.nome ? ` · ${p.luoghi.nome}` : ''}
                  {p.durata_minuti ? ` · ${p.durata_minuti} min` : ''}
                </span>
                {vincitori.length > 0 && (
                  <span className="riga-vincitore">
                    {p.tipo_punteggio === 'coop'
                      ? p.esito_coop === 'vinta' ? 'Vinta insieme' : 'Persa insieme'
                      : `Vince ${vincitori.join(', ')}`}
                  </span>
                )}
              </div>
              <span className="freccia" aria-hidden="true">{apertaQui ? '−' : '+'}</span>
            </button>

            {apertaQui && (
              <div className="dettaglio">
                <ul className="elenco elenco-giocatori">
                  {classifica.map((par) => {
                    const c = chi(par)
                    return (
                      <li key={par.id} className={par.vincitore ? 'vincitore' : ''}>
                        {p.tipo_punteggio !== 'coop' && (
                          <span className="posto">{par.posizione ? `${par.posizione}°` : '–'}</span>
                        )}
                        <span className="pallino" style={{ background: c.colore }} aria-hidden="true" />
                        <div className="nome-giocatore">
                          <strong>{c.nome}</strong>
                          {c.ospite && <span className="anno"> ospite</span>}
                          {(par.ruolo || par.ordine_turno != null) && (
                            <span className="anno block fazione-nota">
                              {par.ruolo}
                              {par.ruolo && par.ordine_turno != null ? ' · ' : ''}
                              {par.ordine_turno != null ? `${par.ordine_turno}° di turno` : ''}
                            </span>
                          )}
                        </div>
                        {par.spareggio != null && (
                          <span className="anno spareggio-nota">sp. {par.spareggio}</span>
                        )}
                        {par.punteggio_totale != null && (
                          <span className="punti-finali">{par.punteggio_totale}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {p.note && <p className="aiuto note-partita">{p.note}</p>}

                {p.registrata_da === profilo.id && (
                  <div className="azioni-partita">
                    <button className="bottone-piatto" onClick={() => onModifica?.(p.id)}>
                      Modifica
                    </button>
                    <button className="bottone-piatto pericolo" onClick={() => cancella(p.id)}>
                      Cancella
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* --- Giochi --- */}
      {sezione === 'giochi' && (
        <ul className="elenco">
          {filtraNome(perGioco()).map((g) => (
            <li key={g.nome}>
              <div className="gioco">
                {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
                <div>
                  <button className="nome-cliccabile" onClick={() => onApri?.('gioco', g.id)}>
                    {g.nome}
                  </button>
                  <span className="anno block">
                    {g.partite} {g.partite === 1 ? 'partita' : 'partite'}
                    {g.vittorie > 0 ? ` · ${g.vittorie} tue vittorie` : ''}
                  </span>
                  <span className="anno block">ultima: {data(g.ultima)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* --- Giocatori --- */}
      {sezione === 'giocatori' && (
        <ul className="elenco">
          {filtraNome(perGiocatore()).map((g) => (
            <li key={g.nome}>
              <span className="pallino" style={{ background: g.colore }} aria-hidden="true" />
              <div className="nome-giocatore">
                <button className="nome-cliccabile" onClick={() => onApri?.('persona', g.chiave)}>
                  {g.nome}
                </button>
                {g.ospite && <span className="anno"> ospite</span>}
              </div>
              <span className="anno">
                {g.partite} insieme · {g.vittorie} vinte
              </span>
            </li>
          ))}
          {perGiocatore().length === 0 && (
            <p className="aiuto">Per ora hai giocato solo da solo.</p>
          )}
        </ul>
      )}

      {/* --- Luoghi --- */}
      {sezione === 'luoghi' && (
        <ul className="elenco">
          {filtraNome(perLuogo()).map((l) => (
            <li key={l.nome}>
              <div className="nome-giocatore">
                <button className="nome-cliccabile" onClick={() => onApri?.('luogo', l.id)}>
                  {l.nome}
                </button>
                <span className="anno block">ultima: {data(l.ultima)}</span>
              </div>
              <span className="anno">{l.partite}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
