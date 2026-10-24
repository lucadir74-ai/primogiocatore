// Primo Giocatore v4.19.1 - 202610221300 (avviso BGA: le partite in sospeso non bloccano più le altre)
// Punto 2: registrazione, accesso, profilo.
// Punto 3a: catalogo giochi da BoardGameGeek.
// Punto 3b: registrazione partite con timer e punteggi.

import { useEffect, useRef, useState } from 'react'
import { supabase, configurato, COLORI, daMostrare } from './supabase'
import Giochi from './Giochi.jsx'
import Partita from './Partita.jsx'
import Storico from './Storico.jsx'
import Statistiche from './Statistiche.jsx'
import Dati from './Dati.jsx'
import UnisciOspiti from './UnisciOspiti.jsx'
import Giocatori from './Giocatori.jsx'
import NomeBga from './NomeBga.jsx'
import Tavoli from './Tavoli.jsx'
import Luoghi from './Luoghi.jsx'
import GiochiDoppi from './GiochiDoppi.jsx'
import TavoloPubblico from './TavoloPubblico.jsx'
import Classifiche from './Classifiche.jsx'
import Organizzatori from './Organizzatori.jsx'
import Soci from './Soci.jsx'
import SeiTu, { contaRichiesteDaApprovare } from './SeiTu.jsx'
import { sincronizzaSeServe } from './sincroBgg'
import { sincronizzaBgaSeServe } from './bga'
import ImportaBga from './ImportaBga.jsx'
import Benvenuto from './Benvenuto.jsx'
import Condividi from './Condividi.jsx'

// Le sezioni del profilo, una alla volta: senza, la pagina era lunghissima.
const SEZIONI_PROFILO = [
  ['profilo', 'Profilo'],
  ['dati', 'Dati e import'],
  ['ospiti', 'Ospiti'],
  ['luoghi', 'Luoghi'],
  ['giochi', 'Giochi doppi', true],   // mostra tutto il catalogo
  ['ruoli', 'Ruoli', true],   // solo per chi organizza
  ['soci', 'Soci', true],     // organizzatori, anche di una sola Tana
]
const CHIAVE_SEZIONE = 'primo-giocatore:sezione-profilo'
// Chi su questo telefono è già entrato una volta salta la pagina di benvenuto.
const CHIAVE_GIA_ENTRATO = 'primo-giocatore:gia-entrato'

// Il riquadro "Sei tu?" serve a chi si è appena registrato: dopo due
// mesi, o per chi organizza, resta solo nel profilo.
const GIORNI_SEI_TU = 60

