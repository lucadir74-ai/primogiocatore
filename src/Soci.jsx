// Primo Giocatore - soci delle Tane (per gli organizzatori)
// v1.1.0 - 202610202100 (CSV più tollerante: anche file Excel, Tana scritta per esteso, errori spiegati)
//
// - Controllo dell'accesso: acceso, solo i soci (e le eccezioni) usano
//   l'app. Lo cambia solo chi organizza tutte le Tane.
// - Aggiungi socio: il modulo veloce per ogni nuovo iscritto.
// - Importa CSV: aggiunge o aggiorna, non cancella mai.
// - Non nell'elenco: gli account che non risultano soci, da decidere.
// - Elenco soci, con ricerca e rimozione.
// - Organizzatori delle Tane.
// L'elenco soci lo leggono solo gli organizzatori della Tana: le
// regole sono nel database (supabase/soci.sql).

import { useEffect, useMemo, useState } from 'react'
import { supabase, daMostrare, tutteLeRighe } from './supabase'
import Sezione from './Sezione.jsx'
import CercaScegli from './CercaScegli.jsx'

const vuoto = { nickname: '', nome: '', cognome: '', email: '' }
const STATI = { in_attesa: 'in attesa', eccezione: 'entra come eccezione', escluso: 'non ammesso' }

// CSV: separatore indovinato dalla prima riga (; , o tab), virgolette rispettate.
function leggiCsv(testo) {
  const prima = testo.split(/\r?\n/)[0] || ''
  const sep = [';', '\t', ','].sort((a, b) => prima.split(b).length - prima.split(a).length)[0]
  const righe = []
  let riga = [], campo = '', tra = false
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    if (tra) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') tra = false
      else campo += c
    } else if (c === '"') tra = true
    else if (c === sep) { riga.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++
      riga.push(campo); righe.push(riga); riga = []; campo = ''
    } else campo += c
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga) }
  return righe.filter((r) => r.some((x) => x.trim()))
}

// Intestazioni riconosciute, scritte come capita.
const piatto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
function colonna(intestazione) {
  const h = piatto(intestazione)
  if (/^(nick|nickname|soprannome)/.test(h)) return 'nickname'
  if (/^(email|mail|emailaddress|posta)/.test(h)) return 'email'
  if (/^cognome/.test(h)) return 'cognome'
  if (/^nome/.test(h)) return 'nome'
  if (/^(tana|sede)/.test(h)) return 'tana'
  return null
}

