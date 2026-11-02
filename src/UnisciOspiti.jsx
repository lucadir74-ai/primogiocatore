// Primo Giocatore - gestione degli ospiti
// v3.8.0 - 202611021600 (elenco «Unioni fatte» con «separa»: l'ultima parola è di chi conosce le persone)
//
// Rinominare, unire i doppioni e trasformare un ospite nell'account
// con cui quella persona si è iscritta.

import { useEffect, useState } from 'react'
import { supabase, tutteLeRighe } from './supabase'
import { RichiesteDaApprovare } from './SeiTu.jsx'
import CercaScegli from './CercaScegli.jsx'
import Sezione from './Sezione.jsx'

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

  useEffect(() => { carica() }, [])

  async function carica() {
    try {
      const [o, p, pr] = await Promise.all([
        tutteLeRighe(() => supabase.from('ospiti').select('*').order('nome')),
        tutteLeRighe(() => supabase.from('partecipazioni').select('ospite_id').not('ospite_id', 'is', null)),
        tutteLeRighe(() => supabase.from('profili').select('*').order('nome')),
      ])
      setPersone(pr)
      const conteggio = new Map()
      for (const r of p) conteggio.set(r.ospite_id, (conteggio.get(r.ospite_id) || 0) + 1)
      // Quelli già collegati a un account, o uniti a un altro ospite,
      // non sono più ospiti da gestire.
      setOspiti(o.filter((x) => !x.utente_collegato && !x.unito_in)
        .map((x) => ({ ...x, partite: conteggio.get(x.id) || 0 })))
    } catch (e) {
      setErrore(e.message)
    }
  }

  // Ospiti che con ogni probabilità sono un iscritto: stesso numero BGA
  // del suo profilo, oppure nome identico al suo nickname, al nome o al
  // nome BGA (maiuscole, spazi e accenti non contano). Solo
  // corrispondenze esatte e senza ambiguità: due account possibili = niente.
  const piatto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const sembranoIscritti = (() => {
    const perNome = new Map()
    const perBga = new Map()
    const aggiungi = (m, k, p) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(p.id) }
    for (const p of persone) {
      // Il nome conta solo se è nome e cognome: «Marco» da solo è di troppi.
      const nomi = [p.nickname, p.bga_username, String(p.nome || '').trim().includes(' ') ? p.nome : null]
      for (const n of nomi) { const k = piatto(n); if (k.length >= 4) aggiungi(perNome, k, p) }
      if (p.bga_id) aggiungi(perBga, String(p.bga_id), p)
    }
    const out = []
    for (const o of ospiti) {
      const daBga = o.bga_id ? perBga.get(String(o.bga_id)) : null
      const daNome = perNome.get(piatto(o.nome))
      const scelto = daBga?.size === 1 ? [...daBga][0] : daNome?.size === 1 ? [...daNome][0] : null
      if (!scelto) continue
      const utente = persone.find((p) => p.id === scelto)
      if (utente) out.push({ ospite: o, utente, perche: daBga?.size === 1 ? 'stesso numero BGA' : 'stesso nome' })
    }
    return out.sort((a, b) => b.ospite.partite - a.ospite.partite)
  })()

  async function collegaTutti() {
    const n = sembranoIscritti.length
    if (!confirm(`Collegare ${n} ospiti ai rispettivi account? Le loro partite passano agli account e le voci ospite spariscono.`)) return
    setErrore(''); setMessaggio(''); setLavorando(true)
    let fatti = 0
    for (const { ospite, utente } of sembranoIscritti) {
      const { error } = await supabase.rpc('collega_ospite', { p_ospite: ospite.id, p_utente: utente.id })
      if (error) { setErrore(`«${ospite.nome}»: ${error.message}`); break }
      fatti++
    }
    setLavorando(false)
    if (fatti) setMessaggio(`${fatti} ospiti collegati al loro account.`)
    carica()
  }

  async function salvaNome() {
    setErrore(''); setMessaggio('')
    if (!rinomina.nome.trim()) { setErrore('Il nome non può restare vuoto.'); return }
    const { error } = await supabase
      .from('ospiti').update({ nome: rinomina.nome.trim() }).eq('id', rinomina.id)
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

      <RichiesteDaApprovare profilo={profilo} onCambio={() => { carica(); onRichieste?.() }} />

      {sembranoIscritti.length > 0 && (
        <>
          <h3 className="titolo-sezione">Sembrano iscritti <span className="conteggio">{sembranoIscritti.length}</span></h3>
          <p className="aiuto">Ospiti con lo stesso nome o lo stesso numero BGA di un account. Collegandoli, le loro partite passano all&rsquo;account e il doppione sparisce.</p>
          <ul className="elenco">
            {sembranoIscritti.slice(0, 30).map(({ ospite, utente, perche }) => (
              <li key={ospite.id}>
                <div className="nome-giocatore">
                  <strong>{ospite.nome}</strong>
                  <span className="anno block">{ospite.partite} {ospite.partite === 1 ? 'partita' : 'partite'} · è {utente.nickname || utente.nome}? ({perche})</span>
                </div>
                <button className="bottone-piatto" onClick={() => diventaAccount(ospite, utente)} disabled={lavorando}>collega</button>
              </li>
            ))}
          </ul>
          {sembranoIscritti.length > 1 && (
            <button className="bottone bottone-secondario" onClick={collegaTutti} disabled={lavorando}>
              {lavorando ? 'Collego…' : `Collega tutti (${sembranoIscritti.length})`}
            </button>
          )}
        </>
      )}

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
                  <span className="anno block">
                    {o.partite} {o.partite === 1 ? 'partita' : 'partite'}
                  </span>
                </div>
                <span className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setRinomina({ id: o.id, nome: o.nome })}>rinomina</button>
                  <button className="bottone-piatto"
                    onClick={() => setCollega({ ospite: o, cerca: '' })}>si è iscritto</button>
                </span>
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
