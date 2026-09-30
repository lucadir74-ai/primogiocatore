// Primo Giocatore - immagini generiche
// v1.0.0 - 202609302230
//
// Il tavolo libero non ha un gioco, quindi nemmeno una copertina: usa
// questa. Per metterci il logo della Tana dei Goblin basta sostituire
// il file public/tavolo-libero.png, lasciando lo stesso nome.

export const IMMAGINE_TAVOLO_LIBERO = '/tavolo-libero.png'

// La copertina da mostrare per un tavolo: quella del gioco, o quella
// generica se il tavolo è libero. grande: per la pagina pubblica.
export function copertinaTavolo(tavolo, grande = false) {
  if (!tavolo) return null
  if (!tavolo.giochi) return IMMAGINE_TAVOLO_LIBERO
  return (grande && tavolo.giochi.immagine_grande) || tavolo.giochi.immagine_url || null
}
