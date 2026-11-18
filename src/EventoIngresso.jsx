// Primo Giocatore - pagina di un evento aperta dal link o dal QR
// v1.0.0 - 202611181700
//
// La vede chi arriva con ?e=CODICE senza essere entrato: nome e date
// dell'evento e i due tasti. Creato l'account (o fatto l'accesso), l'app
// lo fa entrare nell'evento da sola.

import { useEffect, useState } from 'react'
import { leggiEventoDaCodice, dateEvento, dimenticaCodiceEvento } from './evento'

export default function EventoIngresso({ codice, onIscriviti, onEntra, onLascia }) {
  const [stato, setStato] = useState({ caricato: false, evento: null, errore: '' })

  useEffect(() => {
    let vivo = true
    leggiEventoDaCodice(codice).then(
      (evento) => { if (vivo) setStato({ caricato: true, evento, errore: '' }) },
      () => { if (vivo) setStato({ caricato: true, evento: null, errore: 'Non riesco a leggere l’evento. Controlla la rete e riprova.' }) },
    )
    return () => { vivo = false }
  }, [codice])

  function lascia() {
    dimenticaCodiceEvento()
    onLascia()
  }

  if (!stato.caricato) return <div className="scheda"><p>Un attimo&hellip;</p></div>

  const ev = stato.evento
  if (!ev) {
    return (
      <div className="scheda">
        <h2>Evento non trovato</h2>
        <p className="sottotitolo">
          {stato.errore || `Il codice ${codice} non corrisponde a nessun evento. Controlla il link o chiedilo a chi organizza.`}
        </p>
        <button className="bottone bottone-secondario" onClick={lascia}>Vai all&rsquo;app</button>
      </div>
    )
  }

  return (
    <div className="scheda evento-ingresso">
      <p className="evento-occhiello">Evento</p>
      <h2>{ev.nome || 'Evento'}</h2>
      {ev.inizio && <p className="sottotitolo">{dateEvento(ev)}</p>}

      {ev.aperto ? (
        <>
          <p>
            Con Primo Giocatore ti iscrivi ai tavoli dell&rsquo;evento, ne pubblichi di tuoi e registri
            le partite. A fine evento ritrovi partite e classifica.
          </p>
          <button className="bottone" onClick={onIscriviti}>Crea un account</button>
          <button className="bottone bottone-secondario" onClick={onEntra}>Ho già un account</button>
          <p className="aiuto">Se sei socio della Tana di Roma usa l&rsquo;account di sempre: l&rsquo;evento si aggiunge al resto.</p>
        </>
      ) : (
        <>
          <p className="avviso errore">Questo evento è chiuso: non si entra più.</p>
          <button className="bottone bottone-secondario" onClick={onEntra}>Ho già un account</button>
        </>
      )}

      <p className="riga-fondo">
        <button className="bottone-piatto" onClick={lascia}>Non mi interessa l&rsquo;evento</button>
      </p>
    </div>
  )
}
