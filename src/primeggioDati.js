// Primo Giocatore - Primeggio: le partite lette in forma compatta
// v1.0.0 - 202611131200
//
// La funzione del database primeggio_partite (supabase/primeggio_leggero.sql)
// manda le partite a blocchi, in una forma molto più leggera di quella
// piena: ogni id compare una volta sola per blocco (nell'elenco «chiavi»)
// e nelle righe c'è solo il suo numero; niente nomi di campo ripetuti;
// il gioco solo come numero, senza nome e immagine in ogni partita.
//
// Qui la si riporta alla forma di sempre, quella che calcolaPrimeggio
// (primeggioCalcolo.js) si aspetta:
//   { giocata_il, registrata_da, tipo_punteggio, gioco_id,
//     giochi: { id, bgg_id, peso_bgg, nome, immagine_url } | null,
//     partecipazioni: [{ utente_id, ospite_id, punteggio_totale, posizione,
//                        vincitore, ospiti: { utente_collegato } | null }] }
// I giocatori restano nell'ordine in cui arrivano (quello del database).

const chiave = (chiavi, n) => (n == null ? null : chiavi[n] ?? null)

// blocco: { quante, ultimo, chiavi: [testo], righe: [[giocata_il, n_registrata_da,
//   tipo_punteggio, n_gioco, [[n_utente, n_ospite, punteggio_totale, posizione,
//   vincitore, n_collegato], ...]], ...] }
export function decodificaBlocco(blocco) {
  const chiavi = blocco?.chiavi || []
  return (blocco?.righe || []).map(([giocata_il, reg, tipo_punteggio, gioco, parti]) => ({
    giocata_il,
    registrata_da: chiave(chiavi, reg),
    tipo_punteggio,
    gioco_id: chiave(chiavi, gioco),
    giochi: null,
    partecipazioni: (parti || []).map(([u, o, punteggio_totale, posizione, vincitore, c]) => {
      const ospite_id = chiave(chiavi, o)
      return {
        utente_id: chiave(chiavi, u),
        ospite_id,
        punteggio_totale,
        posizione,
        vincitore,
        // Come nella lettura di prima: senza ospite il campo è vuoto,
        // con un ospite c'è sempre, anche se non è collegato a nessuno.
        ospiti: ospite_id ? { utente_collegato: chiave(chiavi, c) } : null,
      }
    }),
  }))
}

// Gli id dei giochi presenti nelle partite (come testo, senza doppioni).
export function idGiochi(partite) {
  return [...new Set(partite.map((p) => p.gioco_id).filter((g) => g != null).map(String))]
}

// giochi: le righe della tabella giochi (id, bgg_id, peso_bgg, nome,
// immagine_url). Ogni partita riceve il suo gioco; le partite dello stesso
// gioco condividono lo stesso oggetto, così un peso recuperato da BGG
// vale subito per tutte.
export function aggiungiGiochi(partite, giochi) {
  const perId = new Map((giochi || []).map((g) => [String(g.id), g]))
  for (const p of partite) p.giochi = p.gioco_id != null ? perId.get(String(p.gioco_id)) || null : null
  return partite
}
