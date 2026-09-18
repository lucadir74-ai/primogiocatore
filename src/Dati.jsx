// Primo Giocatore - Esporta e importa
// v3.8.0 - 202609210900

import { useRef, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import { importaBgstats, analizzaBgstats } from './bgstats'
import { impronta, improntePresenti, giaPresente } from './impronta'

const OGGI = () => new Date().toISOString().slice(0, 10)

function scarica(nomeFile, contenuto, tipo) {
  const blob = new Blob([contenuto], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}

export default function Dati({ profilo }) {
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)
  const fileRef = useRef(null)
  const bgsRef = useRef(null)
  const [avanzamento, setAvanzamento] = useState(null)
  const [anteprima, setAnteprima] = useState(null)   // { doc, analisi }
  const [miei, setMiei] = useState([])               // id dei profili che sono io
  const [cercaGiocatore, setCercaGiocatore] = useState('')
  const [utenteBgg, setUtenteBgg] = useState(profilo.bgg_username || '')
  const [anteprimaBgg, setAnteprimaBgg] = useState(null)
  const [ultimaSincro, setUltimaSincro] = useState(
    () => { try { return localStorage.getItem('primo-giocatore:ultima-sincro-bgg') } catch { return null } }
  )

  async function leggiTutto() {
    return tutteLeRighe(() => supabase
      .from('partite')
      .select(`
        id, giocata_il, durata_minuti, note, tipo_punteggio, esito_coop, chiave_esterna,
        giochi ( bgg_id, nome, anno, min_giocatori, max_giocatori, tipo_punteggio, usa_fazioni ),
        luoghi ( nome, tipo ),
        partecipazioni (
          punteggio_totale, posizione, vincitore, ruolo, spareggio, ordine_turno,
          profili:utente_id ( nome, nickname ),
          ospiti:ospite_id ( nome )
        )
      `)
      .order('giocata_il', { ascending: true }))
  }

  async function esportaJson() {
    setErrore(''); setMessaggio(''); setLavorando(true)
    try {
      const partite = await leggiTutto()
      const documento = {
        formato: 'primo-giocatore',
        versione: 1,
        esportato_il: new Date().toISOString(),
        partite: partite.map((p) => ({
          // La chiave serve a riconoscere la partita se il file viene reimportato.
          chiave: p.chiave_esterna || `pg:${p.id}`,
          giocata_il: p.giocata_il,
          durata_minuti: p.durata_minuti,
          note: p.note,
          tipo_punteggio: p.tipo_punteggio,
          esito_coop: p.esito_coop,
          gioco: p.giochi
            ? {
                nome: p.giochi.nome, bgg_id: p.giochi.bgg_id, anno: p.giochi.anno,
                min_giocatori: p.giochi.min_giocatori, max_giocatori: p.giochi.max_giocatori,
                tipo_punteggio: p.giochi.tipo_punteggio, usa_fazioni: p.giochi.usa_fazioni,
              }
            : null,
          luogo: p.luoghi ? { nome: p.luoghi.nome, tipo: p.luoghi.tipo } : null,
          giocatori: (p.partecipazioni || []).map((x) => ({
            nome: x.profili ? (x.profili.nickname || x.profili.nome) : x.ospiti?.nome || 'Sconosciuto',
            registrato: Boolean(x.profili),
            punteggio: x.punteggio_totale,
            posizione: x.posizione,
            vincitore: x.vincitore,
            fazione: x.ruolo,
            spareggio: x.spareggio,
            ordine_turno: x.ordine_turno,
          })),
        })),
      }
      scarica(`primo-giocatore-${OGGI()}.json`, JSON.stringify(documento, null, 2), 'application/json')
      setMessaggio(`Esportate ${documento.partite.length} partite.`)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  async function esportaCsv() {
    setErrore(''); setMessaggio(''); setLavorando(true)
    try {
      const partite = await leggiTutto()
      const virgolette = (v) => {
        if (v == null) return ''
        const t = String(v)
        return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
      }
      // Una riga per giocatore: è la forma che i fogli di calcolo digeriscono.
      const righe = [
        ['data', 'gioco', 'luogo', 'durata_minuti', 'giocatore', 'punteggio', 'posizione', 'vincitore', 'fazione', 'ordine_turno', 'note'],
      ]
      for (const p of partite) {
        for (const x of p.partecipazioni || []) {
          righe.push([
            p.giocata_il?.slice(0, 10),
            p.giochi?.nome,
            p.luoghi?.nome,
            p.durata_minuti,
            x.profili ? (x.profili.nickname || x.profili.nome) : x.ospiti?.nome,
            x.punteggio_totale,
            x.posizione,
            x.vincitore ? 'sì' : 'no',
            x.ruolo,
            x.ordine_turno,
            p.note,
          ])
        }
      }
      const csv = righe.map((r) => r.map(virgolette).join(';')).join('\n')
      // Il segno iniziale serve a Excel per capire che il file è in UTF-8.
      scarica(`primo-giocatore-${OGGI()}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8')
      setMessaggio(`Esportate ${partite.length} partite in formato foglio di calcolo.`)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  // Legge tutte le pagine delle partite da BGG e prepara l'anteprima,
  // segnalando quelle che sembrano già presenti.
  async function leggiDaBgg(opzioni = {}) {
    setErrore(''); setMessaggio('')
    const utente = utenteBgg.trim()
    if (!utente) { setErrore('Scrivi il tuo nome utente BoardGameGeek.'); return }

    setLavorando(true)
    try {
      const tutte = []
      let pagina = 1
      let totale = 0
      while (pagina <= 30) {
        setAvanzamento({ fase: 'Leggo da BGG', fatto: tutte.length, totale: totale || 100 })
        const r = await fetch(`/api/bgg?azione=partite&utente=${encodeURIComponent(utente)}&pagina=${pagina}`)
        const dati = await r.json()
        if (!r.ok) throw new Error(dati.errore || 'Lettura non riuscita.')
        totale = dati.totale
        tutte.push(...dati.partite)
        if (tutte.length >= totale || dati.partite.length === 0) break
        pagina++
      }

      const presenti = await improntePresenti(supabase, profilo.id)

      // Per confrontare le impronte serve sapere a quale gioco del
      // catalogo corrisponde ognuna: si cercano per identificativo BGG.
      const bggIds = [...new Set(tutte.map((p) => p.gioco?.bgg_id).filter(Boolean))]
      const { data: giochiNoti } = await supabase
        .from('giochi').select('id, bgg_id').in('bgg_id', bggIds)
      const perBgg = new Map((giochiNoti || []).map((g) => [g.bgg_id, g.id]))

      // Si scorre dalla più vecchia, così il conteggio viene consumato
      // nell'ordine giusto quando ci sono più partite uguali.
      const conStato = [...tutte].reverse().map((p) => {
        const giocoId = perBgg.get(p.gioco?.bgg_id)
        const imp = giocoId
          ? impronta({
              giocoId, giocataIl: p.data,
              punteggi: p.giocatori.map((g) => g.punteggio),
            })
          : null
        const esito = giaPresente(presenti, imp)
        return { ...p, impronta: imp, sospetta: esito.presente, debole: esito.modo === 'debole' }
      })

      const anteprima = {
        partite: conStato,
        sospette: conStato.filter((p) => p.sospetta).length,
        deboli: conStato.filter((p) => p.debole).length,
        // Senza il gioco in catalogo l'impronta non si può calcolare:
        // quelle partite risultano nuove per forza, non perché lo siano.
        senzaGioco: conStato.filter((p) => !p.impronta).length,
        utente,
      }

      // In modalità rapida si procede subito con le nuove.
      if (opzioni.automatico) {
        const nuove = conStato.length - anteprima.sospette
        if (nuove === 0) {
          const adesso = new Date().toISOString()
          try { localStorage.setItem('primo-giocatore:ultima-sincro-bgg', adesso) } catch { /* niente */ }
          setUltimaSincro(adesso)
          setMessaggio('Già tutto aggiornato: nessuna partita nuova su BGG.')
          return
        }
        setAnteprimaBgg(anteprima)
        return
      }

      setAnteprimaBgg(anteprima)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
    }
  }

  // Aggiornamento rapido: legge da BGG e importa solo le partite nuove,
  // senza fermarsi all'anteprima. Per il controllo caso per caso resta
  // il percorso lungo.
  async function sincronizzaBgg() {
    setErrore(''); setMessaggio('')
    if (!utenteBgg.trim()) { setErrore('Scrivi il tuo nome utente BoardGameGeek.'); return }
    await leggiDaBgg({ automatico: true })
  }

  async function confermaBgg(includiSospette) {
    setErrore(''); setMessaggio(''); setLavorando(true)
    try {
      const daFare = anteprimaBgg.partite.filter((p) => includiSospette || !p.sospetta)
      let fatte = 0
      let saltate = anteprimaBgg.partite.length - daFare.length

      // Cache dei giochi e degli ospiti, per non interrogare ogni volta.
      const giochi = new Map()
      const ospiti = new Map()
      const { data: ospitiEsistenti } = await supabase.from('ospiti').select('id, nome')
      for (const o of ospitiEsistenti || []) ospiti.set(o.nome.toLowerCase(), o.id)

      for (const p of daFare) {
        setAvanzamento({ fase: 'Importo', fatto: fatte, totale: daFare.length })
        if (!p.gioco?.bgg_id) { saltate++; continue }

        let giocoId = giochi.get(p.gioco.bgg_id)
        if (!giocoId) {
          const { data: esistente } = await supabase
            .from('giochi').select('id').eq('bgg_id', p.gioco.bgg_id).maybeSingle()
          if (esistente) giocoId = esistente.id
          else {
            const { data: creato, error } = await supabase.from('giochi').insert({
              bgg_id: p.gioco.bgg_id, nome: p.gioco.nome || 'Senza nome', creato_da: profilo.id,
            }).select('id').single()
            if (error) throw error
            giocoId = creato.id
          }
          giochi.set(p.gioco.bgg_id, giocoId)
        }

        let luogoId = null
        if (p.luogo) {
          const { data: l } = await supabase.from('luoghi').select('id').ilike('nome', p.luogo).maybeSingle()
          if (l) luogoId = l.id
          else {
            const { data: creato } = await supabase.from('luoghi')
              .insert({ nome: p.luogo, tipo: 'altro', creato_da: profilo.id }).select('id').single()
            luogoId = creato?.id || null
          }
        }

        const punteggi = p.giocatori.map((g) => g.punteggio)
        const { data: partita, error: e1 } = await supabase.from('partite').insert({
          gioco_id: giocoId,
          luogo_id: luogoId,
          giocata_il: `${p.data}T20:00:00`,
          durata_minuti: p.durata_minuti,
          tipo_punteggio: 'punti',
          note: p.note,
          chiave_esterna: `bgg:${p.bgg_play_id}`,
          impronta: impronta({ giocoId, giocataIl: p.data, punteggi }),
          registrata_da: profilo.id,
        }).select('id').single()
        if (e1) throw e1

        // Il proprietario dell'archivio si riconosce dal nome utente BGG.
        const righe = []
        for (const g of p.giocatori) {
          const sonoIo = g.username && g.username.toLowerCase() === anteprimaBgg.utente.toLowerCase()
          let ospiteId = null
          if (!sonoIo) {
            const nome = (g.nome || 'Sconosciuto').trim()
            ospiteId = ospiti.get(nome.toLowerCase())
            if (!ospiteId) {
              const { data: creato, error } = await supabase.from('ospiti')
                .insert({ nome, creato_da: profilo.id }).select('id').single()
              if (error) throw error
              ospiteId = creato.id
              ospiti.set(nome.toLowerCase(), ospiteId)
            }
          }
          righe.push({
            partita_id: partita.id,
            utente_id: sonoIo ? profilo.id : null,
            ospite_id: ospiteId,
            punteggio_totale: g.punteggio,
            vincitore: g.vincitore,
            ordine_turno: g.posizione,
            primo_giocatore: g.posizione === 1,
          })
        }
        if (righe.length) {
          const { error: e2 } = await supabase.from('partecipazioni').insert(righe)
          if (e2) throw e2
        }
        fatte++
      }

      const adesso = new Date().toISOString()
      try { localStorage.setItem('primo-giocatore:ultima-sincro-bgg', adesso) } catch { /* niente */ }
      setUltimaSincro(adesso)
      setMessaggio(
        `Da BGG: importate ${fatte} partite` +
        (saltate ? `, ${saltate} saltate perché già presenti` : '') + '.'
      )
      setAnteprimaBgg(null)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
    }
  }

  async function importa(evento) {
    const file = evento.target.files?.[0]
    if (!file) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    try {
      const testo = await file.text()
      const doc = JSON.parse(testo)

      // Il backup di BG Stats si riconosce dai suoi array: lo passo
      // al convertitore invece di rifiutarlo.
      if (doc.plays && doc.games && doc.players) {
        const analisi = analizzaBgstats(doc)
        setAnteprima({ doc, analisi })
        setMiei(analisi.suggerito != null ? [analisi.suggerito] : [])
        return
      }

      if (doc.formato !== 'primo-giocatore') {
        throw new Error('Questo file non è né un\u2019esportazione di Primo Giocatore né un backup di BG Stats.')
      }

      let aggiunte = 0
      let saltate = 0
      const presenti = await improntePresenti(supabase, profilo.id)

      // Cache locali, per non interrogare il database a ogni riga.
      const giochi = new Map()
      const luoghi = new Map()
      const ospiti = new Map()

      async function trovaGioco(g) {
        if (!g?.nome) return null
        const k = (g.bgg_id ? `b:${g.bgg_id}` : `n:${g.nome.toLowerCase()}`)
        if (giochi.has(k)) return giochi.get(k)
        let query = supabase.from('giochi').select('id')
        query = g.bgg_id ? query.eq('bgg_id', g.bgg_id) : query.ilike('nome', g.nome)
        const { data } = await query.maybeSingle()
        let id = data?.id
        if (!id) {
          const { data: creato, error } = await supabase
            .from('giochi')
            .insert({
              nome: g.nome, bgg_id: g.bgg_id ?? null, anno: g.anno ?? null,
              min_giocatori: g.min_giocatori ?? null, max_giocatori: g.max_giocatori ?? null,
              tipo_punteggio: g.tipo_punteggio || 'punti',
              usa_fazioni: Boolean(g.usa_fazioni),
              creato_da: profilo.id,
            })
            .select('id').single()
          if (error) throw error
          id = creato.id
        }
        giochi.set(k, id)
        return id
      }

      async function trovaLuogo(l) {
        if (!l?.nome) return null
        const k = l.nome.toLowerCase()
        if (luoghi.has(k)) return luoghi.get(k)
        const { data } = await supabase.from('luoghi').select('id').ilike('nome', l.nome).maybeSingle()
        let id = data?.id
        if (!id) {
          const { data: creato, error } = await supabase
            .from('luoghi')
            .insert({ nome: l.nome, tipo: l.tipo || 'altro', creato_da: profilo.id })
            .select('id').single()
          if (error) throw error
          id = creato.id
        }
        luoghi.set(k, id)
        return id
      }

      async function trovaOspite(nome) {
        const k = nome.toLowerCase()
        if (ospiti.has(k)) return ospiti.get(k)
        const { data } = await supabase.from('ospiti').select('id').ilike('nome', nome).maybeSingle()
        let id = data?.id
        if (!id) {
          const { data: creato, error } = await supabase
            .from('ospiti').insert({ nome, creato_da: profilo.id }).select('id').single()
          if (error) throw error
          id = creato.id
        }
        ospiti.set(k, id)
        return id
      }

      for (const p of doc.partite || []) {
        // Già importata? Si salta, così reimportare lo stesso file non duplica.
        if (p.chiave) {
          const { data: esiste } = await supabase
            .from('partite').select('id')
            .eq('registrata_da', profilo.id).eq('chiave_esterna', p.chiave)
            .maybeSingle()
          if (esiste) { saltate++; continue }
        }

        const giocoId = await trovaGioco(p.gioco)
        if (!giocoId) { saltate++; continue }
        const luogoId = await trovaLuogo(p.luogo)

        const imp = impronta({
          giocoId, giocataIl: p.giocata_il,
          punteggi: (p.giocatori || []).map((g) => g.punteggio),
        })
        if (giaPresente(presenti, imp).presente) { saltate++; continue }

        const { data: partita, error } = await supabase
          .from('partite')
          .insert({
            impronta: imp,
            gioco_id: giocoId,
            luogo_id: luogoId,
            giocata_il: p.giocata_il || new Date().toISOString(),
            durata_minuti: p.durata_minuti ?? null,
            tipo_punteggio: p.tipo_punteggio || 'punti',
            esito_coop: p.esito_coop ?? null,
            note: p.note ?? null,
            chiave_esterna: p.chiave ?? null,
            registrata_da: profilo.id,
          })
          .select('id').single()
        if (error) throw error

        const righe = []
        for (const g of p.giocatori || []) {
          // Chi importa è l'unico riconosciuto come utente vero: gli altri
          // diventano ospiti, e si collegheranno quando si iscriveranno.
          const sonoIo = g.nome === profilo.nickname || g.nome === profilo.nome
          righe.push({
            partita_id: partita.id,
            utente_id: sonoIo ? profilo.id : null,
            ospite_id: sonoIo ? null : await trovaOspite(g.nome || 'Sconosciuto'),
            punteggio_totale: g.punteggio ?? null,
            posizione: g.posizione ?? null,
            vincitore: Boolean(g.vincitore),
            ruolo: g.fazione ?? null,
            spareggio: g.spareggio ?? null,
            ordine_turno: g.ordine_turno ?? null,
            primo_giocatore: g.ordine_turno === 1,
          })
        }
        if (righe.length) {
          const { error: e2 } = await supabase.from('partecipazioni').insert(righe)
          if (e2) throw e2
        }
        aggiunte++
      }

      setMessaggio(
        `Importate ${aggiunte} partite${saltate ? `, ${saltate} già presenti e saltate` : ''}.`
      )
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confermaBgstats() {
    setErrore(''); setMessaggio(''); setLavorando(true)
    try {
      const esito = await importaBgstats(anteprima.doc, profilo, miei, setAvanzamento)
      setMessaggio(
        `Importate ${esito.importate} partite` +
        (esito.saltate ? `, ${esito.saltate} già presenti e saltate` : '') +
        (esito.senzaGioco ? `, ${esito.senzaGioco} senza gioco riconoscibile` : '') +
        `. Catalogo aggiornato con ${esito.giochi} giochi.`
      )
      setAnteprima(null)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
    }
  }

  const listaGiocatori = anteprima
    ? anteprima.analisi.giocatori.filter((g) =>
        !cercaGiocatore.trim() || g.nome.toLowerCase().includes(cercaGiocatore.trim().toLowerCase())
      )
    : []

  if (anteprimaBgg) {
    const nuove = anteprimaBgg.partite.length - anteprimaBgg.sospette
    return (
      <div className="scheda">
        <h2>Partite su BoardGameGeek</h2>
        <p className="sottotitolo">
          Trovate {anteprimaBgg.partite.length} partite per «{anteprimaBgg.utente}».
        </p>

        {errore && <div className="avviso errore">{errore}</div>}

        <div className="numeroni">
          <div className="numerone">
            <span className="cifra">{nuove}</span>
            <span className="didascalia">nuove</span>
          </div>
          <div className="numerone sotto">
            <span className="cifra">{anteprimaBgg.sospette}</span>
            <span className="didascalia">già presenti</span>
          </div>
        </div>

        <p className="aiuto">
          Una partita è considerata già presente quando coincidono gioco, giorno, numero
          di giocatori e punteggi. È il confronto che regge fra fonti diverse, perché i
          punteggi non cambiano mentre i nomi sì. Il conteggio è per quantità: se hai
          sei partite uguali e ne arrivano sette, la settima entra.
        </p>

        {anteprimaBgg.senzaGioco > 0 && (
          <p className="aiuto avviso-pareggio">
            {anteprimaBgg.senzaGioco} risultano nuove solo perché il gioco non è ancora
            nel tuo catalogo: per quelle il confronto non si può fare. Vengono importate
            insieme al loro gioco.
          </p>
        )}

        <h3 className="titolo-sezione">Considerate nuove</h3>
        <ul className="elenco elenco-scorrevole">
          {anteprimaBgg.partite.filter((p) => !p.sospetta).map((p) => (
            <li key={p.bgg_play_id}>
              <div className="nome-giocatore">
                <strong>{p.gioco?.nome || 'Gioco sconosciuto'}</strong>
                <span className="anno block">
                  {p.data}
                  {p.luogo ? ` · ${p.luogo}` : ''}
                  {` · ${p.giocatori.length} giocatori`}
                </span>
                <span className="anno block">
                  {p.giocatori
                    .map((g) => `${g.nome}${g.punteggio != null ? ` ${g.punteggio}` : ''}${g.vincitore ? ' ★' : ''}`)
                    .join(' · ')}
                </span>
                {!p.impronta && <span className="distintivo grigio">gioco non in catalogo</span>}
              </div>
            </li>
          ))}
        </ul>

        {anteprimaBgg.deboli > 0 && (
          <p className="aiuto">
            {anteprimaBgg.deboli} sono state riconosciute senza poter confrontare i
            punteggi, perché mancano da una delle due parti: per quelle coincidono gioco,
            giorno e numero di giocatori. Se in una serata avete fatto più partite allo
            stesso gioco, dai un'occhiata prima di importare.
          </p>
        )}

        {avanzamento && (
          <div className="avanzamento">
            <span>{avanzamento.fase}</span>
            <div className="barra-avanzamento">
              <div style={{ width: `${(avanzamento.fatto / Math.max(1, avanzamento.totale)) * 100}%` }} />
            </div>
            <span className="anno">{avanzamento.fatto} / {avanzamento.totale}</span>
          </div>
        )}

        <button className="bottone" onClick={() => confermaBgg(false)} disabled={lavorando || nuove === 0}>
          {lavorando ? 'Importo…' : `Importa le ${nuove} nuove`}
        </button>

        {anteprimaBgg.sospette > 0 && (
          <button className="bottone bottone-secondario" onClick={() => confermaBgg(true)} disabled={lavorando}>
            Importa tutte, doppioni compresi
          </button>
        )}

        <button className="bottone bottone-secondario" onClick={() => setAnteprimaBgg(null)} disabled={lavorando}>
          Annulla
        </button>
      </div>
    )
  }

  if (anteprima) {
    return (
      <div className="scheda">
        <h2>Backup di BG Stats</h2>
        <p className="sottotitolo">
          {anteprima.analisi.partite} partite, {anteprima.analisi.giochi} giochi,
          {' '}{anteprima.analisi.giocatori.length} giocatori.
        </p>

        {errore && <div className="avviso errore">{errore}</div>}

        <h3 className="titolo-sezione">Quale di questi sei tu?</h3>
        <p className="aiuto">
          Serve per attribuirti le partite. Puoi sceglierne più di uno: se in BG Stats
          ti sei ritrovato con profili doppi, qui tornano a essere una persona sola.
          Tutti gli altri diventano ospiti.
        </p>

        <input
          className="campo-cerca"
          value={cercaGiocatore}
          onChange={(e) => setCercaGiocatore(e.target.value)}
          placeholder="Cerca un nome"
          aria-label="Cerca fra i giocatori del file"
        />

        <ul className="elenco elenco-scelta">
          {listaGiocatori.slice(0, 40).map((g) => (
            <li key={g.id}>
              <label className="scelta-io">
                <input
                  type="checkbox"
                  checked={miei.includes(g.id)}
                  onChange={(e) =>
                    setMiei(e.target.checked ? [...miei, g.id] : miei.filter((x) => x !== g.id))
                  }
                />
                <span className="nome-giocatore">
                  <strong>{g.nome}</strong>
                  {g.id === anteprima.analisi.meRefId && (
                    <span className="anno"> · indicato da BG Stats</span>
                  )}
                </span>
                <span className="anno">{g.partite}</span>
              </label>
            </li>
          ))}
        </ul>

        {avanzamento && (
          <div className="avanzamento">
            <span>{avanzamento.fase}</span>
            {avanzamento.totale > 1 && (
              <>
                <div className="barra-avanzamento">
                  <div style={{ width: `${(avanzamento.fatto / avanzamento.totale) * 100}%` }} />
                </div>
                <span className="anno">{avanzamento.fatto} / {avanzamento.totale}</span>
              </>
            )}
          </div>
        )}

        <button className="bottone" onClick={confermaBgstats} disabled={lavorando || miei.length === 0}>
          {lavorando ? 'Importo\u2026' : `Importa ${anteprima.analisi.partite} partite`}
        </button>
        <button className="bottone bottone-secondario" onClick={() => setAnteprima(null)} disabled={lavorando}>
          Annulla
        </button>

        <p className="aiuto">
          Può volerci qualche minuto. Non chiudere la pagina: se si interrompe, i giochi e
          le partite già scritti restano, e ricaricando lo stesso file riprende da dove era.
        </p>
      </div>
    )
  }

  return (
    <div className="scheda">
      <h2>I tuoi dati</h2>
      <p className="sottotitolo">Portali via, rimettili dentro, tienine una copia.</p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <button className="bottone" onClick={esportaJson} disabled={lavorando}>
        Esporta tutto (file da reimportare)
      </button>

      <button className="bottone bottone-secondario" onClick={esportaCsv} disabled={lavorando}>
        Esporta per foglio di calcolo
      </button>

      <h3 className="titolo-sezione">Importa da BoardGameGeek</h3>
      <div className="campo">
        <label htmlFor="d-bgg">Il tuo nome utente BGG</label>
        <input id="d-bgg" value={utenteBgg} onChange={(e) => setUtenteBgg(e.target.value)}
          placeholder="Come compare sul tuo profilo BGG" />
      </div>
      <button className="bottone" onClick={sincronizzaBgg} disabled={lavorando}>
        {lavorando ? 'Aggiorno…' : 'Aggiorna da BGG'}
      </button>
      <button className="bottone bottone-secondario" onClick={() => leggiDaBgg()} disabled={lavorando}>
        Guarda prima cosa c'è
      </button>

      {ultimaSincro && (
        <p className="aiuto">
          Ultimo aggiornamento: {new Date(ultimaSincro).toLocaleString('it-IT', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}

      {avanzamento && !anteprimaBgg && (
        <div className="avanzamento">
          <span>{avanzamento.fase}</span>
          <div className="barra-avanzamento">
            <div style={{ width: `${(avanzamento.fatto / Math.max(1, avanzamento.totale)) * 100}%` }} />
          </div>
        </div>
      )}

      <h3 className="titolo-sezione">Importa da un file</h3>
      <p className="aiuto">
        BG Stats non ha un collegamento diretto come BGG: la sincronizzazione automatica
        è riservata alla loro app. Qui serve il file, da Impostazioni → Esportazione.
      </p>
      <p className="aiuto">
        Accetta sia i file esportati da qui, sia il backup di <strong>BG Stats</strong>
        (Impostazioni → Esportazione). Il formato viene riconosciuto da solo. Le partite
        già presenti vengono saltate, quindi lo stesso file si può ricaricare senza
        creare doppioni.
      </p>

      {avanzamento && (
        <div className="avanzamento">
          <span>{avanzamento.fase}</span>
          {avanzamento.totale > 1 && (
            <>
              <div className="barra-avanzamento">
                <div style={{ width: `${(avanzamento.fatto / avanzamento.totale) * 100}%` }} />
              </div>
              <span className="anno">{avanzamento.fatto} / {avanzamento.totale}</span>
            </>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={importa}
        disabled={lavorando}
        className="campo-file"
        aria-label="Scegli il file da importare"
      />

      <p className="aiuto">
        Nelle partite importate solo tu vieni riconosciuto come utente: gli altri entrano
        come ospiti, e si collegheranno ai loro account quando si iscriveranno.
      </p>
    </div>
  )
}
