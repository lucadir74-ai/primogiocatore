// Primo Giocatore - richieste di tavolo
// v1.0.0 - 202610301200 (prima versione: chi ha il gioco organizza o dice «non posso»; chi ha chiesto vede com'è andata)
//
// In cima a Tavoli. Per chi ha il gioco: «X cerca un tavolo di Y», con
// «Lo organizzo io» (apre il modulo del tavolo con il gioco già messo) e
// «Non posso». Per chi ha chiesto: a che punto è la sua richiesta.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export async function contaRichiesteTavolo() {
  const { data, error } = await supabase.rpc('richieste_tavolo_mie')
  if (error) return 0
  return (data || []).filter((r) => r.per_me).length
}

export default function RichiesteTavolo({ onOrganizza, onApriTavolo, aggiorna }) {
  const [righe, setRighe] = useState([])
  const [errore, setErrore] = useState('')

  useEffect(() => { carica() }, [aggiorna])

  async function carica() {
    const { data, error } = await supabase.rpc('richieste_tavolo_mie')
    if (!error) setRighe(data || [])
  }

  async function rispondi(r, risposta) {
    const testo = risposta === 'no'
      ? `Dire a ${r.chi} che non puoi organizzare ${r.gioco}?`
      : `Chiudere la tua richiesta per ${r.gioco}?`
    if (!confirm(testo)) return
    setErrore('')
    const { error } = await supabase.rpc('rispondi_richiesta_tavolo', { p_richiesta: r.id, p_risposta: risposta })
    if (error) { setErrore(error.message); return }
    carica()
  }

  const perMe = righe.filter((r) => r.per_me)
  const mie = righe.filter((r) => !r.per_me)
  if (perMe.length === 0 && mie.length === 0) return null

  return (
    <div className="richieste-tavolo">
      {errore && <div className="avviso errore">{errore}</div>}

      {perMe.length > 0 && (
        <>
          <h3 className="titolo-sezione">Ti chiedono un tavolo <span className="conteggio">{perMe.length}</span></h3>
          <ul className="elenco">
            {perMe.map((r) => (
              <li key={r.id}>
                <div className="gioco">
                  {r.immagine_url && <img src={r.immagine_url} alt="" className="copertina" />}
                  <div>
                    <strong>{r.chi}</strong> cerca un tavolo di <strong>{r.gioco}</strong>
                    {r.messaggio && <span className="anno block">«{r.messaggio}»</span>}
                    {r.destinatari > 1 && <span className="anno block">chiesto anche ad altri {r.destinatari - 1}</span>}
                    <span className="azioni-iscritto">
                      <button className="bottone-piatto" onClick={() => onOrganizza(r)}>Lo organizzo io</button>
                      <button className="bottone-piatto pericolo" onClick={() => rispondi(r, 'no')}>Non posso</button>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {mie.length > 0 && (
        <>
          <h3 className="titolo-sezione">Le tue richieste</h3>
          <ul className="elenco">
            {mie.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.gioco}</strong>
                  <span className="anno block">
                    {r.stato === 'organizzata'
                      ? `${r.organizzata_da || 'Qualcuno'} ha organizzato il tavolo: sei già iscritto.`
                      : r.stato === 'chiusa'
                        ? (r.rifiuti >= r.destinatari ? 'Nessuno può organizzarlo per ora.' : 'Richiesta chiusa.')
                        : `In attesa: chiesto a ${r.destinatari} ${r.destinatari === 1 ? 'persona' : 'persone'}`
                          + (r.rifiuti ? `, ${r.rifiuti} non ${r.rifiuti === 1 ? 'può' : 'possono'}.` : '.')}
                  </span>
                </div>
                {r.stato === 'organizzata' && r.tavolo_id && (
                  <button className="bottone-piatto" onClick={() => onApriTavolo(r.tavolo_id)}>Apri il tavolo</button>
                )}
                {r.stato === 'aperta' && (
                  <button className="bottone-piatto" onClick={() => rispondi(r, 'chiudi')}>chiudi</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