export default function Soci({ profilo }) {
  const globale = Boolean(profilo.organizzatore)
  const [tane, setTane] = useState([])
  const [mie, setMie] = useState([])                 // id delle Tane che gestisco
  const [tana, setTana] = useState(null)
  const [controllo, setControllo] = useState(null)
  const [soci, setSoci] = useState([])
  const [fuori, setFuori] = useState([])
  const [orgTane, setOrgTane] = useState([])
  const [persone, setPersone] = useState([])
  const [nuovo, setNuovo] = useState(vuoto)
  const [csv, setCsv] = useState(null)               // { righe, colonne, scartate }
  const [cerca, setCerca] = useState('')
  const [decidendo, setDecidendo] = useState(null)   // id account con il modulo «è socio» aperto
  const [datiSocio, setDatiSocio] = useState(vuoto)
  const [nuovoOrg, setNuovoOrg] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [lavoro, setLavoro] = useState(false)

  useEffect(() => { carica() }, [profilo.id])

  async function carica() {
    setErrore('')
    try {
      const [t, imp, o, s, f] = await Promise.all([
        supabase.from('tane').select('id, nome').order('nome'),
        supabase.from('impostazioni').select('valore').eq('chiave', 'controllo_soci').maybeSingle(),
        supabase.from('organizzatori_tana').select('utente_id, tana_id'),
        tutteLeRighe(() => supabase.from('soci').select('id, tana_id, nickname, nome, cognome, email, aggiunto_il').order('aggiunto_il', { ascending: false })),
        supabase.rpc('non_nell_elenco'),
      ])
      const sbaglio = [t, imp, o, f].find((x) => x.error)
      if (sbaglio) throw sbaglio.error
      setTane(t.data || [])
      setControllo(imp.data?.valore === true)
      setOrgTane(o.data || [])
      const gestite = globale ? (t.data || []).map((x) => x.id) : (o.data || []).filter((x) => x.utente_id === profilo.id).map((x) => x.tana_id)
      setMie(gestite)
      setTana((attuale) => attuale ?? gestite[0] ?? null)
      setSoci(s)
      setFuori(f.data || [])
      if (globale) {
        const p = await tutteLeRighe(() => supabase.from('profili').select('id, nome, nickname').order('nome'))
        setPersone(p)
      }
    } catch (e) {
      const m = e?.message || String(e)
      setErrore(/soci|tane|impostazioni|non_nell_elenco/.test(m)
        ? 'Al database manca lo script SQL dei soci (soci.sql): va eseguito una volta in Supabase.'
        : m)
    }
  }

  const nomeTana = (id) => tane.find((t) => t.id === id)?.nome || '—'
  const taneMie = tane.filter((t) => mie.includes(t.id))

  async function esegui(fn, ok) {
    setErrore(''); setMessaggio(''); setLavoro(true)
    try {
      const testo = await fn()
      setMessaggio(testo || ok)
      await carica()
    } catch (e) { setErrore(e?.message || String(e)) } finally { setLavoro(false) }
  }

  function cambiaControllo() {
    const acceso = !controllo
    const avviso = acceso
      ? `Accendere il controllo? Da subito chi non è socio (o eccezione) vede solo un messaggio di attesa. Ora ${fuori.filter((f) => f.stato_socio === 'in_attesa').length} account sono in attesa.`
      : 'Spegnere il controllo? Tutti gli account torneranno a usare l’app.'
    if (!confirm(avviso)) return
    esegui(async () => {
      const { error } = await supabase.rpc('imposta_controllo_soci', { p_attivo: acceso })
      if (error) throw error
    }, acceso ? 'Controllo acceso.' : 'Controllo spento.')
  }

  function aggiungi() {
    esegui(async () => {
      const { data, error } = await supabase.rpc('importa_soci', { p_righe: [nuovo], p_tana: tana })
      if (error) throw error
      setNuovo(vuoto)
      if (data.scartati) throw new Error('Socio non salvato: controlla l’email.')
      return data.nuovi ? `${nuovo.nickname || nuovo.email} aggiunto ai soci di ${nomeTana(tana)}.` : 'Era già nell’elenco: dati aggiornati.'
    })
  }

  // CSV o Excel (.xlsx/.xls): Excel si legge con SheetJS, caricato solo qui.
  async function leggiFile(file) {
    const nome = file.name.toLowerCase()
    const testa = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const excel = /\.(xlsx|xls|ods)$/.test(nome) || (testa[0] === 0x50 && testa[1] === 0x4b) || (testa[0] === 0xd0 && testa[1] === 0xcf)
    if (excel) {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const foglio = libro.Sheets[libro.SheetNames[0]]
      return XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '' })
        .map((r) => r.map((x) => String(x ?? '')))
        .filter((r) => r.some((x) => x.trim()))
    }
    let testo = await file.text()
    // Excel italiano a volte salva in Windows-1252: se l'UTF-8 viene male, si rilegge.
    if (testo.includes('\uFFFD')) testo = new TextDecoder('windows-1252').decode(await file.arrayBuffer())
    return leggiCsv(testo.replace(/^\uFEFF/, ''))
  }

  // «Tana dei Goblin di Roma», «TdG Roma», «roma» → la Tana «Roma», se esiste.
  function tanaRiconosciuta(scritta) {
    const v = piatto(scritta)
    if (!v) return ''
    const esatta = tane.find((t) => piatto(t.nome) === v)
    if (esatta) return esatta.nome
    const dentro = tane.filter((t) => v.includes(piatto(t.nome)))
    return dentro.length === 1 ? dentro[0].nome : scritta.trim()
  }

  async function sceltoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrore(''); setMessaggio('')
    try {
      const righe = await leggiFile(file)
      if (righe.length < 2) { setErrore(`«${file.name}» è vuoto o ha solo l’intestazione.`); return }
      const colonne = righe[0].map(colonna)
      if (!colonne.includes('email')) {
        setErrore(`In «${file.name}» non trovo la colonna dell’email. Intestazioni lette: ${righe[0].map((x) => `«${x.trim()}»`).join(', ') || 'nessuna'}.`)
        return
      }
      const dati = righe.slice(1).map((r) => {
        const o = {}
        colonne.forEach((c, i) => { if (c) o[c] = String(r[i] ?? '').trim() })
        if (o.tana) o.tana = tanaRiconosciuta(o.tana)
        return o
      }).filter((o) => o.email || o.nome || o.nickname)
      const nuoveTane = [...new Set(dati.map((o) => o.tana).filter((t) => t && !tane.some((x) => x.nome === t)))]
      setCsv({ dati, colonne: colonne.filter(Boolean), nome: file.name, nuoveTane })
    } catch (err) {
      setErrore(`Non riesco a leggere «${file.name}»: ${err?.message || err}`)
    }
  }

  function importaCsv() {
    esegui(async () => {
      const { data, error } = await supabase.rpc('importa_soci', { p_righe: csv.dati, p_tana: tana })
      if (error) throw new Error(`Importazione non riuscita: ${error.message}`)
      setCsv(null)
      return `Importati: ${data.nuovi} nuovi, ${data.aggiornati} aggiornati${data.scartati ? `, ${data.scartati} scartati (email non valida o Tana che non gestisci)` : ''}.`
    })
  }

  function decidi(account, scelta, extra = {}) {
    const t = account.tana_id && mie.includes(account.tana_id) ? account.tana_id : tana
    esegui(async () => {
      const { error } = await supabase.rpc('decidi_non_socio', {
        p_utente: account.id, p_scelta: scelta, p_tana: t,
        p_nickname: extra.nickname || null, p_nome: extra.nome || null, p_cognome: extra.cognome || null,
      })
      if (error) throw error
      setDecidendo(null)
    }, scelta === 'socio' ? 'Aggiunto ai soci.' : scelta === 'eccezione' ? 'Può entrare come eccezione.' : scelta === 'escluso' ? 'Non ammesso.' : 'Rimesso in attesa.')
  }

  function togli(s) {
    if (!confirm(`Togliere ${s.nickname || s.email} dai soci di ${nomeTana(s.tana_id)}? Se ha un account, tornerà in attesa; le sue partite restano.`)) return
    esegui(async () => {
      const { error } = await supabase.from('soci').delete().eq('id', s.id)
      if (error) throw error
    }, 'Tolto dall’elenco.')
  }

  function organizzatore(utente, tanaId, si) {
    esegui(async () => {
      const { error } = await supabase.rpc('imposta_organizzatore_tana', { p_utente: utente, p_tana: tanaId, p_si: si })
      if (error) throw error
      setNuovoOrg('')
    }, si ? 'Organizzatore aggiunto.' : 'Organizzatore tolto.')
  }

  const sociVisti = useMemo(() => {
    const q = piatto(cerca)
    const della = soci.filter((s) => !tana || s.tana_id === tana)
    if (!q) return della
    return della.filter((s) => piatto(`${s.nickname} ${s.nome} ${s.cognome} ${s.email}`).includes(q))
  }, [soci, cerca, tana])

  const inAttesa = fuori.filter((f) => f.stato_socio === 'in_attesa')
  const campo = (stato, set, chiave, etichetta, tipo = 'text') => (
    <div className="campo">
      <label htmlFor={`soci-${chiave}`}>{etichetta}</label>
      <input id={`soci-${chiave}`} type={tipo} value={stato[chiave]} autoComplete="off"
        onChange={(e) => set({ ...stato, [chiave]: e.target.value })} />
    </div>
  )

  return (
    <div className="scheda">
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {taneMie.length > 1 && (
        <div className="campo">
          <label htmlFor="soci-tana">Tana</label>
          <CercaScegli id="soci-tana" opzioni={taneMie.map((t) => ({ id: t.id, nome: t.nome }))} valore={tana} onScegli={(id) => id && setTana(id)} etichetta="Tana" />
        </div>
      )}

      {globale && controllo != null && (
        <Sezione id="soci-controllo" titolo="Accesso riservato ai soci" nota={controllo ? 'acceso' : 'spento'}>
          <p className="aiuto">
            {controllo
              ? 'Acceso: solo i soci e le eccezioni usano l’app. Gli altri vedono un messaggio di attesa finché non decidi. Gli ospiti nelle partite restano.'
              : 'Spento: tutti gli account usano l’app come sempre. Accendilo quando l’elenco soci è caricato e la Tana ha confermato di poterlo usare.'}
          </p>
          <button className={`bottone${controllo ? ' bottone-secondario' : ''}`} onClick={cambiaControllo} disabled={lavoro}>
            {controllo ? 'Spegni il controllo' : 'Accendi il controllo'}
          </button>
        </Sezione>
      )}

      <Sezione id="soci-aggiungi" titolo="Aggiungi socio" nota={tana ? nomeTana(tana) : null}>
        {campo(nuovo, setNuovo, 'nickname', 'Nickname')}
        {campo(nuovo, setNuovo, 'nome', 'Nome')}
        {campo(nuovo, setNuovo, 'cognome', 'Cognome')}
        {campo(nuovo, setNuovo, 'email', 'Email', 'email')}
        <button className="bottone" onClick={aggiungi} disabled={lavoro || !tana || !nuovo.email.trim()}>Aggiungi</button>
        <p className="aiuto">Se ha già un account con questa email, diventa socio subito.</p>
      </Sezione>

      <Sezione id="soci-csv" titolo="Importa da CSV" nota="aggiunge o aggiorna, non cancella">
        <p className="aiuto">
          File CSV o Excel. Colonne riconosciute: nickname, nome, cognome, mail (o email), tana (anche «Tana di riferimento»).
          Nel CSV il separatore può essere punto e virgola, virgola o tabulazione. Chi è già nell&rsquo;elenco viene aggiornato; chi manca nel file non viene tolto.
          {taneMie.length > 1 && ' Le righe senza Tana vanno in quella scelta in alto.'}
        </p>
        {!csv ? (
          <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={sceltoFile} className="campo-file" aria-label="Scegli il file CSV" />
        ) : (
          <>
            <p className="aiuto">
              <strong>{csv.nome}</strong>: {csv.dati.length} righe. Colonne trovate: {csv.colonne.join(', ')}.
            </p>
            {csv.nuoveTane.length > 0 && (
              <div className="avviso errore">
                Tane non riconosciute: {csv.nuoveTane.join(', ')}. {globale ? 'Verranno create come Tane nuove: se è un errore di scrittura, correggi il file.' : 'Quelle righe verranno scartate.'}
              </div>
            )}
            <ul className="elenco">
              {csv.dati.slice(0, 3).map((r, i) => (
                <li key={i} style={{ display: 'block' }}>
                  <strong>{r.nickname || `${r.nome || ''} ${r.cognome || ''}`.trim() || '—'}</strong>
                  <span className="anno block">{r.email || 'email mancante'}{r.tana ? ` · ${r.tana}` : ''}</span>
                </li>
              ))}
            </ul>
            <button className="bottone" onClick={importaCsv} disabled={lavoro}>Importa {csv.dati.length} soci</button>
            <button className="bottone bottone-secondario" onClick={() => setCsv(null)}>Annulla</button>
          </>
        )}
      </Sezione>

      <Sezione id="soci-fuori" titolo="Non nell’elenco" nota={inAttesa.length ? `${inAttesa.length} in attesa` : fuori.length ? `${fuori.length}` : 'nessuno'}>
        {fuori.length === 0 ? (
          <p className="aiuto">Tutti gli account risultano soci.</p>
        ) : (
          <ul className="elenco">
            {fuori.map((a) => (
              <li key={a.id} style={{ display: 'block' }}>
                <div className="nome-giocatore">
                  <strong>{daMostrare(a)}</strong>
                  <span className="anno block">{a.email} · {STATI[a.stato_socio] || a.stato_socio}{a.tana_id ? ` · ${nomeTana(a.tana_id)}` : ''}</span>
                </div>
                {decidendo === a.id ? (
                  <div style={{ marginTop: '0.6rem' }}>
                    {campo(datiSocio, setDatiSocio, 'nickname', 'Nickname')}
                    {campo(datiSocio, setDatiSocio, 'nome', 'Nome')}
                    {campo(datiSocio, setDatiSocio, 'cognome', 'Cognome')}
                    <button className="bottone" onClick={() => decidi(a, 'socio', datiSocio)} disabled={lavoro}>
                      Aggiungi ai soci{tana ? ` di ${nomeTana(tana)}` : ''}
                    </button>
                    <button className="bottone bottone-secondario" onClick={() => setDecidendo(null)}>Annulla</button>
                  </div>
                ) : (
                  <span className="azioni-iscritto">
                    <button className="bottone-piatto" onClick={() => { setDecidendo(a.id); setDatiSocio({ ...vuoto, nickname: a.nickname || '', nome: a.nome || '' }) }}>è socio</button>
                    {a.stato_socio !== 'eccezione' && <button className="bottone-piatto" onClick={() => decidi(a, 'eccezione')}>lascia entrare</button>}
                    {a.stato_socio !== 'escluso' && <button className="bottone-piatto pericolo" onClick={() => decidi(a, 'escluso')}>non ammettere</button>}
                    {a.stato_socio !== 'in_attesa' && <button className="bottone-piatto" onClick={() => decidi(a, 'in_attesa')}>rimetti in attesa</button>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sezione>

      <Sezione id="soci-elenco" titolo="Elenco soci" nota={`${soci.filter((s) => !tana || s.tana_id === tana).length}`}>
        <input className="campo-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nickname, nome o email" aria-label="Cerca un socio" />
        <ul className="elenco">
          {sociVisti.slice(0, 100).map((s) => (
            <li key={s.id}>
              <div className="nome-giocatore">
                <strong>{s.nickname || `${s.nome || ''} ${s.cognome || ''}`.trim() || s.email}</strong>
                <span className="anno block">{[s.nickname && `${s.nome || ''} ${s.cognome || ''}`.trim(), s.email].filter(Boolean).join(' · ')}</span>
              </div>
              <button className="bottone-piatto pericolo" onClick={() => togli(s)} disabled={lavoro}>togli</button>
            </li>
          ))}
        </ul>
        {sociVisti.length > 100 && <p className="aiuto">Altri {sociVisti.length - 100}: affina la ricerca.</p>}
      </Sezione>

      {globale && (
        <Sezione id="soci-org" titolo="Organizzatori delle Tane">
          <p className="aiuto">Gestiscono soci e accessi solo della loro Tana. Chi ha il ruolo Organizzatore li gestisce tutte.</p>
          {tane.map((t) => {
            const loro = orgTane.filter((o) => o.tana_id === t.id)
            return (
              <div key={t.id} style={{ marginBottom: '1rem' }}>
                <h4 className="finestra-sottotitolo">{t.nome}</h4>
                {loro.length === 0 && <p className="aiuto">Nessuno, oltre agli organizzatori generali.</p>}
                <ul className="elenco">
                  {loro.map((o) => {
                    const p = persone.find((x) => x.id === o.utente_id)
                    return (
                      <li key={o.utente_id}>
                        <span>{p ? daMostrare(p) : 'account'}</span>
                        <button className="bottone-piatto pericolo" onClick={() => organizzatore(o.utente_id, t.id, false)} disabled={lavoro}>togli</button>
                      </li>
                    )
                  })}
                </ul>
                {t.id === tana && (
                  <>
                    <CercaScegli opzioni={persone.filter((p) => !loro.some((o) => o.utente_id === p.id)).map((p) => ({ id: p.id, nome: daMostrare(p) }))}
                      valore={nuovoOrg} onScegli={setNuovoOrg} segnaposto="Aggiungi un organizzatore" etichetta={`Aggiungi un organizzatore a ${t.nome}`} svuotabile />
                    <button className="bottone bottone-secondario" onClick={() => organizzatore(nuovoOrg, t.id, true)} disabled={lavoro || !nuovoOrg}>Aggiungi a {t.nome}</button>
                  </>
                )}
              </div>
            )
          })}
        </Sezione>
      )}
    </div>
  )
}
