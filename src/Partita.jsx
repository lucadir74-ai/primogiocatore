// Primo Giocatore - registrazione partita
// v1.4.0 - 202609142000

import { useEffect, useRef, useState } from 'react'
import { supabase, COLORI } from './supabase'

function mmss(secondi) {
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Partita({ profilo }) {
  const [catalogo, setCatalogo] = useState([])
  const [persone, setPersone] = useState([])
  const [ospiti, setOspiti] = useState([])
  const [ultime, setUltime] = useState([])

  const [gioco, setGioco] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [righe, setRighe] = useState([])   // i giocatori di questa partita
  const [luogo, setLuogo] = useState('')
  const [note, setNote] = useState('')
  const [esitoCoop, setEsitoCoop] = useState('vinta')

  const [secondi, setSecondi] = useState(0)
  const [inCorso, setInCorso] = useState(false)
  const tick = useRef(null)

  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { caricaTutto() }, [])

  useEffect(() => {
    if (inCorso) {
      tick.current = setInterval(() => setSecondi((s) => s + 1), 1000)
    } else if (tick.current) {
      clearInterval(tick.current)
    }
    return () => tick.current && clearInterval(tick.current)
  }, [inCorso])

  async function caricaTutto() {
    const [g, p, o, u] = await Promise.all([
      supabase.from('giochi').select('*').order('nome'),
      supabase.from('profili').select('id, nome, nickname, colore').order('nome'),
      supabase.from('ospiti').select('id, nome').order('nome'),
      supabase
        .from('partite')
        .select('id, giocata_il, durata_minuti, giochi(nome), partecipazioni(id, vincitore, punteggio_totale, utente_id, ospite_id)')
        .order('giocata_il', { ascending: false })
        .limit(10),
    ])
    if (g.data) setCatalogo(g.data)
    if (p.data) setPersone(p.data)
    if (o.data) setOspiti(o.data)
    if (u.data) setUltime(u.data)
  }

  function scegliGioco(g) {
    setGioco(g)
    setFiltro('')
    setErrore('')
    // Chi registra la partita di solito c'era: lo metto già dentro.
    if (righe.length === 0) {
      setRighe([{ chiave: `u-${profilo.id}`, utente_id: profilo.id, nome: profilo.nome, punteggio: '', posizione: '', vincitore: false, primo: false, ruolo: '' }])
    }
  }

  function aggiungiPersona(p) {
    if (righe.some((r) => r.utente_id === p.id)) return
    setRighe([...righe, { chiave: `u-${p.id}`, utente_id: p.id, nome: p.nome, punteggio: '', posizione: '', vincitore: false, primo: false, ruolo: '' }])
  }

  function aggiungiOspite(o) {
    if (righe.some((r) => r.ospite_id === o.id)) return
    setRighe([...righe, { chiave: `o-${o.id}`, ospite_id: o.id, nome: o.nome, punteggio: '', posizione: '', vincitore: false, primo: false, ruolo: '' }])
  }

  async function creaOspite() {
    const nome = prompt('Nome del giocatore senza account:')
    if (!nome?.trim()) return
    const { data, error } = await supabase
      .from('ospiti')
      .insert({ nome: nome.trim(), creato_da: profilo.id })
      .select()
      .single()
    if (error) { setErrore(error.message); return }
    setOspiti([...ospiti, data])
    aggiungiOspite(data)
  }

  function modifica(chiave, campo, valore) {
    setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, [campo]: valore } : r)))
  }

  function togli(chiave) {
    setRighe((rs) => rs.filter((r) => r.chiave !== chiave))
  }

  // Chi ha vinto lo decide chi registra, ma solo quando serve davvero:
  // in caso di pareggio in testa. Altrimenti è il punteggio a parlare.
  const [vincitoreScelto, setVincitoreScelto] = useState(null)

  async function salva() {
    setErrore('')
    setMessaggio('')
    if (!gioco) { setErrore('Scegli prima il gioco.'); return }
    if (righe.length < 1) { setErrore('Aggiungi almeno un giocatore.'); return }

    setSalvando(true)
    try {
      let luogoId = null
      if (luogo.trim()) {
        const { data: esistente } = await supabase
          .from('luoghi').select('id').eq('nome', luogo.trim()).maybeSingle()
        if (esistente) luogoId = esistente.id
        else {
          const { data, error } = await supabase
            .from('luoghi')
            .insert({ nome: luogo.trim(), tipo: 'altro', creato_da: profilo.id })
            .select().single()
          if (error) throw error
          luogoId = data.id
        }
      }

      const tipo = gioco.tipo_punteggio || 'punti'

      const { data: partita, error: e1 } = await supabase
        .from('partite')
        .insert({
          gioco_id: gioco.id,
          luogo_id: luogoId,
          durata_minuti: secondi > 0 ? Math.max(1, Math.round(secondi / 60)) : null,
          tipo_punteggio: tipo,
          esito_coop: tipo === 'coop' ? esitoCoop : null,
          note: note.trim() || null,
          registrata_da: profilo.id,
        })
        .select().single()
      if (e1) throw e1

      // La posizione viene salvata, non ricalcolata a ogni lettura:
      // gli spareggi cambiano da gioco a gioco.
      const partecipazioni = ordinata.map((r) => ({
        partita_id: partita.id,
        utente_id: r.utente_id || null,
        ospite_id: r.ospite_id || null,
        ruolo: r.ruolo?.trim() || null,
        punteggio_totale: r.punteggio === '' ? null : Number(r.punteggio),
        posizione: tipo === 'coop' ? null : r.pos,
        vincitore: tipo === 'coop' ? esitoCoop === 'vinta' : vincitori.includes(r.chiave),
        primo_giocatore: Boolean(r.primo),
      }))
      const { error: e2 } = await supabase.from('partecipazioni').insert(partecipazioni)
      if (e2) throw e2

      setMessaggio('Partita registrata.')
      setGioco(null)
      setRighe([])
      setVincitoreScelto(null)
      setNote('')
      setSecondi(0)
      setInCorso(false)
      caricaTutto()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const tipo = gioco?.tipo_punteggio || 'punti'

  // Classifica ricalcolata a ogni battuta. I pari merito prendono la
  // stessa posizione, e il successivo salta i posti occupati:
  // 100, 100, 80 dà 1°, 1°, 3°.
  function classifica() {
    if (tipo === 'coop') return righe.map((r) => ({ ...r, pos: null }))

    const valore = (r) =>
      tipo === 'posizione' ? (r.posizione === '' ? Infinity : Number(r.posizione))
                           : (r.punteggio === '' ? -Infinity : Number(r.punteggio))

    const ordinate = [...righe].sort((a, b) =>
      tipo === 'posizione' ? valore(a) - valore(b) : valore(b) - valore(a)
    )

    let ultimoValore = null
    let ultimaPos = 0
    return ordinate.map((r, i) => {
      const v = valore(r)
      const vuoto = v === -Infinity || v === Infinity
      if (!vuoto && v === ultimoValore) return { ...r, pos: ultimaPos }
      ultimoValore = v
      ultimaPos = i + 1
      return { ...r, pos: vuoto ? null : i + 1 }
    })
  }

  const ordinata = classifica()
  const inTesta = ordinata.filter((r) => r.pos === 1)
  const pareggio = inTesta.length > 1
  const vincitori = pareggio
    ? (vincitoreScelto ? [vincitoreScelto] : [])
    : inTesta.map((r) => r.chiave)

  const trovati = filtro.trim().length > 0
    ? catalogo.filter((g) => g.nome.toLowerCase().includes(filtro.toLowerCase())).slice(0, 8)
    : []
  const coloreDi = (r) => {
    const p = persone.find((x) => x.id === r.utente_id)
    return COLORI.find((c) => c.id === p?.colore)?.hex || '#C9D1D8'
  }

  return (
    <div className="scheda">
      <h2>Nuova partita</h2>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {/* --- Gioco --- */}
      {!gioco ? (
        <>
          <div className="campo">
            <label htmlFor="f-gioco">A cosa avete giocato?</label>
            <input
              id="f-gioco"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Scrivi le prime lettere"
            />
          </div>
          {trovati.length > 0 && (
            <ul className="elenco">
              {trovati.map((g) => (
                <li key={g.id}>
                  <span>{g.nome}</span>
                  <button className="bottone-piatto" onClick={() => scegliGioco(g)}>Scegli</button>
                </li>
              ))}
            </ul>
          )}
          {catalogo.length === 0 && (
            <p className="aiuto">Il catalogo è vuoto: aggiungi prima un gioco dalla scheda Giochi.</p>
          )}
        </>
      ) : (
        <>
          <div className="gioco-scelto">
            {gioco.immagine_url && <img src={gioco.immagine_url} alt="" className="copertina" />}
            <div>
              <strong>{gioco.nome}</strong>
              <p className="aiuto">
                {TIPO_ETICHETTA[tipo]}{' '}
                <button className="bottone-piatto" onClick={() => setGioco(null)}>cambia</button>
              </p>
            </div>
          </div>

          {/* --- Timer --- */}
          <div className="timer">
            <span className="orologio">{mmss(secondi)}</span>
            <button className="bottone bottone-stretto" onClick={() => setInCorso(!inCorso)}>
              {inCorso ? 'Pausa' : secondi > 0 ? 'Riprendi' : 'Avvia'}
            </button>
            {secondi > 0 && (
              <button className="bottone-piatto" onClick={() => { setSecondi(0); setInCorso(false) }}>
                azzera
              </button>
            )}
          </div>
          <p className="aiuto">Se te ne dimentichi, la durata si può lasciare vuota.</p>

          {/* --- Giocatori --- */}
          <h3 className="titolo-sezione">Chi ha giocato</h3>

          {righe.length === 0 && <p className="aiuto">Nessun giocatore.</p>}

          <ul className="elenco elenco-giocatori">
            {ordinata.map((r) => {
              const vince = vincitori.includes(r.chiave)
              return (
                <li key={r.chiave} className={vince ? 'vincitore' : ''}>
                  {tipo !== 'coop' && (
                    <span className="posto" aria-hidden="true">
                      {r.pos ? `${r.pos}°` : '–'}
                    </span>
                  )}
                  <span className="pallino" style={{ background: coloreDi(r) }} aria-hidden="true" />
                  <div className="nome-giocatore">
                    <strong>{r.nome}</strong>
                    {r.ospite_id && <span className="anno"> ospite</span>}
                    {vince && <span className="etichetta-vince">vince</span>}
                  </div>

                  {tipo !== 'coop' && (
                    <input
                      className="mini"
                      type="number"
                      inputMode="numeric"
                      aria-label={`Punteggio di ${r.nome}`}
                      placeholder={tipo === 'posizione' ? 'pos.' : 'punti'}
                      value={tipo === 'posizione' ? r.posizione : r.punteggio}
                      onChange={(e) =>
                        modifica(r.chiave, tipo === 'posizione' ? 'posizione' : 'punteggio', e.target.value)
                      }
                    />
                  )}

                  {pareggio && r.pos === 1 && (
                    <button
                      className={`bottone-piatto scegli-vincitore${vincitoreScelto === r.chiave ? ' scelto' : ''}`}
                      onClick={() => setVincitoreScelto(r.chiave)}
                    >
                      {vincitoreScelto === r.chiave ? 'vince' : 'ha vinto'}
                    </button>
                  )}

                  <button className="bottone-piatto" onClick={() => togli(r.chiave)} aria-label={`Togli ${r.nome}`}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>

          {pareggio && (
            <p className="aiuto avviso-pareggio">
              Pareggio in testa: scegli chi ha vinto secondo lo spareggio del gioco.
            </p>
          )}

          {tipo === 'coop' && (
            <div className="campo">
              <label htmlFor="esito">Com'è andata</label>
              <select id="esito" className="scelta-punteggio larga" value={esitoCoop}
                onChange={(e) => setEsitoCoop(e.target.value)}>
                <option value="vinta">Vinta da tutti</option>
                <option value="persa">Persa da tutti</option>
              </select>
            </div>
          )}

          <div className="campo">
            <label>Aggiungi giocatori</label>
            <div className="pastiglie-persone">
              {persone
                .filter((p) => !righe.some((r) => r.utente_id === p.id))
                .map((p) => (
                  <button key={p.id} className="pastiglia-nome" onClick={() => aggiungiPersona(p)}>
                    {p.nome}
                  </button>
                ))}
              {ospiti
                .filter((o) => !righe.some((r) => r.ospite_id === o.id))
                .map((o) => (
                  <button key={o.id} className="pastiglia-nome ospite" onClick={() => aggiungiOspite(o)}>
                    {o.nome}
                  </button>
                ))}
              <button className="pastiglia-nome nuovo" onClick={creaOspite}>+ ospite</button>
            </div>
            <p className="aiuto">
              Gli ospiti sono chi non ha un account. Se un giorno si iscrive, le partite lo seguono.
            </p>
          </div>

          <div className="campo">
            <label htmlFor="luogo">Dove</label>
            <input id="luogo" value={luogo} onChange={(e) => setLuogo(e.target.value)}
              placeholder="Casa mia, sede, online…" />
          </div>

          <div className="campo">
            <label htmlFor="note">Note</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Espansioni, varianti, aneddoti" />
          </div>

          <button className="bottone" onClick={salva} disabled={salvando}>
            {salvando ? 'Salvo…' : 'Registra partita'}
          </button>
        </>
      )}

      {/* --- Ultime partite --- */}
      <h3 className="titolo-sezione">
        Ultime partite <span className="conteggio">{ultime.length}</span>
      </h3>
      {ultime.length === 0 ? (
        <p className="aiuto">Ancora nessuna partita registrata.</p>
      ) : (
        <ul className="elenco">
          {ultime.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.giochi?.nome || 'Gioco'}</strong>
                <span className="anno">
                  {' '}
                  {new Date(p.giocata_il).toLocaleDateString('it-IT')}
                  {p.durata_minuti ? ` · ${p.durata_minuti} min` : ''}
                </span>
              </div>
              <span className="anno">{p.partecipazioni?.length || 0} giocatori</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const TIPO_ETICHETTA = {
  punti: 'Si segnano i punti.',
  categorie: 'Punti divisi per voce.',
  coop: 'Cooperativo: si vince o si perde insieme.',
  posizione: 'Conta solo il piazzamento.',
  obiettivo: 'Vince chi completa il proprio obiettivo.',
}
