// Primo Giocatore - import da CSV delle posizioni dei giochi
// v1.4.0 - 202611021900 (casa: «cerca» anche su BGG e si può aggiungere un gioco
//   alla collezione; abbinamento per parole; espansioni nel messaggio per l'AI;
//   schermo acceso durante il lavoro)
//
// modo «tana»: la ludoteca della Tana (posizione, copie, note).
// modo «casa»: la propria collezione; si abbina ai propri giochi e si
// aggiorna la posizione. Un gioco che non c'è si può cercare (catalogo e
// BGG) e aggiungere, riga per riga: entra come gioco aggiunto a mano, che
// la sincronizzazione con BGG non toglie.
//
// Si fotografano i ripiani, un'AI (Claude, ChatGPT…) legge i titoli sui
// dorsi e restituisce un CSV: titolo;posizione;copie;note per la Tana,
// titolo;posizione;note per casa (le copie a casa non contano). Qui lo si
// incolla o si carica il file: l'app abbina ogni titolo al catalogo,
// chi gestisce controlla quelli dubbi e salva tutto in una volta.
// Servono gli script ludoteca_import.sql (tana), collezione_import.sql (casa),
// giochi_nomi.sql (titoli alternativi) e import_v2.sql (parole, aggiunta). La prima volta l'import prende da
// BGG i titoli alternativi dei giochi che non li hanno: ci vuole qualche
// minuto, poi solo per i giochi nuovi.

import { useRef, useState } from 'react'
import { supabase, fetchBgg } from './supabase'
import CercaGiocoBgg from './CercaGiocoBgg.jsx'

export const MESSAGGIO_AI = `Ti mando le foto dei ripiani di una ludoteca di giochi da tavolo; per ogni foto ti scrivo la posizione (es. B3). Leggi i titoli sui dorsi delle scatole e rispondi solo con un CSV con separatore punto e virgola e intestazione titolo;posizione;copie;note. Se lo stesso gioco compare più volte nella stessa posizione, scrivi una sola riga con il numero di copie. Scrivi il titolo completo come appare sulla scatola; per le espansioni scrivi il nome del gioco base seguito da quello dell’espansione (es. «Carcassonne: Mercanti e Costruttori»). Se un titolo non lo leggi con sicurezza, scrivi «da verificare» nelle note. Non inventare titoli che non riesci a leggere.`

export const MESSAGGIO_AI_CASA = `Ti mando le foto degli scaffali dei miei giochi da tavolo di casa; per ogni foto ti scrivo la posizione (es. B3). Leggi i titoli sui dorsi delle scatole e rispondi solo con un CSV con separatore punto e virgola e intestazione titolo;posizione;note. Una riga per ogni gioco, anche le espansioni. Scrivi il titolo completo come appare sulla scatola; per le espansioni scrivi il nome del gioco base seguito da quello dell’espansione (es. «Carcassonne: Mercanti e Costruttori»). Se un titolo non lo leggi con sicurezza, scrivi «da verificare» nelle note; altrimenti lascia le note vuote. Non inventare titoli che non riesci a leggere.`

// CSV: separatore indovinato dalla prima riga (; , o tab), virgolette rispettate.
function leggiCsv(testo) {
  const prima = testo.split(/\r?\n/)[0] || ''
  const sep = [';', '\t', ','].sort((a, b) => prima.split(b).length - prima.split(a).length)[0]
  const righe = []
  let riga = [], campo = '', tra = false
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    if (tra) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') tra = false
      else campo += c
    } else if (c === '"') tra = true
    else if (c === sep) { riga.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++
      riga.push(campo); righe.push(riga); riga = []; campo = ''
    } else campo += c
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga) }
  return righe.filter((r) => r.some((x) => x.trim()))
}

const piatto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
function colonna(intestazione) {
  const h = piatto(intestazione)
  if (/^(titolo|gioco|nome|title|game)/.test(h)) return 'titolo'
  if (/^(posizione|ripiano|scaffale|dove|position)/.test(h)) return 'posizione'
  if (/^(copie|copia|quantita|qta|numero|copies)/.test(h)) return 'copie'
  if (/^(note|nota|notes)/.test(h)) return 'note'
  return null
}

