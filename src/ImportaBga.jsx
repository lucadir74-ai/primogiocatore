// Primo Giocatore - importa da Board Game Arena
// v3.1.0 - 202610242030 (Aggiorna ora tiene lo schermo acceso finché lavora, per non far cadere la connessione)
//
// Due modi di arrivare qui:
// - dal profilo (Dati e import): istruzioni, segnalibro da salvare,
//   casella per incollare i dati copiati;
// - dal collegamento «Apri in Primo Giocatore» del segnalibro
//   (?bga=1#bga=…): le partite sono nell'indirizzo e si parte da soli.
//
// Se non ci sono giochi nuovi da abbinare né partite incerte, importa
// subito: un aggiornamento normale è un tocco su BGA e uno qui.

import { useEffect, useRef, useState } from 'react'
import CercaGiocoBgg from './CercaGiocoBgg.jsx'
import {
  segnalibroBga, baseSegnalibro, analizzaBga, salvaAbbinamento, classificaBga, importaBga,
  chiamaBga, leggiDaServer,
} from './bga'

const campoTesto = {
  width: '100%', minHeight: '5.5rem', font: 'inherit', fontSize: '0.8rem', padding: '0.6rem',
  borderRadius: 10, border: '1px solid var(--bordo)', background: 'var(--carta)', color: 'var(--inchiostro)',
}