// Menu orizzontale che non sta nello schermo: le frecce ai lati dicono
// che c'è altro e lo fanno scorrere.
function MenuScorrevole({ voci, attiva, onScegli, etichetta }) {
  const fila = useRef(null)
  const [bordi, setBordi] = useState({ sinistra: false, destra: false })

  function misura() {
    const el = fila.current
    if (!el) return
    setBordi({
      sinistra: el.scrollLeft > 4,
      destra: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }

  useEffect(() => {
    misura()
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [voci.length])

  // La voce scelta resta sempre in vista.
  useEffect(() => {
    fila.current?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [attiva])

  const sposta = (verso) => fila.current?.scrollBy({ left: verso * fila.current.clientWidth * 0.7, behavior: 'smooth' })

  return (
    <div className="menu-scorrevole">
      {bordi.sinistra && (
        <button type="button" className="freccia-menu sinistra" onClick={() => sposta(-1)} aria-label="Voci precedenti">‹</button>
      )}
      <nav className="sottoschede" aria-label={etichetta} ref={fila} onScroll={misura}>
        {voci.map(([id, testo, segno]) => (
          <button key={id} className={attiva === id ? 'attiva' : ''}
            aria-current={attiva === id ? 'page' : undefined}
            onClick={() => onScegli(id)}>
            {testo}{segno && <span className="stellina"> ●</span>}
          </button>
        ))}
      </nav>
      {bordi.destra && (
        <button type="button" className="freccia-menu destra" onClick={() => sposta(1)} aria-label="Altre voci">›</button>
      )}
    </div>
  )
}

/* Icone: tracciati semplici, si colorano da sole col testo. */
const ICONE = {
  partita: 'M5 5h14v14H5z M9 9h.01 M15 15h.01 M15 9h.01 M9 15h.01',
  storico: 'M4 6h16 M4 12h16 M4 18h10',
  statistiche: 'M5 20V10 M12 20V4 M19 20v-7',
  giochi: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  profilo: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21c0-4 3.6-6 8-6s8 2 8 6',
  giocatori: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.2 3.2 0 010 6.3 M18 14.3c2.2.6 3.5 2.6 3.5 5.7',
  tavoli: 'M3 10h18 M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3 M6 10v9 M18 10v9',
}

function Icona({ nome }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d={ICONE[nome]} />
    </svg>
  )
}

function Marchio() {
  return (
    <div className="marchio">
      <img className="logo-tana" src="/logo-tdg-roma.png" alt="Tana dei Goblin Roma" />
      <h1>
        Primo Giocatore
        <span>by TdG Roma</span>
      </h1>
    </div>
  )
}

function Avviso({ tipo, testo }) {
  if (!testo) return null
  return <div className={`avviso ${tipo}`}>{testo}</div>
}

/* ---------------- Casella password con l'occhio ---------------- */

// Una casella password con un tasto per vedere quello che si è scritto.
// Resta nascosta finché non la mostri, e torna nascosta a ogni apertura.
function CampoPassword({ id, value, onChange, autoComplete, onKeyDown }) {
  const [visibile, setVisibile] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visibile ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{ paddingRight: '3rem' }}
      />
      <button
        type="button"
        onClick={() => setVisibile((v) => !v)}
        aria-label={visibile ? 'Nascondi password' : 'Mostra password'}
        aria-pressed={visibile}
        title={visibile ? 'Nascondi password' : 'Mostra password'}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '2.9rem',
          display: 'grid', placeItems: 'center', background: 'none', border: 0,
          padding: 0, cursor: 'pointer', color: 'var(--inchiostro-tenue, currentColor)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visibile && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  )
}

/* ---------------- Accesso e registrazione ---------------- */

// Iscrizione riservata ai soci: chi non lo è scrive a Dario su WhatsApp.
const WHATSAPP_TANA = '393335891955'
const TANA_NOME = 'Tana dei Goblin di Roma'
function linkWhatsApp({ nickname, nome, email }) {
  const righe = [
    `Ciao, vorrei usare Primo Giocatore e iscrivermi alla ${TANA_NOME}.`,
    nickname && `Nickname: ${nickname}`,
    nome && `Nome e cognome: ${nome}`,
    email && `Email: ${email}`,
  ].filter(Boolean)
  return `https://wa.me/${WHATSAPP_TANA}?text=${encodeURIComponent(righe.join('\n'))}`
}

function Accesso({ modoIniziale = 'entra', onBenvenuto }) {
  const [modo, setModo] = useState(modoIniziale)   // entra | iscriviti | recupero
  // Iscrizione a passi: domanda → (no: WhatsApp) | (sì: email → dati)
  const [passo, setPasso] = useState('domanda')   // domanda | no | email | dati
  const [emailVerificata, setEmailVerificata] = useState(false)
  const [nonTrovata, setNonTrovata] = useState(false)
  const [nickname, setNickname] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState('')
  const [ok, setOk] = useState('')

  async function verificaEmail() {
    setErrore(''); setOk(''); setNonTrovata(false)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErrore('Scrivi un indirizzo email completo.'); return }
    setAttesa(true)
    try {
      const { data, error } = await supabase.rpc('email_tra_i_soci', { p_email: email.trim() })
      // Se il controllo non riesce non si passa: l'iscrizione è solo per i soci.
      if (error) { setErrore('Non riesco a controllare l\u2019elenco soci. Riprova fra poco.'); return }
      if (data) { setEmailVerificata(true); setPasso('dati') } else setNonTrovata(true)
    } finally { setAttesa(false) }
  }

  function vaiA(nuovo) {
    setModo(nuovo); setPasso('domanda'); setErrore(''); setOk(''); setNonTrovata(false); setEmailVerificata(false)
  }

  async function invia() {
    setErrore('')
    setOk('')

    if (modo === 'recupero') {
      if (!email) { setErrore('Scrivi l\u2019indirizzo con cui ti sei iscritto.'); return }
    } else if (!email || !password) {
      setErrore('Servono email e password.')
      return
    }
    if (modo === 'iscriviti' && !emailVerificata) {
      setErrore('L\u2019iscrizione è riservata ai soci della Tana: se non lo sei, scrivi a Dario su WhatsApp.')
      return
    }
    if (modo === 'iscriviti' && (!nickname.trim() || !nome.trim())) {
      setErrore('Scrivi nickname e nome e cognome.')
      return
    }
    if (modo === 'iscriviti' && password.length < 8) {
      setErrore('La password deve avere almeno 8 caratteri.')
      return
    }

    setAttesa(true)
    try {
      if (modo === 'recupero') {
        // Supabase manda un messaggio con un collegamento che riporta
        // qui dentro già autenticati, giusto il tempo di scegliere
        // una password nuova.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setOk('Ti ho mandato un messaggio: apri il collegamento e scegli la password nuova. Controlla anche la posta indesiderata.')
        return
      }

      if (modo === 'iscriviti') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome: nome.trim(), nickname: nickname.trim() } },
        })
        if (error) throw error
        if (data.session) return
        setOk('Account creato. Controlla la posta (anche la posta indesiderata) e conferma l\u2019indirizzo: poi entri.')
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
      <h2>
        {modo === 'entra' ? 'Entra'
          : modo === 'iscriviti' ? 'Crea il tuo account'
          : 'Password dimenticata'}
      </h2>
      <p className="sottotitolo">
        {modo === 'entra' ? 'Riprendi da dove eri rimasto.'
          : modo === 'iscriviti' ? 'Ti serve per registrare le partite e iscriverti ai tavoli.'
          : 'Scrivi il tuo indirizzo: ti mando un collegamento per sceglierne una nuova.'}
      </p>

      <Avviso tipo="errore" testo={errore} />
      <Avviso tipo="ok" testo={ok} />

      {modo === 'iscriviti' && passo === 'domanda' && (
        <>
          <p><strong>Sei socio della {TANA_NOME}?</strong></p>
          <p className="aiuto">Primo Giocatore è riservato ai soci della Tana.</p>
          <button className="bottone" onClick={() => setPasso('email')}>Sì, sono socio</button>
          <button className="bottone bottone-secondario" onClick={() => setPasso('no')}>No, non ancora</button>
        </>
      )}

      {modo === 'iscriviti' && passo === 'no' && (
        <>
          <p>Per iscriverti alla Tana scrivi su WhatsApp a Dario, l&rsquo;organizzatore. Se vuoi, lascia qui i tuoi dati: finiscono già nel messaggio.</p>
          <div className="campo">
            <label htmlFor="w-nick">Nickname (facoltativo)</label>
            <input id="w-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" />
          </div>
          <div className="campo">
            <label htmlFor="w-nome">Nome e cognome (facoltativo)</label>
            <input id="w-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
          <div className="campo">
            <label htmlFor="w-email">Email (facoltativa)</label>
            <input id="w-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <a className="bottone" href={linkWhatsApp({ nickname, nome, email })} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Scrivi su WhatsApp
          </a>
          <button className="bottone bottone-secondario" onClick={() => setPasso('email')}>In realtà sono socio</button>
        </>
      )}

      {modo === 'iscriviti' && passo === 'email' && (
        <>
          <div className="campo">
            <label htmlFor="v-email">Con quale email ti sei iscritto alla Tana?</label>
            <input id="v-email" type="email" value={email} autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setNonTrovata(false) }}
              onKeyDown={(e) => e.key === 'Enter' && verificaEmail()} />
          </div>
          {!nonTrovata ? (
            <button className="bottone" onClick={verificaEmail} disabled={attesa || !email.trim()}>
              {attesa ? 'Controllo\u2026' : 'Continua'}
            </button>
          ) : (
            <>
              <div className="avviso errore">
                Questa email non risulta fra i soci. Controlla di aver scritto quella che hai dato alla Tana.
              </div>
              <button className="bottone" onClick={verificaEmail} disabled={attesa}>Riprova</button>
              <a className="bottone bottone-secondario" href={linkWhatsApp({ email })} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Chiedi aiuto su WhatsApp
              </a>
            </>
          )}
        </>
      )}

      {modo === 'iscriviti' && passo === 'dati' && (
        <>
          <div className="campo">
            <label htmlFor="nick">Nickname</label>
            <input id="nick" value={nickname} onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname" placeholder="Come ti chiamano al tavolo" />
          </div>
          <div className="campo">
            <label htmlFor="nome">Nome e cognome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
        </>
      )}

      {(modo !== 'iscriviti' || passo === 'dati') && (
      <div className="campo">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          readOnly={modo === 'iscriviti' && emailVerificata}
        />
        {modo === 'iscriviti' && emailVerificata && <p className="aiuto">Email trovata fra i soci della Tana ✓</p>}
      </div>
      )}

      {modo !== 'recupero' && (modo !== 'iscriviti' || passo === 'dati') && (
      <div className="campo">
        <label htmlFor="password">Password</label>
        <CampoPassword
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={modo === 'entra' ? 'current-password' : 'new-password'}
          onKeyDown={(e) => e.key === 'Enter' && invia()}
        />
        {modo === 'iscriviti' && <p className="aiuto">Almeno 8 caratteri.</p>}
      </div>
      )}

      {(modo !== 'iscriviti' || passo === 'dati') && (
      <button className="bottone" onClick={invia} disabled={attesa}>
        {attesa ? 'Un attimo\u2026'
          : modo === 'entra' ? 'Entra'
          : modo === 'iscriviti' ? 'Crea account'
          : 'Mandami il collegamento'}
      </button>
      )}

      {modo === 'entra' && (
        <p className="riga-fondo">
          <button className="bottone-piatto"
            onClick={() => vaiA('recupero')}>
            Password dimenticata
          </button>
        </p>
      )}

      <p className="riga-fondo">
        {modo === 'iscriviti' ? 'Ce l\u2019hai già? ' : modo === 'recupero' ? '' : 'Non hai ancora un account? '}
        <button
          className="bottone-piatto"
          onClick={() => vaiA(modo === 'entra' ? 'iscriviti' : 'entra')}
        >
          {modo === 'entra' ? 'Iscriviti' : 'Torna all\u2019accesso'}
        </button>
      </p>

      {onBenvenuto && (
        <p className="riga-fondo">
          <button className="bottone-piatto" onClick={onBenvenuto}>Cos&rsquo;è Primo Giocatore?</button>
        </p>
      )}
    </div>
  )
}

