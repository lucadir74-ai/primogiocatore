// Primo Giocatore - importazione da BG Stats
// v1.20.0 - 202609161100
//
// Il file di BG Stats contiene array separati di games, players,
// locations e plays, collegati fra loro dagli "id" interni al file.
// Qui si traducono nello schema dell'app.

import { supabase } from './supabase'

/* I punteggi in BG Stats sono testo e possono essere somme scritte a
   mano, tipo "21+18+17-15". Le calcolo solo se contengono unicamente
   cifre e i segni, senza usare eval. */
export function leggiPunteggio(testo) {
  if (testo == null) return null
  const t = String(testo).trim().replace(/,/g, '.')
  if (!t) return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (!/^-?\d+(\.\d+)?([+-]\d+(\.\d+)?)+$/.test(t)) return null
  const pezzi = t.match(/[+-]?\d+(\.\d+)?/g) || []
  const somma = pezzi.reduce((tot, n) => tot + Number(n), 0)
  return Number.isFinite(somma) ? somma : null
}

/* Piazzamenti: uso il rank di BG Stats se c'è, altrimenti li ricavo
   dai punteggi, tenendo conto dei giochi dove vince chi fa meno. */
function piazzamenti(punteggi, vinceIlPiuAlto) {
  const validi = punteggi.map((p, i) => ({ i, v: p })).filter((x) => x.v != null)
  if (validi.length === 0) return punteggi.map(() => null)
  validi.sort((a, b) => (vinceIlPiuAlto ? b.v - a.v : a.v - b.v))
  const esito = punteggi.map(() => null)
  let ultimoValore = null
  let ultimaPos = 0
  validi.forEach((x, idx) => {
    if (x.v === ultimoValore) esito[x.i] = ultimaPos
    else { ultimaPos = idx + 1; ultimoValore = x.v; esito[x.i] = ultimaPos }
  })
  return esito
}

const aBlocchi = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/* Prima di importare si guarda cosa c'è dentro: quante partite, e
   soprattutto chi sono i giocatori, perché l'indicazione di "me" che
   BG Stats salva nel file può riferirsi a un profilo poco usato. */
export function analizzaBgstats(doc) {
  if (!doc?.plays || !doc?.games || !doc?.players) return null

  const partite = (doc.plays || []).filter((p) => !p.ignored)
  const conteggio = new Map()
  for (const p of partite) {
    for (const s of p.playerScores || []) {
      conteggio.set(s.playerRefId, (conteggio.get(s.playerRefId) || 0) + 1)
    }
  }

  const giocatori = (doc.players || [])
    .map((g) => ({ id: g.id, nome: g.name?.trim() || 'Senza nome', partite: conteggio.get(g.id) || 0 }))
    .filter((g) => g.partite > 0)
    .sort((a, b) => b.partite - a.partite)

  return {
    partite: partite.length,
    ignorate: (doc.plays || []).length - partite.length,
    giochi: new Set(partite.map((p) => p.gameRefId)).size,
    giocatori,
    meRefId: doc.userInfo?.meRefId ?? null,
    // Il più presente è quasi sempre chi possiede l'archivio.
    suggerito: giocatori[0]?.id ?? null,
  }
}

