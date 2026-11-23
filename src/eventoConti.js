// Primo Giocatore - i conti di un evento
// v1.0.0 - 202611241000
//
// Dalle partite dell'evento (classifica_evento, eventi_fase5.sql) i numeri
// di ognuno: partite, vittorie, avversari diversi, giochi diversi, peso
// medio dei giochi. Senza il calcolo del Primeggio: lo usano anche le
// Statistiche per la riga «sei 3° per vittorie», senza scaricare altro.
// La chiave di una persona è la stessa del Primeggio: l'account, anche
// quando ha giocato come ospite collegato, o «ospite:ID» per chi non ce l'ha.

export const chiaveDi = (x) => x.utente_id || x.ospiti?.utente_collegato || (x.ospite_id ? `ospite:${x.ospite_id}` : null)

// Per «Giochi impegnativi»: il peso medio conta da questo numero di partite.
export const MIN_PARTITE_PESO = 3

export function contiEvento(dati) {
  const partite = dati?.partite || []
  const nome = (k) => dati?.persone?.[k] || 'Giocatore'
  const persone = new Map()
  const giochi = new Map()
  const di = (k) => {
    if (!persone.has(k)) {
      persone.set(k, { k, nome: nome(k), ospite: k.startsWith('ospite:'), partite: 0, competitive: 0, vittorie: 0,
        avversari: new Set(), giochi: new Set(), pesoSomma: 0, pesoPartite: 0 })
    }
    return persone.get(k)
  }

  for (const p of partite) {
    const coop = p.tipo_punteggio === 'coop'
    const g = giochi.get(p.giochi.id) || { id: p.giochi.id, nome: p.giochi.nome, immagine_url: p.giochi.immagine_url, partite: 0, vincitori: new Map() }
    g.partite++
    giochi.set(p.giochi.id, g)
    // Una persona sola per partita, anche se compare due volte (account e ospite collegato).
    const unici = new Map()
    for (const x of p.partecipazioni || []) {
      const k = chiaveDi(x)
      if (k) unici.set(k, { vincitore: Boolean(x.vincitore || unici.get(k)?.vincitore) })
    }
    const chi = [...unici.entries()]
    for (const [k, x] of chi) {
      const r = di(k)
      r.partite++
      r.giochi.add(p.giochi.id)
      if (p.giochi.peso_bgg > 0) { r.pesoSomma += Number(p.giochi.peso_bgg); r.pesoPartite++ }
      for (const [altro] of chi) if (altro !== k) r.avversari.add(altro)
      // Le vittorie contano nelle competitive: una cooperativa la vincono tutti.
      if (!coop) {
        r.competitive++
        if (x.vincitore) {
          r.vittorie++
          g.vincitori.set(k, (g.vincitori.get(k) || 0) + 1)
        }
      }
    }
  }

  const righe = [...persone.values()].map((r) => ({
    ...r, avversari: r.avversari.size, giochi: r.giochi.size,
    peso: r.pesoPartite >= MIN_PARTITE_PESO ? r.pesoSomma / r.pesoPartite : null,
  }))
  const ordina = (campo, poi) => righe.filter((r) => r[campo] > 0)
    .sort((a, b) => b[campo] - a[campo] || (poi ? poi(a, b) : 0) || a.nome.localeCompare(b.nome, 'it'))

  const elencoGiochi = [...giochi.values()].sort((a, b) => b.partite - a.partite || a.nome.localeCompare(b.nome, 'it'))
    .map((g) => ({ ...g, campione: [...g.vincitori].sort((a, b) => b[1] - a[1])[0] || null }))

  return {
    nome,
    totale: partite.length,
    giocatori: righe.length,
    ospiti: righe.filter((r) => r.ospite).length,
    // A parità di vittorie davanti chi ne ha giocate meno.
    vittorie: ordina('vittorie', (a, b) => a.competitive - b.competitive),
    partite: ordina('partite', (a, b) => b.vittorie - a.vittorie),
    avversari: ordina('avversari', (a, b) => a.partite - b.partite),
    giochiDiversi: ordina('giochi', (a, b) => a.partite - b.partite),
    peso: ordina('peso', (a, b) => b.partite - a.partite),
    giochi: elencoGiochi,
  }
}

// Il posto in una classifica, con i pari merito: 1°, 2°, 2°, 4°…
export function posti(righe, campo) {
  let prima = null
  return righe.map((r, i) => {
    if (!prima || r[campo] !== prima.valore) prima = { valore: r[campo], posto: i + 1 }
    return { ...r, posto: prima.posto }
  })
}
