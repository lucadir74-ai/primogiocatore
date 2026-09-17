// Primo Giocatore - giochi doppi
// v2.7.0 - 202609181800
//
// Capita quando lo stesso gioco entra due volte: una aggiunto a mano,
// una arrivato da BGG o da un'importazione. L'aggancio avviene per
// identificativo BGG, quindi le voci scritte a mano restano separate.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function GiochiDoppi({ profilo }) {
  const [giochi, setGiochi] = useState([])
  const [cerca, setCerca] = useState('')
  const [daUnire, setDaUnire] = useState('')
  const [verso, setVerso] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    const [g, p] = await Promise.all([
      supabase.from('giochi').select('id, nome, anno, bgg_id, immagine_url').order('nome'),
      supabase.from('partite').select('gioco_id'),
    ])
    if (g.error) { setErrore(g.error.message); return }
    const conta = new Map()
    for (const r of p.data || []) conta.set(r.gioco_id, (conta.get(r.gioco_id) || 0) + 1)
    setGiochi((g.data || []).map((x) => ({ ...x, partite: conta.get(x.id) || 0 })))
  }

  // Stesso nome, ripulito da maiuscole e spazi: sono quasi sempre doppioni.
  function doppioni() {
    const per = new Map()
    for (const g of giochi) {
      const k = g.nome.trim().toLowerCase()
      if (!per.has(k)) per.set(k, [])
      per.get(k).push(g)
    }
    return [...per.values()].filter((v) => v.length > 1)
  }

  async function unisci(idSparisce, idResta) {
    setErrore(''); setMessaggio('')
    const a = giochi.find((x) => x.id === idSparisce)
    const b = giochi.find((x) => x.id === idResta)
    if (!a || !b || a.id === b.id) { setErrore('Scegli due giochi diversi.'); return }
    if (!confirm(`Unire «${a.nome}» dentro «${b.nome}»? Le sue ${a.partite} partite passano all'altro e la voce sparisce.`)) return

    setLavorando(true)
    try {
      const { error: e1 } = await supabase
        .from('partite').update({ gioco_id: idResta }).eq('gioco_id', idSparisce)
      if (e1) throw e1

      await supabase.from('tavoli').update({ gioco_id: idResta }).eq('gioco_id', idSparisce)

      // Nelle collezioni la coppia utente+gioco è unica: chi possiede
      // entrambe le voci va spostato solo dove non ce l'ha già.
      const { data: mie } = await supabase
        .from('collezioni').select('utente_id').eq('gioco_id', idSparisce)
      const { data: altre } = await supabase
        .from('collezioni').select('utente_id').eq('gioco_id', idResta)
      const giaPresenti = new Set((altre || []).map((r) => r.utente_id))
      const daSpostare = (mie || []).filter((r) => !giaPresenti.has(r.utente_id))

      for (const r of daSpostare) {
        await supabase.from('collezioni')
          .update({ gioco_id: idResta }).eq('gioco_id', idSparisce).eq('utente_id', r.utente_id)
      }
      await supabase.from('collezioni').delete().eq('gioco_id', idSparisce)

      const { error: e4 } = await supabase.from('giochi').delete().eq('id', idSparisce)
      if (e4) throw e4

      setMessaggio(`«${a.nome}» unito. Ora le partite sono ${a.partite + b.partite}.`)
      setDaUnire(''); setVerso('')
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  const q = cerca.trim().toLowerCase()
  const elenco = q ? giochi.filter((g) => g.nome.toLowerCase().includes(q)) : giochi
  const gruppi = doppioni()

  const descrivi = (g) =>
    `${g.partite} ${g.partite === 1 ? 'partita' : 'partite'}` +
    (g.bgg_id ? ' · collegato a BGG' : ' · aggiunto a mano')

  return (
    <div className="scheda">
      <h2>Giochi doppi</h2>
      <p className="sottotitolo">
        Lo stesso gioco entrato due volte: una a mano e una da BoardGameGeek.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <h3 className="titolo-sezione">
        Trovati <span className="conteggio">{gruppi.length}</span>
      </h3>

      {gruppi.length === 0 ? (
        <p className="aiuto">Nessun doppione con lo stesso nome.</p>
      ) : (
        gruppi.map((gruppo) => {
          // Si tiene quello collegato a BGG, o in mancanza il più giocato.
          const tenere = [...gruppo].sort(
            (a, b) => (b.bgg_id ? 1 : 0) - (a.bgg_id ? 1 : 0) || b.partite - a.partite
          )[0]
          return (
            <div className="riquadro-manuale" key={gruppo[0].id}>
              <strong>{gruppo[0].nome}</strong>
              <ul className="elenco">
                {gruppo.map((g) => (
                  <li key={g.id}>
                    <div className="gioco">
                      {g.immagine_url && <img src={g.immagine_url} alt="" className="copertina" />}
                      <div className="nome-giocatore">
                        <strong>{g.anno || '—'}</strong>
                        <span className="anno block">{descrivi(g)}</span>
                        {g.id === tenere.id && <span className="distintivo verde">Da tenere</span>}
                      </div>
                    </div>
                    {g.id !== tenere.id && (
                      <button className="bottone-piatto" disabled={lavorando}
                        onClick={() => unisci(g.id, tenere.id)}>
                        unisci in quello sopra
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}

      <h3 className="titolo-sezione">Unisci a mano</h3>
      <p className="aiuto">
        Per i casi che il nome non fa riconoscere: «Scythe» e «Scythe ITA».
      </p>

      {giochi.length > 8 && (
        <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un gioco" aria-label="Cerca fra i giochi" />
      )}

      <div className="campo">
        <label htmlFor="gd-da">Questo sparisce</label>
        <select id="gd-da" className="scelta-punteggio larga" value={daUnire}
          onChange={(e) => setDaUnire(e.target.value)}>
          <option value="">—</option>
          {elenco.map((g) => (
            <option key={g.id} value={g.id}>{g.nome} ({g.partite})</option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="gd-verso">E confluisce in questo</label>
        <select id="gd-verso" className="scelta-punteggio larga" value={verso}
          onChange={(e) => setVerso(e.target.value)}>
          <option value="">—</option>
          {elenco.filter((g) => g.id !== daUnire).map((g) => (
            <option key={g.id} value={g.id}>{g.nome} ({g.partite})</option>
          ))}
        </select>
      </div>

      <button className="bottone" onClick={() => unisci(daUnire, verso)}
        disabled={lavorando || !daUnire || !verso}>
        {lavorando ? 'Unisco…' : 'Unisci'}
      </button>
    </div>
  )
}