// L'AI a volte avvolge il CSV tra ``` : si tolgono.
const ripulisci = (t) => String(t || '').replace(/^\uFEFF/, '').replace(/^\s*```[a-z]*\s*$/gim, '').trim()

const DA_VERIFICARE = /da\s*verificare/i
const numeroCopie = (v) => Math.min(99, Math.max(1, parseInt(v, 10) || 1))

// mieiGiochi: non serve più (la ricerca usa catalogo e BGG); resta per compatibilità.
// eslint-disable-next-line no-unused-vars
export default function ImportaLudoteca({ modo = 'tana', tana, esistenti, mieiGiochi = [], onFatto }) {
  const casa = modo === 'casa'
  const [fase, setFase] = useState('carica')       // carica | controlla
  const [testo, setTesto] = useState('')
  const [posDefault, setPosDefault] = useState('')
  const [righe, setRighe] = useState([])
  const [aperta, setAperta] = useState(null)       // k della riga in cui si sceglie il gioco
  const [lavoro, setLavoro] = useState('')
  const [errore, setErrore] = useState('')
  const [copiato, setCopiato] = useState(false)
  const [nomiInCorso, setNomiInCorso] = useState(false)
  const [avvisoNomi, setAvvisoNomi] = useState('')
  const [progresso, setProgresso] = useState(null)   // { fatti, totale } dei titoli da BGG
  const fermaNomi = useRef(false)
  const schermo = useRef(null)

  // Lo schermo resta acceso durante il lavoro lungo (titoli da BGG,
  // abbinamento): se il telefono si spegne il browser ferma tutto.
  async function tieniAcceso(si) {
    try {
      if (si && !schermo.current && navigator.wakeLock) schermo.current = await navigator.wakeLock.request('screen')
      if (!si && schermo.current) { await schermo.current.release(); schermo.current = null }
    } catch { schermo.current = null }
  }

  // Prende da BGG i titoli alternativi dei giochi che non li hanno ancora
  // (40 per giro, una pausa di BGG fra un giro e l'altro). Si può saltare.
  async function completaNomi() {
    const ambito = casa ? 'collezione' : 'catalogo'
    fermaNomi.current = false
    setNomiInCorso(true)
    let fatti = 0, totale = 0
    try {
      for (let giro = 0; giro < 500 && !fermaNomi.current; giro++) {
        const r = await fetchBgg(`/api/bgg?azione=nomi&ambito=${ambito}`)
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.errore || 'BGG non ha risposto.')
        if (!d.fatti) return
        // Il totale si fissa al primo giro: già fatti più quelli che restano.
        fatti += d.fatti
        if (!totale) totale = fatti + (d.restanti || 0)
        setProgresso({ fatti, totale })
        if (!d.restanti) return
        const minuti = Math.max(1, Math.ceil((d.restanti / 40) * 11 / 60))
        setLavoro(`Prendo da BGG i titoli delle edizioni italiane: ne mancano ${d.restanti} (circa ${minuti} min). Si fa una volta sola.`)
      }
    } finally {
      setNomiInCorso(false)
      setProgresso(null)
    }
  }

  async function copiaMessaggio() {
    try { await navigator.clipboard.writeText(casa ? MESSAGGIO_AI_CASA : MESSAGGIO_AI); setCopiato(true) } catch { setCopiato(false) }
  }

  async function sceltoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let t = await file.text()
    if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(await file.arrayBuffer())
    setTesto(t)
    analizza(t)
  }

  async function analizza(daLeggere = testo) {
    setErrore(''); setAperta(null)
    const tabella = leggiCsv(ripulisci(daLeggere))
    if (!tabella.length) { setErrore('Non trovo righe da leggere.'); return }
    // Con l'intestazione si leggono le colonne per nome; senza, nell'ordine
    // titolo;posizione;copie;note (Tana) o titolo;posizione;note (casa; una
    // riga a quattro colonne si legge comunque come quella della Tana).
    const col = tabella[0].map(colonna)
    const conTesta = col.includes('titolo')
    const lette = (conTesta ? tabella.slice(1) : tabella).map((r, i) => {
      const ordine = conTesta ? col
        : casa && r.length < 4 ? ['titolo', 'posizione', 'note']
          : ['titolo', 'posizione', 'copie', 'note']
      const o = {}
      ordine.forEach((c, j) => { if (c) o[c] = String(r[j] ?? '').trim() })
      const incerto = DA_VERIFICARE.test(o.note || '')
      return {
        k: i,
        letto: o.titolo || '',
        posizione: o.posizione || posDefault.trim(),
        copie: numeroCopie(o.copie),
        note: (o.note || '').replace(DA_VERIFICARE, '').replace(/^[\s,;.·-]+|[\s,;.·-]+$/g, ''),
        incerto,
        scelta: null,
        candidati: [],
        salta: false,
      }
    }).filter((r) => r.letto)
    if (!lette.length) { setErrore('Non trovo titoli: controlla che la prima colonna sia il titolo.'); return }
    if (lette.length > 600) { setErrore('Troppe righe in una volta: dividi il CSV in parti da 600 al massimo.'); return }

    setAvvisoNomi('')
    tieniAcceso(true)
    setLavoro('Controllo i titoli delle edizioni italiane…')
    try { await completaNomi() } catch (e) {
      setAvvisoNomi(`Titoli italiani non aggiornati (${e.message}): l’abbinamento usa quelli che ci sono.`)
    }
    setLavoro('Cerco i giochi nel catalogo…')
    try {
      for (let da = 0; da < lette.length; da += 100) {
        const pezzo = lette.slice(da, da + 100)
        const titoli = pezzo.map((r) => r.letto)
        const { data, error } = casa
          ? await supabase.rpc('collezione_abbina', { p_titoli: titoli })
          : await supabase.rpc('ludoteca_abbina', { p_tana: tana.id, p_titoli: titoli })
        if (error) throw error
        for (const c of data || []) pezzo[c.indice - 1]?.candidati.push(c)
      }
      // Scelto da solo solo se c'è un unico gioco con lo stesso titolo.
      for (const r of lette) {
        const uguali = r.candidati.filter((c) => c.punteggio === 0)
        if (uguali.length === 1) r.scelta = uguali[0]
      }
      setRighe(lette)
      setFase('controlla')
    } catch (e) {
      setErrore(/(ludoteca|collezione)_abbina/.test(e?.message || '')
        ? `Manca lo script ${casa ? 'collezione_import.sql' : 'ludoteca_import.sql'} nel database.` : e.message)
    } finally {
      setLavoro('')
      tieniAcceso(false)
    }
  }

  const cambia = (k, campi) => setRighe((rr) => rr.map((r) => (r.k === k ? { ...r, ...campi } : r)))
  function scegli(k, g) {
    const id = String(g.gioco_id ?? g.id)
    // In casa un gioco che non è nella collezione si aggiunge (lo si è scelto apposta).
    cambia(k, { scelta: { gioco_id: id, nome: g.nome, anno: g.anno, trovato: g.trovato, aggiungi: casa && !esistenti.has(id) }, incerto: false })
    setAperta(null)
  }

  const attive = righe.filter((r) => !r.salta)
  // In casa un titolo senza nessun gioco simile non è nella collezione:
  // non blocca, resta in un elenco a parte e non si salva.
  const fuoriCollezione = casa ? attive.filter((r) => !r.scelta && !r.candidati.length) : []
  const daControllare = attive.filter((r) => (!r.scelta || r.incerto) && !fuoriCollezione.includes(r))
  const pronte = attive.filter((r) => r.scelta && !r.incerto)
  const saltate = righe.filter((r) => r.salta)

  async function salva() {
    setErrore('')
    // Lo stesso gioco su più righe diventa una riga sola: copie sommate,
    // la prima posizione, le altre posizioni finiscono nella nota.
    const perGioco = new Map()
    for (const r of pronte) {
      const id = r.scelta.gioco_id
      const pos = r.posizione.trim()
      const x = perGioco.get(id)
      if (!x) { perGioco.set(id, { gioco_id: id, posizione: pos, copie: r.copie, note: r.note ? [r.note] : [], aggiungi: Boolean(r.scelta.aggiungi) }); continue }
      x.copie = numeroCopie(x.copie + r.copie)
      if (pos && pos !== x.posizione) x.note.push(`${r.copie === 1 ? 'una copia' : `${r.copie} copie`} in ${pos}`)
      if (r.note) x.note.push(r.note)
    }
    const dati = [...perGioco.values()].map((x) => ({ ...x, note: x.note.join(' · ') }))
    setLavoro('Salvo…')
    try {
      const { data, error } = casa
        ? await supabase.rpc('collezione_salva_posizioni', { p_righe: dati.map((x) => ({ gioco_id: x.gioco_id, posizione: x.posizione, aggiungi: x.aggiungi })) })
        : await supabase.rpc('ludoteca_salva_blocco', { p_tana: tana.id, p_righe: dati })
      if (error) throw error
      const fuori = fuoriCollezione.map((r) => r.letto)
      const aggiunti = dati.filter((x) => x.aggiungi).length
      setRighe([]); setTesto(''); setFase('carica')
      onFatto(casa
        ? `${data} ${data === 1 ? 'posizione salvata' : 'posizioni salvate'}`
          + `${aggiunti ? `, ${aggiunti} ${aggiunti === 1 ? 'gioco aggiunto' : 'giochi aggiunti'} alla collezione` : ''}.`
          + `${fuori.length ? ` Non salvati: ${fuori.join(', ')}.` : ''}`
        : `${data} ${data === 1 ? 'gioco salvato' : 'giochi salvati'} nella ludoteca.`)
    } catch (e) {
      setErrore(/(ludoteca_salva_blocco|collezione_salva_posizioni)/.test(e?.message || '')
        ? `Manca lo script ${casa ? 'collezione_import.sql' : 'ludoteca_import.sql'} nel database.` : e.message)
    } finally {
      setLavoro('')
    }
  }

  // Si chiama come funzione (non <Riga/>), così le caselle non perdono il cursore a ogni lettera.
  function riga(r) {
    const gia = r.scelta && esistenti.get(r.scelta.gioco_id)
    const altri = r.candidati.filter((c) => c.gioco_id !== r.scelta?.gioco_id)
    return (
      <li key={r.k} style={{ display: 'block' }}>
        <div className="nome-giocatore">
          <strong>{r.letto}</strong>
          <span className="anno block">
            {r.scelta
              ? <>→ {r.scelta.nome}{r.scelta.anno ? ` (${r.scelta.anno})` : ''}
                {r.scelta.trovato && r.scelta.trovato !== r.scelta.nome ? ` · in italiano «${r.scelta.trovato}»` : ''}{r.incerto ? ' · l’AI non era sicura del titolo' : ''}
                {r.scelta.aggiungi ? ' · verrà aggiunto alla tua collezione' : ''}</>
              : r.candidati.length ? 'Quale di questi?' : casa ? 'Non trovato nella tua collezione: se ce l’hai, cercalo e aggiungilo' : 'Non trovato nel catalogo'}
            {!casa && gia ? ` · già in ludoteca: ${gia.posizione || 'senza posizione'}, ${gia.copie} ${gia.copie === 1 ? 'copia' : 'copie'} (verrà aggiornato)` : ''}
            {casa && gia?.posizione && gia.posizione !== r.posizione.trim() ? ` · ora sta in: ${gia.posizione}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.4rem 0' }}>
          <input aria-label={`Posizione di ${r.letto}`} value={r.posizione} placeholder="Posizione"
            onChange={(e) => cambia(r.k, { posizione: e.target.value })} style={{ width: '7rem' }} />
          {!casa && (
            <>
              <input aria-label={`Copie di ${r.letto}`} type="number" inputMode="numeric" min="1" max="99" value={r.copie}
                onChange={(e) => cambia(r.k, { copie: numeroCopie(e.target.value) })} style={{ width: '4rem', textAlign: 'center' }} />
              <span className="anno">{r.copie === 1 ? 'copia' : 'copie'}</span>
            </>
          )}
        </div>
        <span className="azioni-iscritto">
          {r.scelta && r.incerto && (
            <button className="bottone-piatto" onClick={() => cambia(r.k, { incerto: false })}>è giusto</button>
          )}
          {r.scelta && (
            <button className="bottone-piatto" onClick={() => setAperta(aperta === r.k ? null : r.k)}>
              {aperta === r.k ? 'annulla' : 'cambia'}
            </button>
          )}
          {!r.scelta && !r.candidati.length && aperta !== r.k && (
            <button className="bottone-piatto" onClick={() => setAperta(r.k)}>{casa ? 'cerca e aggiungi' : 'cerca'}</button>
          )}
          <button className="bottone-piatto pericolo" onClick={() => cambia(r.k, { salta: true })}>salta</button>
        </span>
        {(!r.scelta && r.candidati.length > 0) || aperta === r.k ? (
          <div style={{ marginTop: '0.5rem' }}>
            {altri.length > 0 && (
              <ul className="elenco">
                {altri.map((c) => (
                  <li key={c.gioco_id}>
                    <button type="button" className="voce-scelta" onClick={() => scegli(r.k, c)}>
                      {c.immagine_url
                        ? <img src={c.immagine_url} alt="" className="copertina" />
                        : <span className="copertina copertina-vuota" aria-hidden="true" />}
                      <span className="voce-testo">
                        <strong>{c.nome}</strong>{c.anno ? <span className="anno"> {c.anno}</span> : null}
                        {c.trovato && c.trovato !== c.nome && <span className="anno block">anche «{c.trovato}»</span>}
                        {c.espansione && <span className="anno block">espansione</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {aperta === r.k ? (
              <CercaGiocoBgg testoIniziale={r.letto} onScegli={(g) => scegli(r.k, g)} />
            ) : (
              <button className="bottone-piatto" onClick={() => setAperta(r.k)}>nessuno di questi: cerca</button>
            )}
          </div>
        ) : null}
      </li>
    )
  }

  if (fase === 'carica') {
    return (
      <div>
        <ol className="aiuto" style={{ paddingLeft: '1.2rem' }}>
          <li>Copia il messaggio per l’AI e incollalo in Claude, ChatGPT o un’altra app che legge le foto.</li>
          <li>Manda le foto dei ripiani, scrivendo per ognuna la posizione (es. B3).</li>
          <li>Copia il CSV che ti restituisce e incollalo qui sotto, oppure carica il file.</li>
        </ol>
        <button className="bottone bottone-secondario" onClick={copiaMessaggio}>
          {copiato ? 'Messaggio copiato ✓' : 'Copia il messaggio per l’AI'}
        </button>
        <div className="campo" style={{ marginTop: '0.8rem' }}>
          <label htmlFor="lud-csv">{casa ? 'CSV (titolo;posizione;note)' : 'CSV (titolo;posizione;copie;note)'}</label>
          <textarea id="lud-csv" rows={6} value={testo} onChange={(e) => setTesto(e.target.value)}
            placeholder={casa
              ? 'titolo;posizione;note\nCarcassonne;B3;\nTicket to Ride: Europe;B3;da verificare'
              : 'titolo;posizione;copie;note\nCarcassonne;B3;2;\nTicket to Ride: Europe;B3;1;scatola rovinata'}
            style={{ width: '100%', fontFamily: 'monospace' }} />
        </div>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={sceltoFile} className="campo-file"
          aria-label="Oppure scegli il file CSV" />
        <div className="campo" style={{ marginTop: '0.8rem' }}>
          <label htmlFor="lud-posdef">Posizione per le righe che non ce l’hanno (facoltativa)</label>
          <input id="lud-posdef" value={posDefault} onChange={(e) => setPosDefault(e.target.value)} placeholder="Es. B3" />
        </div>
        {errore && <div className="avviso errore">{errore}</div>}
        <button className="bottone" onClick={() => analizza()} disabled={!testo.trim() || Boolean(lavoro)}>
          {lavoro || 'Leggi il CSV'}
        </button>
        {progresso && (
          <div style={{ margin: '0.6rem 0' }}>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={progresso.totale} aria-valuenow={progresso.fatti}
              aria-label="Titoli presi da BGG"
              style={{ height: '0.75rem', borderRadius: '999px', border: '1px solid var(--bordo)', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.round((progresso.fatti / Math.max(1, progresso.totale)) * 100)}%`,
                height: '100%', background: 'var(--primario)', transition: 'width 0.4s',
              }} />
            </div>
            <p className="aiuto" style={{ margin: '0.3rem 0 0', textAlign: 'center' }}>
              {progresso.fatti} di {progresso.totale} giochi ({Math.round((progresso.fatti / Math.max(1, progresso.totale)) * 100)}%)
            </p>
          </div>
        )}
        {nomiInCorso && (
          <button className="bottone-piatto" onClick={() => { fermaNomi.current = true }}>
            salta per ora (si riprende al prossimo import)
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {avvisoNomi && <div className="avviso">{avvisoNomi}</div>}
      <p className="aiuto">
        {righe.length} righe lette: {pronte.length} pronte, {daControllare.length} da controllare
        {casa && fuoriCollezione.length ? `, ${fuoriCollezione.length} non nella tua collezione` : ''}
        {saltate.length ? `, ${saltate.length} saltate` : ''}.{' '}
        {casa
          ? 'Si aggiorna la posizione; i giochi che scegli di aggiungere entrano nella collezione. Una posizione vuota lascia quella che c’era.'
          : 'Un gioco già in ludoteca prende la nuova posizione e le nuove copie.'}
      </p>

      {daControllare.length > 0 && (
        <>
          <h3 className="titolo-sezione">Da controllare <span className="conteggio">{daControllare.length}</span></h3>
          <ul className="elenco">{daControllare.map(riga)}</ul>
        </>
      )}

      {pronte.length > 0 && (
        <>
          <h3 className="titolo-sezione">Pronti <span className="conteggio">{pronte.length}</span></h3>
          <ul className="elenco">{pronte.map(riga)}</ul>
        </>
      )}

      {fuoriCollezione.length > 0 && (
        <>
          <h3 className="titolo-sezione">Non nella tua collezione <span className="conteggio">{fuoriCollezione.length}</span></h3>
          <p className="aiuto">Se ce l’hai, tocca «cerca e aggiungi»: la ricerca guarda il catalogo e BGG, e il gioco entra nella tua collezione come aggiunto a mano (la sincronizzazione con BGG non lo toglie). Quelli che lasci così non si salvano.</p>
          <ul className="elenco">{fuoriCollezione.map(riga)}</ul>
        </>
      )}

      {saltate.length > 0 && (
        <p className="aiuto">
          Saltati: {saltate.map((r) => r.letto).join(', ')}.{' '}
          <button className="bottone-piatto" onClick={() => setRighe((rr) => rr.map((r) => ({ ...r, salta: false })))}>riprendili</button>
        </p>
      )}

      {errore && <div className="avviso errore">{errore}</div>}
      <div className="riga-bottoni">
        <button className="bottone" onClick={salva} disabled={daControllare.length > 0 || !pronte.length || Boolean(lavoro)}>
          {lavoro || (daControllare.length ? `Mancano ${daControllare.length} da controllare`
            : casa ? `Salva ${pronte.length} ${pronte.length === 1 ? 'posizione' : 'posizioni'}` : `Salva ${pronte.length} nella ludoteca`)}
        </button>
        <button className="bottone-piatto" onClick={() => { setFase('carica'); setRighe([]) }}>ricomincia</button>
      </div>
    </div>
  )
}
