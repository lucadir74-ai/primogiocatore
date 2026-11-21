// Primo Giocatore - rifare una partita con gli stessi giocatori
// v1.0.0 - 202611211000 (da Home «Rifai l'ultima»: ora la usa anche lo Storico, per qualunque partita)
//
// Stesso gioco, stessi giocatori, stesso luogo, cooperativa o no come
// quella volta. Il resto (punti, fazioni, ordine di turno, durata) da
// capo. Si prepara come partita in corso: la pagina Partita la riprende.

import { supabase, daMostrare } from './supabase'
import { scriviBozza } from './bozza'

const nomeDi = (x) => (x.utente_id
  ? daMostrare(x.profili)
  : [x.ospiti?.nome, x.ospiti?.cognome].filter(Boolean).join(' ') || 'Ospite')

// I giocatori di una partita, pronti per ricominciare: nell'ordine di
// turno di quella volta se c'era, altrimenti come sono.
export function giocatoriDaCapo(partecipazioni) {
  return [...(partecipazioni || [])]
    .sort((a, b) => (a.ordine_turno ?? 99) - (b.ordine_turno ?? 99))
    .map((x) => ({
      chiave: x.utente_id ? `u-${x.utente_id}` : `o-${x.ospite_id}`,
      ...(x.utente_id ? { utente_id: x.utente_id } : { ospite_id: x.ospite_id }),
      nome: nomeDi(x),
      punteggio: '', posizione: '', spareggio: '', ruolo: '', ordine: null,
    }))
}

// partita: come arriva dall'archivio (archivio.js). Il gioco si rilegge
// intero, perché all'archivio bastano nome e copertina.
export async function preparaRivincita(partita) {
  const { data: gioco, error } = await supabase.from('giochi').select('*').eq('id', partita.giochi.id).single()
  if (error) throw error
  scriviBozza({
    gioco,
    righe: giocatoriDaCapo(partita.partecipazioni),
    luogo: partita.luoghi?.nome || '',
    coop: partita.tipo_punteggio === 'coop',
    rifatta: true,
    accumulati: 0,
    avviatoIl: null,
  })
}
