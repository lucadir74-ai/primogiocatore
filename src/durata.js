// Primo Giocatore - durata di una partita, scritta in ore e minuti
//
// 178 minuti si leggono male: diventano «2 h 58 min». Sotto l'ora resta
// «45 min», le ore tonde restano «2 h».
export function durataLeggibile(minuti) {
  const tot = Math.round(Number(minuti) || 0)
  if (tot <= 0) return ''
  const o = Math.floor(tot / 60)
  const m = tot % 60
  if (!o) return `${m} min`
  return m ? `${o} h ${m} min` : `${o} h`
}
