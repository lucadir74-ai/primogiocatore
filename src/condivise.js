// Primo Giocatore - partite condivise
// v1.0.0 - 202610041700
//
// La stessa serata registrata da due persone (ognuna nel proprio
// archivio, per esempio importando BG Stats o sincronizzando BGG)
// deve contare una volta sola. Le partite restano tutte nel database:
// l'unione avviene solo nel calcolo delle statistiche.
//
// Due partite di archivi diversi sono la stessa quando coincidono
// gioco e giorno e poi:
// - se entrambe hanno i punteggi, gli stessi punteggi;
// - se a una mancano, lo stesso numero di giocatori.
// L'accoppiamento è uno a uno: tre partite uguali nello stesso giorno
// in due archivi restano tre, non una.

const giornoDi = (p) => String(p.giocata_il || '').slice(0, 10)

const punteggiDi = (p) => (p.partecipazioni || [])
  .map((x) => x.punteggio_totale)
  .filter((v) => v != null)
  .map(Number)
  .sort((a, b) => a - b)

function compatibili(a, b) {
  const pa = punteggiDi(a)
  const pb = punteggiDi(b)
  if (pa.length && pb.length) return pa.length === pb.length && pa.every((v, i) => v === pb[i])
  return (a.partecipazioni || []).length === (b.partecipazioni || []).length
}

// preferiti: chi registra le copie da tenere, in ordine di preferenza
// (di solito la persona di cui si guardano le statistiche, poi chi
// sta usando l'app). Restituisce le partite nell'ordine originale.
export function unisciCondivise(partite, preferiti = []) {
  const rango = (p) => {
    const i = preferiti.indexOf(p.registrata_da)
    return i === -1 ? preferiti.length : i
  }

  const gruppi = new Map()
  partite.forEach((p, i) => {
    if (!p.giochi?.id) return
    const k = `${p.giochi.id}|${giornoDi(p)}`
    const g = gruppi.get(k) || []
    g.push({ p, i })
    gruppi.set(k, g)
  })

  const scartate = new Set()
  for (const g of gruppi.values()) {
    // Un solo archivio: niente da unire.
    if (new Set(g.map((x) => x.p.registrata_da)).size < 2) continue

    const ordinate = [...g].sort((a, b) => rango(a.p) - rango(b.p) || a.i - b.i)
    const tenute = []   // { p, assorbiti: Set di chi ha registrato le copie unite }
    for (const x of ordinate) {
      const gemella = tenute.find((t) =>
        t.p.registrata_da !== x.p.registrata_da &&
        !t.assorbiti.has(x.p.registrata_da) &&
        compatibili(t.p, x.p))
      if (gemella) {
        gemella.assorbiti.add(x.p.registrata_da)
        scartate.add(x.i)
      } else {
        tenute.push({ p: x.p, assorbiti: new Set() })
      }
    }
  }

  return scartate.size ? partite.filter((_, i) => !scartate.has(i)) : partite
}
