// Primo Giocatore - la collezione
// v3.9.0 - 202609211100
//
// Incrocia quello che possiedi con quello che giochi: quali scatole
// sono ferme, quali non hai mai aperto, quanto ti costa ogni partita.

import { useEffect, useMemo, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'

const giorno = (d) =>
  new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

const giorniDa = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)

function daQuanto(giorni) {
  if (giorni < 31) return `${giorni} giorni fa`
  const mesi = Math.round(giorni / 30.4)
  if (mesi < 24) return `${mesi} mesi fa`
  return `${(giorni / 365).toFixed(1)} anni fa`
}

const SEZIONI = [
  { id: 'fermi', etichetta: 'Fermi da più tempo' },
  { id: 'mai', etichetta: 'Mai giocati' },
  { id: 'piu', etichetta: 'I più giocati' },
  { id: 'fuori', etichetta: 'Giocati e non tuoi' },
]

export default function Collezione({ profilo }) {
  const [collezione, setCollezione] = useState([])
  const [partite, setPartite] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [sezione, setSezione] = useState('fermi')
  const [cerca, setCerca] = useState('')

  useEffect(() => { carica() }, [])

  async function carica() {
    setCaricamento(true)
    try {
      const [c, p] = await Promise.all([
        tutteLeRighe(() => supabase
          .from('collezioni')
          .select('gioco_id, origine, giochi ( id, nome, anno, immagine_url )')
          .eq('utente_id', profilo.id)),
        tutteLeRighe(() => supabase
          .from('partite')
          .select('gioco_id, giocata_il, giochi ( id, nome, immagine_url ), partecipazioni ( utente_id )')),
      ])
      setCollezione(c)
      setPartite(p)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCaricamento(false)
    }
  }

  const dati = useMemo(() => {
    // Quando ho giocato ciascun gioco, e quante volte.
    const uso = new Map()
    for (const p of partite) {
      if (!p.gioco_id) continue
      const v = uso.get(p.gioco_id) || { volte: 0, ultima: null }
      v.volte++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      uso.set(p.gioco_id, v)
    }

    const posseduti = collezione
      .filter((c) => c.giochi)
      .map((c) => ({
        id: c.gioco_id,
        nome: c.giochi.nome,
        anno: c.giochi.anno,
        immagine: c.giochi.immagine_url,
        ...(uso.get(c.gioco_id) || { volte: 0, ultima: null }),
      }))

    const idPosseduti = new Set(posseduti.map((g) => g.id))

    // Giocati ma non in collezione: quelli di altri, o provati in fiera.
    const fuori = new Map()
    for (const p of partite) {
      if (!p.giochi || idPosseduti.has(p.gioco_id)) continue
      const v = fuori.get(p.gioco_id) || {
        id: p.gioco_id, nome: p.giochi.nome, immagine: p.giochi.immagine_url,
        volte: 0, ultima: null,
      }
      v.volte++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      fuori.set(p.gioco_id, v)
    }

    const giocati = posseduti.filter((g) => g.volte > 0)

    return {
      posseduti,
      mai: posseduti.filter((g) => g.volte === 0).sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
      fermi: [...giocati].sort((a, b) => new Date(a.ultima) - new Date(b.ultima)),
      piu: [...giocati].sort((a, b) => b.volte - a.volte),
      fuori: [...fuori.values()].sort((a, b) => b.volte - a.volte),
      partiteSuPosseduti: giocati.reduce((t, g) => t + g.volte, 0),
    }
  }, [collezione, partite])

  if (caricamento) return <div className="scheda"><p>Conto&hellip;</p></div>

  const q = cerca.trim().toLowerCase()
  const filtra = (righe) => (q ? righe.filter((g) => g.nome.toLowerCase().includes(q)) : righe)
  const elenco = filtra(dati[sezione] || [])

  const fermiDaUnAnno = dati.fermi.filter((g) => giorniDa(g.ultima) > 365).length

  return (
    <div className="scheda">
      <h2>La tua collezione</h2>
      <p className="sottotitolo">Quello che possiedi, messo a confronto con quello che giochi.</p>

      {errore && <div className="avviso errore">{errore}</div>}

      {dati.posseduti.length === 0 ? (
        <p className="aiuto">
          Nessun gioco in collezione. Importala dalla scheda Giochi, oppure segna
          «è mio» sui giochi quando registri una partita.
        </p>
      ) : (
        <>
          <div className="numeroni">
            <div className="numerone">
              <span className="cifra">{dati.posseduti.length}</span>
              <span className="didascalia">posseduti</span>
            </div>
            <div className="numerone">
              <span className="cifra">{dati.posseduti.length - dati.mai.length}</span>
              <span className="didascalia">almeno una volta</span>
            </div>
            <div className={`numerone${dati.mai.length ? ' sotto' : ''}`}>
              <span className="cifra">{dati.mai.length}</span>
              <span className="didascalia">mai giocati</span>
            </div>
            <div className={`numerone${fermiDaUnAnno ? ' sotto' : ''}`}>
              <span className="cifra">{fermiDaUnAnno}</span>
              <span className="didascalia">fermi da oltre un anno</span>
            </div>
          </div>

          <div className="spiegone">
            <p>
              Dei {dati.posseduti.length} giochi che possiedi ne hai giocati{' '}
              {dati.posseduti.length - dati.mai.length}, per un totale di{' '}
              {dati.partiteSuPosseduti} partite. Fanno{' '}
              {(dati.partiteSuPosseduti / Math.max(1, dati.posseduti.length)).toFixed(1)} partite
              a scatola.
            </p>
          </div>

          <div className="sottoschede">
            {SEZIONI.map((s) => (
              <button key={s.id} className={sezione === s.id ? 'attiva' : ''}
                onClick={() => setSezione(s.id)}>
                {s.etichetta}
              </button>
            ))}
          </div>

          {(dati[sezione] || []).length > 8 && (
            <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca un gioco" aria-label="Cerca fra i giochi" />
          )}

          {sezione === 'fuori' && (
            <p className="aiuto">
              Giochi che hai provato senza possederli: di altri, in fiera, o online.
            </p>
          )}

          {elenco.length === 0 ? (
            <p className="aiuto">Niente da mostrare qui.</p>
          ) : (
            <ul className="elenco elenco-scorrevole">
              {elenco.slice(0, 200).map((g) => (
                <li key={g.id}>
                  <div className="gioco">
                    {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
                    <div className="nome-giocatore">
                      <strong>{g.nome}</strong>
                      <span className="anno block">
                        {g.volte === 0
                          ? 'mai giocato'
                          : `${g.volte} ${g.volte === 1 ? 'partita' : 'partite'} · ultima ${giorno(g.ultima)}`}
                      </span>
                      {g.volte > 0 && sezione === 'fermi' && (
                        <span className={`anno block${giorniDa(g.ultima) > 365 ? ' fazione-nota' : ''}`}>
                          {daQuanto(giorniDa(g.ultima))}
                        </span>
                      )}
                    </div>
                  </div>
                  {g.volte > 0 && <span className="punti-finali">{g.volte}</span>}
                </li>
              ))}
            </ul>
          )}

          {sezione === 'mai' && dati.mai.length > 0 && (
            <p className="aiuto">
              Attenzione a leggerli come un rimprovero: fra questi ci sono i regali,
              i giochi comprati per il gruppo e quelli che aspettano l'occasione giusta.
            </p>
          )}
        </>
      )}
    </div>
  )
}
