// Primo Giocatore - una partita di BGA nel formato compatto dell'app
// v1.0.0 - 202610201000
//
// Lo stesso formato che produce il segnalibro, così l'import non sa
// (e non deve sapere) se le partite arrivano dal segnalibro o dal
// collegamento con password.
//   t: numero del tavolo   g: nome BGA del gioco   s, e: inizio e fine (secondi)
//   c: cooperativa         p: [[numero BGA, nome, punti, posto], …]
//   b: numeri BGA dei bot
// Restituisce null per le partite annullate o finite per abbandono.

export function compattaTavolo(t) {
  if (String(t.cancelled) === '1' || String(t.normalend) !== '1') return null
  let p = []
  const squadre = t.gameResult?.rankedTeams
  if (squadre?.length) {
    for (const sq of squadre) {
      for (const g of sq.players || []) {
        p.push([Number(g.id), String(g.name || ''), g.score == null ? null : Number(g.score), sq.rank == null ? null : Number(sq.rank)])
      }
    }
  } else {
    const a = String(t.players || '').split(',')
    const b = String(t.player_names || '').split(',')
    const c = String(t.scores || '').split(',')
    const d = String(t.ranks || '').split(',')
    p = a.map((x, k) => [Number(x), b[k] || '', c[k] === '' || c[k] == null ? null : Number(c[k]), d[k] ? Number(d[k]) : null])
  }
  return {
    t: String(t.table_id),
    g: String(t.game_name),
    s: Number(t.start),
    e: Number(t.end),
    c: String(t.is_coop) === '1',
    p,
    b: (t.bot_player_ids || []).map(Number),
  }
}
