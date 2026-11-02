// Primo Giocatore - pagina pubblica del tavolo
// v4.10.0 - 202611030300 (tavolo e iscritti da tavolo_pubblico: senza account si vede solo il tavolo del link)
//
// Si apre con il link condiviso, anche senza account.
// Mostra il tavolo e permette di iscriversi lasciando i contatti,
// che restano visibili solo a chi organizza.

import { nomeLuogo } from './luoghiNome'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { copertinaTavolo } from './immagini'
import { linkMappa } from './indirizzo'

const quando = (d) =>
  new Date(d).toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })

export default function TavoloPubblico({ tavoloId, sessione, profilo }) {
  const [tavolo, setTavolo] = useState(null)
  const [posizione, setPosizione] = useState(null)   // dal database: esatta solo se puoi vederla
  const [iscritti, setIscritti] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState(false)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [disposto, setDisposto] = useState(false)   // tavolo libero: disposto a spiegare
  const [consenso, setConsenso] = useState(false)
  const [invio, setInvio] = useState(false)

  useEffect(() => { carica() }, [tavoloId])

  useEffect(() => {
    if (profilo) {
      setNome((n) => n || profilo.nickname || profilo.nome || '')
      setEmail((e) => e || sessione?.user?.email || '')
    }
  }, [profilo, sessione])

  async function carica() {
    setCaricamento(true)
    // Tavolo, gioco, luogo e iscritti in una chiamata sola: funziona anche
    // senza account (serve lo script ultimi_ritocchi.sql).
    const { data: pagina, error } = await supabase.rpc('tavolo_pubblico', { p_tavolo: tavoloId })
    const data = pagina?.tavolo || null

    if (error) setErrore(/tavolo_pubblico/.test(error.message) ? 'Manca lo script ultimi_ritocchi.sql nel database.' : error.message)
    else if (!data) setErrore('Questo tavolo non esiste, oppure non è più pubblicato.')
    else {
      setTavolo(data)
      const { data: po } = await supabase.rpc('posizioni_tavoli', { p_tavolo: String(tavoloId) })
      setPosizione(Array.isArray(po) && po[0] ? po[0] : null)
      setIscritti(pagina.iscritti || [])
    }
    setCaricamento(false)
  }

  const confermati = iscritti.filter((i) => i.stato === 'confermato')
  // Senza gioco è il tavolo libero: più dimostratori, e chi si iscrive
  // può offrirsi di spiegare.
  const libero = tavolo && !tavolo.giochi
  const chiSpiega = confermati.filter((i) => i.ruolo === 'dimostratore')
  const inAttesa = iscritti.filter((i) => i.stato === 'attesa')
  const pieno = tavolo?.posti_max ? confermati.length >= tavolo.posti_max : false
  const chiuse =
    tavolo?.stato !== 'aperto' ||
    (tavolo?.chiusura_iscrizioni && new Date(tavolo.chiusura_iscrizioni) < new Date())

  const nomeIscritto = (i) =>
    i.profili ? (i.profili.nickname || i.profili.nome) : i.nome_visibile || 'Iscritto'

  const giaIscritto = sessione
    ? iscritti.some((i) => i.utente_id === sessione.user.id)
    : false
  // Su approvazione: chi si iscrive aspetta che chi organizza lo accetti.
  const approvazione = !!tavolo?.su_approvazione
  const inAttesaDiOk = approvazione && sessione
    && iscritti.some((i) => i.utente_id === sessione.user.id && i.stato === 'attesa')

  async function iscrivi() {
    setErrore('')
    if (!nome.trim()) { setErrore('Serve il nome.'); return }
    if (!email.trim() && !telefono.trim()) {
      setErrore('Lascia almeno un contatto: email o telefono.')
      return
    }
    if (!consenso) { setErrore('Serve il consenso per trasmettere i contatti.'); return }

    setInvio(true)
    try {
      // Iscrizione e contatti insieme, in un passaggio solo: lo stato
      // (confermato o in attesa) lo decide il database.
      const { data: stato, error } = await supabase.rpc('iscriviti_tavolo', {
        p_tavolo: tavoloId,
        p_nome: nome.trim(),
        p_email: email.trim() || null,
        p_telefono: telefono.trim() || null,
        p_disposto: Boolean(libero && disposto),
      })
      if (error) {
        throw new Error(/iscriviti_tavolo/.test(error.message)
          ? 'Manca lo script tavoli_bgg_verifica.sql nel database.' : error.message)
      }
      setFatto(stato || 'attesa')
      carica()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  if (caricamento) return <div className="scheda"><p>Carico il tavolo&hellip;</p></div>
  if (!tavolo) return <div className="scheda"><div className="avviso errore">{errore}</div></div>

  return (
    <div className="scheda">
      {copertinaTavolo(tavolo, true) && (
        <img
          src={copertinaTavolo(tavolo, true)}
          alt=""
          className={`copertina-grande${tavolo.giochi ? '' : ' copertina-generica'}`}
        />
      )}

      <h2>{tavolo.titolo || tavolo.giochi?.nome || 'Tavolo'}</h2>
      {tavolo.titolo && tavolo.giochi?.nome && (
        <p className="sottotitolo">{tavolo.giochi.nome}</p>
      )}

      <ul className="elenco elenco-dati">
        <li><span className="etichetta-dato">Quando</span><strong>{quando(tavolo.inizio)}</strong></li>
        {tavolo.luoghi && (
          <li>
            <span className="etichetta-dato">Dove</span>
            <strong>
              {nomeLuogo(tavolo.luoghi, profilo?.id)}
              {tavolo.luoghi.piattaforma ? ` · ${tavolo.luoghi.piattaforma}` : ''}
            </strong>
            {posizione?.esatta ? (
              <span className="anno block">
                {posizione.indirizzo || posizione.zona || ''}{' '}
                <a className="bottone-piatto" href={linkMappa(posizione.lat, posizione.lon)}
                  target="_blank" rel="noopener noreferrer">Apri nella mappa</a>
              </span>
            ) : posizione ? (
              <span className="anno block">
                {posizione.zona ? `Zona: ${posizione.zona}. ` : ''}
                L&rsquo;indirizzo lo vedi quando la tua iscrizione è confermata.
              </span>
            ) : null}
          </li>
        )}
        <li>
          <span className="etichetta-dato">Posti</span>
          <strong>
            {confermati.length}
            {tavolo.posti_max ? ` di ${tavolo.posti_max}` : ''}
            {pieno ? ' · al completo' : ''}
          </strong>
        </li>
        {approvazione && (
          <li><span className="etichetta-dato">Iscrizioni</span><strong>su approvazione di chi organizza</strong></li>
        )}
        {tavolo.giochi?.durata_minuti && (
          <li><span className="etichetta-dato">Durata</span><strong>circa {tavolo.giochi.durata_minuti} min</strong></li>
        )}
      </ul>

      {libero ? (chiSpiega.length > 0 && (
        <div className="dimostratore">
          <span className="foto-dimostratore vuota" aria-hidden="true">?</span>
          <div className="dimostratore-nome">
            <span className="etichetta-dato">{chiSpiega.length === 1 ? 'Spiega i giochi' : 'Spiegano i giochi'}</span>
            <strong>{chiSpiega.map(nomeIscritto).join(', ')}</strong>
          </div>
        </div>
      )) : tavolo.dimostratore_nome && (
        <div className="dimostratore">
          {tavolo.dimostratore_foto
            ? <img src={tavolo.dimostratore_foto} alt="" className="foto-dimostratore" />
            : <span className="foto-dimostratore vuota" aria-hidden="true">?</span>}
          <div className="dimostratore-nome">
            <span className="etichetta-dato">Spiega il gioco</span>
            <strong>{tavolo.dimostratore_nome}</strong>
          </div>
        </div>
      )}

      {tavolo.descrizione && <p className="descrizione-tavolo">{tavolo.descrizione}</p>}

      <h3 className="titolo-sezione">
        Chi c'è <span className="conteggio">{confermati.length}</span>
      </h3>
      {confermati.length === 0 ? (
        <p className="aiuto">Nessuno ancora. Puoi essere il primo.</p>
      ) : (
        <ul className="elenco">
          {confermati.map((i) => (
            <li key={i.id}>
              <strong>{nomeIscritto(i)}</strong>
              {i.ruolo === 'dimostratore' && <span className="distintivo">Spiega</span>}
              {i.ruolo !== 'dimostratore' && i.disposto_a_dimostrare && (
                <span className="distintivo verde">Può spiegare</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {inAttesa.length > 0 && (
        <>
          <h3 className="titolo-sezione">In lista d'attesa</h3>
          <ul className="elenco">
            {inAttesa.map((i) => (
              <li key={i.id}><span className="anno">{nomeIscritto(i)}</span></li>
            ))}
          </ul>
        </>
      )}

      {fatto ? (
        <div className="avviso ok">
          {fatto === 'gia'
            ? 'Risulti già iscritto a questo tavolo.'
            : fatto === 'confermato'
              ? 'Iscrizione registrata. Ci vediamo al tavolo.'
              : !sessione
                ? 'Richiesta inviata: chi organizza ti confermerà, usando i contatti che hai lasciato.'
                : approvazione
                  ? 'Richiesta inviata: chi organizza deve accettarti. Lo vedi nell\u2019app, in Tavoli.'
                  : 'Iscrizione registrata in lista d\u2019attesa: se si libera un posto, chi organizza ti conferma.'}
        </div>
      ) : chiuse ? (
        <div className="avviso errore">Le iscrizioni a questo tavolo sono chiuse.</div>
      ) : giaIscritto ? (
        <div className="avviso ok">
          {inAttesaDiOk ? 'Hai chiesto di partecipare: aspetta che chi organizza ti accetti.' : 'Sei già iscritto a questo tavolo.'}
        </div>
      ) : (
        <>
          <h3 className="titolo-sezione">
            {approvazione || !sessione ? 'Chiedi di partecipare' : pieno ? 'Mettiti in lista d\u2019attesa' : 'Iscriviti'}
          </h3>
          {approvazione && <p className="aiuto">A questo tavolo chi organizza sceglie chi accettare.</p>}
          {!approvazione && !sessione && (
            <p className="aiuto">Senza account la tua iscrizione resta in attesa finché chi organizza non la conferma.</p>
          )}

          {errore && <div className="avviso errore">{errore}</div>}

          {libero && (
            <div className="campo">
              <label>Come partecipi</label>
              <div className="scelte-disponibilita">
                <button type="button" className={`pastiglia-stato si${!disposto ? ' scelto' : ''}`}
                  aria-pressed={!disposto} onClick={() => setDisposto(false)}>
                  Mi godo la serata
                </button>
                <button type="button" className={`pastiglia-stato forse${disposto ? ' scelto' : ''}`}
                  aria-pressed={disposto} onClick={() => setDisposto(true)}>
                  Posso spiegare un gioco
                </button>
              </div>
            </div>
          )}

          <div className="campo">
            <label htmlFor="i-nome">Nome</label>
            <input id="i-nome" value={nome} onChange={(e) => setNome(e.target.value)}
              autoComplete="name" placeholder="Come ti chiamano al tavolo" />
          </div>

          <div className="campo">
            <label htmlFor="i-email">Email</label>
            <input id="i-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" />
          </div>

          <div className="campo">
            <label htmlFor="i-tel">Telefono</label>
            <input id="i-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
              autoComplete="tel" />
          </div>

          <label className="consenso">
            <input type="checkbox" checked={consenso} onChange={(e) => setConsenso(e.target.checked)} />
            <span>
              Acconsento a trasmettere email e telefono a chi organizza questo tavolo, che
              potrà usarli solo per contattarmi su questa serata. Restano invisibili agli
              altri iscritti.
            </span>
          </label>

          <button className="bottone" onClick={iscrivi} disabled={invio}>
            {invio ? 'Invio…' : approvazione || !sessione ? 'Chiedi di partecipare' : pieno ? 'Mettimi in attesa' : 'Iscrivimi'}
          </button>

          {!sessione && (
            <p className="aiuto">
              Non serve un account. Se ne crei uno, però, ritrovi le tue partite e le
              tue statistiche.
            </p>
          )}
        </>
      )}
    </div>
  )
}
