// Primo Giocatore - ricerca di un indirizzo o di una zona
// v1.0.0 - 202610282000
//
// Passa dal nostro server (/api/indirizzo), che chiede a OpenStreetMap.
// Si cerca solo quando la persona preme «Trova», mai mentre scrive.

import { fetchBgg } from './supabase'

export async function cercaIndirizzo(testo) {
  const r = await fetchBgg(`/api/indirizzo?q=${encodeURIComponent(testo.trim())}`)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.errore || 'Ricerca dell\u2019indirizzo non riuscita.')
  return d.risultati || []
}

// Link a una mappa per arrivarci.
export const linkMappa = (lat, lon) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`
