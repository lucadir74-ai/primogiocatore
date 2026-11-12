// Primo Giocatore - l'avviso «senza rete» e le partite in attesa
// v1.0.0 - 202611101200
//
// Sta in cima all'app, sotto la testata. Dice tre cose, solo quando servono:
// - manca la rete (o non risponde): quello che vedi è dell'ultima volta;
// - ci sono partite registrate senza rete che aspettano di partire;
// - le partite in attesa sono appena state salvate;
// - lo stesso per le piccole modifiche fatte senza rete (modifiche.js).
// È anche chi le fa partire: all'apertura e appena la rete torna, da
// qualunque pagina (prima succedeva solo aprendo la pagina Partita).

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { statoRete, seguiRete, vistiINuovi } from './memoriaRete'
import { leggiCoda, inviaCoda, EVENTO_CODA } from './coda'
import { leggiArchivio } from './archivio'
import { leggiModifiche, inviaModifiche, EVENTO_MODIFICHE } from './modifiche'
import { inviaABggSeServe } from './invioBgg'

// pagina: quella aperta; onAggiorna: la ridisegna con i dati appena arrivati
// (assente dove ridisegnare farebbe perdere quello che si sta scrivendo).
export default function StatoRete({ profilo, pagina, onAggiorna }) {
  const [rete, setRete] = useState(statoRete)
  const [inCoda, setInCoda] = useState(() => leggiCoda(profilo?.id).length)
  const [esito, setEsito] = useState(null)   // { salvate } | { rifiutate, motivo }
  const [modifiche, setModifiche] = useState(() => leggiModifiche(profilo?.id).length)
  const [esitoModifiche, setEsitoModifiche] = useState(null)   // { salvate } | { cosa, motivo }

  useEffect(() => seguiRete(setRete), [])
  // Cambiata pagina: quella nuova ha già letto per conto suo.
  useEffect(() => { vistiINuovi() }, [pagina])

  useEffect(() => {
    if (!profilo?.id) return
    let vivo = true
    const conta = () => {
      if (!vivo) return
      setInCoda(leggiCoda(profilo.id).length)
      setModifiche(leggiModifiche(profilo.id).length)
    }

    // Le piccole modifiche fatte senza rete (profilo, «è mio», nome di un luogo).
    async function svuotaModifiche() {
      if (!navigator.onLine || leggiModifiche(profilo.id).length === 0) return
      try {
        const r = await inviaModifiche(profilo.id)
        if (!vivo) return
        conta()
        if (r.scartate.length) setEsitoModifiche(r.scartate[0])
        else if (r.inviate > 0) setEsitoModifiche({ salvate: r.inviate })
      } catch { /* si riprova al prossimo ritorno della rete */ }
    }

    async function svuota() {
      svuotaModifiche()
      if (!navigator.onLine || leggiCoda(profilo.id).length === 0) return
      try {
        const r = await inviaCoda(supabase, profilo)
        if (!vivo) return
        conta()
        if (r.inviate > 0) {
          setEsito({ salvate: r.inviate })
          inviaABggSeServe(profilo)
          leggiArchivio(profilo.id).catch(() => {})   // Storico e Statistiche si rimettono in pari
        }
        if (r.scartate.length) setEsito({ rifiutate: r.scartate.length, motivo: r.scartate[0].motivo })
      } catch { /* si riprova al prossimo ritorno della rete */ }
    }

    // Rete tornata: partono le partite in attesa e l'archivio si rilegge.
    function reteTornata() {
      svuota()
      leggiArchivio(profilo.id).catch(() => {})
    }
    // Riaprendo l'app dopo un po' si riprova: sull'iPhone il segnale
    // «rete tornata» a volte non arriva a un'app rimasta in secondo piano.
    function tornataVisibile() { if (document.visibilityState === 'visible') svuota() }

    conta()
    svuota()
    window.addEventListener('online', reteTornata)
    window.addEventListener(EVENTO_CODA, conta)
    window.addEventListener(EVENTO_MODIFICHE, conta)
    document.addEventListener('visibilitychange', tornataVisibile)
    return () => {
      vivo = false
      window.removeEventListener('online', reteTornata)
      window.removeEventListener(EVENTO_CODA, conta)
      window.removeEventListener(EVENTO_MODIFICHE, conta)
      document.removeEventListener('visibilitychange', tornataVisibile)
    }
  }, [profilo?.id])

  const fuori = rete.senzaRete || rete.datiVecchi
  const nuovi = rete.nuoviArrivati && !fuori && Boolean(onAggiorna)
  if (!fuori && !nuovi && !inCoda && !esito && !modifiche && !esitoModifiche) return null

  return (
    <div className="stato-rete" role="status">
      {fuori && (
        <p className="stato-rete-riga stato-rete-fuori">
          <span className="stato-rete-pallino" aria-hidden="true" />
          <span>
            <strong>{rete.senzaRete ? 'Sei senza rete.' : 'La rete non risponde.'}</strong>{' '}
            Vedi i dati dell&rsquo;ultima volta. Puoi registrare partite: partono da sole quando torna la linea.
          </span>
        </p>
      )}
      {nuovi && (
        <p className="stato-rete-riga">
          La rete era lenta e vedi i dati dell&rsquo;ultima volta: ora sono arrivati quelli nuovi.{' '}
          <button type="button" className="bottone-piatto" onClick={() => { vistiINuovi(); onAggiorna() }}>Aggiorna la pagina</button>
        </p>
      )}
      {inCoda > 0 && (
        <p className="stato-rete-riga">
          {inCoda === 1
            ? 'Una partita aspetta la rete per essere salvata: resta su questo telefono.'
            : `${inCoda} partite aspettano la rete per essere salvate: restano su questo telefono.`}
        </p>
      )}
      {modifiche > 0 && (
        <p className="stato-rete-riga">
          {modifiche === 1
            ? 'Una modifica aspetta la rete: resta su questo telefono.'
            : `${modifiche} modifiche aspettano la rete: restano su questo telefono.`}
        </p>
      )}
      {esitoModifiche?.salvate > 0 && (
        <p className="stato-rete-riga">
          {esitoModifiche.salvate === 1 ? 'La modifica in attesa è stata salvata.' : `${esitoModifiche.salvate} modifiche in attesa sono state salvate.`}{' '}
          <button type="button" className="bottone-piatto" onClick={() => setEsitoModifiche(null)}>ok</button>
        </p>
      )}
      {esitoModifiche?.motivo && (
        <p className="stato-rete-riga">
          Non sono riuscito a salvare {esitoModifiche.cosa}, modificato senza rete: {esitoModifiche.motivo}{' '}
          <button type="button" className="bottone-piatto" onClick={() => setEsitoModifiche(null)}>ok</button>
        </p>
      )}
      {esito?.salvate > 0 && (
        <p className="stato-rete-riga">
          {esito.salvate === 1 ? 'La partita in attesa è stata salvata.' : `${esito.salvate} partite in attesa sono state salvate.`}{' '}
          <button type="button" className="bottone-piatto" onClick={() => setEsito(null)}>ok</button>
        </p>
      )}
      {esito?.rifiutate > 0 && (
        <p className="stato-rete-riga">
          {esito.rifiutate === 1 ? 'Una partita in attesa è stata rifiutata' : `${esito.rifiutate} partite in attesa sono state rifiutate`}: {esito.motivo}{' '}
          <button type="button" className="bottone-piatto" onClick={() => setEsito(null)}>ok</button>
        </p>
      )}
    </div>
  )
}
