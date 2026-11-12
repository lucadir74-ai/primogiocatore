import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import Protezione, { ricaricaUnaVolta } from './Protezione.jsx'
import { registerSW } from 'virtual:pwa-register'

// Le misure dei tempi (tolte) lasciavano un registro sul telefono: via.
try { localStorage.removeItem('primo-giocatore:misure') } catch { /* niente */ }

// Tiene l'app disponibile senza rete e la aggiorna da sola
// alla prima ricarica dopo un nuovo caricamento.
registerSW({ immediate: true })

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
