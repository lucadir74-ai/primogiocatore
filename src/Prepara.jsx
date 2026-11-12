// Primo Giocatore - le pagine preparate per quando manca la rete
// v1.1.0 - 202611131900 (una pagina alla volta, e solo ad app ferma)
//
// Senza rete una pagina mostra la copia dell'ultima volta che è stata
// aperta (memoriaRete.js). Chi non l'aveva mai aperta trovava solo un
// errore. Qui, poco dopo l'apertura dell'app e con la rete, le pagine
// (Tavoli, Giochi, Giocatori, Classifiche e le sezioni del Profilo che
// l'iscritto può vedere) si aprono una alla volta di nascosto: fanno le
// loro letture, e le risposte restano sul telefono.
// Si aprono le pagine vere, non una copia delle loro domande al
// database: così, se una pagina cambia, la preparazione resta giusta.
//
// Una volta ogni 12 ore per account e telefono: una delle pagine legge
// tutte le partite, e rifarlo a ogni apertura sarebbe uno spreco.
// Storico, Statistiche e Partita non servono qui: hanno già la loro
// memoria (archivio.js, elenchiPartita.js).

import { Component, Suspense, useEffect, useState } from 'react'
import { richiesteInCorso } from './memoriaRete'

const CHIAVE = 'primo-giocatore:preparato-2'   // 2: anche le sezioni del Profilo
const OGNI = 12 * 3600000
const PRIMA_ATTESA = 6000    // l'app si apre in pace, poi si comincia
const PER_PAGINA = 2000      // il minimo: il tempo di far partire le letture della pagina
const MASSIMO_PAGINA = 20000 // oltre non si aspetta più: si passa alla successiva
const OGNI_QUANTO = 500      // ogni quanto si guarda se le letture sono finite

function ultimaVolta(profiloId) {
  try {
    const d = JSON.parse(localStorage.getItem(CHIAVE) || '{}')
    return d.id === profiloId ? d.quando || 0 : 0
  } catch { return 0 }
}

// Una pagina che si rompe di nascosto non deve portarsi dietro l'app.
class Protetta extends Component {
  constructor(p) { super(p); this.state = { rotta: false } }
  static getDerivedStateFromError() { return { rotta: true } }
  componentDidCatch() { /* niente: era solo la preparazione */ }
  render() { return this.state.rotta ? null : this.props.children }
}

// pagine: [[id, Componente], ...] — aperta: l'id di quella che si sta guardando.
export default function Prepara({ profilo, pagine, aperta }) {
  const [passo, setPasso] = useState(-1)   // -1: fermo

  useEffect(() => {
    if (!profilo?.id) return
    if (Date.now() - ultimaVolta(profilo.id) < OGNI) return
    // Si comincia ad app ferma: finché le letture dell'apertura (Home,
    // archivio, elenchi della Partita) sono in viaggio, si aspetta.
    let t
    let giri = 0
    const prova = () => {
      if (!navigator.onLine) return
      if (richiesteInCorso() > 0 && giri++ < 60) { t = setTimeout(prova, OGNI_QUANTO); return }
      setPasso(0)
    }
    t = setTimeout(prova, PRIMA_ATTESA)
    return () => clearTimeout(t)
  }, [profilo?.id])

  useEffect(() => {
    if (passo < 0) return
    if (passo >= pagine.length) {
      try { localStorage.setItem(CHIAVE, JSON.stringify({ id: profilo.id, quando: Date.now() })) } catch { /* niente */ }
      setPasso(-1)
      return
    }
    // Rete caduta a metà: ci si ferma, si rifà alla prossima apertura.
    if (!navigator.onLine) { setPasso(-1); return }
    // Una pagina alla volta: la successiva si apre quando le letture di
    // questa sono finite (prima partivano tutte a due secondi una
    // dall'altra, e chi intanto toccava una pagina restava in coda).
    const inizio = Date.now()
    let t
    const prova = () => {
      const passato = Date.now() - inizio
      const libero = richiesteInCorso() === 0 && document.visibilityState !== 'hidden'
      if (passato < MASSIMO_PAGINA && !libero) { t = setTimeout(prova, OGNI_QUANTO); return }
      setPasso((n) => n + 1)
    }
    t = setTimeout(prova, PER_PAGINA)
    return () => clearTimeout(t)
  }, [passo])

  if (passo < 0 || passo >= pagine.length) return null
  const [id, Pagina] = pagine[passo]
  if (id === aperta) return null   // è già sullo schermo: le sue letture le sta facendo lei

  const niente = () => {}
  return (
    <div hidden aria-hidden="true">
      <Protetta key={id}>
        <Suspense fallback={null}>
          <Pagina profilo={profilo} compatto={false} onRichieste={niente} onRegistraPartita={niente}
            onStatistiche={niente} onIndietro={niente} />
        </Suspense>
      </Protetta>
    </div>
  )
}
