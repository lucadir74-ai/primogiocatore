// Primo Giocatore - partite da BoardGameGeek
// v1.3.0 - 202610041200
//
// La strada per le partite di BG Stats (e di Board Game Arena, che BG
// Stats importa) è BGG: BG Stats le pubblica lì, questo le porta qui.
// Serve sia al tasto "Aggiorna da BGG" sia all'aggiornamento
// automatico all'apertura dell'app.
//
// Doppioni: una partita già arrivata da BGG si riconosce dal suo
// numero BGG; una arrivata per altre strade (backup di BG Stats,
// registrata a mano) dall'impronta, cioè gioco, giorno e punteggi.

import { supabase, tutteLeRighe } from './supabase'
import { impronta, improntePresenti, giaPresente } from './impronta'
import { assicuraGiochi, trovaOCreaLuogo, mappaPerNome } from './giochiMiei'

const CHIAVE_ULTIMA = 'primo-giocatore:ultima-sincro-bgg'
const CHIAVE_COMPLETA = 'primo-giocatore:ultimo-controllo-completo-bgg'
const CHIAVE_IN_CORSO = 'primo-giocatore:sincro-bgg-in-corso'
// Il controllo rapido legge una pagina sola: si può fare spesso.
const OGNI_ORE = 1
// Il margine all'indietro: una partita pubblicata in ritardo ha una
// data vecchia, e BGG filtra per data della partita, non di pubblicazione.
const INDIETRO_GIORNI = 30
// Le partite più vecchie del margine (per esempio un blocco di partite
// BGA importate in BG Stats mesi dopo) le trova solo il controllo
// completo, che parte da solo una volta a settimana.
const COMPLETO_OGNI_GIORNI = 7

const PAROLE_ONLINE = ['arena', 'bga', 'yucata', 'tabletopia', 'boiteajeux', 'online', 'steam']

export function ultimaSincro() {
  try { return localStorage.getItem(CHIAVE_ULTIMA) } catch { return null }
}

function segnaCompleto() {
  try { localStorage.setItem(CHIAVE_COMPLETA, new Date().toISOString()) } catch { /* niente */ }
}

function serveCompleto() {
  try {
    const c = localStorage.getItem(CHIAVE_COMPLETA)
    return !c || Date.now() - new Date(c) > COMPLETO_OGNI_GIORNI * 86400000
  } catch { return false }
}

