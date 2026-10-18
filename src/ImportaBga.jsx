// Primo Giocatore - importa da Board Game Arena
// v1.0.0 - 202610181500
//
// Due modi di arrivare qui:
// - dal profilo (Dati e import): istruzioni, segnalibro da salvare,
//   casella per incollare i dati se il messaggio non passa;
// - dalla scheda che il segnalibro apre (?bga=1): l'app risponde
//   «pronta» alla pagina BGA, riceve le partite e parte da sola.
//
// Poi: abbinamento dei giochi BGA a quelli BGG (una volta per gioco,
// vale per tutti), anteprima con i conteggi, importazione.

import { useEffect, useRef, useState } from 'react'
import CercaGiocoBgg from './CercaGiocoBgg.jsx'
import {
  ORIGINE_BGA, segnalibroBga, statoBga, analizzaBga, salvaAbbinamento, classificaBga, importaBga,
} from './bga'

const campoTesto = {
  width: '100%', minHeight: '5.5rem', font: 'inherit', fontSize: '0.8rem', padding: '0.6rem',
  borderRadius: 10, border: '1px solid var(--bordo)', background: 'var(--carta)', color: 'var(--inchiostro)',
}

export default function ImportaBga({ profilo, daLink = false, onChiudi }) {
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

  const codice = segnalibroBga(window.location.origin)

  // Aperta dal segnalibro: si dice «pronta» alla pagina BGA finché
  // non arrivano le partite (la pagina può essere ancora in ascolto
  // mentre qui si fa l'accesso).
  useEffect(() => {
    if (!daLink || !window.opener) return
    let fermo = false
    // Si risponde solo dopo aver letto da dove ripartire: con «fino» a
    // zero il segnalibro rileggerebbe tutto lo storico.
    let stato = null
    statoBga(profilo).then((s) => { stato = s }).catch((e) => setErrore(e.message))

    function alMessaggio(e) {
      if (!ORIGINE_BGA.test(e.origin) || e.source !== window.opener) return
      if (e.data?.tipo !== 'pg-bga-dati' || ricevuto.current) return
      ricevuto.current = true
      try { e.source.postMessage({ tipo: 'pg-ricevuto', n: e.data.tavoli?.length || 0 }, e.origin) } catch { /* niente */ }
      ricevi(e.data)
    }
    window.addEventListener('message', alMessaggio)
    const giro = setInterval(() => {
      if (fermo || ricevuto.current || !stato) return
      try { window.opener?.postMessage({ tipo: 'pg-pronto', ...stato }, '*') } catch { /* niente */ }
    }, 1000)
    return () => { fermo = true; clearInterval(giro); window.removeEventListener('message', alMessaggio) }
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
      else await prepara(a)
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

  async function prepara(a = analisi) {
    setErrore(''); setFase('lavoro')
    setAvanzamento({ fase: 'Cerco le partite che hai già', fatto: 0, totale: 1 })
    try {
      setClassi(await classificaBga(a))
      setAvanzamento(null)
      setFase('anteprima')
    } catch (e) { setErrore(e.message); setAvanzamento(null); setFase('giochi') }
  }

  async function importa() {
    setErrore(''); setFase('lavoro')
    try {
      const r = await importaBga({ profilo, analisi, classi, incerteNuove, avanzamento: setAvanzamento })
      setAvanzamento(null)
      setEsito({ ...r, senzaGioco: classi.senzaGioco, giaImportati: analisi.giaImportati })
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

  return (
    <div className="scheda">
      <h2>Importa da Board Game Arena</h2>
      <p className="sottotitolo">
        Le tue partite BGA arrivano direttamente, senza passare da BG Stats o da BGG.
      </p>

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

      {fase === 'attesa' && (
        daLink && window.opener ? (
          <p className="aiuto">
            In attesa delle partite dalla pagina di BGA&hellip; Se resta ferma, torna alla scheda di BGA
            e usa «Copia i dati», poi incollali qui sotto.
          </p>
        ) : (
          <>
            <h3 className="titolo-sezione">Come si fa</h3>
            <ol className="aiuto" style={{ paddingLeft: '1.2rem' }}>
              <li>Copia il segnalibro con il tasto qui sotto.</li>
              <li>In Chrome salva una pagina qualsiasi nei preferiti (⋮ → stellina → Modifica), chiamalo
                {' '}<strong>PG da BGA</strong> e al posto dell&rsquo;indirizzo incolla il segnalibro.
                Controlla che inizi con <code>javascript:</code>. Si fa una volta sola.</li>
              <li>Su BGA, da entrato, apri la tua <strong>Cronologia delle partite</strong>.</li>
              <li>Tocca la barra degli indirizzi, scrivi <strong>PG da BGA</strong> e tocca il suggerimento
                con la stellina, senza premere Invio.</li>
              <li>Si apre Primo Giocatore e le partite arrivano da sole. La prima volta legge tutto lo
                storico e ci vogliono alcuni minuti: lascia aperta la pagina di BGA.</li>
            </ol>
            <button className="bottone" onClick={copiaCodice}>
              {copiato ? 'Segnalibro copiato' : 'Copia il segnalibro'}
            </button>
            {!copiato && (
              <details>
                <summary className="aiuto">Il tasto non copia? Il segnalibro è qui</summary>
                <textarea readOnly value={codice} style={campoTesto} onFocus={(e) => e.target.select()} />
              </details>
            )}
          </>
        )
      )}

      {fase === 'attesa' && (
        <>
          <h3 className="titolo-sezione">Se le partite non arrivano da sole</h3>
          <p className="aiuto">Nella pagina di BGA tocca «Copia i dati» e incolla qui.</p>
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
          <button className="bottone" onClick={importa}>Importa</button>
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
    </div>
  )
}
