// Primo Giocatore - l'app di chi partecipa solo a un evento
// v1.2.0 - 202611182000 (chi organizza l'evento lo gestisce da qui: link, QR, persone)
//
// Chi non è socio della Tana entra con il link di un evento e vede solo
// i suoi eventi. Per l'evento scelto: i tavoli (iscriversi, pubblicarne),
// la registrazione delle partite e le sue partite. A evento concluso
// tavoli e partite restano da consultare; registrare non si può più.
// La classifica dell'evento arriva con la fase 5.

import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'
import { mieiEventi, statoEvento, eventoAperto, dateEvento } from './evento'
import BarraScorrevole from './BarraScorrevole.jsx'

const Tavoli = lazy(() => import('./Tavoli.jsx'))
const Partita = lazy(() => import('./Partita.jsx'))
const GestioneEventi = lazy(() => import('./GestioneEventi.jsx'))

const RUOLI = { organizzatore: 'organizzi', dimostratore: 'spieghi i giochi', partecipante: 'partecipi' }
const STATI = { in_arrivo: 'In arrivo', in_corso: 'In corso', concluso: 'Concluso' }
const ORDINE = { in_corso: 0, in_arrivo: 1, concluso: 2 }

const quando = (d) => new Date(d).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Le partite dell'evento che vedo: le mie e quelle in cui gioco.
function PartiteEvento({ evento, profilo, onApri }) {
  const [partite, setPartite] = useState(null)
  const [errore, setErrore] = useState('')
  useEffect(() => {
    supabase.from('partite')
      .select('id, giocata_il, registrata_da, giochi ( nome ), partecipazioni ( utente_id, vincitore, posizione, punteggio_totale )')
      .eq('evento_id', evento.id).order('giocata_il', { ascending: false })
      .then(({ data, error }) => { if (error) setErrore(error.message); else setPartite(data || []) })
  }, [evento.id])

  if (errore) return <div className="avviso errore">{errore}</div>
  if (!partite) return <p>Un attimo&hellip;</p>
  if (partite.length === 0) return <p className="sottotitolo">Nessuna partita registrata in questo evento.</p>
  return (
    <ul className="elenco">
      {partite.map((p) => {
        const io = (p.partecipazioni || []).find((x) => x.utente_id === profilo.id)
        const mia = p.registrata_da === profilo.id
        return (
          <li key={p.id}>
            <div className="nome-giocatore">
              <strong>{p.giochi?.nome || 'Partita'}</strong>
              <span className="anno block">
                {quando(p.giocata_il)} · {(p.partecipazioni || []).length} giocatori
                {io ? (io.vincitore ? ' · hai vinto' : io.posizione ? ` · ${io.posizione}°` : '') : ''}
              </span>
            </div>
            {mia && eventoAperto(evento) && (
              <button className="tasto-piccolo" onClick={() => onApri(p.id)}>Modifica</button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function EventoPartecipante({ profilo, avviso }) {
  const [eventi, setEventi] = useState(null)
  const [errore, setErrore] = useState('')
  const [sceltoId, setSceltoId] = useState(null)
  const [scheda, setScheda] = useState('tavoli')   // tavoli | partita | partite
  const [partitaId, setPartitaId] = useState(null)

  useEffect(() => {
    mieiEventi(profilo.id).then((lista) => {
      // Prima quelli in corso, poi in arrivo, poi i conclusi più recenti.
      const ordinati = [...lista].sort((a, b) => ORDINE[statoEvento(a)] - ORDINE[statoEvento(b)])
      setEventi(ordinati)
      setSceltoId((x) => x || ordinati[0]?.id || null)
    }, (e) => setErrore(e.message))
  }, [profilo.id])

  const evento = eventi?.find((e) => e.id === sceltoId) || null
  const aperto = evento && eventoAperto(evento)

  function apriPartita(id) {
    setPartitaId(id)
    setScheda('partita')
    window.scrollTo({ top: 0 })
  }

  if (errore) return <div className="scheda"><div className="avviso errore">{errore}</div></div>
  if (!eventi) return <div className="scheda"><p>Un attimo&hellip;</p></div>

  if (!evento) {
    return (
      <div className="scheda">
        <h2>Ciao {daMostrare(profilo)}</h2>
        {avviso && <div className="avviso ok">{avviso}</div>}
        <p className="sottotitolo">
          Non partecipi a nessun evento. Per entrare apri il link o inquadra il QR che ti ha dato chi organizza.
        </p>
        <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>Esci</button>
      </div>
    )
  }

  const st = statoEvento(evento)
  const schede = [['tavoli', 'Tavoli'], ...(aperto ? [['partita', partitaId ? 'Modifica partita' : 'Registra partita']] : []), ['partite', 'Le mie partite'],
    ...(evento.ruolo === 'organizzatore' ? [['gestisci', 'Gestisci']] : [])]

  return (
    <>
      <div className="scheda evento-testa">
        {avviso && <div className="avviso ok">{avviso}</div>}
        <p className="evento-occhiello">Evento · {RUOLI[evento.ruolo] || evento.ruolo}</p>
        <div className="evento-riga senza-bordo">
          <div>
            <h2>{evento.nome || 'Evento'}</h2>
            <span className="anno block">{dateEvento(evento)}{evento.luogo_nome ? ` · ${evento.luogo_nome}` : ''}</span>
          </div>
          <span className={'evento-stato' + (st !== 'concluso' ? ' aperto' : '')}>{STATI[st]}</span>
        </div>
        {eventi.length > 1 && (
          <div className="campo">
            <label htmlFor="ev-scelto">Altri eventi</label>
            <select id="ev-scelto" value={evento.id}
              onChange={(e) => { setSceltoId(e.target.value); setScheda('tavoli'); setPartitaId(null) }}>
              {eventi.map((e) => <option key={e.id} value={e.id}>{e.nome} · {dateEvento(e)}</option>)}
            </select>
          </div>
        )}
        {!aperto && <p className="aiuto">L&rsquo;evento è concluso: tavoli e partite restano da consultare, ma non si possono più cambiare.</p>}
        <BarraScorrevole><div className="sottoschede">
          {schede.map(([id, etichetta]) => (
            <button key={id} className={scheda === id ? 'attiva' : ''} onClick={() => { setScheda(id); if (id !== 'partita') setPartitaId(null) }}>
              {etichetta}
            </button>
          ))}
        </div></BarraScorrevole>
      </div>

      <Suspense fallback={<div className="scheda"><p>Un attimo&hellip;</p></div>}>
        {scheda === 'tavoli' && (
          <Tavoli key={evento.id} profilo={profilo} evento={evento} soloEvento onRegistraPartita={apriPartita} />
        )}
        {scheda === 'partita' && aperto && (
          <Partita key={`${evento.id}-${partitaId || 'nuova'}`} profilo={profilo} evento={evento} soloEvento
            partitaId={partitaId} finitaModifica={() => { setPartitaId(null); setScheda('partite') }} />
        )}
        {scheda === 'gestisci' && evento.ruolo === 'organizzatore' && (
          <GestioneEventi profilo={profilo} soloEventoId={evento.id} />
        )}
        {scheda === 'partite' && (
          <div className="scheda">
            <h2>Le mie partite</h2>
            <PartiteEvento evento={evento} profilo={profilo} onApri={apriPartita} />
          </div>
        )}
      </Suspense>

      <div className="scheda">
        <p className="aiuto">La classifica dell&rsquo;evento arriva a breve.</p>
        <button className="bottone bottone-secondario" onClick={() => supabase.auth.signOut()}>Esci</button>
      </div>
    </>
  )
}
