// Primo Giocatore - giocatori non soci alla Tana (per gli organizzatori)
// v1.1.0 - 202611241600 (anche le partite inserite a mano in sede)
//
// Chi ha giocato come ospite a un tavolo della Tana o in una partita
// inserita a mano con luogo la sede (fuori dagli eventi)
// e non risulta nell'elenco soci. Il confronto lo fa il database
// (supabase/non_soci_ai_tavoli.sql): l'elenco soci non arriva al telefono.
// «Visto» vale per tutti gli organizzatori: la persona torna fra le
// nuove solo se gioca un'altra partita alla Tana.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Sezione from './Sezione.jsx'

const giorno = (d) => d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function NonSociTavoli({ onCambio }) {
  const [righe, setRighe] = useState(null)   // null = sto leggendo
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)

  async function carica() {
    const { data, error } = await supabase.rpc('non_soci_ai_tavoli', { p_giorni: 120 })
    if (error) {
      setErrore(/non_soci_ai_tavoli/.test(error.message || '')
        ? 'Manca lo script supabase/non_soci_ai_tavoli.sql: va lanciato nell’SQL Editor di Supabase.'
        : error.message)
      setRighe([])
      return
    }
    setErrore('')
    setRighe(data || [])
  }
  useEffect(() => { carica() }, [])

  async function visto(ids) {
    setLavoro(true)
    for (const id of ids) {
      const { error } = await supabase.rpc('non_socio_visto', { p_ospite: id })
      if (error) { setErrore(error.message); break }
    }
    setLavoro(false)
    await carica()
    onCambio?.()
  }

  const nuove = (righe || []).filter((r) => r.nuove > 0)
  const viste = (righe || []).filter((r) => r.nuove === 0)
  const nota = righe == null ? '…' : nuove.length ? `${nuove.length} da guardare` : righe.length ? `${righe.length} già viste` : 'nessuno'

  const riga = (r) => (
    <li key={r.ospite_id} style={{ display: 'block' }}>
      <div className="nome-giocatore">
        <strong>{[r.nome, r.cognome].filter(Boolean).join(' ')}</strong>
        <span className="anno block">
          {r.partite === 1 ? '1 partita' : `${r.partite} partite`}
          {r.nuove > 0 && r.visto_il ? ` (${r.nuove} dopo l’ultimo «visto»)` : ''}
          {' · ultima '}{giorno(r.ultima)}{r.ultimo_gioco ? `, ${r.ultimo_gioco}` : ''}
          {r.registrata_da ? ` · registrata da ${r.registrata_da}` : ''}
        </span>
      </div>
      {r.nuove > 0 && (
        <span className="azioni-iscritto">
          <button className="bottone-piatto" disabled={lavoro} onClick={() => visto([r.ospite_id])}>visto</button>
        </span>
      )}
    </li>
  )

  return (
    // Con persone nuove si apre da sola (la chiave la ricrea a dati arrivati).
    <Sezione key={nuove.length > 0 ? 'nuove' : 'niente'} apri={nuove.length > 0}
      id="soci-non-soci-tavoli" titolo="Non soci alla Tana" nota={nota}>
      <p className="aiuto">
        Chi negli ultimi 4 mesi ha giocato come ospite alla Tana (partita creata da un tavolo, oppure inserita a mano
        con luogo la sede) e non risulta nell&rsquo;elenco soci, per nome e cognome. Le partite degli eventi non contano. Se è un socio scritto in modo diverso,
        correggi il nome nell&rsquo;elenco soci oppure segna «visto».
      </p>
      {errore && <div className="avviso errore">{errore}</div>}
      {righe == null ? (
        <p className="aiuto">Sto controllando…</p>
      ) : righe.length === 0 ? (
        !errore && <p className="aiuto">Nessun non socio alla Tana.</p>
      ) : (
        <>
          {nuove.length > 0 && <ul className="elenco">{nuove.map(riga)}</ul>}
          {nuove.length > 1 && (
            <button className="bottone bottone-secondario" disabled={lavoro}
              onClick={() => visto(nuove.map((r) => r.ospite_id))}>Segna tutti visti</button>
          )}
          {viste.length > 0 && (
            <>
              <p className="aiuto" style={{ marginTop: '0.8rem' }}>Già visti:</p>
              <ul className="elenco">{viste.map(riga)}</ul>
            </>
          )}
        </>
      )}
    </Sezione>
  )
}