// Da che giorno leggere: l'ultima partita arrivata da BGG, meno il
// margine. Sta nel database, quindi vale su ogni dispositivo.
// null se da BGG non è mai arrivato niente: allora si legge tutto.
export async function dataDiPartenza(profiloId) {
  const { data, error } = await supabase.from('partite')
    .select('giocata_il')
    .eq('registrata_da', profiloId)
    .like('chiave_esterna', 'bgg:%')
    .order('giocata_il', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  const d = new Date(new Date(data[0].giocata_il).getTime() - INDIETRO_GIORNI * 86400000)
  return d.toISOString().slice(0, 10)
}

function segnaSincro() {
  const adesso = new Date().toISOString()
  try { localStorage.setItem(CHIAVE_ULTIMA, adesso) } catch { /* resta solo per ora */ }
  return adesso
}

// Legge da BGG e segna ogni partita: già importata (si scarta),
// sospetta (sembra già presente) o nuova. dal: 'AAAA-MM-GG' o niente.
export async function leggiPartiteBgg({ utente, profiloId, dal = null, avanzamento = () => {} }) {
  const tutte = []
  let pagina = 1
  let totale = 0
  // BGG dà cento partite per pagina. Prima ci si fermava a 3000: chi
  // ne ha di più perdeva le più vecchie. Ora si legge tutto, fino a
  // 50.000 partite, cioè ben oltre qualsiasi archivio reale.
  while (pagina <= 500) {
    avanzamento({ fase: 'Leggo da BGG', fatto: tutte.length, totale: totale || 100 })
    const r = await fetch(`/api/bgg?azione=partite&utente=${encodeURIComponent(utente)}&pagina=${pagina}`
      + (dal ? `&dal=${dal}` : ''))
    const dati = await r.json()
    if (!r.ok) throw new Error(dati.errore || 'Lettura da BGG non riuscita.')
    totale = dati.totale
    tutte.push(...dati.partite)
    if (tutte.length >= totale || dati.partite.length === 0) break
    pagina++
  }

  // Una lettura lunga dura minuti: se intanto su BGG entrano partite
  // nuove (per esempio BG Stats che sta pubblicando), le pagine
  // scorrono e alcune partite compaiono due volte. Una per numero BGG.
  // Letto tutto l'archivio: il controllo completo è fatto.
  if (!dal) segnaCompleto()

  const uniche = [...new Map(tutte.map((p) => [p.bgg_play_id, p])).values()]
  const doppie = tutte.length - uniche.length
  tutte.length = 0
  tutte.push(...uniche)

  // Quelle già arrivate da BGG si riconoscono dal numero BGG.
  const gia = await tutteLeRighe(() => supabase.from('partite')
    .select('chiave_esterna').eq('registrata_da', profiloId).like('chiave_esterna', 'bgg:%'))
  const giaBgg = new Set(gia.map((x) => x.chiave_esterna))
  const daGuardare = tutte.filter((p) => !giaBgg.has(`bgg:${p.bgg_play_id}`))

  const presenti = await improntePresenti(supabase, profiloId)
  const bggIds = [...new Set(daGuardare.map((p) => p.gioco?.bgg_id).filter(Boolean))]
  const perBgg = new Map()
  for (let i = 0; i < bggIds.length; i += 200) {
    const { data } = await supabase.from('giochi').select('id, bgg_id').in('bgg_id', bggIds.slice(i, i + 200))
    for (const g of data || []) perBgg.set(g.bgg_id, g.id)
  }

  // Dalla più vecchia, così i conteggi delle partite uguali si
  // consumano nell'ordine giusto.
  const conStato = [...daGuardare].reverse().map((p) => {
    const giocoId = perBgg.get(p.gioco?.bgg_id)
    const imp = giocoId
      ? impronta({ giocoId, giocataIl: p.data, punteggi: p.giocatori.map((g) => g.punteggio) })
      : null
    const esito = giaPresente(presenti, imp)
    return { ...p, impronta: imp, sospetta: esito.presente, debole: esito.modo === 'debole' }
  })

  return {
    partite: conStato,
    sospette: conStato.filter((p) => p.sospetta).length,
    deboli: conStato.filter((p) => p.debole).length,
    senzaGioco: conStato.filter((p) => !perBgg.has(p.gioco?.bgg_id)).length,
    giaImportate: tutte.length - daGuardare.length,
    doppieInLettura: doppie,
    utente,
  }
}

// Scrive le partite scelte. Restituisce quante sono entrate.
export async function importaPartiteBgg({ partite, utente, profiloId, avanzamento = () => {} }) {
  const conGioco = partite.filter((p) => p.gioco?.bgg_id)

  // I giochi in un colpo solo: quelli già nell'app si riusano.
  const unici = [...new Map(conGioco.map((p) => [p.gioco.bgg_id, p.gioco])).values()]
  const giochi = await assicuraGiochi(unici.map((g) => ({ bgg_id: g.bgg_id, nome: g.nome || 'Senza nome' })))
  const idGioco = new Map(giochi.map((g) => [g.bgg_id, g.id]))

  const esistenti = await tutteLeRighe(() => supabase.from('ospiti')
    .select('id, nome, creato_da').is('utente_collegato', null))
  const ospiti = mappaPerNome(esistenti, profiloId)
  const luoghi = new Map()

  let fatte = 0
  for (const p of conGioco) {
    avanzamento({ fase: 'Importo', fatto: fatte, totale: conGioco.length })
    const giocoId = idGioco.get(p.gioco.bgg_id)
    if (!giocoId) continue

    let luogoId = null
    if (p.luogo) {
      const k = p.luogo.toLowerCase()
      if (!luoghi.has(k)) {
        const online = PAROLE_ONLINE.some((w) => k.includes(w))
        luoghi.set(k, await trovaOCreaLuogo(p.luogo, profiloId, online ? 'online' : 'altro'))
      }
      luogoId = luoghi.get(k)
    }

    const punteggi = p.giocatori.map((g) => g.punteggio)
    const { data: partita, error: e1 } = await supabase.from('partite').insert({
      gioco_id: giocoId,
      luogo_id: luogoId,
      giocata_il: `${p.data}T20:00:00`,
      durata_minuti: p.durata_minuti,
      tipo_punteggio: 'punti',
      note: p.note,
      chiave_esterna: `bgg:${p.bgg_play_id}`,
      impronta: impronta({ giocoId, giocataIl: p.data, punteggi }),
      registrata_da: profiloId,
    }).select('id').single()
    // Già entrata (un import interrotto, o una lettura con doppioni):
    // si salta, non si ferma tutto.
    if (e1?.code === '23505') continue
    if (e1) throw e1

    // Il proprietario dell'archivio si riconosce dal nome utente BGG;
    // gli altri entrano come ospiti, riusando i tuoi quando il nome coincide.
    const righe = []
    for (const g of p.giocatori) {
      const sonoIo = g.username && g.username.toLowerCase() === utente.toLowerCase()
      let ospiteId = null
      if (!sonoIo) {
        const nome = (g.nome || 'Sconosciuto').trim()
        ospiteId = ospiti.get(nome.toLowerCase())
        if (!ospiteId) {
          const { data: creato, error } = await supabase.from('ospiti')
            .insert({ nome, creato_da: profiloId }).select('id').single()
          if (error) throw error
          ospiteId = creato.id
          ospiti.set(nome.toLowerCase(), ospiteId)
        }
      }
      righe.push({
        partita_id: partita.id,
        utente_id: sonoIo ? profiloId : null,
        ospite_id: ospiteId,
        punteggio_totale: g.punteggio,
        vincitore: g.vincitore,
        ordine_turno: g.posizione,
        primo_giocatore: g.posizione === 1,
      })
    }
    if (righe.length) {
      const { error: e2 } = await supabase.from('partecipazioni').insert(righe)
      if (e2) throw e2
    }
    fatte++
  }

  segnaSincro()
  return { fatte, saltate: partite.length - fatte }
}

// All'apertura dell'app: legge solo le partite recenti (una pagina,
// pochi secondi) e importa da sola quelle nuove. Una volta a settimana
// rilegge tutto l'archivio, per le partite pubblicate con date vecchie.
// Quelle che sembrano già presenti non le tocca: restano da guardare
// con il tasto. Se da BGG non è mai arrivato niente non parte: il
// primo import completo si fa a mano, dove si vede cosa succede.
export async function sincronizzaSeServe(profilo) {
  const utente = profilo?.bgg_username?.trim()
  if (!utente) return null
  const ultima = ultimaSincro()
  if (ultima && Date.now() - new Date(ultima) < OGNI_ORE * 3600000) return null

  try {
    const inCorso = Number(localStorage.getItem(CHIAVE_IN_CORSO) || 0)
    if (Date.now() - inCorso < 5 * 60000) return null
    localStorage.setItem(CHIAVE_IN_CORSO, String(Date.now()))
  } catch { /* senza memoria si prova lo stesso */ }

  try {
    const dal = await dataDiPartenza(profilo.id)
    if (!dal) return null
    const letto = await leggiPartiteBgg({ utente, profiloId: profilo.id, dal: serveCompleto() ? null : dal })
    const nuove = letto.partite.filter((p) => !p.sospetta)
    const { fatte } = nuove.length
      ? await importaPartiteBgg({ partite: nuove, utente, profiloId: profilo.id })
      : { fatte: 0 }
    if (!nuove.length) segnaSincro()
    return { fatte, daControllare: letto.sospette }
  } finally {
    try { localStorage.removeItem(CHIAVE_IN_CORSO) } catch { /* niente */ }
  }
}
