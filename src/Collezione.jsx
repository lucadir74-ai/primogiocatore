// Primo Giocatore - la collezione
// v3.16.0 - 202611012200 (posizioni importate da CSV fatto con l'AI dalle foto degli scaffali)
//
// Incrocia quello che possiedi con quello che giochi: quali scatole
// sono ferme, quali non hai mai aperto, quanto ti costa ogni partita.

import { useEffect, useMemo, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import DettaglioGioco from './DettaglioGioco.jsx'
import { archivioInMemoria, leggiArchivio, seguiArchivio } from './archivio'
import { unisciCondivise } from './condivise'
import ImportaLudoteca from './ImportaLudoteca.jsx'
import Sezione from './Sezione.jsx'
import BarraScorrevole from './BarraScorrevole.jsx'

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
  { id: 'tutti', etichetta: 'Tutti' },
  { id: 'fermi', etichetta: 'Fermi da più tempo' },
  { id: 'mai', etichetta: 'Mai giocati' },
  { id: 'piu', etichetta: 'I più giocati' },
  { id: 'fuori', etichetta: 'Giocati e non tuoi' },
]

export default function Collezione({ profilo }) {
  // Le partite sono quelle dell'archivio unico dell'app (lo stesso di
  // Storico e Statistiche): se è già in memoria si vede subito, e la
  // pagina si aggiorna da sola quando arriva la versione nuova.
  const inMemoria = archivioInMemoria(profilo.id)
  const [collezione, setCollezione] = useState([])
  const [partite, setPartite] = useState(inMemoria || [])
  const [partiteArrivate, setPartiteArrivate] = useState(Boolean(inMemoria))
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [sezione, setSezione] = useState('tutti')
  const [cerca, setCerca] = useState('')
  const [aperto, setAperto] = useState(null)   // il gioco di cui si guarda la scheda

  useEffect(() => { carica() }, [])
  useEffect(() => seguiArchivio((righe) => { setPartite(righe); setPartiteArrivate(true) }), [profilo.id])

  async function carica() {
    setCaricamento(true)
    try {
      // La colonna espansione arriva con lo script espansioni.sql: se
      // manca, si legge senza e tutti i giochi contano come giochi base.
      const campi = 'id, nome, anno, immagine_url, min_giocatori, max_giocatori, durata_minuti'
      // Anche posizione arriva con uno script (ludoteca.sql): se manca, si legge senza.
      const leggiCollezione = (conEsp, conPos) => tutteLeRighe(() => supabase
        .from('collezioni')
        .select(`gioco_id, origine${conPos ? ', posizione' : ''}, giochi ( ${campi}${conEsp ? ', espansione' : ''} )`)
        .eq('utente_id', profilo.id), 1000, 'gioco_id')
      const conPosizione = (conEsp) => leggiCollezione(conEsp, true).catch((e) => {
        if (!/posizione/.test(e?.message || '')) throw e
        return leggiCollezione(conEsp, false)
      })
      const collezioneSicura = conPosizione(true).catch((e) => {
        if (!/espansione/.test(e?.message || '')) throw e
        return conPosizione(false)
      })
      // L'archivio non si aspetta: se c'era già in memoria la pagina parte
      // subito, e lui la aggiorna quando ha finito di rileggere.
      leggiArchivio(profilo.id)
        .then((righe) => { setPartite(righe); setPartiteArrivate(true) })
        .catch((e) => { setErrore(e.message); setPartiteArrivate(true) })
      setCollezione(await collezioneSicura)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCaricamento(false)
    }
  }

  const dati = useMemo(() => {
    // La stessa serata registrata da due persone conta una volta sola,
    // con la stessa regola di Storico e Statistiche.
    const uniche = unisciCondivise(partite, [profilo.id])

    // Quando ho giocato ciascun gioco, e quante volte.
    const uso = new Map()
    for (const p of uniche) {
      // Chiave sempre come testo: dall'archivio e dalla collezione l'id
      // può arrivare in forme diverse.
      const id = p.giochi?.id == null ? null : String(p.giochi.id)
      if (!id) continue
      const v = uso.get(id) || { volte: 0, ultima: null }
      v.volte++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      uso.set(id, v)
    }

    // Un'espansione si gioca insieme al gioco base: conta come gioco solo
    // se ha partite sue (es. un'espansione di Hitster giocata da sola).
    // Le altre restano fuori dai numeri, così «mai giocati» non si gonfia.
    const tutte = collezione.filter((c) => c.giochi)
    const espansioniFerme = tutte.filter((c) => c.giochi.espansione && !uso.has(String(c.gioco_id))).length
    const posseduti = tutte
      .filter((c) => !c.giochi.espansione || uso.has(String(c.gioco_id)))
      .map((c) => ({
        id: c.gioco_id,
        nome: c.giochi.nome,
        anno: c.giochi.anno,
        immagine: c.giochi.immagine_url,
        min_giocatori: c.giochi.min_giocatori,
        max_giocatori: c.giochi.max_giocatori,
        durata_minuti: c.giochi.durata_minuti,
        posizione: c.posizione || '',
        posseduto: true,
        ...(uso.get(String(c.gioco_id)) || { volte: 0, ultima: null }),
      }))

    const idPosseduti = new Set(posseduti.map((g) => String(g.id)))

    // Giocati ma non in collezione: quelli di altri, o provati in fiera.
    const fuori = new Map()
    // L'archivio porta solo id, nome e copertina del gioco: il resto lo
    // legge la scheda quando la apri.
    for (const p of uniche) {
      if (p.giochi?.id == null) continue
      const id = String(p.giochi.id)
      if (idPosseduti.has(id)) continue
      const v = fuori.get(id) || {
        id: p.giochi.id, nome: p.giochi.nome, immagine: p.giochi.immagine_url,
        posseduto: false, volte: 0, ultima: null,
      }
      v.volte++
      if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      fuori.set(id, v)
    }

    const giocati = posseduti.filter((g) => g.volte > 0)

    return {
      posseduti,
      tutti: [...posseduti].sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
      espansioniFerme,
      mai: posseduti.filter((g) => g.volte === 0).sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
      fermi: [...giocati].sort((a, b) => new Date(a.ultima) - new Date(b.ultima)),
      piu: [...giocati].sort((a, b) => b.volte - a.volte),
      fuori: [...fuori.values()].sort((a, b) => b.volte - a.volte),
      partiteSuPosseduti: giocati.reduce((t, g) => t + g.volte, 0),
    }
  }, [collezione, partite, profilo.id])

  // Per l'import delle posizioni: tutti i giochi in collezione, espansioni comprese.
  const esistenti = new Map(collezione.filter((c) => c.giochi).map((c) => [String(c.gioco_id), { posizione: c.posizione || '' }]))
  const mieiGiochi = collezione.filter((c) => c.giochi).map((c) => ({
    gioco_id: String(c.gioco_id), nome: c.giochi.nome, anno: c.giochi.anno, immagine_url: c.giochi.immagine_url,
  }))

  if (caricamento || !partiteArrivate) return <div className="scheda"><p>Conto&hellip;</p></div>

  const q = cerca.trim().toLowerCase()
  // Si cerca anche per posizione: «sala» trova tutto quello che sta in sala.
  const filtra = (righe) => (q ? righe.filter((g) => g.nome.toLowerCase().includes(q)
    || (g.posizione || '').toLowerCase().includes(q)) : righe)
  const elenco = filtra(dati[sezione] || [])

  const fermiDaUnAnno = dati.fermi.filter((g) => giorniDa(g.ultima) > 365).length

  return (
    <div className="scheda">
      <h2>La tua collezione</h2>
      <p className="sottotitolo">Quello che possiedi, messo a confronto con quello che giochi.</p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {dati.posseduti.length === 0 ? (
        <p className="aiuto">
          Nessun gioco in collezione. Importala da Gestisci, qui sopra, oppure segna
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
            {dati.espansioniFerme > 0 && (
              <p>
                {dati.espansioniFerme === 1
                  ? 'In più hai 1 espansione che non conta qui: le espansioni contano come giochi solo se le hai giocate da sole.'
                  : `In più hai ${dati.espansioniFerme} espansioni che non contano qui: le espansioni contano come giochi solo se le hai giocate da sole.`}
              </p>
            )}
          </div>

          <BarraScorrevole><div className="sottoschede">
            {SEZIONI.map((s) => (
              <button key={s.id} className={sezione === s.id ? 'attiva' : ''}
                onClick={() => setSezione(s.id)}>
                {s.etichetta}
              </button>
            ))}
          </div></BarraScorrevole>

          {(dati[sezione] || []).length > 8 && (
            <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca un gioco o dove sta" aria-label="Cerca fra i giochi" />
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
                  <button type="button" className="riga-gioco" onClick={() => setAperto(g)}>
                    <span className="gioco">
                      {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
                      <span className="nome-giocatore">
                        <strong>{g.nome}</strong>
                        <span className="anno block">
                          {g.volte === 0
                            ? 'mai giocato'
                            : `${g.volte} ${g.volte === 1 ? 'partita' : 'partite'} · ultima ${giorno(g.ultima)}`}
                          {g.posizione ? ` · sta in: ${g.posizione}` : ''}
                        </span>
                        {g.volte > 0 && sezione === 'fermi' && (
                          <span className={`anno block${giorniDa(g.ultima) > 365 ? ' fazione-nota' : ''}`}>
                            {daQuanto(giorniDa(g.ultima))}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="riga-gioco-destra">
                      {g.volte > 0 && <span className="punti-finali">{g.volte}</span>}
                      <span className="freccia-scheda" aria-hidden="true">›</span>
                    </span>
                  </button>
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

          <Sezione id="collezione-import-posizioni" titolo="Importa posizioni da CSV" nota="foto degli scaffali + AI">
            <ImportaLudoteca modo="casa" esistenti={esistenti} mieiGiochi={mieiGiochi}
              onFatto={(m) => { setErrore(''); setMessaggio(m); carica() }} />
          </Sezione>
        </>
      )}

      {aperto && (
        <DettaglioGioco
          gioco={aperto}
          mio={{ posseduto: aperto.posseduto, volte: aperto.volte, ultima: aperto.ultima, posizione: aperto.posizione }}
          onPosizione={(nuova) => {
            setCollezione((c) => c.map((r) => (String(r.gioco_id) === String(aperto.id) ? { ...r, posizione: nuova } : r)))
            setAperto((a) => ({ ...a, posizione: nuova }))
          }}
          onChiudi={() => setAperto(null)}
        />
      )}
    </div>
  )
}
