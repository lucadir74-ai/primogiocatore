// Primo Giocatore - Esporta e importa
// v5.1.0 - 202611141500 (elenco delle risposte lente del server)

import { useEffect, useRef, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import { importaBgstats, analizzaBgstats } from './bgstats'
import { impronta, improntePresenti, giaPresente } from './impronta'
import { leggiPartiteBgg, importaPartiteBgg, dataDiPartenza, ultimaSincro as ultimaSincroBgg } from './sincroBgg'
import { assicuraGiocoBgg, trovaOCreaLuogo, trovaOCreaOspite } from './giochiMiei'
import ImportaBga from './ImportaBga.jsx'
import { useInvioBgg, InvioBggStato, InvioBggAzioni } from './InvioBgg.jsx'
import Sezione from './Sezione.jsx'
import { importaCollezioneBgg, contaCollezioneBgg, fraseCollezione } from './collezioneBgg'
import { risposteLente, svuotaRisposteLente } from './memoriaRete'
import { ARCHIVIO_LOCALE, archivioLocaleAttivo, impostaArchivioLocale, ricaricaTuttoArchivio } from './archivio'

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

// L'archivio partite salvato sul telefono: in prova si accende qui.
function ArchivioTelefono({ profilo }) {
  const [attivo, setAttivo] = useState(archivioLocaleAttivo())
  const [stato, setStato] = useState('')
  const [lavoro, setLavoro] = useState(false)
  if (ARCHIVIO_LOCALE === 'spento') return null
  async function ricarica() {
    setLavoro(true); setStato('Ricarico tutto l’archivio…')
    try {
      const righe = await ricaricaTuttoArchivio(profilo.id)
      setStato(`Fatto: ${righe.length} partite.`)
    } catch (e) { setStato(`Errore: ${e.message}`) } finally { setLavoro(false) }
  }
  function cambia(e) {
    impostaArchivioLocale(e.target.checked)
    setAttivo(e.target.checked)
    setStato(e.target.checked ? 'Attivo: la prossima apertura salva l’archivio sul telefono.' : 'Spento: l’archivio si scarica tutto a ogni apertura.')
  }
  return (
    <Sezione id="archivio-telefono" titolo="Archivio sul telefono" nota={ARCHIVIO_LOCALE === 'prova' ? (attivo ? 'prova attiva' : 'prova') : null}>
      {ARCHIVIO_LOCALE === 'prova' && (
        <label className="riga-spunta">
          <input type="checkbox" checked={attivo} onChange={cambia} />
          {' '}Tieni l&rsquo;archivio sul telefono (prova)
        </label>
      )}
      <p className="aiuto">
        Le partite restano salvate sul telefono e a ogni apertura arrivano solo quelle nuove o cambiate:
        l&rsquo;app è più veloce e consuma meno dati. Una volta a settimana si rilegge tutto da sola.
      </p>
      <button className="bottone bottone-secondario" onClick={ricarica} disabled={lavoro}>Ricarica tutto l&rsquo;archivio</button>
      {stato && <p className="aiuto">{stato}</p>}
    </Sezione>
  )
}

// Le richieste al database che hanno risposto in ritardo (memoriaRete.js):
// quando compare l'avviso «il server ha risposto in ritardo», qui si vede quale.
function RisposteLente() {
  const [righe, setRighe] = useState(() => risposteLente())
  const quando = (t) => new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const secondi = (ms) => (ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })
  return (
    <Sezione id="risposte-lente" titolo="Risposte lente del server" nota={righe.length ? String(righe.length) : null}>
      <p className="aiuto">
        Le richieste a cui il server ha risposto dopo più di 4 secondi, su questo telefono: servono a capire cosa rallenta l&rsquo;app.
      </p>
      {righe.length === 0 ? (
        <p className="aiuto">Nessuna finora.</p>
      ) : (
        <>
          <ul className="risposte-lente">
            {righe.map((r, i) => (
              <li key={i}>
                <strong>{r.cosa}</strong> · {secondi(r.ms)} s{r.arrivata ? '' : ' · non arrivata'}
                <span className="anno block">{quando(r.quando)}{r.dettaglio ? ` · ${r.dettaglio}` : ''}</span>
              </li>
            ))}
          </ul>
          <button className="bottone bottone-secondario" onClick={() => { svuotaRisposteLente(); setRighe([]) }}>Svuota l&rsquo;elenco</button>
        </>
      )}
    </Sezione>
  )
}