export async function importaBgstats(doc, profilo, idMiei = [], avanzamento = () => {}) {
  if (!doc?.plays || !doc?.games || !doc?.players) {
    throw new Error('Questo non sembra un backup di BG Stats.')
  }

  const giochiFile = new Map(doc.games.map((g) => [g.id, g]))
  const giocatoriFile = new Map(doc.players.map((p) => [p.id, p]))
  const luoghiFile = new Map((doc.locations || []).map((l) => [l.id, l]))
  // Chi sono io in questo file: scelto da chi importa, non dedotto.
  // Può essere più d'uno, se in BG Stats esistono profili doppi.
  const sonoIoSet = new Set(idMiei.length ? idMiei : [doc.userInfo?.meRefId].filter((x) => x != null))

  const partite = (doc.plays || []).filter((p) => !p.ignored)

  /* ---------- 1. Giochi ---------- */
  avanzamento({ fase: 'Giochi', fatto: 0, totale: 1 })

  const idGiochiUsati = new Set()
  for (const p of partite) {
    idGiochiUsati.add(p.gameRefId)
    for (const e of p.expansionPlays || []) idGiochiUsati.add(e.gameRefId)
  }

  const daCreare = [...idGiochiUsati].map((id) => giochiFile.get(id)).filter(Boolean)

  const righeGiochi = daCreare.map((g) => ({
    bgg_id: g.bggId || null,
    nome: g.name || g.bggName || 'Senza nome',
    anno: g.bggYear || null,
    min_giocatori: g.minPlayerCount || null,
    max_giocatori: g.maxPlayerCount || null,
    durata_minuti: g.maxPlayTime || null,
    immagine_url: g.urlThumb || null,
    tipo_punteggio: g.cooperative ? 'coop' : g.noPoints ? 'posizione' : 'punti',
    creato_da: profilo.id,
  }))

  // Chi ha un bggId si aggancia a quello; gli altri si cercano per nome.
  const conBgg = righeGiochi.filter((g) => g.bgg_id)
  const senzaBgg = righeGiochi.filter((g) => !g.bgg_id)

  for (const blocco of aBlocchi(conBgg, 200)) {
    const { error } = await supabase.from('giochi').upsert(blocco, { onConflict: 'bgg_id' })
    if (error) throw error
  }
  for (const g of senzaBgg) {
    const { data } = await supabase.from('giochi').select('id').ilike('nome', g.nome).maybeSingle()
    if (!data) {
      const { error } = await supabase.from('giochi').insert(g)
      if (error) throw error
    }
  }

  const { data: giochiSalvati, error: eg } = await supabase.from('giochi').select('id, bgg_id, nome')
  if (eg) throw eg
  const perBgg = new Map(giochiSalvati.filter((g) => g.bgg_id).map((g) => [g.bgg_id, g.id]))
  const perNome = new Map(giochiSalvati.map((g) => [g.nome.toLowerCase(), g.id]))
  const idGioco = (gFile) =>
    (gFile.bggId && perBgg.get(gFile.bggId)) || perNome.get((gFile.name || '').toLowerCase()) || null

  /* ---------- 2. Luoghi ---------- */
  avanzamento({ fase: 'Luoghi', fatto: 0, totale: 1 })

  const nomiLuoghi = [...new Set(partite.map((p) => luoghiFile.get(p.locationRefId)?.name?.trim()).filter(Boolean))]
  const { data: luoghiEsistenti } = await supabase.from('luoghi').select('id, nome')
  const mappaLuoghi = new Map((luoghiEsistenti || []).map((l) => [l.nome.toLowerCase(), l.id]))

  const luoghiNuovi = nomiLuoghi
    .filter((n) => !mappaLuoghi.has(n.toLowerCase()))
    .map((n) => ({ nome: n, tipo: 'altro', creato_da: profilo.id }))

  if (luoghiNuovi.length) {
    const { data, error } = await supabase.from('luoghi').insert(luoghiNuovi).select('id, nome')
    if (error) throw error
    for (const l of data) mappaLuoghi.set(l.nome.toLowerCase(), l.id)
  }

  /* ---------- 3. Giocatori (tutti ospiti tranne me) ---------- */
  avanzamento({ fase: 'Giocatori', fatto: 0, totale: 1 })

  const idGiocatoriUsati = new Set()
  for (const p of partite) for (const s of p.playerScores || []) idGiocatoriUsati.add(s.playerRefId)
  for (const id of sonoIoSet) idGiocatoriUsati.delete(id)

  const nomiOspiti = [...idGiocatoriUsati]
    .map((id) => giocatoriFile.get(id)?.name?.trim())
    .filter(Boolean)

  const { data: ospitiEsistenti } = await supabase.from('ospiti').select('id, nome')
  const mappaOspiti = new Map((ospitiEsistenti || []).map((o) => [o.nome.toLowerCase(), o.id]))

  const ospitiNuovi = [...new Set(nomiOspiti)]
    .filter((n) => !mappaOspiti.has(n.toLowerCase()))
    .map((n) => ({ nome: n, creato_da: profilo.id }))

  for (const blocco of aBlocchi(ospitiNuovi, 200)) {
    const { data, error } = await supabase.from('ospiti').insert(blocco).select('id, nome')
    if (error) throw error
    for (const o of data) mappaOspiti.set(o.nome.toLowerCase(), o.id)
  }

  /* ---------- 4. Partite già importate ---------- */
  const { data: gia } = await supabase
    .from('partite').select('chiave_esterna')
    .eq('registrata_da', profilo.id).not('chiave_esterna', 'is', null)
  const chiaviPresenti = new Set((gia || []).map((r) => r.chiave_esterna))

  const daImportare = partite.filter((p) => !chiaviPresenti.has(`bgstats:${p.uuid}`))
  const saltate = partite.length - daImportare.length

  /* ---------- 5. Partite ---------- */
  let fatte = 0
  let senzaGioco = 0

  for (const blocco of aBlocchi(daImportare, 50)) {
    const righe = []
    const originali = []

    for (const p of blocco) {
      const gFile = giochiFile.get(p.gameRefId)
      const gid = gFile ? idGioco(gFile) : null
      if (!gid) { senzaGioco++; continue }

      // Le espansioni non hanno una tabella propria: finiscono nelle note,
      // così l'informazione non si perde in attesa di gestirle davvero.
      const espansioni = (p.expansionPlays || [])
        .map((e) => giochiFile.get(e.gameRefId)?.name)
        .filter(Boolean)
      const note = [p.comments?.trim(), espansioni.length ? `Espansioni: ${espansioni.join(', ')}` : null]
        .filter(Boolean).join(' — ') || null

      righe.push({
        gioco_id: gid,
        luogo_id: mappaLuoghi.get(luoghiFile.get(p.locationRefId)?.name?.trim()?.toLowerCase()) || null,
        giocata_il: (p.playDate || p.entryDate || '').replace(' ', 'T') || new Date().toISOString(),
        durata_minuti: p.durationMin || null,
        tipo_punteggio: gFile.cooperative ? 'coop' : gFile.noPoints ? 'posizione' : 'punti',
        a_squadre: Boolean(p.usesTeams),
        esito_coop: gFile.cooperative
          ? ((p.playerScores || []).some((s) => s.winner) ? 'vinta' : 'persa')
          : null,
        note,
        chiave_esterna: `bgstats:${p.uuid}`,
        registrata_da: profilo.id,
      })
      originali.push({ play: p, gFile })
    }

    if (righe.length === 0) continue

    const { data: inserite, error } = await supabase.from('partite').insert(righe).select('id')
    if (error) throw error

    const partecipazioni = []
    inserite.forEach((partita, i) => {
      const { play, gFile } = originali[i]
      const punteggi = (play.playerScores || []).map((s) => leggiPunteggio(s.score))
      const daRank = (play.playerScores || []).some((s) => s.rank)
      const pos = daRank
        ? (play.playerScores || []).map((s) => s.rank || null)
        : piazzamenti(punteggi, gFile.highestWins !== false)

      let ioGiaMesso = false
      ;(play.playerScores || []).forEach((s, k) => {
        const sonoIo = sonoIoSet.has(s.playerRefId)
        // Se due profili doppi compaiono nella stessa partita, il secondo
        // si scarta: nel database una persona può esserci una volta sola.
        if (sonoIo && ioGiaMesso) return
        if (sonoIo) ioGiaMesso = true
        const nome = giocatoriFile.get(s.playerRefId)?.name?.trim()
        const ospiteId = sonoIo ? null : mappaOspiti.get((nome || '').toLowerCase()) || null
        if (!sonoIo && !ospiteId) return

        partecipazioni.push({
          partita_id: partita.id,
          utente_id: sonoIo ? profilo.id : null,
          ospite_id: ospiteId,
          punteggio_totale: punteggi[k],
          posizione: gFile.cooperative ? null : pos[k],
          vincitore: Boolean(s.winner),
          ruolo: s.role?.trim() || null,
          squadra: play.usesTeams && s.team != null ? String(s.team) : null,
          ordine_turno: s.seatOrder || (s.startPlayer ? 1 : null),
          primo_giocatore: Boolean(s.startPlayer) || s.seatOrder === 1,
        })
      })
    })

    for (const bloccoPart of aBlocchi(partecipazioni, 400)) {
      const { error: e2 } = await supabase.from('partecipazioni').insert(bloccoPart)
      if (e2) throw e2
    }

    fatte += inserite.length
    avanzamento({ fase: 'Partite', fatto: fatte, totale: daImportare.length })
  }

  return { importate: fatte, saltate, senzaGioco, giochi: daCreare.length }
}
