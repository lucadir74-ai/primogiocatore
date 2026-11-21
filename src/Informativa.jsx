// Primo Giocatore - informativa privacy al primo accesso
// v1.0.0 - 202611212100
//
// Indicazioni dell'associazione (punto 4): al primo accesso si legge e
// si accetta una breve informativa; l'app registra data e versione.
// Il testo lo scrive l'associazione e lo pubblica l'amministratore da
// Persone → Soci → Informativa: ogni versione nuova va riaccettata.
// Regole e registrazioni nel database (supabase/privacy_fase4.sql).
//
// Il testo è semplice: paragrafi separati da una riga vuota, titoletti
// con «# » davanti, elenchi con «- ». Niente HTML.

import { Fragment, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Solo un punto di partenza per l'amministratore: il testo vero lo
// prepara l'associazione.
export const BOZZA_INFORMATIVA = `# Primo Giocatore: informativa per i soci

Questa è un'informativa integrativa a quella che hai ricevuto quando ti sei associato. [BOZZA PROVVISORIA: il testo definitivo lo prepara l'associazione.]

# A cosa serve l'app
Primo Giocatore serve a creare comunità fra i soci: organizzare tavoli, registrare le partite, vedere statistiche e classifiche.

# Cosa vedono gli altri soci
Per usare l'app, il tuo nick e le statistiche di gioco legate al nick sono visibili agli altri soci iscritti all'app. Se non lo vuoi, non iscriverti.
- Nome e cognome li vedono gli altri solo se lo scegli tu, dal profilo, e puoi cambiare idea quando vuoi.
- La tua email non è mai visibile agli altri.

# Quali dati usa l'app
Nick, nome, cognome ed email dell'elenco soci, e i dati di gioco: tavoli, partecipazioni e risultati.

# I tuoi diritti
Dal profilo puoi scaricare i tuoi dati ed eliminare il tuo account. Le partite già giocate restano nelle statistiche in forma anonima. Eliminare l'account non tocca l'iscrizione all'associazione.

# Contatti
Per qualsiasi domanda scrivi all'associazione.`

// Testo → paragrafi, titoletti, elenchi.
export function TestoInformativa({ testo }) {
  const blocchi = String(testo || '').replace(/\r/g, '').split(/\n\s*\n/)
  return blocchi.map((b, i) => {
    const righe = b.split('\n').filter((r) => r.trim())
    return (
      <Fragment key={i}>
        {righe.map((r, j) => {
          if (r.startsWith('# ')) return <h3 key={j} className="titolo-sezione" style={{ marginTop: '1rem' }}>{r.slice(2)}</h3>
          if (r.startsWith('- ')) return <p key={j} style={{ margin: '0.2rem 0 0.2rem 1rem' }}>• {r.slice(2)}</p>
          return <p key={j}>{r}</p>
        })}
      </Fragment>
    )
  })
}

// La schermata del primo accesso: finché non si accetta, l'app non si apre.
export default function Informativa({ dati, onAccettata }) {
  const [letta, setLetta] = useState(false)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState('')

  async function accetta() {
    setErrore(''); setAttesa(true)
    const { error } = await supabase.rpc('accetta_informativa', { p_versione: dati.versione })
    setAttesa(false)
    if (error) { setErrore(error.message); return }
    onAccettata()
  }

  return (
    <div className="scheda">
      <h2>Prima di entrare</h2>
      <p className="sottotitolo">Leggi l&rsquo;informativa sulla privacy dell&rsquo;associazione. Versione {dati.versione}.</p>
      <div className="informativa-testo" style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--bordo)', borderRadius: 12, padding: '0.4rem 1rem', margin: '1rem 0' }}>
        <TestoInformativa testo={dati.testo} />
      </div>
      {errore && <div className="avviso errore">{errore}</div>}
      <label className="sei-tu-scelta" style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={letta} onChange={(e) => setLetta(e.target.checked)} />
        <span>Ho letto l&rsquo;informativa e accetto</span>
      </label>
      <button className="bottone" onClick={accetta} disabled={!letta || attesa}>
        {attesa ? 'Un attimo…' : 'Entra nell’app'}
      </button>
      <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>
        Non accetto, esci
      </button>
      <p className="aiuto">Se non accetti non puoi usare l&rsquo;app. Puoi chiedere all&rsquo;associazione di eliminare il tuo account.</p>
    </div>
  )
}

