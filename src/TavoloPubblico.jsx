// Primo Giocatore - pagina pubblica del tavolo
// v2.0.0 - 202609170900
//
// Si apre con il link condiviso, anche senza account.
// Mostra il tavolo e permette di iscriversi lasciando i contatti,
// che restano visibili solo a chi organizza.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const quando = (d) =>
  new Date(d).toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })

export default function TavoloPubblico({ tavoloId, sessione, profilo }) {
  const [tavolo, setTavolo] = useState(null)
  const [iscritti, setIscritti] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState(false)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
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
    const { data, error } = await supabase
      .from('tavoli')
      .select(`
        id, titolo, descrizione, inizio, posti_min, posti_max, stato, pubblicato,
        dimostratore_nome, dimostratore_foto, chiusura_iscrizioni, note,
        giochi ( nome, immagine_url, min_giocatori, max_giocatori, durata_minuti ),
        luoghi ( nome, tipo, indirizzo, piattaforma )
      `)
      .eq('id', tavoloId)
      .maybeSingle()

    if (error) setErrore(error.message)
    else if (!data) setErrore('Questo tavolo non esiste, oppure non è più pubblicato.')
    else {
      setTavolo(data)
      const { data: is } = await supabase
        .from('iscrizioni_tavolo')
        .select('id, stato, nome_visibile, utente_id, profili:utente_id ( nome, nickname )')
        .eq('tavolo_id', tavoloId)
        .neq('stato', 'annullato')
        .order('creata_il')
      setIscritti(is || [])
    }
    setCaricamento(false)
  }

  const confermati = iscritti.filter((i) => i.stato === 'confermato')
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
      const { data: iscrizione, error } = await supabase
        .from('iscrizioni_tavolo')
        .insert({
          tavolo_id: tavoloId,
          utente_id: sessione?.user?.id || null,
          nome_visibile: nome.trim(),
          stato: pieno ? 'attesa' : 'confermato',
        })
        .select('id').single()
      if (error) throw error

      const { error: e2 } = await supabase.from('iscrizioni_contatti').insert({
        iscrizione_id: iscrizione.id,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
      })
      if (e2) throw e2

      setFatto(true)
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
      {tavolo.giochi?.immagine_url && (
        <img src={tavolo.giochi.immagine_url} alt="" className="copertina-grande" />
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
              {tavolo.luoghi.nome}
              {tavolo.luoghi.piattaforma ? ` · ${tavolo.luoghi.piattaforma}` : ''}
            </strong>
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
        {tavolo.giochi?.durata_minuti && (
          <li><span className="etichetta-dato">Durata</span><strong>circa {tavolo.giochi.durata_minuti} min</strong></li>
        )}
      </ul>

      {tavolo.dimostratore_nome && (
        <div className="dimostratore">
          {tavolo.dimostratore_foto
            ? <img src={tavolo.dimostratore_foto} alt="" className="foto-dimostratore" />
            : <span className="foto-dimostratore vuota" aria-hidden="true">?</span>}
          <div>
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
            <li key={i.id}><strong>{nomeIscritto(i)}</strong></li>
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
          Iscrizione registrata{pieno ? ' in lista d\u2019attesa' : ''}. Ci vediamo al tavolo.
        </div>
      ) : chiuse ? (
        <div className="avviso errore">Le iscrizioni a questo tavolo sono chiuse.</div>
      ) : giaIscritto ? (
        <div className="avviso ok">Sei già iscritto a questo tavolo.</div>
      ) : (
        <>
          <h3 className="titolo-sezione">{pieno ? 'Mettiti in lista d\u2019attesa' : 'Iscriviti'}</h3>

          {errore && <div className="avviso errore">{errore}</div>}

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
            {invio ? 'Ti iscrivo…' : pieno ? 'Mettimi in attesa' : 'Iscrivimi'}
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
