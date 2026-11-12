// Primo Giocatore - gli aggiornamenti dell'app
// v1.0.0 - 202611132100
//
// Prima, appena usciva una versione nuova, la pagina si ricaricava da
// sola: chi stava scrivendo qualcosa lo perdeva. Ora la versione nuova
// aspetta, e si prende:
// - toccando «Aggiorna» nell'avviso in cima (Aggiornamento.jsx);
// - da soli tornando all'app dopo averla lasciata per qualche minuto;
// - comunque alla prossima apertura dopo averla chiusa.
// Riaprendo l'app rimasta aperta si controlla anche se ce n'è una nuova
// (al massimo una volta l'ora): prima succedeva solo ricaricando.

import { registerSW } from 'virtual:pwa-register'

const LONTANO_PER = 5 * 60000   // via dall'app almeno così: al ritorno si aggiorna da soli
const CONTROLLO_OGNI = 3600000

let pronta = false
let applica = null
const ascoltatori = new Set()

export const versioneNuovaPronta = () => pronta
export function seguiAggiornamento(f) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}
// Passa alla versione nuova e ricarica la pagina.
export function aggiornaOra() {
  applica?.(true)
  // Alla primissima visita la versione nuova è già attiva e non c'è niente
  // da far passare: basta ricaricare. Vale anche se il passaggio si inceppa.
  setTimeout(() => window.location.reload(), 3000)
}

export function avviaAggiornamenti() {
  let nascostaDal = 0
  let ultimoControllo = Date.now()
  let registrazione = null

  applica = registerSW({
    immediate: true,
    onNeedRefresh() {
      pronta = true
      for (const f of ascoltatori) f(true)
    },
    onRegisteredSW(_indirizzo, r) { registrazione = r || null },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { nascostaDal = Date.now(); return }
    const lontano = nascostaDal ? Date.now() - nascostaDal : 0
    if (pronta && lontano >= LONTANO_PER) { aggiornaOra(); return }
    if (registrazione && navigator.onLine && Date.now() - ultimoControllo > CONTROLLO_OGNI) {
      ultimoControllo = Date.now()
      registrazione.update().catch(() => { /* niente rete: alla prossima */ })
    }
  })
}
