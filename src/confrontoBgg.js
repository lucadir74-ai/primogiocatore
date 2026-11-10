// Primo Giocatore - confronto con BoardGameGeek: cosa manca su BGG
// v1.0.0 - 202611110900
//
// Primo Giocatore manda a BGG solo le partite registrate qui dopo il
// collegamento: quelle arrivate da BG Stats o dallo storico di Board
// Game Arena no, perché di solito su BGG le ha già messe BG Stats. Ma
// non sempre: alcune restano fuori. Qui si legge tutto quello che c'è
// su BGG, lo si abbina alle partite dell'archivio e si trovano quelle
// che su BGG mancano davvero.
//
// Nel dubbio una partita si considera GIÀ su BGG: meglio una partita in
// meno su BGG che una doppia. Una partita dell'archivio «c'è già» se su
// BGG ne esiste una libera dello stesso gioco:
// 1. nello stesso giorno con gli stessi punteggi;
// 2. nel giorno prima o dopo con gli stessi punteggi (mezzanotte);
// 3. nello stesso giorno, comunque sia scritta.
// Ogni partita di BGG si usa una volta sola: tre uguali restano tre.

import { supabase, tutteLeRighe, fetchBgg } from './supabase.js'

const GIORNO = 86400000
const numero = (g) => Math.round(Date.parse(`${g}T00:00:00Z`) / GIORNO)
const aRoma = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' })

// I giorni in cui può cadere: gli import salvano l'ora così com'è
// scritta, le partite a mano l'istante vero.
function giorniDi(istante) {
  const d = new Date(istante)
  if (Number.isNaN(d.getTime())) return []
  return [...new Set([d.toISOString().slice(0, 10), aRoma.format(d)])]
}

const firma = (punti) => (punti || [])
  .filter((v) => v != null && v !== '').map(Number).sort((a, b) => a - b).join(',')

export function origineDi(p) {
  if (/^bgstats:/.test(p.chiave_esterna || '')) return 'bgstats'
  if (p.bga_tavolo != null || /^bga:/.test(p.chiave_esterna || '')) return 'bga'
  return 'mano'
}

// archivio: le tue partite ({ id, giocata_il, chiave_esterna, bgg_play_id,
//   bga_tavolo, bgg_richiesta_il, giochi: { bgg_id, nome }, partecipazioni })
// suBgg: le partite lette da BGG (api/bgg, azione partite)
export function confronta(archivio, suBgg) {
  // Le partite di BGG già legate a una dell'archivio (arrivate da lì, o
  // mandate da qui) non sono libere.
  const legate = new Set()
  for (const p of archivio) {
    if (p.bgg_play_id != null) legate.add(Number(p.bgg_play_id))
    const m = /^bgg:(\d+)$/.exec(p.chiave_esterna || '')
    if (m) legate.add(Number(m[1]))
  }

  const libere = new Map()   // numero BGG del gioco -> [{ giorno, firma, resta }]
  for (const b of suBgg) {
    if (legate.has(Number(b.bgg_play_id)) || !b.gioco?.bgg_id || !b.data) continue
    const g = numero(b.data)
    if (Number.isNaN(g)) continue
    const l = libere.get(b.gioco.bgg_id) || []
    l.push({ giorno: g, firma: firma((b.giocatori || []).map((x) => x.punteggio)), resta: Math.max(1, Number(b.quante) || 1) })
    libere.set(b.gioco.bgg_id, l)
  }

  let giaLegate = 0
  let senzaBgg = 0
  const daCercare = []
  for (const p of archivio) {
    if (p.bgg_play_id != null || /^bgg:/.test(p.chiave_esterna || '')) { giaLegate++; continue }
    if (!p.giochi?.bgg_id) { senzaBgg++; continue }
    const giorni = giorniDi(p.giocata_il).map(numero)
    if (!giorni.length) continue
    daCercare.push({ p, giorni, firma: firma((p.partecipazioni || []).map((x) => x.punteggio_totale)), trovata: false })
  }
  // Dalla più vecchia, così le partite uguali si consumano in ordine.
  daCercare.sort((a, b) => String(a.p.giocata_il).localeCompare(String(b.p.giocata_il)))

  const prendi = (x, adatta) => {
    const c = (libere.get(x.p.giochi.bgg_id) || []).find((l) => l.resta > 0 && adatta(l))
    if (!c) return
    c.resta -= 1
    x.trovata = true
  }
  const passate = [
    (x) => (l) => x.firma && l.firma === x.firma && x.giorni.includes(l.giorno),
    (x) => (l) => x.firma && l.firma === x.firma && x.giorni.some((g) => Math.abs(g - l.giorno) <= 1),
    (x) => (l) => x.giorni.includes(l.giorno),
  ]
  for (const passata of passate) {
    for (const x of daCercare) if (!x.trovata) prendi(x, passata(x))
  }

  const mancanti = daCercare.filter((x) => !x.trovata).map(({ p }) => ({
    id: p.id,
    giorno: /^(bgstats|bgg):/.test(p.chiave_esterna || '') ? String(p.giocata_il).slice(0, 10) : aRoma.format(new Date(p.giocata_il)),
    gioco: p.giochi.nome,
    origine: origineDi(p),
    richiesta: Boolean(p.bgg_richiesta_il),
  }))
  return {
    mancanti,
    suBgg: suBgg.length,
    giaSuBgg: giaLegate + daCercare.length - mancanti.length,
    senzaBgg,
  }
}

// Tutte le partite che BGG ha per questo nome utente.
async function leggiTutteBgg(utente, avanzamento) {
  const tutte = []
  let totale = 0
  for (let pagina = 1; pagina <= 500; pagina++) {
    avanzamento({ fase: 'Leggo da BGG', fatto: tutte.length, totale: totale || 100 })
    const r = await fetchBgg(`/api/bgg?azione=partite&utente=${encodeURIComponent(utente)}&pagina=${pagina}`)
    const dati = await r.json()
    if (!r.ok) throw new Error(dati.errore || 'Lettura da BGG non riuscita.')
    totale = dati.totale
    tutte.push(...dati.partite)
    if (tutte.length >= totale || dati.partite.length === 0) break
  }
  return [...new Map(tutte.map((p) => [p.bgg_play_id, p])).values()]
}

export async function confrontaConBgg({ utente, profiloId, avanzamento = () => {} }) {
  const suBgg = await leggiTutteBgg(utente, avanzamento)
  avanzamento({ fase: 'Confronto con il tuo archivio', fatto: 0, totale: 1 })
  const campi = (richiesta) => `id, giocata_il, chiave_esterna, bgg_play_id, bga_tavolo${richiesta ? ', bgg_richiesta_il' : ''},
    giochi ( bgg_id, nome ), partecipazioni ( punteggio_totale )`
  let archivio
  try {
    archivio = await tutteLeRighe(() => supabase.from('partite').select(campi(true)).eq('registrata_da', profiloId))
  } catch (e) {
    if (!/bgg_richiesta_il/.test(e?.message || '')) throw e
    throw new Error('Al database manca lo script SQL bgg_mancanti.sql: va lanciato una volta in Supabase.')
  }
  return confronta(archivio, suBgg)
}
