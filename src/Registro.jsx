// Primo Giocatore - registro delle operazioni (solo l'amministratore dell'app)
// v1.0.0 - 202611211900
//
// Chiesto dall'associazione per la privacy: chi ha caricato, cambiato o
// consultato l'elenco soci, chi ha cambiato ruoli e accessi. Lo scrive
// solo il database (supabase/privacy_fase2.sql); qui si legge e basta.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

const PAGINA = 100

const quando = (d) => new Date(d).toLocaleString('it-IT', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default function Registro() {
  const [righe, setRighe] = useState(null)
  const [altre, setAltre] = useState(false)
  const [errore, setErrore] = useState('')
  const [attesa, setAttesa] = useState(false)

  async function leggi(da = 0) {
    setErrore(''); setAttesa(true)
    const { data, error } = await supabase
      .from('registro_operazioni')
      .select('id, quando, azione, dettaglio, profili ( id, nickname, nome )')
      .order('quando', { ascending: false })
      .range(da, da + PAGINA - 1)
    setAttesa(false)
    if (error) {
      setErrore(/registro_operazioni/.test(error.message)
        ? 'Al database manca lo script del registro (privacy_fase2.sql): va eseguito una volta in Supabase.'
        : error.message)
      return
    }
    setRighe((r) => (da === 0 ? data : [...(r || []), ...data]))
    setAltre(data.length === PAGINA)
  }

  useEffect(() => { leggi() }, [])

  return (
    <>
      <p className="aiuto">
        Caricamenti e modifiche dell&rsquo;elenco soci, consultazioni, ruoli e decisioni sugli accessi.
        Lo scrive solo il database: nessuno può cambiarlo o cancellarne righe dall&rsquo;app.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {righe && righe.length === 0 && <p className="aiuto">Ancora nessuna operazione.</p>}
      {righe && righe.length > 0 && (
        <ul className="elenco">
          {righe.map((r) => (
            <li key={r.id} style={{ display: 'block' }}>
              <div><strong>{r.azione}</strong></div>
              {r.dettaglio && <div>{r.dettaglio}</div>}
              <span className="anno block">
                {quando(r.quando)} · {r.profili ? daMostrare(r.profili) : 'sistema o account eliminato'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button className="bottone bottone-secondario" onClick={() => leggi(0)} disabled={attesa}>
        {attesa ? 'Leggo…' : 'Aggiorna'}
      </button>
      {altre && (
        <button className="bottone bottone-secondario" onClick={() => leggi(righe.length)} disabled={attesa}>
          Mostra le precedenti
        </button>
      )}
    </>
  )
}
