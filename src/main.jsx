import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import Protezione, { ricaricaUnaVolta } from './Protezione.jsx'
import { avviaAggiornamenti } from './aggiornamento'

// Le misure dei tempi (tolte) lasciavano un registro sul telefono: via.
try { localStorage.removeItem('primo-giocatore:misure') } catch { /* niente */ }

// Tiene l'app disponibile senza rete; la versione nuova si propone
// (aggiornamento.js), non ricarica più la pagina mentre la si usa.
avviaAggiornamenti()

// Un file della versione vecchia che non c'è più (app aggiornata mentre
// era aperta): si ricarica per prendere quella nuova.
window.addEventListener('vite:preloadError', (e) => { if (ricaricaUnaVolta()) e.preventDefault() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Protezione>
      <App />
    </Protezione>
  </React.StrictMode>
)
