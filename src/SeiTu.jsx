// Primo Giocatore - "Sei tu?"
// v2.0.0 - 202610292330 (una sola richiesta per tutte le schede che sono te, cercate fra gli ospiti di tutti)
//
// Chi si registra spesso ha già giocato come ospite, e magari più
// persone l'hanno inserito ognuna a modo suo («kaihla», «gess»...).
// L'app cerca fra gli ospiti di TUTTI quelli che somigliano a nickname,
// nome e cognome, e li mostra in un unico elenco da spuntare: una sola
// richiesta, approvata una volta da chi organizza. Con l'email di un
// tavolo uguale e confermata il collegamento è immediato.
//
// compatto: il riquadro in cima alle pagine, che si può chiudere.
// Senza compatto: la sezione nel profilo, sempre visibile.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const chiaveChiusi = (id) => `primo-giocatore:sei-tu-chiusi:${id}`

function leggiChiusi(id) {
  try { return JSON.parse(localStorage.getItem(chiaveChiusi(id)) || '[]') } catch { return [] }
}

const giorno = (d) => new Date(d + 'T12:00').toLocaleDateString('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric',
})

const nomeIntero = (nome, cognome) => [nome, cognome].filter(Boolean).join(' ')

// Le righe delle richieste raggruppate: una per gruppo (le vecchie,
// senza gruppo, contano da sole).
function raggruppa(righe, chiave) {
  const gruppi = new Map()
  for (const r of righe) {
    const k = chiave(r)
    if (!gruppi.has(k)) gruppi.set(k, [])
    gruppi.get(k).push(r)
  }
  return [...gruppi.entries()].map(([id, voci]) => ({ id, voci }))
}

