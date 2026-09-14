// Primo Giocatore v1.3.0 - 202609141800
// Punto 2: registrazione, accesso, profilo.
// Punto 3a: catalogo giochi da BoardGameGeek.
// Punto 3b: registrazione partite con timer e punteggi.

import { useEffect, useState } from 'react'
import { supabase, configurato, COLORI } from './supabase'
import Giochi from './Giochi.jsx'
import Partita from './Partita.jsx'

function Marchio() {
  return (
    <div className="marchio">
      <div className="segnalino" aria-hidden="true">1°</div>
      <h1>
        Primo
        <span>giocatore</span>
      </h1>
    </div>
  )
}

function Avviso({ tipo, testo }) {
  if (!testo) return null
  return <div className={`avviso ${tipo}`}>{testo}</div>
}

/* ---------------- Accesso e registrazione ---------------- */

function Accesso() {
  const [modo, setModo] = useState('entra')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState('')
  const [ok, setOk] = useState('')

  async function invia() {
    setErrore('')
    setOk('')

    if (!email || !password) {
      setErrore('Servono email e password.')
      return
    }
    if (modo === 'iscriviti' && !nome.trim()) {
      setErrore('Scrivi il nome con cui ti vedranno gli altri giocatori.')
      return
    }
    if (modo === 'iscriviti' && password.length < 8) {
      setErrore('La password deve avere almeno 8 caratteri.')
      return
    }

    setAttesa(true)
    try {
      if (modo === 'iscriviti') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw error
        if (data.session) return
        setOk('Account creato. Controlla la posta e conferma l\u2019indirizzo, poi torna qui.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) {
      setErrore(traduciErrore(e))
    } finally {
      setAttesa(false)
    }
  }

  return (
    <div className="scheda">
      <h2>{modo === 'entra' ? 'Entra' : 'Crea il tuo account'}</h2>
      <p className="sottotitolo">
        {modo === 'entra'
          ? 'Riprendi da dove eri rimasto.'
          : 'Ti serve per registrare le partite e iscriverti ai tavoli.'}
      </p>

      <Avviso tipo="errore" testo={errore} />
      <Avviso tipo="ok" testo={ok} />

      {modo === 'iscriviti' && (
        <div className="campo">
          <label htmlFor="nome">Nome</label>
          <input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            placeholder="Come ti chiamano al tavolo"
          />
        </div>
      )}

      <div className="campo">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="campo">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={modo === 'entra' ? 'current-password' : 'new-password'}
          onKeyDown={(e) => e.key === 'Enter' && invia()}
        />
        {modo === 'iscriviti' && <p className="aiuto">Almeno 8 caratteri.</p>}
      </div>

      <button className="bottone" onClick={invia} disabled={attesa}>
        {attesa ? 'Un attimo\u2026' : modo === 'entra' ? 'Entra' : 'Crea account'}
      </button>

      <p className="riga-fondo">
        {modo === 'entra' ? 'Non hai ancora un account? ' : 'Ce l\u2019hai già? '}
        <button
          className="bottone-piatto"
          onClick={() => {
            setModo(modo === 'entra' ? 'iscriviti' : 'entra')
            setErrore('')
            setOk('')
          }}
        >
          {modo === 'entra' ? 'Iscriviti' : 'Entra'}
        </button>
      </p>
    </div>
  )
}

/* ---------------- Profilo ---------------- */

function Profilo({ sessione, profilo, setProfilo }) {
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState('')
  const [ok, setOk] = useState('')

  function aggiorna(campo, valore) {
    setProfilo((p) => ({ ...p, [campo]: valore }))
    setOk('')
  }

  async function salva() {
    setErrore('')
    setOk('')
    if (!profilo.nome?.trim()) {
      setErrore('Il nome non può restare vuoto.')
      return
    }
    setSalvataggio(true)
    const { error } = await supabase
      .from('profili')
      .update({
        nome: profilo.nome.trim(),
        nickname: profilo.nickname?.trim() || null,
        citta: profilo.citta?.trim() || null,
        colore: profilo.colore || null,
        bgg_username: profilo.bgg_username?.trim() || null,
        bga_username: profilo.bga_username?.trim() || null,
      })
      .eq('id', sessione.user.id)

    setSalvataggio(false)
    if (error) setErrore(traduciErrore(error))
    else setOk('Profilo salvato.')
  }

  const coloreAttivo = COLORI.find((c) => c.id === profilo.colore)

  return (
    <div className="scheda">
      <h2>{profilo.nome}</h2>
      <p className="sottotitolo">{sessione.user.email}</p>

      <Avviso tipo="errore" testo={errore} />
      <Avviso tipo="ok" testo={ok} />

      <div className="campo">
        <label htmlFor="p-nome">Nome</label>
        <input id="p-nome" value={profilo.nome || ''} onChange={(e) => aggiorna('nome', e.target.value)} />
      </div>

      <div className="campo">
        <label htmlFor="p-nick">Soprannome</label>
        <input id="p-nick" value={profilo.nickname || ''} onChange={(e) => aggiorna('nickname', e.target.value)} />
        <p className="aiuto">Deve essere diverso da quello di ogni altro giocatore.</p>
      </div>

      <div className="campo">
        <label htmlFor="p-citta">Città</label>
        <input id="p-citta" value={profilo.citta || ''} onChange={(e) => aggiorna('citta', e.target.value)} />
      </div>

      <fieldset className="campo colori-campo">
        <label style={{ display: 'block' }}>
          Il tuo colore{coloreAttivo ? `: ${coloreAttivo.nome}` : ''}
        </label>
        <div className="colori">
          {COLORI.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pastiglia"
              style={{ background: c.hex }}
              aria-label={c.nome}
              aria-pressed={profilo.colore === c.id}
              onClick={() => aggiorna('colore', c.id)}
            />
          ))}
        </div>
        <p className="aiuto">Ti riconosce nelle classifiche e nei tavoli, come il segnalino al tavolo vero.</p>
      </fieldset>

      <div className="campo">
        <label htmlFor="p-bgg">Utente BoardGameGeek</label>
        <input id="p-bgg" value={profilo.bgg_username || ''} onChange={(e) => aggiorna('bgg_username', e.target.value)} />
        <p className="aiuto">Facoltativo. Serve per importare la tua collezione.</p>
      </div>

      <div className="campo">
        <label htmlFor="p-bga">Utente Board Game Arena</label>
        <input id="p-bga" value={profilo.bga_username || ''} onChange={(e) => aggiorna('bga_username', e.target.value)} />
        <p className="aiuto">Facoltativo.</p>
      </div>

      <button className="bottone" onClick={salva} disabled={salvataggio}>
        {salvataggio ? 'Salvo\u2026' : 'Salva profilo'}
      </button>
    </div>
  )
}

