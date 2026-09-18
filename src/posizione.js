// Primo Giocatore - distanze
// v4.1.0 - 202609221100
//
// La posizione di chi guarda resta sul suo telefono: il calcolo
// avviene qui, e al server non arriva mai nulla.

const RAGGIO_TERRA = 6371 // km

export function distanza(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || Number.isNaN(v))) return null
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RAGGIO_TERRA * Math.asin(Math.sqrt(a))
}

export function scriviDistanza(km) {
  if (km == null) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// Chiede la posizione al telefono. Il permesso lo dà la persona, e
// vale solo per questa volta: non si tiene niente da parte.
export function chiediPosizione() {
  return new Promise((risolvi, rifiuta) => {
    if (!navigator.geolocation) {
      rifiuta(new Error('Questo dispositivo non sa dire dove si trova.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => risolvi({ lat: p.coords.latitude, lon: p.coords.longitude, precisione: p.coords.accuracy }),
      (e) => {
        const messaggi = {
          1: 'Permesso negato: senza posizione non posso ordinare i tavoli per distanza.',
          2: 'Posizione non disponibile in questo momento.',
          3: 'La ricerca della posizione ha impiegato troppo tempo.',
        }
        rifiuta(new Error(messaggi[e.code] || 'Posizione non disponibile.'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    )
  })
}