export default function SeiTu({ profilo, compatto = false }) {
  const [ospiti, setOspiti] = useState([])
  const [spuntati, setSpuntati] = useState(new Set())
  const [richieste, setRichieste] = useState([])
  const [chiusi, setChiusi] = useState(() => leggiChiusi(profilo.id))
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [profilo.id])

  async function carica() {
    const [o, r] = await Promise.all([
      supabase.rpc('ospiti_simili'),
      supabase.from('richieste_collegamento')
        .select('id, gruppo, ospite_nome, stato, creata_il')
        .eq('utente_id', profilo.id)
        .order('creata_il', { ascending: false }),
    ])
    if (!o.error) {
      const lista = o.data || []
      setOspiti(lista)
      // Già spuntate le somiglianze forti; quelle deboli (nome parziale)
      // le spunta la persona se sono sue.
      setSpuntati(new Set(lista.filter((x) => !x.richiesta && (x.forza ?? 2) >= 2).map((x) => x.id)))
    }
    if (!r.error) setRichieste(r.data || [])
  }

  function cambiaSpunta(id) {
    setSpuntati((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Da proporre: non già chiesti e, nel riquadro, non già scartati.
  const daProporre = ospiti.filter((o) => !o.richiesta && (!compatto || !chiusi.includes(o.id)))
  const scelti = daProporre.filter((o) => spuntati.has(o.id))
  const partiteScelte = scelti.reduce((t, o) => t + (o.partite || 0), 0)

  async function sonoIo() {
    if (scelti.length === 0) { setErrore('Spunta almeno una scheda.'); return }
    const tutteEmail = scelti.every((o) => o.email_uguale)
    const testo = tutteEmail
      ? `Collegare ${scelti.length === 1 ? 'questa scheda' : `queste ${scelti.length} schede`} al tuo account? Le partite diventano tue.`
      : `Chiedere di collegare ${scelti.length === 1 ? 'questa scheda' : `queste ${scelti.length} schede`} (${partiteScelte} ${partiteScelte === 1 ? 'partita' : 'partite'}) al tuo account? È una sola richiesta: la approva chi organizza.`
    if (!confirm(testo)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { data, error } = await supabase.rpc('sono_io_tutti', { p_ospiti: scelti.map((o) => o.id) })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(data === 'collegato'
      ? 'Fatto: quelle partite ora sono tue.'
      : 'Richiesta inviata. Quando viene approvata, tutte quelle partite passano a te.')
    carica()
  }

  // Chi organizza può approvare le proprie richieste.
  async function approvaMia(g) {
    if (!confirm('Collegare queste schede al tuo account? Le partite diventano tue.')) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    const { error } = await supabase.rpc('decidi_gruppo', { p_gruppo: g.id, p_approva: true })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio('Fatto: quelle partite ora sono tue.')
    carica()
  }

  function nessuno() {
    const tutti = [...new Set([...chiusi, ...daProporre.map((o) => o.id)])]
    try { localStorage.setItem(chiaveChiusi(profilo.id), JSON.stringify(tutti)) } catch { /* pazienza */ }
    setChiusi(tutti)
  }

  const gruppiRichieste = raggruppa(richieste, (r) => r.gruppo || r.id)
    .map((g) => ({ ...g, stato: g.voci[0].stato }))
  const inAttesa = gruppiRichieste.filter((g) => g.stato === 'attesa')

  if (compatto && daProporre.length === 0 && !messaggio) return null

  const elenco = (
    <>
      <ul className="elenco">
        {daProporre.map((o) => (
          <li key={o.id}>
            <label className="sei-tu-scelta">
              <input type="checkbox" checked={spuntati.has(o.id)} onChange={() => cambiaSpunta(o.id)} />
              <span className="nome-giocatore">
                <strong>{nomeIntero(o.nome, o.cognome)}</strong>
                <span className="anno block">
                  {o.partite} {o.partite === 1 ? 'partita' : 'partite'}
                  {o.ultima ? `, l'ultima il ${giorno(o.ultima)}` : ''}
                  {o.creato_da ? ` · inserito da ${o.creato_da}` : ''}
                  {o.email_uguale ? ' · stessa email' : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {errore && <div className="avviso errore">{errore}</div>}
      <button className="bottone" onClick={sonoIo} disabled={lavorando || scelti.length === 0}>
        {lavorando ? 'Un attimo…'
          : scelti.length <= 1 ? 'Sono io' : `Sono io (${scelti.length} schede)`}
      </button>
    </>
  )

  if (compatto) {
    return (
      <div className="scheda">
        {messaggio ? (
          <>
            <div className="avviso ok">{messaggio}</div>
            <button className="bottone-piatto" onClick={() => setMessaggio('')}>chiudi</button>
          </>
        ) : (
          <>
            <h3 className="titolo-sezione">Hai già giocato come ospite?</h3>
            <p className="aiuto">
              Qualcuno ha registrato partite con un nome simile al tuo. Spunta quelle che sono te:
              parte una sola richiesta.
            </p>
            {elenco}
            <button className="bottone-piatto" onClick={nessuno}>Nessuno di questi sono io</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="scheda">
      <h2>Le tue partite da ospite</h2>
      <p className="sottotitolo">
        Se hai giocato prima di registrarti, qui colleghi quelle partite al tuo account.
      </p>
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {daProporre.length > 0 ? elenco : (
        <p className="aiuto">Nessun ospite con un nome simile al tuo.</p>
      )}

      {gruppiRichieste.length > 0 && (
        <>
          <h3 className="titolo-sezione">Richieste fatte</h3>
          <ul className="elenco">
            {gruppiRichieste.map((g) => (
              <li key={g.id}>
                <span>{[...new Set(g.voci.map((v) => v.ospite_nome))].join(', ')}</span>
                {g.stato === 'attesa' && profilo.organizzatore ? (
                  <button className="bottone-piatto" onClick={() => approvaMia(g)} disabled={lavorando}>approva</button>
                ) : (
                  <span className="anno">
                    {g.stato === 'attesa' ? 'in attesa' : g.stato === 'approvata' ? 'collegato' : 'non approvata'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {inAttesa.length > 0 && !profilo.organizzatore && (
            <p className="aiuto">Le richieste in attesa le approva chi organizza.</p>
          )}
        </>
      )}
    </div>
  )
}

// Per chi organizza (o ha inserito l'ospite): le richieste da decidere,
// una per persona anche quando le schede sono tante.
export function RichiesteDaApprovare({ onCambio }) {
  const [righe, setRighe] = useState([])
  const [errore, setErrore] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase.rpc('richieste_da_decidere')
    if (!error) setRighe(data || [])
  }

  const gruppi = raggruppa(righe, (r) => r.gruppo)

  async function decidi(g, approva) {
    const chi = g.voci[0].chi || 'questa persona'
    const nomi = g.voci.map((v) => nomeIntero(v.ospite_nome, v.ospite_cognome)).join(', ')
    const testo = approva
      ? `${chi} è «${nomi}»? Tutte le partite, i tavoli e le disponibilità di ${g.voci.length === 1 ? 'questa scheda' : `queste ${g.voci.length} schede`} passano a quell'account.`
      : `Rifiutare la richiesta di ${chi}?`
    if (!confirm(testo)) return
    setErrore(''); setLavorando(true)
    const { error } = await supabase.rpc('decidi_gruppo', { p_gruppo: g.id, p_approva: approva })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    carica()
    onCambio?.()
  }

  if (gruppi.length === 0) return null

  return (
    <>
      <h3 className="titolo-sezione">
        Richieste «sono io» <span className="conteggio">{gruppi.length}</span>
      </h3>
      {errore && <div className="avviso errore">{errore}</div>}
      <ul className="elenco">
        {gruppi.map((g) => (
          <li key={g.id}>
            <div className="nome-giocatore">
              <strong>{g.voci[0].chi || 'Utente'}</strong>
              <span className="anno block">dice di essere:</span>
              {g.voci.map((v) => (
                <span className="anno block" key={v.ospite_id}>
                  «{nomeIntero(v.ospite_nome, v.ospite_cognome)}»
                  {` · ${v.partite} ${v.partite === 1 ? 'partita' : 'partite'}`}
                  {v.creato_da ? ` · inserito da ${v.creato_da}` : ''}
                </span>
              ))}
            </div>
            <span className="azioni-iscritto">
              <button className="bottone-piatto" onClick={() => decidi(g, true)} disabled={lavorando}>
                {g.voci.length > 1 ? 'approva tutte' : 'approva'}
              </button>
              <button className="bottone-piatto pericolo" onClick={() => decidi(g, false)} disabled={lavorando}>rifiuta</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Quante richieste (persone) aspettano una decisione: per l'avviso in cima all'app.
export async function contaRichiesteDaApprovare() {
  const { data, error } = await supabase.rpc('richieste_da_decidere')
  if (error) return 0
  return new Set((data || []).map((r) => r.gruppo)).size
}