// Un passo della procedura: numero, titolo e a che punto è.
// apri: è il prossimo da fare, quindi si apre da solo. Gli altri restano
// chiusi con l'esito accanto al titolo; un passo appena finito resta
// aperto, così se ne legge il risultato.
function Passo({ numero, titolo, fatto, stato, facoltativo, apri, children }) {
  const [aperto, setAperto] = useState(Boolean(apri))
  useEffect(() => { if (apri) setAperto(true) }, [apri])
  return (
    <details className={'passo' + (fatto ? ' fatto' : '')} open={aperto}
      onToggle={(e) => setAperto(e.currentTarget.open)}>
      <summary>
        <span className="passo-numero" aria-hidden="true">{fatto ? '✓' : numero}</span>
        <span className="passo-testa">
          <span className="sezione-titolo">{titolo}</span>
          <span className="sezione-nota">{stato || (facoltativo ? 'facoltativo' : 'da fare')}</span>
        </span>
      </summary>
      <div className="sezione-corpo">{children}</div>
    </details>
  )
}

export default function Dati({ profilo }) {
  const [errore, setErrore] = useState('')
  const invio = useInvioBgg(profilo)
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

  // A che punto è la procedura: giochi arrivati da BGG e partite arrivate da BGG.
  const [collezione, setCollezione] = useState(null)       // quanti giochi; null = non ancora letto
  const [partiteBgg, setPartiteBgg] = useState(null)       // true / false; null = non ancora letto
  const [esitoCollezione, setEsitoCollezione] = useState('')
  const [importandoCollezione, setImportandoCollezione] = useState(false)
  async function leggiStato() {
    const [n, dal] = await Promise.all([contaCollezioneBgg(profilo.id), dataDiPartenza(profilo.id)])
    setCollezione(n)
    setPartiteBgg(Boolean(dal))
  }
  useEffect(() => { leggiStato() }, [profilo.id])

  // Il nome utente BGG si scrive una volta: vale per i giochi, per le
  // partite e per l'aggiornamento automatico.
  async function salvaUtenteBgg() {
    const utente = utenteBgg.trim()
    if (!utente) { setErrore('Scrivi il tuo nome utente BoardGameGeek nel passo 1.'); return null }
    if (utente !== (profilo.bgg_username || '')) {
      const { error } = await supabase.from('profili').update({ bgg_username: utente }).eq('id', profilo.id)
      if (error) { setErrore(error.message); return null }
    }
    return utente
  }

  async function importaCollezione() {
    setErrore(''); setMessaggio(''); setEsitoCollezione('')
    const utente = await salvaUtenteBgg()
    if (!utente) return
    setImportandoCollezione(true)
    tieniAcceso(true)
    try {
      const esito = await importaCollezioneBgg({ utente, profiloId: profilo.id })
      setEsitoCollezione(fraseCollezione(esito))
      setCollezione(esito.giochi + esito.espansioni)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setImportandoCollezione(false)
      tieniAcceso(false)
    }
  }

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
  // Un archivio grande richiede minuti: lo schermo resta acceso, altrimenti
  // il telefono si spegne e il browser taglia la connessione a metà.
  const schermoBgg = useRef(null)
  async function tieniAcceso(si) {
    try {
      if (si && !schermoBgg.current && navigator.wakeLock) schermoBgg.current = await navigator.wakeLock.request('screen')
      if (!si && schermoBgg.current) { await schermoBgg.current.release(); schermoBgg.current = null }
    } catch { schermoBgg.current = null }
  }

  async function leggiDaBgg(opzioni = {}) {
    setErrore(''); setMessaggio('')
    const utente = await salvaUtenteBgg()
    if (!utente) return

    setLavorando(true)
    tieniAcceso(true)
    try {
      // Rapido: solo le partite recenti. Completo: tutto l'archivio.
      const dal = opzioni.automatico ? await dataDiPartenza(profilo.id) : null
      const anteprima = await leggiPartiteBgg({ utente, profiloId: profilo.id, dal, avanzamento: setAvanzamento })

      // In modalità rapida, se non c'è niente di nuovo, si chiude qui.
      if (opzioni.automatico && anteprima.partite.length === 0) {
        setUltimaSincro(new Date().toISOString())
        try { localStorage.setItem('primo-giocatore:ultima-sincro-bgg', new Date().toISOString()) } catch { /* niente */ }
        setMessaggio('Già tutto aggiornato: nessuna partita nuova su BGG.')
        return
      }
      setAnteprimaBgg(anteprima)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
      tieniAcceso(false)
    }
  }

  // Aggiornamento rapido: legge da BGG e mostra solo cosa c'è di nuovo.
  async function sincronizzaBgg() {
    setErrore(''); setMessaggio('')
    await leggiDaBgg({ automatico: true })
  }

  async function confermaBgg(includiSospette) {
    setErrore(''); setMessaggio(''); setLavorando(true)
    tieniAcceso(true)
    try {
      const daFare = anteprimaBgg.partite.filter((p) => includiSospette || !p.sospetta)
      const { fatte } = await importaPartiteBgg({
        partite: daFare, utente: anteprimaBgg.utente, profiloId: profilo.id, avanzamento: setAvanzamento,
      })
      const saltate = anteprimaBgg.partite.length - fatte
      setUltimaSincro(ultimaSincroBgg())
      setMessaggio(
        `Da BGG: importate ${fatte} partite` +
        (saltate ? `, ${saltate} saltate perché già presenti` : '') + '.'
      )
      setAnteprimaBgg(null)
      leggiStato()
    } catch (e) {
      setErrore(/failed to fetch|load failed|networkerror/i.test(e.message || '')
        ? 'La connessione si è interrotta: tocca di nuovo «Importa». Le partite già entrate vengono saltate, si riprende da dove si era arrivati.'
        : e.message)
    } finally {
      setLavorando(false)
      setAvanzamento(null)
      tieniAcceso(false)
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
        // Quello già nell'app se c'è (anche aggiunto da altri), altrimenti nuovo.
        const { id } = await assicuraGiocoBgg({
          nome: g.nome, bgg_id: g.bgg_id ?? null, anno: g.anno ?? null,
          min_giocatori: g.min_giocatori ?? null, max_giocatori: g.max_giocatori ?? null,
          tipo_punteggio: g.tipo_punteggio || 'punti', usa_fazioni: Boolean(g.usa_fazioni),
        })
        giochi.set(k, id)
        return id
      }

      async function trovaLuogo(l) {
        if (!l?.nome) return null
        const k = l.nome.toLowerCase()
        if (!luoghi.has(k)) luoghi.set(k, await trovaOCreaLuogo(l.nome, profilo.id, l.tipo || 'altro'))
        return luoghi.get(k)
      }

      async function trovaOspite(nome) {
        const k = nome.toLowerCase()
        if (!ospiti.has(k)) ospiti.set(k, await trovaOCreaOspite(nome, profilo.id))
        return ospiti.get(k)
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
        let ioMesso = false
        for (const g of p.giocatori || []) {
          // Chi importa è l'unico riconosciuto come utente vero: gli altri
          // diventano ospiti, e si collegheranno quando si iscriveranno.
          // Una volta sola per partita: un ospite col tuo stesso nome resta ospite.
          const sonoIo = !ioMesso && Boolean(g.nome) && (g.nome === profilo.nickname || g.nome === profilo.nome)
          if (sonoIo) ioMesso = true
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
          if (e2) {
            // Senza giocatori resterebbe a metà e al prossimo import verrebbe
            // saltata: si toglie, così rientra intera.
            await supabase.from('partite').delete().eq('id', partita.id)
            throw e2
          }
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
    tieniAcceso(true)
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
      tieniAcceso(false)
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

        {anteprimaBgg.senzaData > 0 && (
          <p className="aiuto avviso-pareggio">
            {anteprimaBgg.senzaData === 1 ? '1 partita non ha' : `${anteprimaBgg.senzaData} partite non hanno`} la
            data su BGG e {anteprimaBgg.senzaData === 1 ? 'resta' : 'restano'} fuori. Se aggiungi la data su
            BGG, alla prossima lettura entrano.
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
          Può volerci qualche minuto. Non chiudere la pagina e non cambiare app: se si interrompe, i giochi e
          le partite già scritti restano, e ricaricando lo stesso file riprende da dove era.
        </p>
      </div>
    )
  }

  // Il prossimo passo da fare: si apre da solo. Finché lo stato non è
  // arrivato dal database non se ne apre nessuno.
  const fatti = [collezione == null ? null : collezione > 0, partiteBgg, Boolean(profilo.bga_id)]
  const prossimo = fatti.slice(0, 2).includes(null) ? 0 : fatti.indexOf(false) + 1

  const barra = avanzamento && (
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
  )

  return (
    <div className="scheda">
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <h2>Porta qui giochi e partite</h2>
      <p className="aiuto">
        La prima volta fai i passi in ordine, dall&rsquo;alto in basso: prima i giochi, poi le partite.
        Salta quelli che non ti servono. Dopo, giochi e partite nuove si aggiornano da soli.
      </p>
      <p className="aiuto nota-aperta">
        <strong>I passi 1, 2 e 4 lavorano sul telefono:</strong> mentre importano tieni questa pagina aperta
        e in primo piano, senza passare ad altre app. Lo schermo resta acceso da solo. Solo Board Game Arena
        (passo 3), una volta collegato, va avanti sul server anche a telefono spento.
      </p>

      <Passo numero={1} titolo="Giochi da BoardGameGeek"
        fatto={fatti[0]} apri={prossimo === 1}
        stato={collezione == null ? '…' : collezione > 0 ? `fatto · ${collezione} in collezione` : null}>
        <p className="aiuto">
          Porta qui i giochi che su BGG hai segnato come posseduti, espansioni comprese.
          Non hai un account BGG? Salta al passo 3 o al 4.
        </p>
        <div className="campo">
          <label htmlFor="d-bgg">Il tuo nome utente BGG</label>
          <input id="d-bgg" value={utenteBgg} onChange={(e) => setUtenteBgg(e.target.value)}
            placeholder="Come compare sul tuo profilo BGG" autoCapitalize="none" autoCorrect="off" />
        </div>
        <button className="bottone" onClick={importaCollezione} disabled={importandoCollezione || lavorando}>
          {importandoCollezione ? 'Chiedo a BGG…' : collezione > 0 ? 'Aggiorna i miei giochi' : 'Importa i miei giochi'}
        </button>
        {importandoCollezione && <div className="avviso">Non chiudere e non cambiare app: la prima volta BGG può metterci fino a un minuto.</div>}
        {esitoCollezione && <div className="avviso ok">{esitoCollezione}</div>}
        <p className="aiuto">Quando compri un gioco nuovo e lo segni su BGG, ripassa di qui o usa il tasto nella pagina Giochi.</p>
      </Passo>

      <Passo numero={2} titolo="Partite da BoardGameGeek"
        fatto={partiteBgg} apri={prossimo === 2}
        stato={partiteBgg == null ? '…' : partiteBgg
          ? `fatto${invio.stato?.collegato ? ' · invio attivo' : ''}` : null}>
        <p className="aiuto">
          {utenteBgg.trim()
            ? <>Legge le partite che «{utenteBgg.trim()}» ha registrato su BGG e ti mostra cosa c&rsquo;è di nuovo prima di importare.</>
            : 'Prima scrivi il tuo nome utente BGG nel passo 1.'}
          {!partiteBgg && ' La prima volta legge tutto l’archivio: con molte partite ci vogliono alcuni minuti.'}
        </p>
        {lavorando && <div className="avviso">Non chiudere e non cambiare app finché non finisce. Se si interrompe, tocca di nuovo il tasto: riprende da dove era.</div>}
        <button className="bottone" onClick={sincronizzaBgg} disabled={lavorando || importandoCollezione}>
          {lavorando ? 'Leggo da BGG…' : partiteBgg ? 'Aggiorna le partite da BGG' : 'Importa le partite da BGG'}
        </button>
        <p className="aiuto">
          Dopo la prima volta le partite nuove arrivano da sole, quando apri l&rsquo;app.
          {ultimaSincro && ` Ultimo aggiornamento: ${new Date(ultimaSincro).toLocaleString('it-IT', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          })}.`}
        </p>
        {barra}
        <InvioBggStato invio={invio} profilo={profilo} />
        <details className="dettagli-piccoli">
          <summary>Altre azioni</summary>
          <p className="aiuto">Rilegge tutto l&rsquo;archivio BGG: serve se hai pubblicato partite vecchie. Parte comunque da solo una volta a settimana.</p>
          <button className="bottone bottone-secondario" onClick={() => leggiDaBgg()} disabled={lavorando}>
            Rileggi tutto da BGG
          </button>
          <InvioBggAzioni invio={invio} profilo={profilo} />
        </details>
      </Passo>

      <Passo numero={3} titolo="Partite da Board Game Arena"
        fatto={Boolean(profilo.bga_id)} apri={prossimo === 3} stato={profilo.bga_id ? 'fatto · collegato' : null}>
        <p className="aiuto">
          Una volta collegato l&rsquo;account, le partite arrivano da sole dal server, circa ogni ora, anche a
          telefono spento: non serve tenere aperta la pagina. Lo storico vecchio entra a pezzi nelle ore successive.
          Solo se avvii una lettura a mano qui sotto, aspetta che finisca prima di uscire.
        </p>
        <ImportaBga profilo={profilo} incorporata />
      </Passo>

      <Passo numero={4} titolo="Da BG Stats o da un file" facoltativo>
        <p className="aiuto">
          Serve solo se hai partite in BG Stats che non sono su BGG, o una copia esportata da Primo Giocatore.
          Se BG Stats pubblica già su BGG, le hai prese col passo 2 e questo non ti serve.
        </p>
        <ol className="passi-file">
          <li>Apri <strong>BG Stats</strong> sul telefono.</li>
          <li>Vai in <strong>Impostazioni</strong> e apri la voce di <strong>esportazione dei dati</strong>.</li>
          <li>Scegli l&rsquo;esportazione completa (il backup): crea un file che si chiama <strong>BGStatsExport.json</strong>.</li>
          <li>Quando chiede dove metterlo, scegli <strong>Salva su File</strong> (o «Download»), non una chat.</li>
          <li>Torna qui e tocca <strong>Scegli il file</strong> qui sotto: lo trovi fra i file recenti.</li>
          <li>L&rsquo;app ti chiede quale dei giocatori sei tu, poi importa. Le partite già presenti vengono saltate.</li>
        </ol>
        <label className="bottone bottone-secondario scegli-file">
          {lavorando ? 'Importo…' : 'Scegli il file'}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={importa}
            disabled={lavorando}
            className="visivamente-nascosto"
          />
        </label>
        {barra}
        <p className="aiuto">
          Dopo aver scelto il file tieni la pagina aperta finché non compare l&rsquo;esito.
          Gli altri giocatori entrano come ospiti. Altre app: va bene qualunque file nel formato di BG Stats;
          se la tua app non lo esporta, pubblica le partite su BGG e usa il passo 2.
        </p>
      </Passo>

      <ArchivioTelefono profilo={profilo} />
      <RisposteLente />

      <Sezione id="esporta" titolo="Esporta" nota="una copia delle tue partite">
        <button className="bottone" onClick={esportaJson} disabled={lavorando}>
          Copia completa (da reimportare)
        </button>
        <button className="bottone bottone-secondario" onClick={esportaCsv} disabled={lavorando}>
          Per foglio di calcolo (CSV)
        </button>
      </Sezione>
    </div>
  )
}
