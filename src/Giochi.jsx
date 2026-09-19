// Primo Giocatore - schermata Giochi
// v4.8.0 - 202609231800

import { useEffect, useState } from 'react'
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
  const [soloMiei, setSoloMiei] = useState(true)
  const [mieiGiochi, setMieiGiochi] = useState(new Set())
  const [cercaCatalogo, setCercaCatalogo] = useState('')

  useEffect(() => { caricaCatalogo(); caricaMiei() }, [])

  // I giochi che ti riguardano: quelli che possiedi e quelli che hai
  // giocato. Il resto del catalogo è di tutti, e resta a disposizione.
  async function caricaMiei() {
    const [c, p] = await Promise.all([
      tutteLeRighe(() => supabase.from('collezioni').select('gioco_id').eq('utente_id', profilo.id)),
      tutteLeRighe(() => supabase.from('partecipazioni')
        .select('partite ( gioco_id )').eq('utente_id', profilo.id)),
    ])
    const s = new Set(c.map((r) => r.gioco_id))
    for (const r of p) if (r.partite?.gioco_id) s.add(r.partite.gioco_id)
    setMieiGiochi(s)
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
      setMessaggio(`${g.nome} aggiunto.`)
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

  // Gioco non presente su BGG: prototipo, print and play, autoprodotto.
  async function salvaManuale() {
    setErrore('')
    setMessaggio('')
    if (!manuale.nome.trim()) {
      setErrore('Serve almeno il nome del gioco.')
      return
    }
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

      <h3 className="titolo-sezione">
        {soloMiei ? 'I giochi che ti riguardano' : 'Catalogo condiviso'}{' '}
        <span className="conteggio">
          {soloMiei ? mieiGiochi.size : catalogo.length}
        </span>
      </h3>

      <p className="aiuto">
        {soloMiei
          ? 'I giochi che possiedi o hai giocato. Da ogni riga imposti come si conta il punteggio e se ci sono fazioni: sono le impostazioni che decidono cosa ti chiede la schermata della partita.'
          : 'Tutti i giochi che l\u2019app conosce, aggiunti da chiunque: serve a non rifare due volte lo stesso lavoro. Il catalogo completo dei giochi resta BoardGameGeek.'}
      </p>

      <div className="sottoschede">
        <button className={!soloMiei ? 'attiva' : ''} onClick={() => setSoloMiei(false)}>
          Tutti
        </button>
        <button className={soloMiei ? 'attiva' : ''} onClick={() => setSoloMiei(true)}>
          Posseduti e giocati
        </button>
      </div>

      {catalogo.length > 10 && (
        <input className="campo-cerca" value={cercaCatalogo}
          onChange={(e) => setCercaCatalogo(e.target.value)}
          placeholder="Cerca nel catalogo" aria-label="Cerca nel catalogo" />
      )}

      {catalogo.length === 0 ? (
        <p className="aiuto">Ancora nessun gioco. Cercane uno qui sopra.</p>
      ) : (
        <ul className="elenco elenco-catalogo">
          {catalogo
            .filter((g) => !soloMiei || mieiGiochi.has(g.id))
            .filter((g) => !cercaCatalogo.trim()
              || g.nome.toLowerCase().includes(cercaCatalogo.trim().toLowerCase()))
            .slice(0, 300)
            .map((g) => (
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
      )}

      </>}
    </div>
  )
}
