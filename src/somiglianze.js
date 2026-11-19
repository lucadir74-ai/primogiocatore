// Primo Giocatore - quale iscritto è questo ospite?
// v1.0.0 - 202611181900 (nome E cognome, anche scritti un po' diversi)
//
// Chi si iscrive ha spesso già giocato come ospite, scritto da altri a
// modo loro: «Ale Rossi», «Alessandro Rosi», «Rossi Alessandro»,
// «D'Angelo» / «Dangelo», «Di Marco» / «Dimarco». Qui si cercano gli
// ospiti che hanno lo stesso cognome (o quasi: una lettera sbagliata) e
// un nome che non lo contraddice. Il nome da solo non basta mai.
// Decide sempre una persona: qui si propone e basta.

// Le parole di un nome: minuscole, senza accenti, apostrofi e punti.
export function parole(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[\s'’`.,\-_/]+/).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean)
}
export const piatto = (t) => parole(t).join('')

// Cerca un iscritto scrivendo come lo si conosce: nick, nome, cognome, in
// qualsiasi ordine («irene ragni», «ragni», «syli»). Prima chi ha più
// parole in comune; basta una parola per comparire.
export function cercaPersone(persone, testo, quanti = 8) {
  const cercate = parole(testo)
  if (!cercate.length) return persone.slice(0, quanti)
  const tutto = piatto(testo)
  return persone
    .map((p) => {
      const sue = parole([p.nickname, p.nome, p.cognome].filter(Boolean).join(' '))
      let punti = cercate.filter((w) => sue.some((s) => s.startsWith(w) || (w.length >= 3 && s.includes(w)))).length
      // Il nick scritto tutto attaccato o con spazi («syli ael»).
      if (tutto.length >= 3 && piatto(p.nickname).includes(tutto)) punti = Math.max(punti, cercate.length)
      return { p, punti }
    })
    .filter((x) => x.punti > 0)
    .sort((a, b) => b.punti - a.punti
      || String(a.p.nickname || a.p.nome || '').localeCompare(String(b.p.nickname || b.p.nome || ''), 'it'))
    .slice(0, quanti)
    .map((x) => x.p)
}

// Quante lettere cambiare per passare da una parola all'altra.
function distanza(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9
  let prima = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const riga = [i]
    for (let j = 1; j <= b.length; j++) {
      riga[j] = Math.min(prima[j] + 1, riga[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prima = riga
  }
  return prima[b.length]
}

// Stesso cognome: uguale, oppure una lettera di differenza se è lungo.
function cognomeSimile(x, y) {
  if (!x || !y) return 0
  if (x === y) return 2
  return Math.min(x.length, y.length) >= 4 && distanza(x, y) <= 1 ? 1 : 0
}

// Il nome dell'ospite non contraddice quello dell'iscritto: uguale, un
// pezzo («Ale» / «Alessandro»), l'iniziale («A.»), un errore di battitura.
function nomeSimile(x, nomi) {
  if (!x || nomi.length === 0) return 0
  const intero = nomi.join('')
  const primo = nomi[0]
  if (x === intero || x === primo) return 2
  if (x.length === 1) return x === primo[0] ? 1 : 0
  if (x.length >= 3 && (primo.startsWith(x) || x.startsWith(primo) || intero.startsWith(x))) return 1
  if (primo.length >= 4 && distanza(x, primo) <= (primo.length >= 7 ? 2 : 1)) return 1
  return 0
}

// Nome e cognome dell'iscritto. Se il cognome manca ed è scritto tutto
// nel nome («Mario Rossi»), la prima parola è il nome.
function nomeCognome(p) {
  let n = parole(p.nome)
  let c = parole(p.cognome)
  if (c.length === 0 && n.length >= 2) { c = n.slice(1); n = n.slice(0, 1) }
  return { n, c: c.join('') }
}

// Le parole di ospiti e iscritti si calcolano una volta sola: le coppie
// da confrontare possono essere centinaia di migliaia.
const cacheOspiti = new WeakMap()
const cachePersone = new WeakMap()
function preparaOspite(ospite) {
  let x = cacheOspiti.get(ospite)
  if (!x) {
    // Il cognome a parte si aggiunge solo se il nome non lo contiene già
    // (la pagina Ospiti mostra il nome intero).
    const giaDentro = ospite.cognome && piatto(ospite.nome).endsWith(piatto(ospite.cognome))
    const g = parole([ospite.nome, giaDentro ? null : ospite.cognome].filter(Boolean).join(' '))
    x = { g, tutto: g.join('') }
    cacheOspiti.set(ospite, x)
  }
  return x
}
function preparaPersona(p) {
  let x = cachePersone.get(p)
  if (!x) {
    x = { ...nomeCognome(p), chiavi: [piatto(p.nickname), piatto(p.bga_username)].filter((k) => k.length >= 4) }
    cachePersone.set(p, x)
  }
  return x
}

// Quanto l'ospite somiglia all'iscritto: 0 niente, 1 probabile, 2 sicuro
// (nome e cognome uguali, o nick uguale).
export function somiglianza(ospite, p) {
  const { g, tutto } = preparaOspite(ospite)
  const { n, c, chiavi } = preparaPersona(p)
  if (ospite.bga_id && p.bga_id && String(ospite.bga_id) === String(p.bga_id)) return 2
  if (chiavi.includes(tutto)) return 2
  if (g.length < 2) return 0                 // serve nome E cognome
  if (!c || n.length === 0) return 0
  // Scorciatoia: il cognome dell'iscritto deve stare (quasi) all'inizio o in fondo.
  if (!tutto.includes(c.slice(0, 3)) && !tutto.includes(c.slice(-3))) return 0
  let meglio = 0
  // Il cognome può essere in fondo («Mario Rossi») o in testa («Rossi Mario»),
  // e fatto di più parole («Di Marco», «De Angelis»).
  for (let i = 1; i < g.length; i++) {
    const prima = g.slice(0, i).join('')
    const dopo = g.slice(i).join('')
    for (const [nomeG, cognomeG] of [[prima, dopo], [dopo, prima]]) {
      const sc = cognomeSimile(cognomeG, c)
      if (!sc) continue
      const sn = nomeSimile(nomeG, n)
      if (!sn) continue
      // Un errore alla volta: se il cognome è solo simile, il nome deve essere uguale.
      if (sc === 1 && sn === 1) continue
      meglio = Math.max(meglio, sc === 2 && sn === 2 ? 2 : 1)
    }
  }
  return meglio
}

// Prima di collegare un ospite a un account: cosa non torna. Ogni avviso
// è { forte, testo }; forte = quasi certamente un'altra persona.
// Nessun avviso se nome e cognome (o nick, o numero BGA) sono uguali.
export function avvisiCollegamento(ospite, p) {
  if (!ospite || !p) return []
  if (somiglianza(ospite, p) === 2) return []
  const avvisi = []
  const { g } = preparaOspite(ospite)
  const { n, c } = preparaPersona(p)
  const parlanti = String([ospite.nome, ospite.cognome].filter(Boolean).join(' ')).trim().split(/\s+/)

  if (ospite.bga_id && p.bga_id && String(ospite.bga_id) !== String(p.bga_id)) {
    avvisi.push({ forte: true, testo: 'Su Board Game Arena sono due giocatori diversi (numeri BGA diversi).' })
  } else if (ospite.bga_id) {
    avvisi.push({ forte: false, testo: 'Questo nome viene da Board Game Arena: controlla che il giocatore di quei tavoli sia proprio questa persona.' })
  }

  if (g.length < 2) {
    avvisi.push({ forte: false, testo: `C'è solo «${parlanti.join(' ')}», senza cognome: potrebbe essere un'altra persona con lo stesso nome.` })
  } else if (!c) {
    avvisi.push({ forte: false, testo: 'L’account non ha il cognome: non si può confrontare.' })
  } else {
    const restoOspite = g.slice(1)
    const cognomeOk = g.some((w, i) => i > 0 && cognomeSimile(w, c)) || cognomeSimile(restoOspite.join(''), c)
      || cognomeSimile(g[0], c)
    if (!cognomeOk) {
      avvisi.push({ forte: true, testo: `Il cognome non corrisponde: qui «${parlanti.slice(1).join(' ')}», nell’account «${[p.cognome].filter(Boolean).join(' ') || c}».` })
    }
  }
  if (g.length && n.length && !nomeSimile(g[0], n) && !g.some((w) => nomeSimile(w, n))) {
    avvisi.push({ forte: true, testo: `Il nome non corrisponde: qui «${parlanti[0]}», nell’account «${p.nome || ''}».` })
  }
  return avvisi
}

// Per ogni iscritto, gli ospiti che sembrano lui. `no` è l'insieme delle
// coppie già escluse («ospite|utente»). I più sicuri e con più partite prima.
export function propostePerIscritto(ospiti, persone, no = new Set()) {
  const perUtente = new Map()
  // Gli ospiti di una parola sola (quasi tutti gli avversari di BGA)
  // possono essere solo un nick o un numero BGA: si cercano per chiave,
  // senza confrontarli con ogni iscritto.
  const perChiave = new Map()
  for (const p of persone) {
    const chiavi = [...preparaPersona(p).chiavi, p.bga_id ? `#${p.bga_id}` : null].filter(Boolean)
    for (const k of chiavi) { if (!perChiave.has(k)) perChiave.set(k, []); perChiave.get(k).push(p) }
  }
  for (const o of ospiti) {
    const corti = preparaOspite(o).g.length < 2
    const daProvare = corti
      ? [...(perChiave.get(preparaOspite(o).tutto) || []), ...(o.bga_id ? perChiave.get(`#${o.bga_id}`) || [] : [])]
      : persone
    for (const p of new Set(daProvare)) {
      if (no.has(`${o.id}|${p.id}`)) continue
      const forza = somiglianza(o, p)
      if (!forza) continue
      if (!perUtente.has(p.id)) perUtente.set(p.id, { utente: p, ospiti: [] })
      perUtente.get(p.id).ospiti.push({ ospite: o, forza })
    }
  }
  // Chi somiglia a più iscritti lo dice, così si guarda meglio.
  const quanti = new Map()
  for (const g of perUtente.values()) for (const x of g.ospiti) quanti.set(x.ospite.id, (quanti.get(x.ospite.id) || 0) + 1)
  const gruppi = [...perUtente.values()].map((g) => {
    g.ospiti = g.ospiti
      .map((x) => ({ ...x, conteso: quanti.get(x.ospite.id) > 1 }))
      .sort((a, b) => b.forza - a.forza || b.ospite.partite - a.ospite.partite)
    g.sicuro = g.ospiti.every((x) => x.forza === 2 && !x.conteso)
    g.partite = g.ospiti.reduce((s, x) => s + (x.ospite.partite || 0), 0)
    return g
  })
  return gruppi.sort((a, b) => Number(b.sicuro) - Number(a.sicuro) || b.partite - a.partite
    || String(a.utente.nickname || a.utente.nome).localeCompare(String(b.utente.nickname || b.utente.nome), 'it'))
}
