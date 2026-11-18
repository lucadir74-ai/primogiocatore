// Primo Giocatore - gestione degli ospiti
// v3.11.0 - 202611181900 («Si sono iscritti»: per nome e cognome anche scritti diversi, un tocco per unire)
//
// Rinominare, unire i doppioni e trasformare un ospite nell'account
// con cui quella persona si è iscritta.

import { useEffect, useState } from 'react'
import { supabase, nomeOspite, tutteLeRighe } from './supabase'
import { RichiesteDaApprovare } from './SeiTu.jsx'
import ChiSono, { PartiteOspite } from './ChiSono.jsx'
import CercaScegli from './CercaScegli.jsx'
import Sezione from './Sezione.jsx'
import { propostePerIscritto } from './somiglianze.js'

const MOTIVI = {
  'numero BGA': 'stesso numero BGA',
  'partite in comune': 'partite in comune',
  'a mano': 'unito a mano',
  'prima del registro': 'unito in precedenza',
}

// Le unioni fatte (dal sistema o a mano), con la possibilità di separare
// due persone che in realtà sono diverse: non verranno più riunite.
function UnioniFatte({ onCambio }) {
  const [unioni, setUnioni] = useState(null)
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)

  async function carica() {
    const { data, error } = await supabase.rpc('elenco_unioni')
    if (error) {
      setErrore(/elenco_unioni/.test(error.message || '') ? 'Manca lo script ospiti_doppi.sql (v1.1.0) nel database.' : error.message)
      setUnioni([])
    } else setUnioni(data || [])
  }
  useEffect(() => { carica() }, [])

  async function separa(u) {
    setErrore(''); setMessaggio('')
    if (!confirm(`«${u.unito}» e «${u.dentro}» sono due persone diverse? Le partite di «${u.unito}» tornano a lui e il sistema non li unirà più.`)) return
    setLavorando(true)
    const { data, error } = await supabase.rpc('separa_ospite', { p_unione: u.id })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(data
      ? `«${u.unito}» separato da «${u.dentro}»: ${data} ${data === 1 ? 'partita tornata' : 'partite tornate'}.`
      : `«${u.unito}» separato da «${u.dentro}». Nessuna partita da riportare: se ne aveva, spostale a mano.`)
    carica()
    onCambio?.()
  }

  if (unioni === null) return <p className="aiuto">Carico…</p>
  const q = cerca.trim().toLowerCase()
  const elenco = q
    ? unioni.filter((u) => `${u.unito} ${u.dentro}`.toLowerCase().includes(q))
    : unioni
  return (
    <div>
      <p className="aiuto">
        Il sistema unisce da solo gli ospiti con lo stesso numero BGA e quelli che
        compaiono nelle stesse partite registrate da due iscritti. Se due persone
        sono diverse, tocca «separa»: tornano separate e non verranno più unite.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}
      {unioni.length > 8 && (
        <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un nome" aria-label="Cerca fra le unioni" />
      )}
      {elenco.length === 0 ? (
        <p className="aiuto">{q ? 'Nessuna unione con questo nome.' : 'Nessuna unione da mostrare.'}</p>
      ) : (
        <ul className="elenco elenco-scorrevole">
          {elenco.slice(0, 80).map((u) => (
            <li key={u.id}>
              <div className="nome-giocatore">
                <strong>{u.unito} → {u.dentro}</strong>
                <span className="anno block">
                  {MOTIVI[u.come] || u.come}{u.creato_da ? ` · inserito da ${u.creato_da}` : ''}
                </span>
              </div>
              <button className="bottone-piatto" onClick={() => separa(u)} disabled={lavorando}>separa</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Quante partite ha ogni ospite. Il conto lo fa il database e arriva in
// una risposta sola (script partite_per_ospite.sql); senza lo script si
// leggono come prima tutte le partecipazioni e si contano qui.
async function partitePerOspite() {
  const { data, error } = await supabase.rpc('partite_per_ospite')
  if (!error && data && typeof data === 'object') return new Map(Object.entries(data))
  const righe = await tutteLeRighe(() => supabase.from('partecipazioni').select('ospite_id').not('ospite_id', 'is', null))
  const conteggio = new Map()
  for (const r of righe) conteggio.set(r.ospite_id, (conteggio.get(r.ospite_id) || 0) + 1)
  return conteggio
}

// I «non è lui» detti da questo telefono, nel caso il database non li
// lasci rileggere: così non tornano a ogni apertura.
const CHIAVE_ESCLUSI = 'primo-giocatore:non-e-lui'
function esclusiSalvati() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_ESCLUSI) || '[]') } catch { return [] }
}

export default function UnisciOspiti({ profilo, onRichieste }) {
  const [ospiti, setOspiti] = useState([])
  const [daUnire, setDaUnire] = useState('')   // sparisce
  const [verso, setVerso] = useState('')       // resta
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavorando, setLavorando] = useState(false)
  const [persone, setPersone] = useState([])
  const [rinomina, setRinomina] = useState(null)      // { id, nome }
  const [collega, setCollega] = useState(null)        // { ospite, cerca }
  const [aperto, setAperto] = useState(null)          // l'ospite di cui si guardano le partite
  const [esclusi, setEsclusi] = useState(() => new Set())   // «ospite|utente» già detti «non è lui»

  useEffect(() => { carica() }, [])

  async function carica() {
    try {
      const [o, conteggio, pr, no] = await Promise.all([
        tutteLeRighe(() => supabase.from('ospiti').select('*').order('nome')),
        partitePerOspite(),
        // Solo quello che la pagina usa (prima arrivava il profilo intero di tutti).
        tutteLeRighe(() => supabase.from('profili').select('id, nome, cognome, nickname, bga_username, bga_id').order('nome')),
        // Le coppie già escluse con «non è lui»: se non si leggono, pazienza.
        supabase.from('richieste_collegamento').select('ospite_id, utente_id').eq('stato', 'rifiutata')
          .then(({ data }) => data || [], () => []),
      ])
      setPersone(pr)
      setEsclusi((prima) => new Set([...prima, ...esclusiSalvati(), ...no.map((r) => `${r.ospite_id}|${r.utente_id}`)]))
      // Quelli già collegati a un account, o uniti a un altro ospite,
      // non sono più ospiti da gestire.
      setOspiti(o.filter((x) => !x.utente_collegato && !x.unito_in)
        // Nella pagina il nome è quello intero: chi nasce dalla partita ha
        // il cognome in un campo a parte.
        .map((x) => ({ ...x, nome: nomeOspite(x), partite: conteggio.get(x.id) || 0 })))
    } catch (e) {
      setErrore(e.message)
    }
  }

  // Iscritti che hanno già giocato come ospiti: stesso nome E cognome,
  // anche scritti un po' diversi (somiglianze.js), stesso nick o stesso
  // numero BGA. Chi organizza li vede tutti, gli altri solo gli ospiti
  // che hanno inserito loro. Il nick che resta è quello dell'iscritto.
  const organizza = !!(profilo?.organizzatore || profilo?.amministratore)
  const proposte = propostePerIscritto(
    ospiti.filter((o) => organizza || o.creato_da === profilo?.id), persone, esclusi)

  async function unisciAlIscritto(g, soloSicuri = false) {
    const voci = g.ospiti
    const nick = g.utente.nickname || g.utente.nome
    if (!soloSicuri && !confirm(`${voci.map((x) => `«${x.ospite.nome}»`).join(', ')} ${voci.length === 1 ? 'è' : 'sono'} ${nick}?\n\nPartite, tavoli e disponibilità passano al suo account, con il suo nick.`)) return false
    let fatti = 0
    for (const { ospite } of voci) {
      const { error } = await supabase.rpc('riconosci_ospite', { p_ospite: ospite.id, p_utente: g.utente.id })
      if (error) { setErrore(`«${ospite.nome}»: ${error.message}`); break }
      fatti++
    }
    return fatti
  }

  async function unisciUno(g) {
    setErrore(''); setMessaggio(''); setLavorando(true)
    const fatti = await unisciAlIscritto(g)
    setLavorando(false)
    if (fatti) { setMessaggio(`Fatto: ora è tutto di ${g.utente.nickname || g.utente.nome}.`); carica(); onRichieste?.() }
  }

  async function unisciTuttiSicuri() {
    const sicuri = proposte.filter((g) => g.sicuro)
    if (!confirm(`Unire ${sicuri.length} iscritti con i loro ospiti (nome e cognome uguali)?\n\n${sicuri.map((g) => `${g.ospiti.map((x) => x.ospite.nome).join(', ')} → ${g.utente.nickname || g.utente.nome}`).join('\n')}`)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    let fatti = 0
    for (const g of sicuri) {
      const n = await unisciAlIscritto(g, true)
      if (n === false || n < g.ospiti.length) break
      fatti += n
    }
    setLavorando(false)
    if (fatti) setMessaggio(`${fatti} ospiti uniti ai loro iscritti.`)
    carica(); onRichieste?.()
  }

  // «Non è lui»: la coppia non viene più proposta (né qui né in «Chi sono»).
  async function nonELui(ospite, utente) {
    setErrore(''); setLavorando(true)
    const { error } = await supabase.rpc('ospite_non_e', { p_ospite: ospite.id, p_utenti: [utente.id] })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    const coppia = `${ospite.id}|${utente.id}`
    setEsclusi((s) => new Set(s).add(coppia))
    try { localStorage.setItem(CHIAVE_ESCLUSI, JSON.stringify([...new Set([...esclusiSalvati(), coppia])].slice(-500))) } catch { /* pazienza */ }
  }

  async function salvaNome() {
    setErrore(''); setMessaggio('')
    if (!rinomina.nome.trim()) { setErrore('Il nome non può restare vuoto.'); return }
    // Chi ha il cognome a parte lo tiene a parte: la prima parola è il
    // nome, il resto il cognome. Gli altri restano scritti tutti nel nome.
    const intero = rinomina.nome.trim().replace(/\s+/g, ' ')
    const o = ospiti.find((x) => x.id === rinomina.id)
    const parole = intero.split(' ')
    const campi = o?.cognome && parole.length > 1
      ? { nome: parole[0], cognome: parole.slice(1).join(' ') }
      : { nome: intero, cognome: null }
    const { error } = await supabase
      .from('ospiti').update(campi).eq('id', rinomina.id)
    if (error) setErrore(error.message)
    else { setMessaggio('Nome corretto.'); setRinomina(null); carica() }
  }

  // L'ospite si è iscritto: partite, tavoli e disponibilità passano
  // all'account vero e la voce ospite sparisce. Lo fa il database, così
  // si spostano anche le partite registrate da altri.
  async function diventaAccount(ospite, utente) {
    setErrore(''); setMessaggio('')
    const nomeUtente = utente.nickname || utente.nome
    if (!confirm(`«${ospite.nome}» è ${nomeUtente}? Le sue ${ospite.partite} partite, i tavoli e le disponibilità passano a quell'account e la voce ospite sparisce.`)) return

    setLavorando(true)
    const { error } = await supabase.rpc('collega_ospite', { p_ospite: ospite.id, p_utente: utente.id })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(`«${ospite.nome}» ora è ${nomeUtente}.`)
    setCollega(null)
    carica()
  }

  async function unisci() {
    setErrore(''); setMessaggio('')
    if (!daUnire || !verso || daUnire === verso) {
      setErrore('Scegli due ospiti diversi.')
      return
    }
    const a = ospiti.find((x) => x.id === daUnire)
    const b = ospiti.find((x) => x.id === verso)
    if (!confirm(`Unire «${a.nome}» dentro «${b.nome}»? «${a.nome}» sparisce e le sue partite passano a «${b.nome}». Non si torna indietro.`)) return

    setLavorando(true)
    try {
      // Lo fa il database: sposta anche le partite, i tavoli e le serate
      // registrati da altri, e se i due erano nella stessa partita ne
      // tiene uno solo. Il nome unito resta collegato: chi lo usa ancora
      // finisce su «${b.nome}».
      const { error } = await supabase.rpc('unisci_ospiti', { p_da: daUnire, p_verso: verso })
      if (error) {
        if (/unisci_ospiti/.test(error.message || '')) throw new Error('Manca lo script ospiti_doppi.sql nel database.')
        throw error
      }
      setMessaggio(`«${a.nome}» unito in «${b.nome}».`)
      setDaUnire(''); setVerso('')
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLavorando(false)
    }
  }

  const q = cerca.trim().toLowerCase()
  const elenco = q ? ospiti.filter((o) => o.nome.toLowerCase().includes(q)) : ospiti

  return (
    <div className="scheda">
      <h2>Ospiti</h2>
      <p className="sottotitolo">
        Chi gioca senza account. Correggi i nomi, unisci i doppioni, e quando
        qualcuno si iscrive trasformalo nel suo account.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {proposte.length > 0 && (
        <>
          <h3 className="titolo-sezione">Si sono iscritti <span className="conteggio">{proposte.length}</span></h3>
          <p className="aiuto">
            Iscritti che avevano già giocato come ospiti: stesso nome e cognome, anche scritti un po&rsquo; diversi.
            «Unisci» passa partite, tavoli e disponibilità all&rsquo;iscritto, che tiene il suo nick.
            Se un nome non è lui, tocca «non è lui» e non te lo proponiamo più.
          </p>
          {proposte.filter((g) => g.sicuro).length > 1 && (
            <button className="bottone" onClick={unisciTuttiSicuri} disabled={lavorando}>
              {lavorando ? 'Unisco…' : `Unisci tutti quelli sicuri (${proposte.filter((g) => g.sicuro).length})`}
            </button>
          )}
          <ul className="elenco unione-iscritti">
            {proposte.slice(0, 40).map((g) => (
              <li key={g.utente.id} style={{ display: 'block' }}>
                <div className="nome-giocatore">
                  <strong>{g.utente.nickname || g.utente.nome}</strong>
                  <span className={`distintivo${g.sicuro ? '' : ' grigio'}`}>{g.sicuro ? 'sicuro' : 'da controllare'}</span>
                  <span className="anno block">
                    {[g.utente.nome, g.utente.cognome].filter(Boolean).join(' ')} · ha giocato come:
                  </span>
                </div>
                {g.ospiti.map(({ ospite, forza, conteso }) => (
                  <div key={ospite.id} className="unione-ospite">
                    <span>
                      «{ospite.nome}» · {ospite.partite} {ospite.partite === 1 ? 'partita' : 'partite'}
                      {forza < 2 ? ' · scritto un po’ diverso' : ''}{conteso ? ' · somiglia anche a un altro iscritto' : ''}
                    </span>
                    <span className="azioni-iscritto">
                      {ospite.partite > 0 && (
                        <button className="bottone-piatto" aria-expanded={aperto === ospite.id}
                          onClick={() => setAperto(aperto === ospite.id ? null : ospite.id)}>
                          {aperto === ospite.id ? 'nascondi' : 'vedi'}
                        </button>
                      )}
                      <button className="bottone-piatto" onClick={() => nonELui(ospite, g.utente)} disabled={lavorando}>non è lui</button>
                    </span>
                    {aperto === ospite.id && <div className="ospite-partite-elenco"><PartiteOspite ospiteId={ospite.id} /></div>}
                  </div>
                ))}
                <button className="bottone bottone-secondario" style={{ marginTop: '0.5rem' }}
                  onClick={() => unisciUno(g)} disabled={lavorando}>
                  Unisci a {g.utente.nickname || g.utente.nome}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <RichiesteDaApprovare profilo={profilo} onCambio={() => { carica(); onRichieste?.() }} />
      <ChiSono escludi={new Set(proposte.flatMap((g) => g.ospiti.map((x) => x.ospite.id)))}
        onCambio={() => { carica(); onRichieste?.() }} />

      {ospiti.length > 8 && (
        <input
          className="campo-cerca"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca un nome"
          aria-label="Cerca fra gli ospiti"
        />
      )}

      <ul className="elenco elenco-scorrevole">
        {elenco.slice(0, 60).map((o) => (
          <li key={o.id}>
            {rinomina?.id === o.id ? (
              <>
                <input className="campo-cerca" value={rinomina.nome} autoFocus
                  onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && salvaNome()} />
                <span className="azioni-iscritto">
                  <button className="bottone-piatto" onClick={salvaNome}>salva</button>
                  <button className="bottone-piatto" onClick={() => setRinomina(null)}>annulla</button>
                </span>
              </>
            ) : collega?.ospite?.id === o.id ? (
              <div className="nome-giocatore">
                <strong>{o.nome}</strong>
                <span className="anno block">Con quale account si è iscritto?</span>
                <input className="campo-cerca" value={collega.cerca} autoFocus
                  onChange={(e) => setCollega({ ...collega, cerca: e.target.value })}
                  placeholder="Cerca il suo account" />
                <div className="pastiglie-persone">
                  {persone
                    .filter((p) => (p.nickname || p.nome || '').toLowerCase()
                      .includes(collega.cerca.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((p) => (
                      <button key={p.id} className="pastiglia-nome"
                        onClick={() => diventaAccount(o, p)} disabled={lavorando}>
                        {p.nickname || p.nome}
                      </button>
                    ))}
                </div>
                <button className="bottone-piatto" onClick={() => setCollega(null)}>annulla</button>
              </div>
            ) : (
              <>
                <div className="nome-giocatore">
                  <strong>{o.nome}</strong>
                  {o.partite > 0 ? (
                    <button type="button" className="bottone-piatto ospite-partite"
                      aria-expanded={aperto === o.id}
                      onClick={() => setAperto(aperto === o.id ? null : o.id)}>
                      {o.partite} {o.partite === 1 ? 'partita' : 'partite'} · {aperto === o.id ? 'nascondi' : 'vedi'}
                    </button>
                  ) : (
                    <span className="anno block">0 partite</span>
                  )}
                </div>
                <span className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setRinomina({ id: o.id, nome: o.nome })}>rinomina</button>
                  <button className="bottone-piatto"
                    onClick={() => setCollega({ ospite: o, cerca: '' })}>si è iscritto</button>
                </span>
                {aperto === o.id && <div className="ospite-partite-elenco"><PartiteOspite ospiteId={o.id} /></div>}
              </>
            )}
          </li>
        ))}
      </ul>

      <h3 className="titolo-sezione">Unisci due ospiti</h3>

      <div className="campo">
        <label htmlFor="u-da">Questo sparisce</label>
        <CercaScegli id="u-da" svuotabile
          opzioni={ospiti.map((x) => ({ id: x.id, nome: x.nome, nota: `${x.partite} ${x.partite === 1 ? 'partita' : 'partite'}` }))}
          valore={daUnire} onScegli={(id) => { setDaUnire(id); if (id === verso) setVerso('') }}
          segnaposto="Scrivi per cercare" etichetta="Ospite che sparisce" />
      </div>

      <div className="campo">
        <label htmlFor="u-verso">E confluisce in questo</label>
        <CercaScegli id="u-verso" svuotabile
          opzioni={ospiti.filter((x) => x.id !== daUnire).map((x) => ({ id: x.id, nome: x.nome, nota: `${x.partite} ${x.partite === 1 ? 'partita' : 'partite'}` }))}
          valore={verso} onScegli={setVerso}
          segnaposto="Scrivi per cercare" etichetta="Ospite in cui confluisce" />
      </div>

      <button className="bottone" onClick={unisci} disabled={lavorando || !daUnire || !verso}>
        {lavorando ? 'Unisco…' : 'Unisci'}
      </button>

      <p className="aiuto">
        Il numero fra parentesi è quante partite ha quell&rsquo;ospite. Tieni quello con più
        partite come destinazione. Si spostano anche le partite registrate da altri; se
        ti sbagli, l&rsquo;unione si annulla da «Unioni fatte».
      </p>

      <Sezione id="ospiti-unioni" titolo="Unioni fatte" nota="separa chi è diverso">
        <UnioniFatte onCambio={carica} />
      </Sezione>
    </div>
  )
}
