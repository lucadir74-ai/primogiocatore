// Primo Giocatore - importa da Board Game Arena
// v2.0.0 - 202610182100 (aggiornamento in un tocco)
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

  const [base, setBase] = useState(null)
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

      {fase === 'attesa' && !daLink && (
        <>
          <h3 className="titolo-sezione">Per aggiornare</h3>
          <ol className="aiuto" style={{ paddingLeft: '1.2rem' }}>
            <li>Su BGA, da entrato, apri la tua <strong>Cronologia delle partite</strong>.</li>
            <li>Tocca la barra degli indirizzi, scrivi <strong>PG da BGA</strong> e tocca il suggerimento
              con la stellina, senza premere Invio.</li>
            <li>Dopo pochi secondi tocca <strong>Apri in Primo Giocatore</strong>: le partite nuove
              entrano da sole. Ti chiede qualcosa solo se c&rsquo;è un gioco mai visto da abbinare.</li>
          </ol>
          <h3 className="titolo-sezione">Il segnalibro</h3>
          <p className="aiuto">
            Va salvato una volta nei preferiti di Chrome (⋮ → stellina → Modifica): nome
            {' '}<strong>PG da BGA</strong>, e al posto dell&rsquo;indirizzo il segnalibro copiato da qui.
            Deve iniziare con <code>javascript:</code>. Se l&rsquo;avevi già, sostituiscilo con questo.
          </p>
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
      )}

      {fase === 'attesa' && (
        <>
          <h3 className="titolo-sezione">Se il collegamento non funziona</h3>
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
    </div>
  )
}
