// Primo Giocatore - protezione dagli errori
// v1.0.0 - 202611131900
//
// Un errore nel disegno di una pagina lasciava lo schermo bianco, senza
// modo di uscirne. Ora compare un messaggio con il tasto «Ricarica».
// Il caso più comune è l'app aggiornata mentre era aperta: la pagina
// toccata sta in un file della versione vecchia, che sul server non c'è
// più. Lì si ricarica da soli, una volta sola (se non basta, il messaggio).

import { Component } from 'react'

const CHIAVE = 'primo-giocatore:ricaricata-il'
const FILE_MANCANTE = /dynamically imported module|importing a module script|module script failed|error loading dynamically|unable to preload/i

// Vero se la ricarica è partita. Al massimo una al minuto: mai a ripetizione.
export function ricaricaUnaVolta() {
  try {
    if (!navigator.onLine) return false
    const ultima = Number(sessionStorage.getItem(CHIAVE) || 0)
    if (Date.now() - ultima < 60000) return false
    sessionStorage.setItem(CHIAVE, String(Date.now()))
  } catch { return false }
  window.location.reload()
  return true
}

export default class Protezione extends Component {
  constructor(p) { super(p); this.state = { errore: null } }
  static getDerivedStateFromError(errore) { return { errore } }
  componentDidCatch(errore) {
    if (FILE_MANCANTE.test(errore?.message || '')) ricaricaUnaVolta()
    else console.error(errore)
  }
  render() {
    if (!this.state.errore) return this.props.children
    return (
      <div className="guscio">
        <div className="scheda">
          <h2>Qualcosa non ha funzionato</h2>
          <p className="sottotitolo">
            La pagina si è fermata per un errore. Ricaricando si riparte: le partite
            lasciate a metà e quelle in attesa di rete restano sul telefono.
          </p>
          <button className="bottone" onClick={() => window.location.reload()}>Ricarica</button>
          <p className="aiuto">{String(this.state.errore?.message || '')}</p>
        </div>
      </div>
    )
  }
}