/* ---------------- Password nuova ---------------- */

// Si arriva qui dal collegamento ricevuto per posta: Supabase apre
// una sessione valida giusto per questo, e finché non si sceglie una
// password nuova non si va da nessuna parte.
function NuovaPassword({ fatto }) {
  const [password, setPassword] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState('')

  async function salva() {
    setErrore('')
    if (password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return }
    if (password !== ripeti) { setErrore('Le due password non coincidono.'); return }

    setAttesa(true)
    const { error } = await supabase.auth.updateUser({ password })
    setAttesa(false)
    if (error) setErrore(traduciErrore(error))
    else fatto()
  }

  return (
    <div className="scheda">
      <h2>Scegli la password nuova</h2>
      <p className="sottotitolo">Da adesso entrerai con questa.</p>

      <Avviso tipo="errore" testo={errore} />

      <div className="campo">
        <label htmlFor="np1">Password nuova</label>
        <CampoPassword id="np1" value={password} autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} />
        <p className="aiuto">Almeno 8 caratteri.</p>
      </div>

      <div className="campo">
        <label htmlFor="np2">Ripetila</label>
        <CampoPassword id="np2" value={ripeti} autoComplete="new-password"
          onChange={(e) => setRipeti(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salva()} />
      </div>

      <button className="bottone" onClick={salva} disabled={attesa}>
        {attesa ? 'Salvo\u2026' : 'Salva la password'}
      </button>
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
      <h2>{daMostrare(profilo)}</h2>
      <p className="sottotitolo">
        {sessione.user.email}
        {profilo.organizzatore && <span className="distintivo">Organizzatore</span>}
        {profilo.dimostratore && <span className="distintivo verde">Dimostratore</span>}
      </p>

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

      <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>
        Esci dall'account
      </button>

      <EliminaAccount email={sessione.user.email} />
    </div>
  )
}

