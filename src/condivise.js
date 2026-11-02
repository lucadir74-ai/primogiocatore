// Primo Giocatore - partite condivise
// v1.3.0 - 202611030200 (serve una prova per fondere due copie: punteggi poco comuni o un account in comune)
//
// La stessa serata registrata da due persone (ognuna nel proprio
// archivio, per esempio importando BG Stats o sincronizzando BGG)
// deve contare e comparire una volta sola. Le partite restano tutte
// nel database: l'unione avviene solo quando si mostrano.
//
// Due partite di archivi diversi sono la stessa quando hanno lo stesso
// gioco e poi:
// - entrambe con i punteggi: gli stessi punteggi, nello stesso giorno
//   o in giorni vicini. Il giorno vicino serve per le serate che
//   finiscono dopo mezzanotte: BG Stats salva l'ora, BGG solo la data,
//   e la stessa partita può cadere su due date diverse. Se i punteggi
//   sono banali (1-0, 7-5) serve anche un account in comune;
// - a una mancano i punteggi: stesso giorno, stesso numero di giocatori
//   e almeno un account in comune.
// L'accoppiamento è uno a uno: tre partite uguali nello stesso giorno
// in due archivi restano tre, non una.

const giornoDi = (p) => String(p.giocata_il || '').slice(0, 10)
const numeroGiorno = (g) => Math.floor(Date.parse(`${g}T00:00:00Z`) / 86400000)

const punteggiDi = (p) => (p.partecipazioni || [])
  .map((x) => x.punteggio_totale)
  .filter((v) => v != null)
  .map(Number)
  .sort((a, b) => a - b)

// Gli account presenti in una partita (giocatori con account o ospiti
// collegati a un account), più chi l'ha registrata.
function accountDi(p) {
  const s = new Set()
  if (p.registrata_da) s.add(p.registrata_da)
  for (const x of p.partecipazioni || []) {
    const k = x.utente_id || x.ospiti?.utente_collegato
    if (k) s.add(k)
  }
  return s
}
const inComune = (a, b) => [...a._account].some((k) => b._account.has(k))
// Punteggi che difficilmente si ripetono per caso: un 1-0 o un 7-5 sì,
// un 82-75-61 no.
const distintivi = (punti) => punti.length >= 2 && punti.reduce((t, v) => t + Math.abs(v), 0) >= 20

// Due copie sono la stessa partita solo con una prova: gli stessi
// punteggi poco comuni, oppure almeno una persona con account in comune
// (chi registra compare nell'altra copia). Senza prova restano due:
// due tavoli dello stesso gioco nella stessa serata non si fondono più.
function compatibili(a, b, stessoGiorno) {
  const pa = a._punti
  const pb = b._punti
  const comune = inComune(a, b)
  if (pa.length && pb.length) {
    const uguali = pa.length === pb.length && pa.every((v, i) => v === pb[i])
    return uguali && (comune || distintivi(pa))
  }
  return stessoGiorno && comune && (a.p.partecipazioni || []).length === (b.p.partecipazioni || []).length
}

// preferiti: chi registra le copie da tenere, in ordine di preferenza
// (di solito la persona di cui si guardano i dati, poi chi sta usando
// l'app). Restituisce le partite nell'ordine originale.
// suUnione (facoltativo): chiamata con (tenuta, scartata) per ogni copia
// assorbita; il Primeggio la usa per non perdere i giocatori con account
// che compaiono solo nella copia scartata.
export function unisciCondivise(partite, preferiti = [], suUnione = null) {
  const rango = (p) => {
    const i = preferiti.indexOf(p.registrata_da)
    return i === -1 ? preferiti.length : i
  }

  // Si guarda solo dove ci sono almeno due archivi per lo stesso gioco.
  const perGioco = new Map()
  partite.forEach((p, i) => {
    if (!p.giochi?.id) return
    const g = perGioco.get(p.giochi.id) || []
    g.push({ p, i })
    perGioco.set(p.giochi.id, g)
  })

  const scartate = new Set()
  for (const gruppo of perGioco.values()) {
    if (new Set(gruppo.map((x) => x.p.registrata_da)).size < 2) continue

    const ordinate = gruppo
      .map((x) => ({ ...x, _giorno: numeroGiorno(giornoDi(x.p)), _punti: punteggiDi(x.p), _account: accountDi(x.p) }))
      .sort((a, b) => rango(a.p) - rango(b.p) || a.i - b.i)

    const tenutePerGiorno = new Map()   // numero giorno -> [{ ..., assorbiti }]
    for (const x of ordinate) {
      let gemella = null
      for (const d of [0, -1, 1]) {
        const candidate = tenutePerGiorno.get(x._giorno + d) || []
        gemella = candidate.find((t) =>
          t.p.registrata_da !== x.p.registrata_da &&
          !t.assorbiti.has(x.p.registrata_da) &&
          compatibili(t, x, d === 0))
        if (gemella) break
      }
      if (gemella) {
        gemella.assorbiti.add(x.p.registrata_da)
        scartate.add(x.i)
        if (suUnione) suUnione(gemella.p, x.p)
      } else {
        const l = tenutePerGiorno.get(x._giorno) || []
        l.push({ ...x, assorbiti: new Set() })
        tenutePerGiorno.set(x._giorno, l)
      }
    }
  }

  return scartate.size ? partite.filter((_, i) => !scartate.has(i)) : partite
}
