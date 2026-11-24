// Primo Giocatore - giocatori non soci alla Tana (per gli organizzatori)
// v1.4.0 - 202611250000 (tutte le partite alla Tana, anche inserite a mano)
//
// Chi ha giocato senza account alla Tana di Roma (fuori dagli eventi):
// ospite di una partita lì (a mano o da un tavolo) o iscritto confermato
// a un tavolo lì,
// e non risulta nell'elenco soci. Il confronto lo fa il database
// (supabase/non_soci_ai_tavoli.sql): l'elenco soci non arriva al telefono.
// Una persona è il suo nome (chiave). «Visto» vale per tutti gli
// organizzatori: la persona torna fra le nuove solo se gioca un'altra
// partita o si iscrive a un altro tavolo alla Tana.

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
      setErrore(/non_soci_ai_tavoli|non_socio_visto_nome/.test(error.message || '')
        ? 'Manca lo script supabase/non_soci_ai_tavoli.sql aggiornato: va lanciato nell’SQL Editor di Supabase.'
        : error.message)
      setRighe([])
      return
    }
    setErrore('')
    setRighe(data || [])
  }
  useEffect(() => { carica() }, [])

  async function visto(chiavi) {
    setLavoro(true)
    for (const chiave of chiavi) {
      const { error } = await supabase.rpc('non_socio_visto_nome', { p_chiave: chiave })
      if (error) { setErrore(error.message); break }
    }
    setLavoro(false)
    await carica()
    onCambio?.()
  }

  const nuove = (righe || []).filter((r) => r.nuove > 0)
  const viste = (righe || []).filter((r) => r.nuove === 0)
  const nota = righe == null ? '…' : errore ? 'da riprovare' : nuove.length ? `${nuove.length} da guardare` : righe.length ? `${righe.length} già viste` : 'nessuno'

  const riga = (r) => (
    <li key={r.chiave} style={{ display: 'block' }}>
      <div className="nome-giocatore">
        <strong>{[r.nome, r.cognome].filter(Boolean).join(' ')}</strong>
        <span className="anno block">
          {r.volte === 1 ? '1 volta' : `${r.volte} volte`}
          {r.nuove > 0 && r.visto_il ? ` (${r.nuove} dopo l’ultimo «visto»)` : ''}
          {r.da_registrare > 0 ? ` · ${r.da_registrare === r.volte ? 'iscritto, partita non ancora registrata' : `${r.da_registrare} non ancora registrat${r.da_registrare === 1 ? 'a' : 'e'}`}` : ''}
          {' · ultimo '}{giorno(r.ultima)}{r.ultimo_gioco ? `, ${r.ultimo_gioco}` : ''}
          {r.registrata_da ? ` · registrata da ${r.registrata_da}` : ''}
        </span>
      </div>
      {r.nuove > 0 && (
        <span className="azioni-iscritto">
          <button className="bottone-piatto" disabled={lavoro} onClick={() => visto([r.chiave])}>visto</button>
        </span>
      )}
    </li>
  )

  return (
    // Con persone nuove si apre da sola (la chiave la ricrea a dati arrivati).
    <Sezione key={nuove.length > 0 ? 'nuove' : 'niente'} apri={nuove.length > 0}
      id="soci-non-soci-tavoli" titolo="Non soci alla Tana" nota={nota}>
      <p className="aiuto">
        Chi negli ultimi 4 mesi ha giocato senza account alla Tana di Roma (in una partita inserita a mano
        o da un tavolo, oppure iscritto confermato a un tavolo) e non risulta nell&rsquo;elenco soci, per nome
        e cognome o per nick. Gli eventi non contano. Se è un socio scritto in modo diverso,
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
              onClick={() => visto(nuove.map((r) => r.chiave))}>Segna tutti visti</button>
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
