// Primo Giocatore - registrazione e modifica partita
// v1.8.1 - 202609151030

import { useEffect, useRef, useState } from 'react'
import { supabase, COLORI } from './supabase'

function mmss(secondi) {
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// "2026-09-14T21:30" per il campo data/ora del browser.
function perCampo(d) {
  const x = new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`
}

export default function Partita({ profilo, partitaId, finitaModifica }) {
  const modifica = Boolean(partitaId)

  const [catalogo, setCatalogo] = useState([])
  const [persone, setPersone] = useState([])
  const [ospiti, setOspiti] = useState([])

  const [gioco, setGioco] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [righe, setRighe] = useState([])
  const [luogo, setLuogo] = useState('')
  const [note, setNote] = useState('')
  const [esitoCoop, setEsitoCoop] = useState('vinta')
  const [quando, setQuando] = useState(perCampo(new Date()))
  const [minuti, setMinuti] = useState('')
  const [vincitoreScelto, setVincitoreScelto] = useState(null)

  const [secondi, setSecondi] = useState(0)
  const [inCorso, setInCorso] = useState(false)
  const tick = useRef(null)

  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [caricamento, setCaricamento] = useState(modifica)

  useEffect(() => { caricaElenchi() }, [])
  useEffect(() => { if (partitaId) caricaPartita(partitaId) }, [partitaId])

  useEffect(() => {
    if (inCorso) tick.current = setInterval(() => setSecondi((s) => s + 1), 1000)
    else if (tick.current) clearInterval(tick.current)
    return () => tick.current && clearInterval(tick.current)
  }, [inCorso])

  // Il timer alimenta il campo dei minuti, che resta comunque scrivibile.
  useEffect(() => {
    if (secondi > 0) setMinuti(String(Math.max(1, Math.round(secondi / 60))))
  }, [secondi])

  async function caricaElenchi() {
    const [g, p, o] = await Promise.all([
      supabase.from('giochi').select('*').order('nome'),
      supabase.from('profili').select('id, nome, nickname, colore').order('nome'),
      supabase.from('ospiti').select('id, nome').order('nome'),
    ])
    if (g.data) setCatalogo(g.data)
    if (p.data) setPersone(p.data)
    if (o.data) setOspiti(o.data)
  }

  async function caricaPartita(id) {
    setCaricamento(true)
    const { data, error } = await supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop,
        giochi ( * ), luoghi ( nome ),
        partecipazioni (
          id, utente_id, ospite_id, punteggio_totale, posizione, vincitore, ruolo, spareggio,
          profili:utente_id ( nome ), ospiti:ospite_id ( nome )
        )
      `)
      .eq('id', id)
      .single()

    if (error) { setErrore(error.message); setCaricamento(false); return }

    setGioco(data.giochi)
    setLuogo(data.luoghi?.nome || '')
    setNote(data.note || '')
    setQuando(perCampo(data.giocata_il))
    setMinuti(data.durata_minuti ? String(data.durata_minuti) : '')
    setEsitoCoop(data.esito_coop || 'vinta')
    setRighe(
      (data.partecipazioni || []).map((p) => ({
        chiave: p.utente_id ? `u-${p.utente_id}` : `o-${p.ospite_id}`,
        utente_id: p.utente_id || undefined,
        ospite_id: p.ospite_id || undefined,
        nome: p.profili?.nome || p.ospiti?.nome || 'Sconosciuto',
        punteggio: p.punteggio_totale == null ? '' : String(p.punteggio_totale),
        posizione: p.posizione == null ? '' : String(p.posizione),
        spareggio: p.spareggio == null ? '' : String(p.spareggio),
        ruolo: p.ruolo || '',
        primo: false,
      }))
    )
    setCaricamento(false)
  }

  function scegliGioco(g) {
    setGioco(g)
    setFiltro('')
    setErrore('')
    if (righe.length === 0) {
      setRighe([{ chiave: `u-${profilo.id}`, utente_id: profilo.id, nome: profilo.nome, punteggio: '', posizione: '', spareggio: '', ruolo: '', primo: false }])
    }
  }

  function aggiungiPersona(p) {
    if (righe.some((r) => r.utente_id === p.id)) return
    setRighe([...righe, { chiave: `u-${p.id}`, utente_id: p.id, nome: p.nome, punteggio: '', posizione: '', spareggio: '', ruolo: '', primo: false }])
  }

  function aggiungiOspite(o) {
    if (righe.some((r) => r.ospite_id === o.id)) return
    setRighe([...righe, { chiave: `o-${o.id}`, ospite_id: o.id, nome: o.nome, punteggio: '', posizione: '', spareggio: '', ruolo: '', primo: false }])
  }

  const [nuovoOspite, setNuovoOspite] = useState('')

  async function creaOspite() {
    const nome = nuovoOspite.trim()
    if (!nome) return
    const { data, error } = await supabase
      .from('ospiti').insert({ nome, creato_da: profilo.id }).select().single()
    if (error) { setErrore(error.message); return }
    setOspiti([...ospiti, data])
    aggiungiOspite(data)
    setNuovoOspite('')
  }

  const cambia = (chiave, campo, valore) =>
    setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, [campo]: valore } : r)))

  const togli = (chiave) => setRighe((rs) => rs.filter((r) => r.chiave !== chiave))

  const tipo = gioco?.tipo_punteggio || 'punti'

  // Ordine: prima il punteggio, poi il valore di spareggio, poi la
  // scelta fatta a mano. Chi resta davvero pari condivide la posizione.
  function classifica() {
    if (tipo === 'coop') return righe.map((r) => ({ ...r, pos: null }))

    const punti = (r) =>
      tipo === 'posizione' ? (r.posizione === '' ? Infinity : Number(r.posizione))
                           : (r.punteggio === '' ? -Infinity : Number(r.punteggio))
    const spar = (r) => (r.spareggio === '' || r.spareggio == null ? null : Number(r.spareggio))

    const confronta = (a, b) => {
      const pa = punti(a), pb = punti(b)
      if (pa !== pb) return tipo === 'posizione' ? pa - pb : pb - pa
      const sa = spar(a), sb = spar(b)
      if (sa != null && sb != null && sa !== sb) return sb - sa
      // scelto a mano: davanti a tutti i suoi pari merito
      if (vincitoreScelto === a.chiave) return -1
      if (vincitoreScelto === b.chiave) return 1
      return 0
    }

    const ordinate = [...righe].sort(confronta)

    let ultimaPos = 0
    return ordinate.map((r, i) => {
      const v = punti(r)
      if (v === -Infinity || v === Infinity) return { ...r, pos: null }
      // pari merito solo se il confronto non ha saputo separarli
      if (i > 0 && confronta(ordinate[i - 1], r) === 0) return { ...r, pos: ultimaPos }
      ultimaPos = i + 1
      return { ...r, pos: ultimaPos }
    })
  }

  const ordinata = classifica()

  // Chi è a pari punteggio col migliore: sono loro a doversi spareggiare.
  const migliore = ordinata.find((r) => r.pos != null)
  const contendenti = migliore
    ? ordinata.filter((r) => r.punteggio !== '' && r.punteggio === migliore.punteggio)
    : []
  const pareggio = contendenti.length > 1 && tipo !== 'coop'
  const mostraScelta = (r) => pareggio && contendenti.some((c) => c.chiave === r.chiave)

  const inTesta = ordinata.filter((r) => r.pos === 1)
  const vincitori = pareggio && !vincitoreScelto ? [] : inTesta.map((r) => r.chiave)

  function azzera() {
    setGioco(null); setRighe([]); setNote(''); setLuogo('')
    setSecondi(0); setInCorso(false); setMinuti('')
    setQuando(perCampo(new Date())); setVincitoreScelto(null)
  }

  async function salva() {
    setErrore(''); setMessaggio('')
    if (!gioco) { setErrore('Scegli prima il gioco.'); return }
    if (righe.length < 1) { setErrore('Aggiungi almeno un giocatore.'); return }

    setSalvando(true)
    try {
      let luogoId = null
      if (luogo.trim()) {
        const { data: esistente } = await supabase
          .from('luoghi').select('id').ilike('nome', luogo.trim()).maybeSingle()
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

      const campi = {
        gioco_id: gioco.id,
        luogo_id: luogoId,
        giocata_il: new Date(quando).toISOString(),
        durata_minuti: minuti ? Number(minuti) : null,
        tipo_punteggio: tipo,
        esito_coop: tipo === 'coop' ? esitoCoop : null,
        note: note.trim() || null,
      }

      let id = partitaId
      if (modifica) {
        const { error } = await supabase.from('partite').update(campi).eq('id', id)
        if (error) throw error
        // Le partecipazioni si riscrivono da zero: più semplice e più
        // sicuro che inseguire chi è stato aggiunto o tolto.
        const { error: e0 } = await supabase.from('partecipazioni').delete().eq('partita_id', id)
        if (e0) throw e0
      } else {
        const { data, error } = await supabase
          .from('partite')
          .insert({ ...campi, registrata_da: profilo.id })
          .select().single()
        if (error) throw error
        id = data.id
      }

      const partecipazioni = ordinata.map((r) => ({
        partita_id: id,
        utente_id: r.utente_id || null,
        ospite_id: r.ospite_id || null,
        ruolo: r.ruolo?.trim() || null,
        punteggio_totale: r.punteggio === '' ? null : Number(r.punteggio),
        spareggio: r.spareggio === '' ? null : Number(r.spareggio),
        posizione: tipo === 'coop' ? null : r.pos,
        vincitore: tipo === 'coop' ? esitoCoop === 'vinta' : vincitori.includes(r.chiave),
        primo_giocatore: Boolean(r.primo),
      }))
      const { error: e2 } = await supabase.from('partecipazioni').insert(partecipazioni)
      if (e2) throw e2

      if (modifica) {
        setMessaggio('Partita aggiornata.')
        finitaModifica?.()
      } else {
        setMessaggio('Partita registrata.')
        azzera()
      }
    } catch (e) {
      setErrore(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const trovati = filtro.trim().length > 0
    ? catalogo.filter((g) => g.nome.toLowerCase().includes(filtro.toLowerCase())).slice(0, 8)
    : []

  const coloreDi = (r) => {
    const p = persone.find((x) => x.id === r.utente_id)
    return COLORI.find((c) => c.id === p?.colore)?.hex || '#C9D1D8'
  }

  if (caricamento) return <div className="scheda"><p>Carico la partita&hellip;</p></div>

  return (
    <div className="scheda">
      <h2>{modifica ? 'Modifica partita' : 'Nuova partita'}</h2>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {!gioco ? (
        <>
          <div className="campo">
            <label htmlFor="f-gioco">A che giochiamo?</label>
            <input id="f-gioco" value={filtro} onChange={(e) => setFiltro(e.target.value)}
              placeholder="Scrivi le prime lettere" />
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

          <div className="campo">
            <label htmlFor="quando">Quando</label>
            <input id="quando" type="datetime-local" value={quando}
              onChange={(e) => setQuando(e.target.value)} />
          </div>

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

          <div className="campo campo-minuti">
            <label htmlFor="minuti">Durata in minuti</label>
            <input id="minuti" type="number" min="1" className="mini" value={minuti}
              onChange={(e) => setMinuti(e.target.value)} placeholder="—" />
            <p className="aiuto">Il timer la riempie da sé, ma puoi scriverla a mano.</p>
          </div>

          <h3 className="titolo-sezione">Chi ha giocato</h3>

          {righe.length === 0 && <p className="aiuto">Nessun giocatore.</p>}

          <ul className="elenco elenco-giocatori">
            {ordinata.map((r) => {
              const vince = vincitori.includes(r.chiave)
              return (
                <li key={r.chiave} className={vince ? 'vincitore' : ''}>
                  {tipo !== 'coop' && (
                    <span className="posto" aria-hidden="true">{r.pos ? `${r.pos}°` : '–'}</span>
                  )}
                  <span className="pallino" style={{ background: coloreDi(r) }} aria-hidden="true" />
                  <div className="nome-giocatore">
                    <strong>{r.nome}</strong>
                    {r.ospite_id && <span className="anno"> ospite</span>}
                    {vince && <span className="etichetta-vince">vince</span>}
                  </div>

                  {tipo !== 'coop' && (
                    <input
                      className="mini" type="number" inputMode="numeric"
                      aria-label={`Punteggio di ${r.nome}`}
                      placeholder={tipo === 'posizione' ? 'pos.' : 'punti'}
                      value={tipo === 'posizione' ? r.posizione : r.punteggio}
                      onChange={(e) =>
                        cambia(r.chiave, tipo === 'posizione' ? 'posizione' : 'punteggio', e.target.value)
                      }
                    />
                  )}

                  {mostraScelta(r) && (
                    <button
                      className={`bottone-piatto scegli-vincitore${vincitoreScelto === r.chiave ? ' scelto' : ''}`}
                      onClick={() =>
                        setVincitoreScelto(vincitoreScelto === r.chiave ? null : r.chiave)
                      }
                    >
                      {vincitoreScelto === r.chiave ? 'ha vinto ✓' : 'ha vinto'}
                    </button>
                  )}

                  <button className="bottone-piatto" onClick={() => togli(r.chiave)}
                    aria-label={`Togli ${r.nome}`}>×</button>
                </li>
              )
            })}
          </ul>

          {pareggio && (
            <p className="aiuto avviso-pareggio">
              Pareggio in testa: tocca «ha vinto» accanto a chi ha prevalso
              secondo lo spareggio del gioco. L'altro scala al secondo posto.
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
              {persone.filter((p) => !righe.some((r) => r.utente_id === p.id)).map((p) => (
                <button key={p.id} className="pastiglia-nome" onClick={() => aggiungiPersona(p)}>
                  {p.nome}
                </button>
              ))}
              {ospiti.filter((o) => !righe.some((r) => r.ospite_id === o.id)).map((o) => (
                <button key={o.id} className="pastiglia-nome ospite" onClick={() => aggiungiOspite(o)}>
                  {o.nome}
                </button>
              ))}
            </div>
            <div className="riga-ricerca riga-ospite">
              <input value={nuovoOspite} onChange={(e) => setNuovoOspite(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && creaOspite()}
                placeholder="Nome di chi non ha l'account" />
              <button className="bottone bottone-stretto" onClick={creaOspite}>+</button>
            </div>
            <p className="aiuto">Se un ospite un giorno si iscrive, le sue partite lo seguono.</p>
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
            {salvando ? 'Salvo…' : modifica ? 'Salva modifiche' : 'Registra partita'}
          </button>

          {modifica && (
            <button className="bottone bottone-secondario" onClick={() => finitaModifica?.()}>
              Annulla
            </button>
          )}
        </>
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
