// Primo Giocatore - schermata Giochi
// v1.3.0 - 202609141800

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

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

  useEffect(() => { caricaCatalogo() }, [])

  async function caricaCatalogo() {
    const { data, error } = await supabase
      .from('giochi')
      .select('id, bgg_id, nome, anno, min_giocatori, max_giocatori, immagine_url, tipo_punteggio')
      .order('nome')
    if (error) setErrore(error.message)
    else setCatalogo(data || [])
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
          creato_da: profilo.id,
        },
        { onConflict: 'bgg_id' }
      )
      if (error) throw error
      setMessaggio(`${g.nome} aggiunto al catalogo.`)
      caricaCatalogo()
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

  async function cambiaPunteggio(giocoId, tipo) {
    const { error } = await supabase.from('giochi').update({ tipo_punteggio: tipo }).eq('id', giocoId)
    if (error) setErrore(error.message)
    else setCatalogo((c) => c.map((g) => (g.id === giocoId ? { ...g, tipo_punteggio: tipo } : g)))
  }

  const giaInCatalogo = (bggId) => catalogo.some((g) => g.bgg_id === bggId)

  return (
    <div className="scheda">
      <h2>Giochi</h2>
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
        In catalogo <span className="conteggio">{catalogo.length}</span>
      </h3>

      {catalogo.length === 0 ? (
        <p className="aiuto">Ancora nessun gioco. Cercane uno qui sopra.</p>
      ) : (
        <ul className="elenco elenco-catalogo">
          {catalogo.map((g) => (
            <li key={g.id}>
              <div className="gioco">
                {g.immagine_url && <img src={g.immagine_url} alt="" className="copertina" />}
                <div>
                  <strong>{g.nome}</strong>
                  {g.anno ? <span className="anno"> {g.anno}</span> : null}
                  <select
                    className="scelta-punteggio"
                    value={g.tipo_punteggio || 'punti'}
                    onChange={(e) => cambiaPunteggio(g.id, e.target.value)}
                  >
                    {TIPI_PUNTEGGIO.map((t) => (
                      <option key={t.id} value={t.id}>{t.etichetta}</option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
