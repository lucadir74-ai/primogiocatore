// Primo Giocatore - registrazione e modifica partita
// v4.3.0 - 202609221700

import { useEffect, useRef, useState } from 'react'
import { supabase, COLORI, daMostrare, tutteLeRighe } from './supabase'
import { impronta } from './impronta'
import { accodaPartita, leggiCoda, inviaCoda, eProblemaDiRete, scriviPartita } from './coda'

// La partita in corso resta sul telefono finché non la salvi: se chiudi
// la pagina o cade la linea, la ritrovi com'era.
const BOZZA = 'primo-giocatore:bozza'
const LIMITE_NOMI = 12

function leggiBozza() {
  try {
    const grezzo = localStorage.getItem(BOZZA)
    return grezzo ? JSON.parse(grezzo) : null
  } catch { return null }
}

function scriviBozza(dati) {
  try { localStorage.setItem(BOZZA, JSON.stringify(dati)) } catch { /* spazio pieno */ }
}

function cancellaBozza() {
  try { localStorage.removeItem(BOZZA) } catch { /* niente da fare */ }
}

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
  // Istante in cui il timer è stato avviato e secondi già accumulati
  // prima dell'ultima pausa: insieme sopravvivono alla chiusura.
  const [avviatoIl, setAvviatoIl] = useState(null)
  const [accumulati, setAccumulati] = useState(0)
  const tick = useRef(null)
  const bozzaLetta = useRef(false)

  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [caricamento, setCaricamento] = useState(modifica)
  const [inCoda, setInCoda] = useState(() => leggiCoda().length)
  const [inviando, setInviando] = useState(false)
  const [ripresa, setRipresa] = useState(false)

  useEffect(() => { caricaElenchi() }, [])

  // Appena la rete torna, le partite in attesa partono da sole.
  useEffect(() => {
    async function svuota() {
      if (leggiCoda().length === 0 || inviando) return
      setInviando(true)
      try {
        const esito = await inviaCoda(supabase, profilo)
        setInCoda(esito.rimaste)
        if (esito.inviate > 0) {
          setMessaggio(
            esito.inviate === 1
              ? 'La partita in attesa è stata salvata.'
              : `${esito.inviate} partite in attesa sono state salvate.`
          )
        }
        if (esito.scartate.length) {
          setErrore(`${esito.scartate.length} partite in attesa sono state rifiutate: ${esito.scartate[0].motivo}`)
        }
      } catch (e) {
        setErrore(e.message)
      } finally {
        setInviando(false)
      }
    }
    svuota()
    window.addEventListener('online', svuota)
    return () => window.removeEventListener('online', svuota)
  }, [])
  useEffect(() => { if (partitaId) caricaPartita(partitaId) }, [partitaId])

  // Al primo avvio: se c'è una partita lasciata a metà, la rimetto com'era.
  useEffect(() => {
    if (modifica || bozzaLetta.current) return
    bozzaLetta.current = true
    const b = leggiBozza()
    if (!b) return
    if (b.gioco) setGioco(b.gioco)
    if (b.righe) setRighe(b.righe)
    if (b.luogo) setLuogo(b.luogo)
    if (b.note) setNote(b.note)
    if (b.quando) setQuando(b.quando)
    if (b.minuti) setMinuti(b.minuti)
    if (b.esitoCoop) setEsitoCoop(b.esitoCoop)
    if (b.vincitoreScelto) setVincitoreScelto(b.vincitoreScelto)
    setAccumulati(b.accumulati || 0)
    setAvviatoIl(b.avviatoIl || null)
    setInCorso(Boolean(b.avviatoIl))
    setRipresa(true)
  }, [modifica])

  // Ogni cambiamento viene messo da parte.
  useEffect(() => {
    if (modifica || !bozzaLetta.current) return
    if (!gioco && righe.length === 0 && !accumulati && !avviatoIl) { cancellaBozza(); return }
    scriviBozza({
      gioco, righe, luogo, note, quando, minuti, esitoCoop, vincitoreScelto,
      accumulati, avviatoIl,
    })
  }, [gioco, righe, luogo, note, quando, minuti, esitoCoop, vincitoreScelto, accumulati, avviatoIl, modifica])

  useEffect(() => {
    function aggiorna() {
      setSecondi(accumulati + (avviatoIl ? Math.floor((Date.now() - avviatoIl) / 1000) : 0))
    }
    aggiorna()
    if (inCorso) tick.current = setInterval(aggiorna, 1000)
    else if (tick.current) clearInterval(tick.current)
    return () => tick.current && clearInterval(tick.current)
  }, [inCorso, avviatoIl, accumulati])

  function avviaOFerma() {
    if (inCorso) {
      setAccumulati(accumulati + Math.floor((Date.now() - avviatoIl) / 1000))
      setAvviatoIl(null)
      setInCorso(false)
    } else {
      setAvviatoIl(Date.now())
      setInCorso(true)
    }
  }

  function azzeraTimer() {
    setAvviatoIl(null); setAccumulati(0); setSecondi(0); setInCorso(false)
  }

  // Il timer alimenta il campo dei minuti, che resta comunque scrivibile.
  useEffect(() => {
    if (secondi > 0) setMinuti(String(Math.max(1, Math.round(secondi / 60))))
  }, [secondi])

  async function caricaElenchi() {
    const [g, p, o, f, l, c] = await Promise.all([
      tutteLeRighe(() => supabase.from('giochi').select('*').order('nome')),
      tutteLeRighe(() => supabase.from('profili').select('id, nome, nickname, colore').order('nome')),
      tutteLeRighe(() => supabase.from('ospiti').select('id, nome').order('nome')),
      tutteLeRighe(() => supabase.from('partecipazioni').select('utente_id, ospite_id')),
      tutteLeRighe(() => supabase.from('luoghi').select('nome').order('nome')),
      tutteLeRighe(() => supabase.from('collezioni').select('gioco_id').eq('utente_id', profilo.id)),
    ])
    setCatalogo(g)
    setPersone(p)
    setOspiti(o)
    setLuoghiNoti(l.map((x) => x.nome))
    setMiaCollezione(new Set(c.map((x) => x.gioco_id)))

    // Quante partite ha ciascuno: i soliti compagni vanno davanti,
    // altrimenti con qualche centinaio di nomi l'elenco è inservibile.
    {
      const c = new Map()
      for (const r of f) {
        const k = r.utente_id ? `u-${r.utente_id}` : `o-${r.ospite_id}`
        c.set(k, (c.get(k) || 0) + 1)
      }
      setFrequenza(c)
    }
  }

  async function caricaPartita(id) {
    setCaricamento(true)
    const { data, error } = await supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop,
        giochi ( * ), luoghi ( nome ),
        partecipazioni (
          id, utente_id, ospite_id, punteggio_totale, posizione, vincitore, ruolo, spareggio, ordine_turno,
          profili:utente_id ( nome, nickname ), ospiti:ospite_id ( nome )
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
        nome: p.profili ? daMostrare(p.profili) : (p.ospiti?.nome || 'Sconosciuto'),
        punteggio: p.punteggio_totale == null ? '' : String(p.punteggio_totale),
        posizione: p.posizione == null ? '' : String(p.posizione),
        spareggio: p.spareggio == null ? '' : String(p.spareggio),
        ruolo: p.ruolo || '',
        ordine: p.ordine_turno ?? null,
      }))
    )
    setCaricamento(false)
  }

  // Il gioco non è in catalogo: lo si cerca su BGG e si aggiunge senza
  // uscire da qui. Prima si guarda sempre in catalogo, che è immediato.
  async function cercaSuBgg() {
    if (filtro.trim().length < 2) return
    setErrore(''); setCercandoBgg(true); setSuBgg(null)
    try {
      const r = await fetch(`/api/bgg?azione=cerca&q=${encodeURIComponent(filtro.trim())}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Ricerca non riuscita.')
      setSuBgg({ righe: dati.risultati.slice(0, 40), totale: dati.risultati.length })
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercandoBgg(false)
    }
  }

  async function aggiungiDaBgg(bggId) {
    setErrore('')
    try {
      const r = await fetch(`/api/bgg?azione=dettagli&id=${bggId}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Non sono riuscito a leggere il gioco.')
      const g = dati.giochi[0]
      if (!g) throw new Error('BGG non ha restituito il gioco.')

      const { data, error } = await supabase.from('giochi').upsert({
        bgg_id: g.bgg_id, nome: g.nome, anno: g.anno,
        min_giocatori: g.min_giocatori, max_giocatori: g.max_giocatori,
        durata_minuti: g.durata_minuti, immagine_url: g.immagine_url,
        immagine_grande: g.immagine_grande,
        creato_da: profilo.id,
      }, { onConflict: 'bgg_id' }).select().single()
      if (error) throw error

      setCatalogo((c) => [...c.filter((x) => x.id !== data.id), data])
      setSuBgg(null)
      scegliGioco(data)
    } catch (e) {
      setErrore(e.message)
    }
  }

  // Posseduto o no: si segna da qui, senza passare dal catalogo.
  async function cambiaPossesso(giocoId, posseduto) {
    setErrore('')
    if (posseduto) {
      const { error } = await supabase.from('collezioni')
        .upsert({ utente_id: profilo.id, gioco_id: giocoId, origine: 'manuale' })
      if (error) { setErrore(error.message); return }
      setMiaCollezione((s) => new Set([...s, giocoId]))
    } else {
      const { error } = await supabase.from('collezioni').delete()
        .eq('utente_id', profilo.id).eq('gioco_id', giocoId)
      if (error) { setErrore(error.message); return }
      setMiaCollezione((s) => new Set([...s].filter((x) => x !== giocoId)))
    }
  }

  function scegliGioco(g) {
    setGioco(g)
    setFiltro('')
    setErrore('')
    if (righe.length === 0) {
      setRighe([{ chiave: `u-${profilo.id}`, utente_id: profilo.id, nome: daMostrare(profilo), punteggio: '', posizione: '', spareggio: '', ruolo: '', ordine: null }])
    }
  }

  function aggiungiPersona(p) {
    if (righe.some((r) => r.utente_id === p.id)) return
    setRighe([...righe, { chiave: `u-${p.id}`, utente_id: p.id, nome: daMostrare(p), punteggio: '', posizione: '', spareggio: '', ruolo: '', ordine: null }])
  }

  function aggiungiOspite(o) {
    if (righe.some((r) => r.ospite_id === o.id)) return
    setRighe([...righe, { chiave: `o-${o.id}`, ospite_id: o.id, nome: o.nome, punteggio: '', posizione: '', spareggio: '', ruolo: '', ordine: null }])
  }

  const [nuovoOspite, setNuovoOspite] = useState('')
  const [frequenza, setFrequenza] = useState(new Map())
  const [luoghiNoti, setLuoghiNoti] = useState([])
  const [miaCollezione, setMiaCollezione] = useState(new Set())
  const [suBgg, setSuBgg] = useState(null)      // risultati della ricerca su BGG
  const [cercandoBgg, setCercandoBgg] = useState(false)
  const [cercaGiocatore, setCercaGiocatore] = useState('')
  const [fazioniNote, setFazioniNote] = useState([])
  const [segnandoOrdine, setSegnandoOrdine] = useState(false)

  // I suggerimenti nascono dall'uso: le fazioni già scritte in altre
  // partite a questo gioco. Nessun elenco da compilare a mano.
  useEffect(() => {
    if (!gioco?.usa_fazioni) { setFazioniNote([]); return }
    let vivo = true
    supabase
      .from('partecipazioni')
      .select('ruolo, partite!inner(gioco_id)')
      .eq('partite.gioco_id', gioco.id)
      .not('ruolo', 'is', null)
      .then(({ data }) => {
        if (!vivo || !data) return
        setFazioniNote([...new Set(data.map((r) => r.ruolo).filter(Boolean))].sort())
      })
    return () => { vivo = false }
  }, [gioco?.id, gioco?.usa_fazioni])

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

  // Si tocca nell'ordine in cui si è giocato: 1 a chi ha iniziato.
  // Ritoccare un numero già dato lo toglie e ricompatta gli altri.
  function segnaOrdine(chiave) {
    setRighe((rs) => {
      const r = rs.find((x) => x.chiave === chiave)
      if (r?.ordine != null) {
        const tolto = r.ordine
        return rs.map((x) =>
          x.chiave === chiave ? { ...x, ordine: null }
          : x.ordine != null && x.ordine > tolto ? { ...x, ordine: x.ordine - 1 }
          : x
        )
      }
      const prossimo = Math.max(0, ...rs.map((x) => x.ordine || 0)) + 1
      return rs.map((x) => (x.chiave === chiave ? { ...x, ordine: prossimo } : x))
    })
  }

  const azzeraOrdine = () => setRighe((rs) => rs.map((x) => ({ ...x, ordine: null })))

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
      // vittoria condivisa: restano pari merito
      if (vincitoreScelto === 'condivisa') return 0
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
  const condivisa = vincitoreScelto === 'condivisa'
  const vincitori = condivisa
    ? contendenti.map((r) => r.chiave)
    : pareggio && !vincitoreScelto
      ? []
      : inTesta.map((r) => r.chiave)

  function azzera() {
    setGioco(null); setRighe([]); setNote(''); setLuogo('')
    setMinuti(''); setQuando(perCampo(new Date())); setVincitoreScelto(null)
    setRipresa(false)
    setCercaGiocatore('')
    azzeraTimer()
    cancellaBozza()
  }

  async function salva() {
    setErrore(''); setMessaggio('')
    if (!gioco) { setErrore('Scegli prima il gioco.'); return }
    if (righe.length < 1) { setErrore('Aggiungi almeno un giocatore.'); return }

    setSalvando(true)
    try {
      // La posizione viene salvata, non ricalcolata a ogni lettura:
      // gli spareggi cambiano da gioco a gioco.
      const dati = {
        partita_id: partitaId || null,
        gioco_id: gioco.id,
        luogo,
        giocata_il: new Date(quando).toISOString(),
        durata_minuti: minuti ? Number(minuti) : null,
        tipo_punteggio: tipo,
        esito_coop: tipo === 'coop' ? esitoCoop : null,
        note: note.trim() || null,
        giocatori: ordinata.map((r) => ({
          utente_id: r.utente_id || null,
          ospite_id: r.ospite_id || null,
          ruolo: r.ruolo?.trim() || null,
          punteggio_totale: r.punteggio === '' ? null : Number(r.punteggio),
          spareggio: r.spareggio === '' ? null : Number(r.spareggio),
          posizione: tipo === 'coop' ? null : r.pos,
          vincitore: tipo === 'coop' ? esitoCoop === 'vinta' : vincitori.includes(r.chiave),
          ordine_turno: r.ordine ?? null,
          primo_giocatore: r.ordine === 1,
        })),
      }

      try {
        await scriviPartita(supabase, profilo, dati)
        if (modifica) {
          setMessaggio('Partita aggiornata.')
          finitaModifica?.()
        } else {
          setMessaggio('Partita registrata.')
          azzera()
        }
      } catch (e) {
        // Senza rete la partita resta sul telefono e parte da sola
        // appena la linea torna. Una modifica invece richiede la rete:
        // rifarla a mano su dati vecchi creerebbe più danni.
        if (!eProblemaDiRete(e) || modifica) throw e
        const quante = accodaPartita(dati)
        setInCoda(quante)
        setMessaggio(
          quante === 1
            ? 'Niente rete: la partita è salvata sul telefono e partirà da sola.'
            : `Niente rete: ${quante} partite in attesa, partiranno da sole.`
        )
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

  // Un elenco solo, utenti e ospiti insieme, ordinato per quanto
  // spesso giocano. Senza filtro se ne mostrano pochi.
  const tuttiDisponibili = [
    ...persone
      .filter((p) => !righe.some((r) => r.utente_id === p.id))
      .map((p) => ({ chiave: `u-${p.id}`, nome: daMostrare(p), tipo: 'utente', dato: p })),
    ...ospiti
      .filter((o) => !righe.some((r) => r.ospite_id === o.id))
      .map((o) => ({ chiave: `o-${o.id}`, nome: o.nome, tipo: 'ospite', dato: o })),
  ].sort((a, b) => (frequenza.get(b.chiave) || 0) - (frequenza.get(a.chiave) || 0))

  const filtroNomi = cercaGiocatore.trim().toLowerCase()
  const trovatiNomi = filtroNomi
    ? tuttiDisponibili.filter((x) => x.nome.toLowerCase().includes(filtroNomi))
    : tuttiDisponibili
  const disponibili = filtroNomi ? trovatiNomi.slice(0, 30) : trovatiNomi.slice(0, LIMITE_NOMI)
  const restanti = Math.max(0, tuttiDisponibili.length - LIMITE_NOMI)

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

      {inCoda > 0 && (
        <div className="avviso errore">
          {inCoda === 1
            ? 'Una partita è in attesa di rete.'
            : `${inCoda} partite sono in attesa di rete.`}{' '}
          {inviando ? 'Le sto inviando…' : 'Partiranno da sole appena torna la linea.'}
        </div>
      )}

      {ripresa && !modifica && (
        <div className="avviso ok">
          Ripresa la partita lasciata a metà.{' '}
          <button className="bottone-piatto" onClick={azzera}>ricomincia da capo</button>
        </div>
      )}

      {!gioco ? (
        <>
          <div className="campo">
            <label htmlFor="f-gioco">A che giochiamo?</label>
            <input
              id="f-gioco"
              value={filtro}
              onChange={(e) => { setFiltro(e.target.value); setSuBgg(null) }}
              onKeyDown={(e) => e.key === 'Enter' && cercaSuBgg()}
              placeholder="Scrivi le prime lettere, poi Invio per cercare su BGG"
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
          {filtro.trim().length >= 2 && (
            <>
              <button className="bottone bottone-secondario" onClick={cercaSuBgg} disabled={cercandoBgg}>
                {cercandoBgg ? 'Cerco su BGG…' : trovati.length
                  ? 'Non è questo? Cerca su BoardGameGeek'
                  : 'Cerca su BoardGameGeek'}
              </button>
              {trovati.length === 0 && !suBgg && !cercandoBgg && (
                <p className="aiuto">Nessun gioco con questo nome fra quelli già registrati.</p>
              )}
            </>
          )}

          {suBgg && (
            <>
              <h3 className="titolo-sezione">
                Su BoardGameGeek <span className="conteggio">{suBgg.totale}</span>
              </h3>
              {suBgg.righe.length === 0 ? (
                <p className="aiuto">Nessun risultato: prova con il titolo originale, di solito in inglese.</p>
              ) : (
                <>
                  <ul className="elenco elenco-scorrevole">
                    {suBgg.righe.map((r) => (
                      <li key={r.bgg_id}>
                        <div className="nome-giocatore">
                          <strong>{r.nome}</strong>
                          {r.anno && <span className="anno"> {r.anno}</span>}
                        </div>
                        <button className="bottone-piatto" onClick={() => aggiungiDaBgg(r.bgg_id)}>
                          Aggiungi
                        </button>
                      </li>
                    ))}
                  </ul>
                  {suBgg.totale > suBgg.righe.length && (
                    <p className="aiuto">
                      Mostrati i primi {suBgg.righe.length} di {suBgg.totale}: scrivi il titolo
                      più preciso e cerca di nuovo.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="gioco-scelto">
            {gioco.immagine_url && <img src={gioco.immagine_url} alt="" className="copertina" />}
            <div>
              <strong>{gioco.nome}</strong>
              {!miaCollezione.has(gioco.id) && (
                <span className="distintivo grigio">Non posseduto</span>
              )}
              <p className="aiuto">
                {TIPO_ETICHETTA[tipo]}{' '}
                <button className="bottone-piatto" onClick={() => setGioco(null)}>cambia</button>
                {' · '}
                <button className="bottone-piatto"
                  onClick={() => cambiaPossesso(gioco.id, !miaCollezione.has(gioco.id))}>
                  {miaCollezione.has(gioco.id) ? 'togli dalla collezione' : 'è mio'}
                </button>
              </p>
            </div>
          </div>

          <div className="campo">
            <label htmlFor="quando">Quando</label>
            <input id="quando" type="datetime-local" value={quando}
              onChange={(e) => setQuando(e.target.value)} />
          </div>

          <div className="campo">
            <label htmlFor="minuti">Durata</label>
            <div className="barra-durata">
              <button
                className={`tasto-timer${inCorso ? ' attivo' : ''}`}
                onClick={avviaOFerma}
                aria-label={inCorso ? 'Ferma il timer' : 'Avvia il timer'}
              >
                {inCorso ? '❚❚' : '▶'}
              </button>
              <span className={`orologio${inCorso ? ' acceso' : ''}`}>{mmss(secondi)}</span>
              {secondi > 0 && (
                <button className="azzera-timer" onClick={azzeraTimer}
                  aria-label="Azzera il timer">↺</button>
              )}
              <span className="separatore-durata" aria-hidden="true" />
              <input id="minuti" type="number" min="1" className="mini minuti" value={minuti}
                onChange={(e) => setMinuti(e.target.value)} placeholder="—" />
              <span className="unita">min</span>
            </div>
          </div>

          {gioco.usa_fazioni && (
            <datalist id="fazioni-note">
              {fazioniNote.map((f) => <option key={f} value={f} />)}
            </datalist>
          )}

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
                  {segnandoOrdine ? (
                    <button
                      className={`tondo-ordine${r.ordine != null ? ' dato' : ''}`}
                      onClick={() => segnaOrdine(r.chiave)}
                      aria-label={r.ordine != null ? `${r.nome} ha giocato ${r.ordine}° di turno` : `Segna ${r.nome}`}
                    >
                      {r.ordine ?? ''}
                    </button>
                  ) : (
                    <span className="pallino" style={{ background: coloreDi(r) }} aria-hidden="true" />
                  )}
                  <div className="nome-giocatore">
                    <strong>{r.nome}</strong>
                    {r.ospite_id && <span className="anno"> ospite</span>}
                    {vince && <span className="etichetta-vince">vince</span>}
                    {!segnandoOrdine && r.ordine != null && (
                      <span className="anno fazione-nota"> · {r.ordine}° di turno</span>
                    )}
                    {gioco.usa_fazioni && (
                      <input
                        className="campo-fazione"
                        list="fazioni-note"
                        value={r.ruolo || ''}
                        onChange={(e) => cambia(r.chiave, 'ruolo', e.target.value)}
                        placeholder="fazione"
                        aria-label={`Fazione di ${r.nome}`}
                      />
                    )}
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

                  {mostraScelta(r) && !condivisa && (
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

          {righe.length > 1 && (
            <div className="riga-ordine">
              <button
                className={`bottone bottone-secondario${segnandoOrdine ? ' attivo' : ''}`}
                onClick={() => setSegnandoOrdine(!segnandoOrdine)}
              >
                {segnandoOrdine ? 'Fatto' : 'Segna l\u2019ordine di turno'}
              </button>
              {segnandoOrdine && righe.some((r) => r.ordine != null) && (
                <button className="bottone-piatto" onClick={azzeraOrdine}>azzera</button>
              )}
            </div>
          )}

          {segnandoOrdine && (
            <p className="aiuto">
              Tocca i giocatori nell&rsquo;ordine in cui hanno giocato: il primo prende 1.
              Toccando di nuovo un numero lo togli.
            </p>
          )}

          {pareggio && (
            <div className="blocco-pareggio">
              <p className="aiuto avviso-pareggio">
                {condivisa
                  ? `Vittoria condivisa fra ${contendenti.length} giocatori.`
                  : 'Pareggio in testa: tocca «ha vinto» accanto a chi ha prevalso secondo lo spareggio del gioco, oppure dichiara la vittoria condivisa.'}
              </p>
              <button
                className={`bottone bottone-secondario${condivisa ? ' attivo' : ''}`}
                onClick={() => setVincitoreScelto(condivisa ? null : 'condivisa')}
              >
                {condivisa ? 'Annulla vittoria condivisa' : 'Vittoria condivisa'}
              </button>
            </div>
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
            <label htmlFor="cerca-giocatore">Aggiungi giocatori</label>
            <input
              id="cerca-giocatore"
              className="campo-cerca"
              value={cercaGiocatore}
              onChange={(e) => setCercaGiocatore(e.target.value)}
              placeholder="Cerca un nome"
            />

            <div className="pastiglie-persone">
              {disponibili.map((x) =>
                x.tipo === 'utente' ? (
                  <button key={x.chiave} className="pastiglia-nome" onClick={() => aggiungiPersona(x.dato)}>
                    {x.nome}
                  </button>
                ) : (
                  <button key={x.chiave} className="pastiglia-nome ospite" onClick={() => aggiungiOspite(x.dato)}>
                    {x.nome}
                  </button>
                )
              )}
            </div>

            {!cercaGiocatore.trim() && restanti > 0 && (
              <p className="aiuto">
                Mostrati i {LIMITE_NOMI} con cui giochi più spesso. Gli altri {restanti} si
                trovano scrivendo il nome qui sopra.
              </p>
            )}
            {cercaGiocatore.trim() && disponibili.length === 0 && (
              <p className="aiuto">Nessuno con questo nome. Puoi aggiungerlo come ospite qui sotto.</p>
            )}

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
              list="luoghi-noti" placeholder="Casa mia, sede, online…" />
            <datalist id="luoghi-noti">
              {luoghiNoti.map((n) => <option key={n} value={n} />)}
            </datalist>
            <p className="aiuto">
              Scrivi le prime lettere: se il posto c'è già te lo propone, così non
              nascono doppioni.
            </p>
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