// Per l'amministratore: versione attuale, quanti l'hanno accettata,
// pubblicazione di una versione nuova con anteprima.
export function GestioneInformativa() {
  const [ultima, setUltima] = useState(undefined)   // undefined = carico, null = nessuna
  const [stato, setStato] = useState(null)
  const [versione, setVersione] = useState('')
  const [testo, setTesto] = useState('')
  const [anteprima, setAnteprima] = useState(false)
  const [errore, setErrore] = useState('')
  const [ok, setOk] = useState('')
  const [attesa, setAttesa] = useState(false)

  async function carica() {
    const [u, s] = await Promise.all([
      supabase.from('informative').select('versione, testo, pubblicata_il').order('pubblicata_il', { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc('stato_informativa'),
    ])
    if (u.error) {
      setErrore(/informative/.test(u.error.message) ? 'Al database manca lo script dell’informativa (privacy_fase4.sql): va eseguito una volta in Supabase.' : u.error.message)
      setUltima(null)
      return
    }
    setUltima(u.data)
    setStato(s.data || null)
    setTesto((t) => t || u.data?.testo || BOZZA_INFORMATIVA)
    setVersione((v) => v || (u.data ? '' : '1.0'))
  }
  useEffect(() => { carica() }, [])

  async function pubblica() {
    setErrore(''); setOk('')
    if (!confirm(`Pubblicare la versione ${versione.trim()}? Da subito tutti gli iscritti dovranno leggerla e accettarla al prossimo accesso. Non si può cancellare: per correggere si pubblica una versione nuova.`)) return
    setAttesa(true)
    const { error } = await supabase.rpc('pubblica_informativa', { p_versione: versione.trim(), p_testo: testo })
    setAttesa(false)
    if (error) { setErrore(error.message); return }
    setOk(`Versione ${versione.trim()} pubblicata.`)
    setVersione(''); setAnteprima(false)
    carica()
  }

  const bozza = testo.includes('[BOZZA PROVVISORIA')

  return (
    <>
      {errore && <div className="avviso errore">{errore}</div>}
      {ok && <div className="avviso ok">{ok}</div>}
      {ultima === undefined ? <p className="aiuto">Carico…</p> : ultima ? (
        <p className="aiuto">
          In vigore la versione <strong>{ultima.versione}</strong>, pubblicata il {new Date(ultima.pubblicata_il).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.
          {stato && ` L’hanno accettata ${stato.accettata_da} iscritti su ${stato.iscritti}.`}
        </p>
      ) : (
        <p className="aiuto">Nessuna informativa pubblicata: per ora l&rsquo;app non chiede niente. Quando l&rsquo;associazione manda il testo, incollalo qui sotto e pubblicalo.</p>
      )}
      <div className="campo">
        <label htmlFor="inf-versione">Numero della versione nuova</label>
        <input id="inf-versione" value={versione} onChange={(e) => setVersione(e.target.value)} placeholder="per esempio 1.0, 1.1, 2.0" autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor="inf-testo">Testo</label>
        <textarea id="inf-testo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={14} style={{ width: '100%', fontFamily: 'inherit' }} />
        <p className="aiuto">Paragrafi separati da una riga vuota; «# » davanti per un titoletto, «- » per un elenco.</p>
      </div>
      {bozza && <div className="avviso errore">Il testo contiene ancora la scritta «BOZZA PROVVISORIA»: sostituiscilo con quello dell&rsquo;associazione prima di pubblicare.</div>}
      <button className="bottone bottone-secondario" onClick={() => setAnteprima((a) => !a)}>
        {anteprima ? 'Chiudi l’anteprima' : 'Anteprima'}
      </button>
      {anteprima && (
        <div style={{ border: '1px solid var(--bordo)', borderRadius: 12, padding: '0.4rem 1rem', margin: '0.6rem 0' }}>
          <TestoInformativa testo={testo} />
        </div>
      )}
      <button className="bottone" onClick={pubblica} disabled={attesa || !versione.trim() || testo.trim().length < 50 || bozza}>
        {attesa ? 'Pubblico…' : 'Pubblica la versione nuova'}
      </button>
    </>
  )
}