/* ---------------- Elimina account ---------------- */

// In fondo al profilo, chiusa finché non la apri. Per confermare si
// riscrive la propria email: un tocco distratto non basta a cancellare.
function EliminaAccount({ email }) {
  const [aperta, setAperta] = useState(false)
  const [conferma, setConferma] = useState('')
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState('')

  const giusta = conferma.trim().toLowerCase() === (email || '').toLowerCase()

  async function elimina() {
    if (!giusta || attesa) return
    setErrore('')
    setAttesa(true)
    const { error } = await supabase.rpc('elimina_mio_account')
    if (error) {
      setAttesa(false)
      setErrore('Eliminazione non riuscita: ' + traduciErrore(error))
      return
    }
    // Via anche bozze e partite in attesa salvate su questo telefono.
    try { localStorage.clear() } catch { /* niente da fare */ }
    await supabase.auth.signOut()
  }

  if (!aperta) {
    return (
      <p className="riga-fondo">
        <button className="bottone-piatto" onClick={() => setAperta(true)}>
          Elimina il mio account
        </button>
      </p>
    )
  }

  return (
    <div className="campo" style={{ marginTop: '2rem' }}>
      <h3 className="titolo-sezione">Elimina il mio account</h3>
      <p className="aiuto">
        Non si torna indietro. Spariscono il tuo account, il profilo, la collezione,
        le iscrizioni ai tavoli e le partite che hai giocato da solo o solo con i tuoi ospiti.
      </p>
      <p className="aiuto">
        Le partite in cui c&rsquo;erano altri giocatori dell&rsquo;app restano nel loro storico:
        al tuo posto comparirà &laquo;Ex giocatore&raquo;, senza il tuo nome né altri tuoi dati.
        I giochi e i luoghi che hai aggiunto restano a disposizione di tutti.
      </p>
      <Avviso tipo="errore" testo={errore} />
      <label htmlFor="conferma-elimina">Per confermare, scrivi la tua email</label>
      <input
        id="conferma-elimina"
        type="email"
        value={conferma}
        onChange={(e) => setConferma(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        placeholder={email}
      />
      <button
        className="bottone"
        style={{ marginTop: '0.75rem', background: '#8C2A20', color: '#FFFFFF' }}
        onClick={elimina}
        disabled={!giusta || attesa}
      >
        {attesa ? 'Elimino\u2026' : 'Elimina definitivamente'}
      </button>
      <button
        className="bottone bottone-secondario"
        onClick={() => { setAperta(false); setConferma(''); setErrore('') }}
        disabled={attesa}
      >
        Annulla
      </button>
    </div>
  )
}

/* ---------------- Radice ---------------- */

// Il tavolo condiviso arriva come ?t=<id>: così il link funziona
// senza bisogno di configurare percorsi sul server.
function tavoloDalLink() {
  try {
    return new URLSearchParams(window.location.search).get('t')
  } catch { return null }
}

// La scheda aperta dal segnalibro «PG da BGA» arriva come ?bga=1.
function bgaDalLink() {
  try {
    return new URLSearchParams(window.location.search).has('bga')
  } catch { return false }
}

// Con l'accesso riservato ai soci acceso, chi non risulta socio vede
// solo questo finché un organizzatore della Tana non decide.
function InAttesa({ profilo, onRicontrolla }) {
  const escluso = profilo.stato_socio === 'escluso'
  return (
    <div className="scheda">
      <h2>{escluso ? 'Accesso non disponibile' : 'Iscrizione in attesa'}</h2>
      {escluso ? (
        <p className="sottotitolo">Questo account non è stato ammesso. Se pensi sia un errore, parlane con un organizzatore della tua Tana.</p>
      ) : (
        <>
          <p className="sottotitolo">
            Primo Giocatore è riservato ai soci della Tana dei Goblin. La tua email non risulta ancora
            nell&rsquo;elenco soci: un organizzatore deve confermare l&rsquo;iscrizione.
          </p>
          <p className="aiuto">
            Se sei socio, controlla di esserti registrato con la stessa email che hai dato alla Tana,
            oppure scrivi a un organizzatore. Appena confermato, entri normalmente.
          </p>
        </>
      )}
      <button className="bottone" onClick={onRicontrolla}>Ricontrolla</button>
      <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>Esci</button>
    </div>
  )
}

/* ---------------- Indirizzi delle pagine ---------------- */

// Ogni pagina ha il suo indirizzo (/tavoli, /storico, /profilo/dati...):
// il tasto indietro del telefono torna alla pagina di prima invece di
// chiudere l'app, e un indirizzo si può salvare o riaprire.
const PAGINE = ['partita', 'tavoli', 'storico', 'statistiche', 'classifiche', 'giochi', 'giocatori', 'profilo']

function percorsoDi(scheda, partitaId, sezione) {
  if (scheda === 'partita') return partitaId ? `/partita/${partitaId}` : '/partita'
  if (scheda === 'profilo') return sezione && sezione !== 'profilo' ? `/profilo/${sezione}` : '/profilo'
  return '/' + scheda
}

function leggiPercorso() {
  try {
    const [, a, b] = window.location.pathname.split('/')
    if (!PAGINE.includes(a)) return null
    return {
      scheda: a,
      partitaId: a === 'partita' && b ? decodeURIComponent(b) : null,
      sezione: a === 'profilo' ? (b || 'profilo') : null,
    }
  } catch { return null }
}

function IconaProfilo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  )
}