/* ---------------- Radice ---------------- */

export default function App() {
  const [sessione, setSessione] = useState(null)
  const [profilo, setProfilo] = useState(null)
  const [pronto, setPronto] = useState(false)
  const [scheda, setScheda] = useState('partita')
  const [erroreProfilo, setErroreProfilo] = useState('')

  useEffect(() => {
    if (!configurato) { setPronto(true); return }

    supabase.auth.getSession().then(({ data }) => {
      setSessione(data.session)
      setPronto(true)
    })

    const { data: iscrizione } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessione(s)
      if (!s) setProfilo(null)
    })
    return () => iscrizione.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessione) return
    let vivo = true
    supabase
      .from('profili')
      .select('*')
      .eq('id', sessione.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setErroreProfilo(traduciErrore(error))
        else if (data) setProfilo(data)
        else setErroreProfilo('Il profilo non è stato creato: controlla il trigger su auth.users.')
      })
    return () => { vivo = false }
  }, [sessione])

  return (
    <div className="guscio">
      <Marchio />

      {!configurato ? (
        <div className="scheda">
          <h2>Manca il collegamento al database</h2>
          <p className="sottotitolo">
            Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY fra le variabili
            d&rsquo;ambiente del progetto su Vercel, poi rilancia la build.
          </p>
        </div>
      ) : !pronto ? (
        <div className="scheda"><p>Un attimo&hellip;</p></div>
      ) : !sessione ? (
        <Accesso />
      ) : !profilo ? (
        <div className="scheda">
          {erroreProfilo ? <Avviso tipo="errore" testo={erroreProfilo} /> : <p>Carico il profilo&hellip;</p>}
        </div>
      ) : (
        <>
          <nav className="schede">
            <button
              className={scheda === 'partita' ? 'scheda-attiva' : ''}
              onClick={() => setScheda('partita')}
            >
              Partita
            </button>
            <button
              className={scheda === 'giochi' ? 'scheda-attiva' : ''}
              onClick={() => setScheda('giochi')}
            >
              Giochi
            </button>
            <button
              className={scheda === 'profilo' ? 'scheda-attiva' : ''}
              onClick={() => setScheda('profilo')}
            >
              Profilo
            </button>
            <button className="esci" onClick={() => supabase.auth.signOut()}>Esci</button>
          </nav>

          {scheda === 'partita' ? (
            <Partita profilo={profilo} />
          ) : scheda === 'giochi' ? (
            <Giochi profilo={profilo} />
          ) : (
            <Profilo sessione={sessione} profilo={profilo} setProfilo={setProfilo} />
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- Messaggi d'errore in italiano ---------------- */

function traduciErrore(e) {
  const m = (e?.message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email o password non corrispondono.'
  if (m.includes('user already registered')) return 'Questa email ha già un account. Prova a entrare.'
  if (m.includes('email not confirmed')) return 'Devi prima confermare l\u2019indirizzo dal messaggio che ti è arrivato.'
  if (m.includes('duplicate key') && m.includes('nickname')) return 'Questo soprannome è già di qualcun altro. Scegline un altro.'
  if (m.includes('row-level security')) return 'Il database ha rifiutato la scrittura: manca una regola di accesso.'
  if (m.includes('failed to fetch')) return 'Nessuna connessione al database. Controlla la rete.'
  return e?.message || 'Qualcosa non ha funzionato.'
}
