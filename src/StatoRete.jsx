// Primo Giocatore - l'avviso «senza rete» e le partite in attesa
// v1.0.0 - 202611101200
//
// Sta in cima all'app, sotto la testata. Dice tre cose, solo quando servono:
// - manca la rete (o non risponde): quello che vedi è dell'ultima volta;
// - ci sono partite registrate senza rete che aspettano di partire;
// - le partite in attesa sono appena state salvate.
// È anche chi le fa partire: all'apertura e appena la rete torna, da
// qualunque pagina (prima succedeva solo aprendo la pagina Partita).

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { statoRete, seguiRete } from './memoriaRete'
import { leggiCoda, inviaCoda, EVENTO_CODA } from './coda'
import { leggiArchivio } from './archivio'
import { inviaABggSeServe } from './invioBgg'

export default function StatoRete({ profilo }) {
  const [rete, setRete] = useState(statoRete)
  const [inCoda, setInCoda] = useState(() => leggiCoda(profilo?.id).length)
  const [esito, setEsito] = useState(null)   // { salvate } | { rifiutate, motivo }

  useEffect(() => seguiRete(setRete), [])

  useEffect(() => {
    if (!profilo?.id) return
    let vivo = true
    const conta = () => { if (vivo) setInCoda(leggiCoda(profilo.id).length) }

    async function svuota() {
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
    document.addEventListener('visibilitychange', tornataVisibile)
    return () => {
      vivo = false
      window.removeEventListener('online', reteTornata)
      window.removeEventListener(EVENTO_CODA, conta)
      document.removeEventListener('visibilitychange', tornataVisibile)
    }
  }, [profilo?.id])

  const fuori = rete.senzaRete || rete.datiVecchi
  if (!fuori && !inCoda && !esito) return null

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
      {inCoda > 0 && (
        <p className="stato-rete-riga">
          {inCoda === 1
            ? 'Una partita aspetta la rete per essere salvata: resta su questo telefono.'
            : `${inCoda} partite aspettano la rete per essere salvate: restano su questo telefono.`}
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