// incorporata: dentro la pagina Dati e import, senza riquadro e titolo propri.
export default function ImportaBga({ profilo, daLink = false, onChiudi, incorporata = false }) {
  const [fase, setFase] = useState('attesa')   // attesa | giochi | anteprima | lavoro | fatto
  const [errore, setErrore] = useState('')
  const [avviso, setAvviso] = useState('')
  const [analisi, setAnalisi] = useState(null)
  const [classi, setClassi] = useState(null)
  const [incerteNuove, setIncerteNuove] = useState(false)
  const [avanzamento, setAvanzamento] = useState(null)
  const [esito, setEsito] = useState(null)
  const [incollato, setIncollato] = useState('')
  const [copiato, setCopiato] = useState(false)
  const [cambio, setCambio] = useState(null)    // bga_nome con la ricerca aperta
  const [salto, setSalto] = useState([])         // giochi lasciati fuori stavolta
  const ricevuto = useRef(false)

  const [base, setBase] = useState(null)
  const [collegamento, setCollegamento] = useState(null)   // null = sto controllando
  const [utenteBga, setUtenteBga] = useState('')
  const [passwordBga, setPasswordBga] = useState('')
  const [occupato, setOccupato] = useState(false)

  // Collegato con password? (Nella scheda aperta dal segnalibro non serve.)
  useEffect(() => {
    if (daLink) return
    chiamaBga('stato').then(setCollegamento).catch(() => setCollegamento({ collegato: false }))
  }, [profilo.id, daLink])

  async function collega() {
    setErrore(''); setAvviso(''); setOccupato(true)
    try {
      const r = await chiamaBga('collega', { utente: utenteBga.trim(), password: passwordBga })
      setCollegamento({ collegato: true, bga_id: r.bgaId, bga_nome: r.nome })
      profilo.bga_id = r.bgaId   // per questa sessione: il profilo si ricarica alla prossima apertura
      setAvviso(`Collegato come ${r.nome}. Le partite nuove arriveranno da sole quando apri l’app.`)
    } catch (e) { setErrore(e.message) } finally { setPasswordBga(''); setOccupato(false) }
  }

  async function scollega() {
    if (!confirm('Scollegare BGA? I dati di accesso salvati vengono cancellati; le partite già importate restano.')) return
    setErrore(''); setOccupato(true)
    try {
      await chiamaBga('scollega')
      setCollegamento({ collegato: false })
      setAvviso('BGA scollegato.')
    } catch (e) { setErrore(e.message) } finally { setOccupato(false) }
  }

  async function aggiornaOra(tutto = false) {
    setErrore(''); setAvviso(''); setFase('lavoro')
    // Uno storico lungo richiede minuti: se il telefono spegne lo schermo
    // il browser taglia la connessione («Failed to fetch»). Si tiene
    // acceso finché si lavora, dove il browser lo permette.
    let schermo = null
    try { schermo = await navigator.wakeLock?.request('screen') } catch { /* non supportato: pazienza */ }
    try {
      const dati = await leggiDaServer(profilo, { tutto, avanzamento: setAvanzamento })
      if (dati.scaduta) {
        setCollegamento((c) => ({ ...c, ultimo_errore: 'scaduta' }))
        setErrore('La sessione BGA è scaduta: inserisci di nuovo la password per ricollegare.')
        setAvanzamento(null); setFase('attesa')
        return
      }
      if (dati.scollegato) { setCollegamento({ collegato: false }); setAvanzamento(null); setFase('attesa'); return }
      await ricevi(dati)
    } catch (e) {
      setErrore(/failed to fetch|load failed|networkerror/i.test(e.message)
        ? 'La connessione si è interrotta durante l’importazione. Tieni l’app aperta in primo piano, con lo schermo acceso, e tocca di nuovo «Aggiorna ora».'
        : e.message)
      setAvanzamento(null); setFase('attesa')
    } finally { schermo?.release?.().catch(() => {}) }
  }
  const codice = segnalibroBga(window.location.origin, base || { id: profilo.bga_id })

  // Il segnalibro porta dentro il tuo numero BGA e l'ultima partita
  // importata: anche appena copiato, legge solo le partite nuove.
  useEffect(() => {
    baseSegnalibro(profilo).then(setBase).catch(() => {})
  }, [profilo.id])

  // Arrivo dal collegamento del segnalibro: le partite sono dopo il #.
  useEffect(() => {
    if (!daLink || ricevuto.current) return
    const h = window.location.hash
    if (!h.startsWith('#bga=')) return
    ricevuto.current = true
    try { window.history.replaceState(null, '', window.location.pathname + '?bga=1') } catch { /* niente */ }
    try {
      ricevi(JSON.parse(decodeURIComponent(h.slice(5))))
    } catch {
      setErrore('Il collegamento da BGA è arrivato incompleto: su BGA usa «Copia i dati» e incollali qui.')
      ricevuto.current = false
    }
  }, [daLink, profilo.id])

  async function ricevi(dati) {
    setErrore(''); setAvviso(''); setFase('lavoro')
    setAvanzamento({ fase: `Controllo ${dati.tavoli?.length || 0} partite`, fatto: 0, totale: 1 })
    try {
      const a = await analizzaBga(profilo, dati)
      setAnalisi(a)
      setSalto([])
      setAvanzamento(null)
      if (!a.tavoli.length) {
        setEsito({ niente: true, giaImportati: a.giaImportati })
        setFase('fatto')
      } else if (a.giochiDaAbbinare.length) setFase('giochi')
      else await prepara(a, true)
    } catch (e) {
      setErrore(e.message); setFase('attesa'); setAvanzamento(null); ricevuto.current = false
    }
  }

  function daIncollato() {
    try {
      const dati = JSON.parse(incollato.trim())
      if (dati?.tipo !== 'pg-bga-dati') throw new Error()
      ricevi(dati)
    } catch {
      setErrore('Il testo incollato non è quello copiato dal segnalibro BGA.')
    }
  }

  async function copiaCodice() {
    try { await navigator.clipboard.writeText(codice); setCopiato(true) } catch { setCopiato(false) }
  }

  // Abbinamento di un gioco BGA. gioco: { bgg_id, nome }
  async function abbina(voce, gioco) {
    setErrore('')
    try {
      await salvaAbbinamento(voce.bga_nome, gioco)
      const mappa = new Map(analisi.mappa)
      mappa.set(voce.bga_nome, { bgg_id: gioco.bgg_id, nome: gioco.nome })
      setAnalisi({ ...analisi, mappa, giochiDaAbbinare: analisi.giochiDaAbbinare.filter((g) => g.bga_nome !== voce.bga_nome) })
      setCambio(null)
    } catch (e) { setErrore(e.message) }
  }

  async function confermaSuggeriti() {
    const conSuggerimento = daAbbinare.filter((g) => g.suggerito)
    setErrore('')
    try {
      for (const g of conSuggerimento) await salvaAbbinamento(g.bga_nome, g.suggerito)
      const mappa = new Map(analisi.mappa)
      for (const g of conSuggerimento) mappa.set(g.bga_nome, { bgg_id: g.suggerito.bgg_id, nome: g.suggerito.nome })
      const nomi = new Set(conSuggerimento.map((g) => g.bga_nome))
      setAnalisi({ ...analisi, mappa, giochiDaAbbinare: analisi.giochiDaAbbinare.filter((g) => !nomi.has(g.bga_nome)) })
    } catch (e) { setErrore(e.message) }
  }

  // automatico: niente da decidere (nessuna partita incerta) = si importa subito.
  async function prepara(a = analisi, automatico = false) {
    setErrore(''); setFase('lavoro')
    setAvanzamento({ fase: 'Cerco le partite che hai già', fatto: 0, totale: 1 })
    try {
      const c = await classificaBga(a)
      setClassi(c)
      setAvanzamento(null)
      if (automatico && !c.incerte.length) await importa(a, c)
      else setFase('anteprima')
    } catch (e) { setErrore(e.message); setAvanzamento(null); setFase(automatico ? 'attesa' : 'giochi') }
  }

  async function importa(a = analisi, c = classi) {
    setErrore(''); setFase('lavoro')
    try {
      const r = await importaBga({ profilo, analisi: a, classi: c, incerteNuove, avanzamento: setAvanzamento })
      setAvanzamento(null)
      setEsito({ ...r, senzaGioco: c.senzaGioco, giaImportati: a.giaImportati })
      setFase('fatto')
    } catch (e) { setErrore(e.message); setAvanzamento(null); setFase('anteprima') }
  }

  function ricomincia() {
    ricevuto.current = false
    setFase('attesa'); setAnalisi(null); setClassi(null); setEsito(null); setIncollato(''); setErrore('')
  }

  const daAbbinare = (analisi?.giochiDaAbbinare || []).filter((g) => !salto.includes(g.bga_nome))
  const partiteSaltate = (analisi?.giochiDaAbbinare || []).filter((g) => salto.includes(g.bga_nome))
    .reduce((s, g) => s + g.tavoli, 0)

  const Contenitore = incorporata ? 'div' : 'section'
  return (
    <Contenitore className={incorporata ? '' : 'scheda'}>
      {!incorporata && <h2>Importa da Board Game Arena</h2>}

      {errore && <div className="avviso errore">{errore}</div>}
      {avviso && <div className="avviso ok">{avviso}</div>}

      {avanzamento && (
        <div className="avanzamento">
          <span>{avanzamento.fase}</span>
          <div className="barra-avanzamento">
            <div style={{ width: `${(avanzamento.fatto / Math.max(1, avanzamento.totale)) * 100}%` }} />
          </div>
        </div>
      )}

      {fase === 'attesa' && !daLink && collegamento === null && <p className="aiuto">Controllo il collegamento&hellip;</p>}

      {fase === 'attesa' && !daLink && collegamento?.collegato && (
        <>
          <p className="aiuto">
            Collegato come <strong>{collegamento.bga_nome || 'giocatore BGA'}</strong>.
            {' '}Le partite nuove arrivano da sole, al massimo una volta all&rsquo;ora, quando apri l&rsquo;app.
            {collegamento.ultima_lettura && ` Ultima lettura: ${new Date(collegamento.ultima_lettura).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`}
          </p>
          {collegamento.ultimo_errore === 'scaduta' ? (
            <>
              <div className="avviso errore">La sessione BGA è scaduta: rimetti la password per ricollegare.</div>
              <ModuloAccesso utente={utenteBga} setUtente={setUtenteBga} password={passwordBga} setPassword={setPasswordBga}
                occupato={occupato} onInvia={collega} etichetta="Ricollega" />
            </>
          ) : (
            <button className="bottone" onClick={() => aggiornaOra(false)} disabled={occupato}>Aggiorna ora</button>
          )}
          <details className="dettagli-piccoli">
            <summary>Altre azioni</summary>
            <button className="bottone bottone-secondario" onClick={() => aggiornaOra(true)} disabled={occupato}>
              Rileggi tutto lo storico
            </button>
            <p className="aiuto">Serve solo se pensi che manchi qualcosa: le partite già importate vengono saltate.</p>
            <button className="bottone bottone-secondario" onClick={scollega} disabled={occupato}>Scollega BGA</button>
          </details>
        </>
      )}

      {fase === 'attesa' && !daLink && collegamento && !collegamento.collegato && (
        <>
          <p className="aiuto">
            Collega il tuo account BGA e le partite arriveranno da sole. La password serve una volta
            per entrare e non viene salvata: Primo Giocatore conserva solo la sessione di BGA, cifrata,
            che puoi cancellare quando vuoi con «Scollega» (o cambiando la password su BGA).
          </p>
          <ModuloAccesso utente={utenteBga} setUtente={setUtenteBga} password={passwordBga} setPassword={setPasswordBga}
            occupato={occupato} onInvia={collega} etichetta="Collega BGA" />

          <details className="dettagli-piccoli">
            <summary>Senza password: il segnalibro</summary>
            <ol className="aiuto" style={{ paddingLeft: '1.2rem' }}>
              <li>Copia il segnalibro e salvalo nei preferiti di Chrome (⋮ → stellina → Modifica) con nome
                {' '}<strong>PG da BGA</strong>, al posto dell&rsquo;indirizzo. Deve iniziare con <code>javascript:</code>.</li>
              <li>Su BGA apri la tua <strong>Cronologia delle partite</strong>, scrivi <strong>PG da BGA</strong> nella
                barra degli indirizzi e tocca il suggerimento con la stellina.</li>
              <li>Tocca <strong>Apri in Primo Giocatore</strong>.</li>
            </ol>
            <button className="bottone bottone-secondario" onClick={copiaCodice}>
              {copiato ? 'Segnalibro copiato' : 'Copia il segnalibro'}
            </button>
            {!copiato && <textarea readOnly value={codice} style={campoTesto} onFocus={(e) => e.target.select()} aria-label="Segnalibro" />}
            <p className="aiuto">Se il collegamento non si apre, nel riquadro su BGA tocca «Copia i dati» e incolla qui.</p>
            <textarea value={incollato} onChange={(e) => setIncollato(e.target.value)} style={campoTesto}
              placeholder="Incolla qui i dati copiati da BGA" aria-label="Dati copiati da BGA" />
            <button className="bottone bottone-secondario" onClick={daIncollato} disabled={!incollato.trim()}>
              Usa i dati incollati
            </button>
          </details>
        </>
      )}

      {fase === 'attesa' && daLink && (
        <>
          <p className="aiuto">Nel riquadro su BGA tocca «Copia i dati» e incolla qui.</p>
          <textarea value={incollato} onChange={(e) => setIncollato(e.target.value)} style={campoTesto}
            placeholder="Incolla qui i dati copiati da BGA" aria-label="Dati copiati da BGA" />
          <button className="bottone bottone-secondario" onClick={daIncollato} disabled={!incollato.trim()}>
            Usa i dati incollati
          </button>
        </>
      )}

      {fase === 'giochi' && analisi && (
        <>
          <h3 className="titolo-sezione">
            Giochi da riconoscere <span className="conteggio">{daAbbinare.length}</span>
          </h3>
          <p className="aiuto">
            BGA chiama i giochi a modo suo. Abbina ognuno al gioco di BGG: si fa una volta e vale per
            tutti gli iscritti. I suggerimenti vengono dalle partite che hai già.
          </p>
          {daAbbinare.some((g) => g.suggerito) && (
            <button className="bottone" onClick={confermaSuggeriti}>
              Conferma tutti i suggerimenti ({daAbbinare.filter((g) => g.suggerito).length})
            </button>
          )}
          <ul className="elenco">
            {daAbbinare.map((g) => (
              <li key={g.bga_nome} style={{ display: 'block' }}>
                <div className="nome-giocatore">
                  <strong>{g.bga_nome}</strong>
                  <span className="anno block">
                    {g.tavoli} {g.tavoli === 1 ? 'partita' : 'partite'}
                    {g.suggerito ? ` · sembra ${g.suggerito.nome}` : ' · nessun suggerimento'}
                    {g.suggerito?.perche === 'nome' ? ' (dal nome)' : ''}
                  </span>
                </div>
                <span className="azioni-iscritto">
                  {g.suggerito && cambio !== g.bga_nome && (
                    <button className="bottone-piatto" onClick={() => abbina(g, g.suggerito)}>è giusto</button>
                  )}
                  <button className="bottone-piatto" onClick={() => setCambio(cambio === g.bga_nome ? null : g.bga_nome)}>
                    {cambio === g.bga_nome ? 'annulla' : g.suggerito ? 'cambia' : 'scegli'}
                  </button>
                  <button className="bottone-piatto pericolo" onClick={() => setSalto([...salto, g.bga_nome])}>salta</button>
                </span>
                {cambio === g.bga_nome && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <CercaGiocoBgg profilo={profilo} autoFocus onScegli={(gioco) => abbina(g, gioco)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {salto.length > 0 && (
            <p className="aiuto">
              Lasciati fuori: {salto.join(', ')} ({partiteSaltate} partite). Torneranno la prossima volta.{' '}
              <button className="bottone-piatto" onClick={() => setSalto([])}>riprendili</button>
            </p>
          )}
          <button className="bottone" onClick={() => prepara()} disabled={daAbbinare.length > 0}>
            {daAbbinare.length ? `Mancano ${daAbbinare.length} giochi` : 'Avanti'}
          </button>
        </>
      )}

      {fase === 'anteprima' && classi && (
        <>
          <h3 className="titolo-sezione">Cosa succede</h3>
          <ul className="elenco">
            <li><span><strong>{classi.nuove.length}</strong> partite nuove da importare</span></li>
            <li><span><strong>{classi.collegate.length}</strong> già presenti (stessi punteggi): ricevono il numero del tavolo BGA</span></li>
            {classi.incerte.length > 0 && (
              <li><span><strong>{classi.incerte.length}</strong> probabilmente già presenti, ma senza punteggi da confrontare</span></li>
            )}
            {analisi.giaImportati > 0 && (
              <li><span><strong>{analisi.giaImportati}</strong> già importate da BGA in precedenza: saltate</span></li>
            )}
            {classi.senzaGioco > 0 && (
              <li><span><strong>{classi.senzaGioco}</strong> di giochi lasciati fuori: saltate per ora</span></li>
            )}
          </ul>
          {classi.incerte.length > 0 && (
            <label className="aiuto" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={incerteNuove} onChange={(e) => setIncerteNuove(e.target.checked)} />
              Importa le {classi.incerte.length} incerte come partite nuove (di solito non serve: rischi doppioni)
            </label>
          )}
          <button className="bottone" onClick={() => importa()}>Importa</button>
          <button className="bottone bottone-secondario" onClick={ricomincia}>Annulla</button>
        </>
      )}

      {fase === 'fatto' && esito && (
        <>
          <div className="avviso ok">
            {esito.niente
              ? `Niente di nuovo: ${esito.giaImportati} partite erano già state importate.`
              : `Fatto: ${esito.nuove} partite nuove, ${esito.collegate} già presenti collegate a BGA.`}
            {esito.senzaGioco ? ` ${esito.senzaGioco} partite di giochi lasciati fuori torneranno la prossima volta.` : ''}
          </div>
          <p className="aiuto">
            Da ora la sincronizzazione con BGG non riporta più le partite di Board Game Arena: arrivano solo da qui.
          </p>
          {daLink ? (
            <button className="bottone" onClick={onChiudi}>Vai all&rsquo;app</button>
          ) : (
            <button className="bottone bottone-secondario" onClick={ricomincia}>Fatto</button>
          )}
        </>
      )}

      {daLink && fase !== 'fatto' && fase !== 'lavoro' && (
        <button className="bottone bottone-secondario" onClick={onChiudi}>Torna all&rsquo;app</button>
      )}
    </Contenitore>
  )
}


function ModuloAccesso({ utente, setUtente, password, setPassword, occupato, onInvia, etichetta }) {
  return (
    <>
      <div className="campo">
        <label htmlFor="bga-utente">Nome utente o email BGA</label>
        <input id="bga-utente" value={utente} onChange={(e) => setUtente(e.target.value)} autoComplete="username" />
      </div>
      <div className="campo">
        <label htmlFor="bga-password">Password BGA</label>
        <input id="bga-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter' && utente.trim() && password) onInvia() }} />
      </div>
      <button className="bottone" onClick={onInvia} disabled={occupato || !utente.trim() || !password}>
        {occupato ? 'Collego…' : etichetta}
      </button>
    </>
  )
}
