// Primo Giocatore - sezione a scomparsa
// v1.0.0 - 202610201930

import { useState } from 'react'

// Le sezioni a scomparsa ricordano se le avevi aperte.
const CHIAVE_APERTE = 'primo-giocatore:dati-aperte'

// id: per ricordare se era aperta (unico in tutta l'app).
export default function Sezione({ id, titolo, nota, children }) {
  const [aperta, setAperta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHIAVE_APERTE) || '[]').includes(id) } catch { return false }
  })
  function cambia(e) {
    const ora = e.currentTarget.open
    setAperta(ora)
    try {
      const v = new Set(JSON.parse(localStorage.getItem(CHIAVE_APERTE) || '[]'))
      if (ora) v.add(id); else v.delete(id)
      localStorage.setItem(CHIAVE_APERTE, JSON.stringify([...v]))
    } catch { /* resta solo per ora */ }
  }
  return (
    <details className="sezione-ripiegabile" open={aperta} onToggle={cambia}>
      <summary>
        <span className="sezione-titolo">{titolo}</span>
        {nota && <span className="sezione-nota">{nota}</span>}
      </summary>
      <div className="sezione-corpo">{children}</div>
    </details>
  )
}