function IconaEsci() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function App() {
  const [tavoloPubblico] = useState(tavoloDalLink())
  const [daBga, setDaBga] = useState(bgaDalLink())
  const [sessione, setSessione] = useState(null)
  const [profilo, setProfilo] = useState(null)
  // Accesso riservato ai soci: null = sto controllando.
  const [ammesso, setAmmesso] = useState(null)
  const [orgTana, setOrgTana] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [scheda, setScheda] = useState(() => leggiPercorso()?.scheda || 'partita')
  const [erroreProfilo, setErroreProfilo] = useState('')
  const [partitaId, setPartitaId] = useState(() => leggiPercorso()?.partitaId || null)
  const [mira, setMira] = useState(null)
  const [ritorno, setRitorno] = useState(null)
  const [ritornoStorico, setRitornoStorico] = useState(null)
  const [cambioPassword, setCambioPassword] = useState(false)
  // Senza sessione: pagina di benvenuto, oppure accesso/iscrizione.
  const [ingresso, setIngresso] = useState(() => {
    try { return localStorage.getItem(CHIAVE_GIA_ENTRATO) ? 'entra' : 'benvenuto' } catch { return 'benvenuto' }
  })
  const [sezioneProfilo, setSezioneProfilo] = useState(() => {
    const dalPercorso = leggiPercorso()?.sezione
    if (dalPercorso) return dalPercorso
    try { return localStorage.getItem(CHIAVE_SEZIONE) || 'profilo' } catch { return 'profilo' }
  })
  // Come scrivere il prossimo cambio di pagina nella cronologia del
  // browser: 'push' aggiunge un passo (il tasto indietro ci torna),
  // 'replace' sostituisce quello attuale. Il primo è sempre 'replace'.
  const modoStoria = useRef('replace')
  // Dati da allegare al prossimo passo, es. { ritornoA: '/storico' }.
  const statoProssimo = useRef(null)
  const [daApprovare, setDaApprovare] = useState(0)
  const [daBgg, setDaBgg] = useState(null)   // { fatte, daControllare }
  const [controlloBga, setControlloBga] = useState(0)   // rifà la ricerca del nome BGA

  // Partite nuove su BGG (anche quelle che BG Stats ci pubblica, comprese
  // quelle di Board Game Arena): arrivano da sole all'apertura.
  useEffect(() => {
    if (!profilo?.bgg_username) return
    sincronizzaSeServe(profilo)
      .then((r) => { if (r?.fatte) { setDaBgg(r); setControlloBga(Date.now()) } })
      .catch(() => { /* niente rete o BGG giù: si riprova alla prossima apertura */ })
  }, [profilo?.id])

  // Board Game Arena, per chi l'ha collegato con la password.
  const [avvisoBga, setAvvisoBga] = useState(null)   // { nuove } | { inSospeso } | { scaduta }
  useEffect(() => {
    if (!profilo?.bga_id || daBga) return   // non nella scheda aperta dal segnalibro
    sincronizzaBgaSeServe(profilo)
      .then((r) => { if (r) setAvvisoBga(r) })
      .catch(() => { /* niente rete o BGA giù: si riprova alla prossima apertura */ })
  }, [profilo?.id])

  function apriSezione(id) {
    setSezioneProfilo(id)
    try { localStorage.setItem(CHIAVE_SEZIONE, id) } catch { /* resta solo per ora */ }
    window.scrollTo({ top: 0 })
  }

  // Chi organizza vede quante richieste "sono io" aspettano.
  useEffect(() => {
    if (!profilo) return
    contaRichiesteDaApprovare(profilo.id).then(setDaApprovare)
  }, [profilo?.id, scheda])

  // Una volta entrato su questo telefono, la prossima volta si parte dall'accesso.
  useEffect(() => {
    if (!sessione) return
    try { localStorage.setItem(CHIAVE_GIA_ENTRATO, '1') } catch { /* niente */ }
    setIngresso('entra')
  }, [sessione])

  useEffect(() => {
    if (!configurato) { setPronto(true); return }

    supabase.auth.getSession().then(({ data }) => {
      setSessione(data.session)
      setPronto(true)
    })

    const { data: iscrizione } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessione(s)
      if (!s) setProfilo(null)
      // Rientro dal collegamento di recupero: prima la password nuova.
      if (evento === 'PASSWORD_RECOVERY') setCambioPassword(true)
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
        else if (data) {
          // Il nickname scelto all'iscrizione arriva con l'account: al
          // primo accesso finisce nel profilo, se non ce n'è già uno.
          const nick = sessione.user.user_metadata?.nickname?.trim()
          if (nick && !data.nickname) {
            setProfilo({ ...data, nickname: nick })
            supabase.from('profili').update({ nickname: nick }).eq('id', data.id).then(() => {})
          } else setProfilo(data)
        }
        else setErroreProfilo('Il profilo non è stato creato: controlla il trigger su auth.users.')
      })
    return () => { vivo = false }
  }, [sessione])

  // Socio, eccezione o organizzatore? Senza lo script SQL dei soci
  // (funzione mancante) si entra come sempre.
  function controllaAccesso() {
    if (!profilo?.id) return
    supabase.rpc('ammesso').then(({ data, error }) => setAmmesso(error ? true : data !== false))
    supabase.from('organizzatori_tana').select('tana_id').eq('utente_id', profilo.id).limit(1)
      .then(({ data }) => setOrgTana(Boolean(data?.length)))
  }
  useEffect(() => { setAmmesso(null); controllaAccesso() }, [profilo?.id])

  // La pagina aperta finisce nell'indirizzo e nella cronologia.
  const inApp = !!(sessione && profilo && !tavoloPubblico && !daBga)
  useEffect(() => {
    if (!inApp) return
    const percorso = percorsoDi(scheda, partitaId, sezioneProfilo)
    const modo = modoStoria.current
    modoStoria.current = 'push'
    const stato = { pg: true, ...(statoProssimo.current || {}) }
    statoProssimo.current = null
    if (percorso === window.location.pathname) return
    try {
      if (modo === 'replace') window.history.replaceState(stato, '', percorso)
      else window.history.pushState(stato, '', percorso)
    } catch { /* niente: si resta sulla pagina senza cronologia */ }
  }, [inApp, scheda, partitaId, sezioneProfilo])

  // Tasto indietro (o avanti) del telefono: si apre la pagina dell'indirizzo.
  useEffect(() => {
    function suCambioIndirizzo() {
      const r = leggiPercorso()
      if (!r) return
      setScheda(r.scheda)
      setPartitaId(r.partitaId)
      if (r.sezione) setSezioneProfilo(r.sezione)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', suCambioIndirizzo)
    return () => window.removeEventListener('popstate', suCambioIndirizzo)
  }, [])

  // Apre una partita da modificare ricordando da dove si arriva, così
  // a fine modifica si torna indietro di un passo invece di aggiungerne.
  function apriPartita(id) {
    statoProssimo.current = { ritornoA: window.location.pathname }
    setPartitaId(id)
    setScheda('partita')
  }

  function vaiAlProfilo() {
    setRitornoStorico(null)
    setScheda('profilo')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="guscio">
      <header className="testata">
        <Marchio />
        <div className="tasti-testata">
          <Condividi />
          {inApp && (
            <button type="button" className={'tasto-condividi' + (scheda === 'profilo' ? ' attivo' : '')}
              aria-label="Profilo" title="Profilo" aria-current={scheda === 'profilo' ? 'page' : undefined}
              onClick={vaiAlProfilo}>
              <IconaProfilo />
            </button>
          )}
          {sessione && !tavoloPubblico && (
            <button type="button" className="tasto-condividi" aria-label="Esci dall'account" title="Esci dall'account"
              onClick={() => { if (window.confirm('Vuoi uscire dall\u2019account?')) supabase.auth.signOut() }}>
              <IconaEsci />
            </button>
          )}
        </div>
      </header>

      {tavoloPubblico ? (
        <>
          <TavoloPubblico tavoloId={tavoloPubblico} sessione={sessione} profilo={profilo} />
          <div className="scheda">
            <p className="aiuto">
              Questo è un tavolo di Primo Giocatore.{' '}
              <a className="bottone-piatto" href={window.location.origin}>Apri l&rsquo;app</a>
            </p>
          </div>
        </>
      ) : !configurato ? (
        <div className="scheda">
          <h2>Manca il collegamento al database</h2>
          <p className="sottotitolo">
            Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY fra le variabili
            d&rsquo;ambiente del progetto su Vercel, poi rilancia la build.
          </p>
        </div>
      ) : !pronto ? (
        <div className="scheda"><p>Un attimo&hellip;</p></div>
      ) : cambioPassword ? (
        <NuovaPassword fatto={() => setCambioPassword(false)} />
      ) : !sessione ? (
        ingresso === 'benvenuto' ? (
          <Benvenuto
            onIscriviti={() => setIngresso('iscriviti')}
            onEntra={() => setIngresso('entra')}
            linkNonSocio={linkWhatsApp({})}
          />
        ) : (
          <Accesso key={ingresso} modoIniziale={ingresso} onBenvenuto={() => setIngresso('benvenuto')} />
        )
      ) : !profilo ? (
        <div className="scheda">
          {erroreProfilo ? <Avviso tipo="errore" testo={erroreProfilo} /> : <p>Carico il profilo&hellip;</p>}
        </div>
      ) : ammesso === false ? (   // mentre controlla si entra: i dati li protegge il database
        <InAttesa profilo={profilo} onRicontrolla={controllaAccesso} />
      ) : daBga ? (
        <ImportaBga profilo={profilo} daLink onChiudi={() => {
          try { window.history.replaceState(null, '', window.location.pathname) } catch { /* niente */ }
          setDaBga(false)
        }} />
      ) : (
        <>
          <nav className="barra-basso">
            {[
              ['partita', 'Partita'],
              ['tavoli', 'Tavoli'],
              ['storico', 'Storico'],
              ['statistiche', 'Statistiche'],
              ['giochi', 'Giochi'],
              ['giocatori', 'Giocatori'],
            ].map(([id, etichetta]) => (
              <button
                key={id}
                className={scheda === id || (id === 'statistiche' && scheda === 'classifiche') ? 'attiva' : ''}
                onClick={() => {
                  if (id === 'partita') setPartitaId(null)
                  // Dal menu in basso si riparte da capo: il ritorno alla
                  // partita aperta vale solo subito dopo una modifica.
                  setRitornoStorico(null)
                  setScheda(id)
                }}
                aria-current={scheda === id ? 'page' : undefined}
              >
                <Icona nome={id} />
                <span>{etichetta}</span>
              </button>
            ))}
          </nav>

          {daBgg && (
            <div className="scheda scheda-sottile">
              <p className="aiuto" style={{ margin: 0 }}>
                {daBgg.fatte > 0 && `Da BGG: ${daBgg.fatte} ${daBgg.fatte === 1 ? 'partita nuova' : 'partite nuove'}. `}
                {daBgg.daControllare > 0 && `${daBgg.daControllare} sembrano già presenti: guardale in Dati e import. `}
                <button className="bottone-piatto" onClick={() => setDaBgg(null)}>ok</button>
              </p>
            </div>
          )}

          {avvisoBga && (
            <div className="scheda scheda-sottile">
              <p className="aiuto" style={{ margin: 0 }}>
                {avvisoBga.nuove > 0 && `Da BGA: ${avvisoBga.nuove} ${avvisoBga.nuove === 1 ? 'partita nuova' : 'partite nuove'}. `}
                {avvisoBga.inSospeso > 0 && `Da BGA: ${avvisoBga.inSospeso} partite aspettano una tua scelta (giochi da riconoscere o partite da confermare); le altre sono già entrate. Per vederle: Dati e import → Board Game Arena → Rileggi tutto lo storico. `}
                {avvisoBga.scaduta && 'La sessione BGA è scaduta: ricollegala in Dati e import → Board Game Arena. '}
                <button className="bottone-piatto" onClick={() => setAvvisoBga(null)}>ok</button>
              </p>
            </div>
          )}

          <NomeBga profilo={profilo} quando={controlloBga} />

          {scheda !== 'profilo' && daApprovare > 0 && (
            <div className="scheda scheda-sottile">
              <p className="aiuto" style={{ margin: 0 }}>
                {daApprovare === 1
                  ? 'C\u2019è una richiesta «sono io» da guardare.'
                  : `Ci sono ${daApprovare} richieste «sono io» da guardare.`}{' '}
                <button className="bottone-piatto"
                  onClick={() => { apriSezione('ospiti'); setScheda('profilo') }}>Guarda</button>
              </p>
            </div>
          )}

          {scheda === 'partita' ? (
            <Partita
              key={partitaId || 'nuova'}
              profilo={profilo}
              partitaId={partitaId}
              finitaModifica={() => {
                // Si torna da dove si era arrivati, com'era.
                const eraModifica = !!partitaId
                let meta
                if (ritorno) {
                  setMira({ ...ritorno, quando: Date.now() })
                  setRitorno(null)
                  meta = 'statistiche'
                } else {
                  if (ritornoStorico) {
                    setRitornoStorico({ ...ritornoStorico, quando: Date.now() })
                  }
                  meta = 'storico'
                }
                // Arrivati da quella pagina: un passo indietro, così la
                // modifica non resta nella cronologia.
                if (eraModifica && window.history.state?.ritornoA === '/' + meta) {
                  window.history.back()
                  return
                }
                if (eraModifica) modoStoria.current = 'replace'
                setPartitaId(null)
                setScheda(meta)
              }}
            />
          ) : scheda === 'tavoli' ? (
            <Tavoli
              profilo={profilo}
              onRegistraPartita={apriPartita}
            />
          ) : scheda === 'storico' ? (
            <Storico
              profilo={profilo}
              ripristina={ritornoStorico}
              onModifica={(id, posizione) => {
                setRitorno(null)
                setRitornoStorico(posizione || null)
                apriPartita(id)
              }}
              onApri={(tipo, id) => {
                setMira({ tipo, id, quando: Date.now() })
                setScheda('statistiche')
              }}
            />
          ) : scheda === 'statistiche' ? (
            <Statistiche
              profilo={profilo}
              mira={mira}
              onClassifiche={() => { statoProssimo.current = { ritornoA: '/statistiche' }; setScheda('classifiche') }}
              onModifica={(id, dove) => {
                setRitorno(dove || null)
                apriPartita(id)
              }}
            />
          ) : scheda === 'classifiche' ? (
            <Classifiche profilo={profilo} onIndietro={() => {
              if (window.history.state?.ritornoA === '/statistiche') window.history.back()
              else setScheda('statistiche')
            }} />
          ) : scheda === 'giochi' ? (
            <Giochi profilo={profilo} />
          ) : scheda === 'giocatori' ? (
            <Giocatori
              profilo={profilo}
              onStatistiche={(id) => {
                setMira({ tipo: 'persona', id, quando: Date.now() })
                setScheda('statistiche')
              }}
            />
          ) : (
            (() => {
              const sezioni = SEZIONI_PROFILO.filter(([id, , soloOrg]) => !soloOrg || profilo.organizzatore || (id === 'soci' && orgTana))
              const attiva = sezioni.some(([id]) => id === sezioneProfilo) ? sezioneProfilo : 'profilo'
              return (
                <>
                  <div className="menu-profilo">
                    <MenuScorrevole etichetta="Sezioni del profilo" attiva={attiva} onScegli={apriSezione}
                      voci={sezioni.map(([id, testo]) => [id, testo, id === 'ospiti' && daApprovare > 0])} />
                  </div>

                  {attiva === 'profilo' ? (
                    <>
                      <Profilo sessione={sessione} profilo={profilo} setProfilo={setProfilo} />
                      <SeiTu profilo={profilo} />
                    </>
                  ) : attiva === 'dati' ? (
                    <Dati profilo={profilo} />
                  ) : attiva === 'ospiti' ? (
                    <UnisciOspiti profilo={profilo} onRichieste={() => contaRichiesteDaApprovare(profilo.id).then(setDaApprovare)} />
                  ) : attiva === 'luoghi' ? (
                    <Luoghi profilo={profilo} />
                  ) : attiva === 'giochi' ? (
                    <GiochiDoppi profilo={profilo} />
                  ) : attiva === 'soci' ? (
                    <Soci profilo={profilo} />
                  ) : (
                    <Organizzatori profilo={profilo} />
                  )}
                </>
              )
            })()
          )}

          {scheda !== 'profilo' && !profilo.organizzatore && profilo.creato_il
            && Date.now() - new Date(profilo.creato_il) < GIORNI_SEI_TU * 86400000 && (
            <SeiTu profilo={profilo} compatto />
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
