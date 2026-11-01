// Primo Giocatore - la ludoteca della Tana
// v1.0.0 - 202611011600
//
// I giochi della Tana e dove stanno (scaffale, ripiano…). Tutti cercano
// e vedono la posizione; organizzatori e dimostratori aggiungono giochi,
// li spostano e li tolgono. Si riempie a mano, un gioco alla volta.
// Serve lo script ludoteca.sql.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import DettaglioGioco from './DettaglioGioco.jsx'

const piatto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function Ludoteca({ profilo }) {
  const [righe, setRighe] = useState([])
  const [tana, setTana] = useState({ id: null, nome: '', posso: false })
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [cerca, setCerca] = useState('')
  const [ordine, setOrdine] = useState('nome')        // nome | posizione
  const [modifica, setModifica] = useState(null)      // { gioco_id, nome, posizione, note, nuovo }
  const [aggiungi, setAggiungi] = useState('')        // testo per cercare nel catalogo
  const [trovati, setTrovati] = useState([])
  const [aperto, setAperto] = useState(null)

  useEffect(() => { carica() }, [profilo.id])

  async function carica() {
    setCaricamento(true); setErrore('')
    try {
      // Nome della Tana e permessi arrivano anche a ludoteca vuota.
      const [{ data: el, error }, { data: posso }, { data: t }] = await Promise.all([
        supabase.rpc('ludoteca_elenco'),
        supabase.rpc('puo_gestire_ludoteca', { p_tana: String(profilo.tana_id) }),
        supabase.from('tane').select('nome').eq('id', profilo.tana_id).maybeSingle(),
      ])
      if (error) throw error
      setRighe(el || [])
      setTana({ id: String(profilo.tana_id), nome: t?.nome || el?.[0]?.tana || 'la tua Tana', posso: Boolean(posso) })
    } catch (e) {
      setErrore(/ludoteca_elenco/.test(e?.message || '') ? 'Manca lo script ludoteca.sql nel database.' : e.message)
    } finally {
      setCaricamento(false)
    }
  }

  // Le posizioni già usate: si scelgono da qui, così «B3» resta «B3».
  const posizioni = useMemo(() => [...new Set(righe.map((r) => r.posizione).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'it', { numeric: true })), [righe])

  // Cerca nel catalogo i giochi da aggiungere.
  useEffect(() => {
    if (!tana.posso || aggiungi.trim().length < 2) { setTrovati([]); return }
    let vivo = true
    const attesa = setTimeout(async () => {
      const { data } = await supabase.rpc('ludoteca_cerca', { p_tana: tana.id, p_testo: aggiungi.trim() })
      if (vivo) setTrovati(data || [])
    }, 300)
    return () => { vivo = false; clearTimeout(attesa) }
  }, [aggiungi, tana.posso, tana.id])

  async function salva() {
    setErrore(''); setMessaggio('')
    const { error } = await supabase.rpc('ludoteca_salva', {
      p_tana: tana.id, p_gioco: modifica.gioco_id, p_posizione: modifica.posizione || '', p_note: modifica.note || '',
    })
    if (error) { setErrore(error.message); return }
    setMessaggio(modifica.nuovo ? `${modifica.nome} aggiunto alla ludoteca.` : `${modifica.nome}: posizione salvata.`)
    setModifica(null); setAggiungi(''); setTrovati([])
    carica()
  }

  async function togli(r) {
    if (!window.confirm(`Togliere ${r.nome} dalla ludoteca della Tana?`)) return
    const { error } = await supabase.rpc('ludoteca_togli', { p_tana: tana.id, p_gioco: r.gioco_id })
    if (error) { setErrore(error.message); return }
    setMessaggio(`${r.nome} tolto dalla ludoteca.`)
    setModifica(null)
    carica()
  }

  if (!profilo.tana_id) {
    return <div className="scheda"><p className="aiuto">Scegli la tua Tana nel profilo per vederne la ludoteca.</p></div>
  }
  if (caricamento) return <div className="scheda"><p>Apro la ludoteca&hellip;</p></div>

  const q = piatto(cerca)
  const filtrate = !q ? righe : righe.filter((r) => piatto(r.nome).includes(q) || piatto(r.posizione).includes(q))
  const ordinate = ordine === 'nome' ? filtrate : [...filtrate].sort((a, b) =>
    (a.posizione || '\uffff').localeCompare(b.posizione || '\uffff', 'it', { numeric: true }) || a.nome.localeCompare(b.nome, 'it'))

  return (
    <div className="scheda">
      <h2>Ludoteca di {tana.nome}</h2>
      <p className="sottotitolo">
        {righe.length === 0 ? 'Ancora nessun gioco.' : `${righe.length} giochi.`} Cerca un gioco per sapere dove sta.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {righe.length > 0 && (
        <>
          <input className="campo-cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca per gioco o posizione" aria-label="Cerca nella ludoteca" />
          <div className="sottoschede">
            <button className={ordine === 'nome' ? 'attiva' : ''} onClick={() => setOrdine('nome')}>Per nome</button>
            <button className={ordine === 'posizione' ? 'attiva' : ''} onClick={() => setOrdine('posizione')}>Per posizione</button>
          </div>
        </>
      )}

      {q && ordinate.length === 0 && <p className="aiuto">Non c&rsquo;è nella ludoteca.</p>}

      <ul className="elenco elenco-scorrevole">
        {ordinate.slice(0, 300).map((r, i) => {
          const nuovoGruppo = ordine === 'posizione' && (i === 0 || ordinate[i - 1].posizione !== r.posizione)
          return (
            <li key={r.gioco_id} style={nuovoGruppo ? { flexWrap: 'wrap' } : undefined}>
              {nuovoGruppo && (
                <h3 className="titolo-sezione" style={{ width: '100%', margin: '0.6rem 0 0.2rem' }}>
                  {r.posizione || 'Posizione non indicata'}
                </h3>
              )}
              <button type="button" className="riga-gioco" style={{ flex: 1, minWidth: 0 }}
                onClick={() => setAperto({ id: r.gioco_id, nome: r.nome, anno: r.anno, immagine: r.immagine_url, immagine_url: r.immagine_url })}>
                <span className="gioco">
                  {r.immagine_url && <img src={r.immagine_url} alt="" className="copertina" />}
                  <span className="nome-giocatore">
                    <strong>{r.nome}</strong>
                    <span className="anno block">
                      {r.posizione ? `Sta in: ${r.posizione}` : 'posizione non indicata'}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  </span>
                </span>
              </button>
              {tana.posso && (
                <button className="bottone-piatto" onClick={() => setModifica({ ...r, nuovo: false })}>sposta</button>
              )}
            </li>
          )
        })}
      </ul>

      {tana.posso && (
        <>
          <h3 className="titolo-sezione">Aggiungi un gioco</h3>
          <input className="campo-cerca" type="search" value={aggiungi} onChange={(e) => setAggiungi(e.target.value)}
            placeholder="Scrivi il nome del gioco" aria-label="Cerca un gioco da aggiungere" />
          {aggiungi.trim().length >= 2 && trovati.length === 0 && (
            <p className="aiuto">
              Nessun gioco con questo nome nel catalogo: aggiungilo prima da Gestisci (cerca su BGG), poi torna qui.
            </p>
          )}
          {trovati.length > 0 && (
            <ul className="elenco">
              {trovati.map((g) => (
                <li key={g.gioco_id}>
                  <span className="nome-giocatore" style={{ flex: 1, minWidth: 0 }}>
                    <strong>{g.nome}</strong>{g.anno ? <span className="anno"> ({g.anno})</span> : null}
                  </span>
                  {g.gia_dentro
                    ? <span className="anno">già in ludoteca</span>
                    : <button className="bottone-piatto"
                        onClick={() => setModifica({ gioco_id: g.gioco_id, nome: g.nome, posizione: '', note: '', nuovo: true })}>
                        aggiungi
                      </button>}
                </li>
              ))}
            </ul>
          )}
          <p className="aiuto">La ludoteca la modificano organizzatori e dimostratori; tutti gli altri la consultano.</p>
        </>
      )}

      {modifica && (
        <div className="finestra-sfondo" onClick={() => setModifica(null)}>
          <div className="finestra" role="dialog" aria-modal="true" aria-label={modifica.nome} onClick={(e) => e.stopPropagation()}>
            <div className="finestra-testa">
              <h3>{modifica.nome}</h3>
              <button type="button" className="finestra-chiudi" onClick={() => setModifica(null)} aria-label="Chiudi">×</button>
            </div>
            <div className="finestra-corpo">
              <div className="campo">
                <label htmlFor="lud-pos">Dove sta</label>
                <input id="lud-pos" list="lud-posizioni" value={modifica.posizione || ''} autoFocus
                  onChange={(e) => setModifica({ ...modifica, posizione: e.target.value })}
                  placeholder="Es. B3, Armadio sala, Scaffale 2 in alto" />
                <datalist id="lud-posizioni">{posizioni.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div className="campo">
                <label htmlFor="lud-note">Nota (facoltativa)</label>
                <input id="lud-note" value={modifica.note || ''}
                  onChange={(e) => setModifica({ ...modifica, note: e.target.value })}
                  placeholder="Es. manca un dado, scatola rovinata" />
              </div>
              <div className="riga-bottoni">
                <button className="bottone" onClick={salva}>{modifica.nuovo ? 'Aggiungi' : 'Salva'}</button>
                {!modifica.nuovo && (
                  <button className="bottone-piatto pericolo" onClick={() => togli(modifica)}>togli dalla ludoteca</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {aperto && <DettaglioGioco gioco={aperto} onChiudi={() => setAperto(null)} />}
    </div>
  )
}
