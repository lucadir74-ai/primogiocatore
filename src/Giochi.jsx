// Primo Giocatore - schermata Giochi
// v4.11.0 - 202609210130

import { useEffect, useRef, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import Collezione from './Collezione.jsx'

const TIPI_PUNTEGGIO = [
  { id: 'punti', etichetta: 'Punti' },
  { id: 'categorie', etichetta: 'Punti divisi per voce' },
  { id: 'coop', etichetta: 'Cooperativo' },
  { id: 'posizione', etichetta: 'Solo piazzamento' },
  { id: 'obiettivo', etichetta: 'Per obiettivo' },
]

export default function Giochi({ profilo }) {
  const [catalogo, setCatalogo] = useState([])
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState(null)
  const [cercando, setCercando] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [importando, setImportando] = useState(false)
  const [manuale, setManuale] = useState(null) // null = chiuso
  const [vista, setVista] = useState('catalogo')
  const [posseduti, setPosseduti] = useState(new Set()) // collezione BGG
  const [giocati, setGiocati] = useState(new Set())     // partite registrate
  const [cercaCatalogo, setCercaCatalogo] = useState('')
  const [completando, setCompletando] = useState(0) // quanti ne mancano
  const giaTentati = useRef(new Set())
  const inCorso = useRef(false)

  useEffect(() => { caricaCatalogo(); caricaMiei() }, [])

  // La pagina è personale: ognuno vede solo la propria collezione e i
  // giochi a cui ha giocato senza possederli. Il catalogo comune resta nel
  // database perché le partite puntano lì, ma non si sfoglia.
  async function caricaMiei() {
    try {
      const [c, p] = await Promise.all([
        tutteLeRighe(() => supabase.from('collezioni').select('gioco_id').eq('utente_id', profilo.id)),
        tutteLeRighe(() => supabase.from('partecipazioni')
          .select('partite ( gioco_id )').eq('utente_id', profilo.id)),
      ])
      setPosseduti(new Set(c.map((r) => r.gioco_id)))
      setGiocati(new Set(p.map((r) => r.partite?.gioco_id).filter(Boolean)))
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function caricaCatalogo() {
    try {
      const righe = await tutteLeRighe(() => supabase
        .from('giochi')
        .select('id, bgg_id, nome, anno, min_giocatori, max_giocatori, immagine_url, tipo_punteggio, usa_fazioni, creato_da')
        .order('nome'))
      setCatalogo(righe)
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function cerca() {
    if (query.trim().length < 2) {
      setErrore('Scrivi almeno due lettere.')
      return
    }
    setErrore('')
    setMessaggio('')
    setCercando(true)
    try {
      const r = await fetch(`/api/bgg?azione=cerca&q=${encodeURIComponent(query.trim())}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Ricerca non riuscita.')
      setRisultati(dati.risultati.slice(0, 25))
      if (dati.risultati.length === 0) setMessaggio('Nessun gioco con questo nome su BGG.')
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercando(false)
    }
  }

  // Prende i dati completi da BGG e salva il gioco nel catalogo.
  async function aggiungi(bggId) {
    setErrore('')
    setMessaggio('')
    try {
      const r = await fetch(`/api/bgg?azione=dettagli&id=${bggId}`)
      const dati = await r.json()
      if (!r.ok) throw new Error(dati.errore || 'Non sono riuscito a leggere il gioco.')
      const g = dati.giochi[0]
      if (!g) throw new Error('BGG non ha restituito il gioco.')

      const { error } = await supabase.from('giochi').upsert(
        {
          bgg_id: g.bgg_id,
          nome: g.nome,
          anno: g.anno,
          min_giocatori: g.min_giocatori,
          max_giocatori: g.max_giocatori,
          durata_minuti: g.durata_minuti,
          immagine_url: g.immagine_url,
          immagine_grande: g.immagine_grande,
          creato_da: profilo.id,
        },
        { onConflict: 'bgg_id' }
      )
      if (error) throw error
      setMessaggio(`${g.nome} aggiunto. Comparirà qui quando lo giocherai o lo segnerai come tuo.`)
      caricaCatalogo()
      caricaMiei()
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function importaCollezione() {
    if (!profilo.bgg_username) {
      setErrore('Prima scrivi il tuo utente BoardGameGeek nel profilo.')
      return
    }
    setErrore('')
    setMessaggio('Chiedo la collezione a BGG. La prima volta può volerci qualche secondo.')
    setImportando(true)
    try {
      const r = await fetch(
        `/api/bgg?azione=collezione&utente=${encodeURIComponent(profilo.bgg_username)}`
      )
      const dati = await r.json()
      if (r.status === 202) throw new Error('BGG sta ancora preparando la collezione. Riprova fra poco.')
      if (!r.ok) throw new Error(dati.errore || 'Import non riuscito.')

      // Salva i giochi nel catalogo (solo nome e anno: i dettagli si
      // completano quando servono) e segna quali possiedi.
      const righe = dati.giochi.map((g) => ({
        bgg_id: g.bgg_id,
        nome: g.nome,
        anno: g.anno,
        creato_da: profilo.id,
      }))

      for (let i = 0; i < righe.length; i += 200) {
        const { error } = await supabase
          .from('giochi')
          .upsert(righe.slice(i, i + 200), { onConflict: 'bgg_id' })
        if (error) throw error
      }

      const { data: salvati, error: e2 } = await supabase
        .from('giochi')
        .select('id, bgg_id')
        .in('bgg_id', dati.giochi.map((g) => g.bgg_id))
      if (e2) throw e2

      const possedute = salvati.map((g) => ({
        utente_id: profilo.id,
        gioco_id: g.id,
        origine: 'bgg',
      }))
      for (let i = 0; i < possedute.length; i += 200) {
        const { error } = await supabase
          .from('collezioni')
          .upsert(possedute.slice(i, i + 200), { onConflict: 'utente_id,gioco_id' })
        if (error) throw error
      }

      setMessaggio(`Collezione importata: ${dati.totale} giochi.`)
      caricaCatalogo()
      caricaMiei()
    } catch (e) {
      setErrore(e.message)
      setMessaggio('')
    } finally {
      setImportando(false)
    }
  }

  // L'import della collezione porta solo nome e anno, perché chiedere a BGG
  // i dettagli di 139 giochi richiede minuti. Copertina, giocatori e durata
  // arrivano qui da sole, in sottofondo, venti per volta e solo per i tuoi
  // giochi. Se BGG non risponde si riprova alla prossima apertura.
  useEffect(() => {
    if (inCorso.current) return
    const mancanti = catalogo.filter((g) =>
      g.bgg_id && !g.immagine_url
      && (posseduti.has(g.id) || giocati.has(g.id))
      && !giaTentati.current.has(g.bgg_id))
    if (mancanti.length === 0) { setCompletando(0); return }

    let vivo = true
    inCorso.current = true
    setCompletando(mancanti.length)

    ;(async () => {
      for (let i = 0; i < mancanti.length && vivo; i += 20) {
        const gruppo = mancanti.slice(i, i + 20)
        gruppo.forEach((g) => giaTentati.current.add(g.bgg_id))
        try {
          const r = await fetch(`/api/bgg?azione=dettagli&id=${gruppo.map((g) => g.bgg_id).join(',')}`)
          const dati = await r.json()
          if (!r.ok || !dati.giochi?.length) continue
          const righe = dati.giochi.map((g) => ({
            bgg_id: g.bgg_id, nome: g.nome, anno: g.anno,
            min_giocatori: g.min_giocatori, max_giocatori: g.max_giocatori,
            durata_minuti: g.durata_minuti,
            immagine_url: g.immagine_url, immagine_grande: g.immagine_grande,
          }))
          const { error } = await supabase.from('giochi').upsert(righe, { onConflict: 'bgg_id' })
          if (error) continue
          if (!vivo) return
          // Aggiorno solo le righe toccate: niente ricarica dell'intero elenco.
          const perBgg = new Map(righe.map((x) => [x.bgg_id, x]))
          setCatalogo((c) => c.map((x) => (perBgg.has(x.bgg_id) ? { ...x, ...perBgg.get(x.bgg_id) } : x)))
        } catch { /* rete assente: si riprova alla prossima apertura */ }
        if (vivo) setCompletando((n) => Math.max(0, n - gruppo.length))
      }
      inCorso.current = false
      if (vivo) setCompletando(0)
    })()

    return () => { vivo = false; inCorso.current = false }
  }, [catalogo, posseduti, giocati])

  // Giochi già registrati con lo stesso nome (maiuscole e spazi non contano).
  const normale = (t) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const omonimi = (nome) => normale(nome)
    ? catalogo.filter((g) => normale(g.nome) === normale(nome))
    : []

  // Gioco non presente su BGG: prototipo, print and play, autoprodotto.
  async function salvaManuale() {
    setErrore('')
    setMessaggio('')
    if (!manuale.nome.trim()) {
      setErrore('Serve almeno il nome del gioco.')
      return
    }
    // Un gioco con lo stesso nome c'è già: di solito è lui, e crearne un
    // secondo divide le partite fra due voci. Si procede solo se confermi.
    if (omonimi(manuale.nome).length > 0 && !window.confirm(
      `Esiste già un gioco chiamato «${manuale.nome.trim()}». Se è lo stesso, annulla e usa quello: ` +
      'le partite registrate su due voci diverse non si sommano nelle statistiche.\n\n' +
      'Crearne comunque un altro?'
    )) return
    const { error } = await supabase.from('giochi').insert({
      nome: manuale.nome.trim(),
      anno: manuale.anno ? Number(manuale.anno) : null,
      min_giocatori: manuale.min ? Number(manuale.min) : null,
      max_giocatori: manuale.max ? Number(manuale.max) : null,
      durata_minuti: manuale.durata ? Number(manuale.durata) : null,
      tipo_punteggio: manuale.tipo_punteggio,
      creato_da: profilo.id,
    })
    if (error) { setErrore(error.message); return }
    setMessaggio(`${manuale.nome.trim()} aggiunto a mano.`)
    setManuale(null)
    caricaCatalogo()
  }

  async function cambiaFazioni(giocoId, valore) {
    const { error } = await supabase.from('giochi').update({ usa_fazioni: valore }).eq('id', giocoId)
    if (error) setErrore(error.message)
    else setCatalogo((c) => c.map((g) => (g.id === giocoId ? { ...g, usa_fazioni: valore } : g)))
  }

  async function cambiaPunteggio(giocoId, tipo) {
    const { error } = await supabase.from('giochi').update({ tipo_punteggio: tipo }).eq('id', giocoId)
    if (error) setErrore(error.message)
    else setCatalogo((c) => c.map((g) => (g.id === giocoId ? { ...g, tipo_punteggio: tipo } : g)))
  }

  const giaInCatalogo = (bggId) => catalogo.some((g) => g.bgg_id === bggId)

  const miei = catalogo.filter((g) => posseduti.has(g.id))
  const soloGiocati = catalogo.filter((g) => !posseduti.has(g.id) && giocati.has(g.id))
  const totaleMiei = miei.length + soloGiocati.length

  // Un elenco di giochi con le loro impostazioni, filtrato dalla ricerca.
  function elenco(giochi) {
    const cerca = cercaCatalogo.trim().toLowerCase()
    const visibili = giochi.filter((g) => !cerca || g.nome.toLowerCase().includes(cerca))
    if (visibili.length === 0) return <p className="aiuto">Nessun gioco con questo nome.</p>
    return (
      <ul className="elenco elenco-catalogo">
        {visibili.slice(0, 300).map((g) => (
        <li key={g.id}>
          <div className="gioco">
            {g.immagine_url && <img src={g.immagine_url} alt="" className="copertina" />}
            <div>
              <strong>{g.nome}</strong>
              {g.anno ? <span className="anno"> {g.anno}</span> : null}
              {posso(g) ? (
                <>
                  <select
                    className="scelta-punteggio"
                    value={g.tipo_punteggio || 'punti'}
                    onChange={(e) => cambiaPunteggio(g.id, e.target.value)}
                  >
                    {TIPI_PUNTEGGIO.map((t) => (
                      <option key={t.id} value={t.id}>{t.etichetta}</option>
                    ))}
                  </select>
                  <label className="spunta-fazioni">
                    <input
                      type="checkbox"
                      checked={Boolean(g.usa_fazioni)}
                      onChange={(e) => cambiaFazioni(g.id, e.target.checked)}
                    />
                    ha fazioni
                  </label>
                </>
              ) : (
                <span className="anno block">
                  {TIPI_PUNTEGGIO.find((t) => t.id === (g.tipo_punteggio || 'punti'))?.etichetta}
                  {g.usa_fazioni ? ' · con fazioni' : ''}
                </span>
              )}
            </div>
          </div>
        </li>
        ))}
      </ul>
    )
  }


  // Le impostazioni di un gioco valgono per tutti: le cambia chi ha
  // aggiunto la voce, o un organizzatore.
  const posso = (g) => g.creato_da === profilo.id || profilo.organizzatore

  return (
    <div className="scheda">
      <h2>Giochi</h2>

      <div className="sottoschede">
        <button className={vista === 'catalogo' ? 'attiva' : ''} onClick={() => setVista('catalogo')}>
          Catalogo
        </button>
        <button className={vista === 'collezione' ? 'attiva' : ''} onClick={() => setVista('collezione')}>
          La mia collezione
        </button>
      </div>

      {vista === 'collezione' ? <Collezione profilo={profilo} /> : <>

      <p className="sottotitolo">
        Cerca un gioco su BoardGameGeek e aggiungilo, oppure porta dentro tutta la tua collezione.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <div className="campo">
        <label htmlFor="cerca">Cerca su BoardGameGeek</label>
        <div className="riga-ricerca">
          <input
            id="cerca"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cerca()}
            placeholder="Scythe, Brass, Hegemony…"
          />
          <button className="bottone bottone-stretto" onClick={cerca} disabled={cercando}>
            {cercando ? '\u2026' : 'Cerca'}
          </button>
        </div>
        <p className="aiuto">
          La ricerca parte quando premi il tasto: BGG chiede di non tempestarlo di richieste.
        </p>
      </div>

      {risultati && (
        <ul className="elenco">
          {risultati.map((r) => (
            <li key={r.bgg_id}>
              <div>
                <strong>{r.nome}</strong>
                {r.anno ? <span className="anno"> {r.anno}</span> : null}
              </div>
              {giaInCatalogo(r.bgg_id) ? (
                <span className="gia">già in catalogo</span>
              ) : (
                <button className="bottone-piatto" onClick={() => aggiungi(r.bgg_id)}>
                  Aggiungi
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button className="bottone bottone-secondario" onClick={importaCollezione} disabled={importando}>
        {importando ? 'Importo\u2026' : 'Importa la mia collezione BGG'}
      </button>

      {manuale === null ? (
        <p className="riga-fondo">
          Il gioco non è su BGG?{' '}
          <button
            className="bottone-piatto"
            onClick={() =>
              setManuale({ nome: '', anno: '', min: '', max: '', durata: '', tipo_punteggio: 'punti' })
            }
          >
            Aggiungilo a mano
          </button>
        </p>
      ) : (
        <div className="riquadro-manuale">
          <h3 className="titolo-sezione">Gioco senza BGG</h3>
          <p className="aiuto">Per prototipi, print and play e autoprodotti.</p>

          <div className="campo">
            <label htmlFor="m-nome">Nome</label>
            <input
              id="m-nome"
              value={manuale.nome}
              onChange={(e) => setManuale({ ...manuale, nome: e.target.value })}
            />
            {omonimi(manuale.nome).length > 0 && (
              <p className="aiuto" role="status">
                C&rsquo;è già un gioco con questo nome
                {omonimi(manuale.nome).some((g) => g.bgg_id) ? ', preso da BoardGameGeek' : ''}.
                Se è lo stesso non serve crearlo: lo trovi quando registri la partita.
              </p>
            )}
          </div>

          <div className="riga-campi">
            <div className="campo">
              <label htmlFor="m-min">Da</label>
              <input id="m-min" type="number" min="1" value={manuale.min}
                onChange={(e) => setManuale({ ...manuale, min: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="m-max">A</label>
              <input id="m-max" type="number" min="1" value={manuale.max}
                onChange={(e) => setManuale({ ...manuale, max: e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="m-dur">Minuti</label>
              <input id="m-dur" type="number" min="1" value={manuale.durata}
                onChange={(e) => setManuale({ ...manuale, durata: e.target.value })} />
            </div>
          </div>

          <div className="campo">
            <label htmlFor="m-tipo">Come si conta il punteggio</label>
            <select
              id="m-tipo"
              className="scelta-punteggio larga"
              value={manuale.tipo_punteggio}
              onChange={(e) => setManuale({ ...manuale, tipo_punteggio: e.target.value })}
            >
              {TIPI_PUNTEGGIO.map((t) => (
                <option key={t.id} value={t.id}>{t.etichetta}</option>
              ))}
            </select>
          </div>

          <div className="riga-bottoni">
            <button className="bottone" onClick={salvaManuale}>Salva gioco</button>
            <button className="bottone bottone-secondario" onClick={() => setManuale(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {completando > 0 && (
        <p className="aiuto" role="status">
          Sto recuperando le copertine da BoardGameGeek: ne mancano {completando}.
          Puoi continuare a usare l&rsquo;app.
        </p>
      )}

      <p className="aiuto">
        Qui ci sono solo i tuoi giochi: quelli della tua collezione BGG e quelli a cui hai
        giocato senza possederli. Da ogni riga imposti come si conta il punteggio e se ci
        sono fazioni: sono le impostazioni che decidono cosa ti chiede la schermata della partita.
      </p>

      {totaleMiei > 10 && (
        <input className="campo-cerca" value={cercaCatalogo}
          onChange={(e) => setCercaCatalogo(e.target.value)}
          placeholder="Cerca fra i tuoi giochi" aria-label="Cerca fra i tuoi giochi" />
      )}

      {totaleMiei === 0 ? (
        <p className="aiuto">
          Non hai ancora giochi. Importa la tua collezione BGG qui sopra, oppure registra
          una partita: il gioco comparirà qui da solo.
        </p>
      ) : (
        <>
          <h3 className="titolo-sezione">
            Nella tua collezione <span className="conteggio">{miei.length}</span>
          </h3>
          {miei.length === 0
            ? <p className="aiuto">Nessuno: importa la collezione da BGG qui sopra.</p>
            : elenco(miei)}

          {soloGiocati.length > 0 && (
            <>
              <h3 className="titolo-sezione">
                Giocati, non tuoi <span className="conteggio">{soloGiocati.length}</span>
              </h3>
              {elenco(soloGiocati)}
            </>
          )}
        </>
      )}

      </>}
    </div>
  )
}
