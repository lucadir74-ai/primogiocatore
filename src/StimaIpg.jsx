// Primo Giocatore - quanto cambia l'IPG con le partite appena entrate
// v1.2.0 - 202611231900 (anche per le partite importate da BG Stats)
//
// Per ogni giocatore con un account: l'IPG di quel gioco prima e dopo, e
// di quanto si muove l'IPG globale. È una STIMA: parte dai valori
// dell'ultimo ricalcolo (tabella ipg, con forza mu e incertezza sigma per
// gioco) e applica le sole partite nuove, in ordine di data, con lo
// stesso motore del server (openskill, src/primeggioCalcolo.js). Il valore
// vero arriva col ricalcolo, di notte o dal tasto in Statistiche: può
// differire un poco se intanto sono entrate altre partite, o se le
// partite sono più vecchie di altre già registrate. Gli ospiti senza
// account giocano come avversari nuovi (la loro forza non è salvata).
//
// Le partite che il Primeggio non conta (cooperative, a squadre, senza un
// vincitore riconoscibile) qui non contano. Quelle già comprese
// nell'ultimo ricalcolo si saltano: altrimenti conterebbero due volte.

import { useEffect, useState } from 'react'
import { rating, rate } from 'openskill'
import { supabase, tutteLeRighe, nomeOspite, daMostrare } from './supabase'
import { posti, ipgDa, pesoEffettivo, TETTO_PARTITE } from './primeggioCalcolo.js'

const segno = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const MASSIMO_PARTITE = 30   // oltre (es. il primo import di tutto lo storico) la stima non serve

// Media pesata come sul server: peso BGG × partite (con il tetto).
function globale(righe, pesi) {
  let somma = 0
  let tot = 0
  for (const r of righe) {
    const w = pesoEffettivo(pesi.get(String(r.gioco_id))) * Math.min(r.partite, TETTO_PARTITE)
    somma += r.ipg * w
    tot += w
  }
  return tot ? somma / tot : null
}

// partite: [{ giocoId, giocoNome, giocataIl, giocatori: [{ nome, utente_id, ospite_id, posizione, punteggio_totale, vincitore }] }]
// Restituisce, per ogni account: { nome, giochi: [{ nome, prima, dopo, delta, nuovo }], globale }.
export async function calcolaStimaIpg(partite) {
  // Una persona una volta sola per partita, come nel calcolo del server.
  const valide = []
  for (const p of [...partite].sort((a, b) => String(a.giocataIl || '').localeCompare(String(b.giocataIl || '')))) {
    const viste = new Set()
    const righe = (p.giocatori || []).filter((g) => {
      const k = g.utente_id || (g.ospite_id ? `ospite:${g.ospite_id}` : null)
      if (!k || viste.has(k)) return false
      viste.add(k)
      return true
    })
    if (righe.length < 2 || !righe.some((r) => r.utente_id)) continue
    const rank = posti(righe)
    if (rank) valide.push({ ...p, giocoId: String(p.giocoId), righe, rank })
  }
  if (!valide.length || valide.length > MASSIMO_PARTITE) return null
  const account = [...new Set(valide.flatMap((p) => p.righe.map((r) => r.utente_id)).filter(Boolean))]

  // Tutte le righe IPG per gioco di questi account (servono per il globale).
  const tabella = await tutteLeRighe(() => supabase.from('ipg')
    .select('profilo_id, gioco_id, ipg, partite, mu, sigma')
    .in('profilo_id', account).neq('gioco_id', '').order('gioco_id'), 1000, null)
  const idGiochi = [...new Set([...tabella.map((r) => String(r.gioco_id)), ...valide.map((p) => p.giocoId)])]
  const pesi = new Map()
  for (let i = 0; i < idGiochi.length; i += 150) {
    const { data, error } = await supabase.from('giochi').select('id, peso_bgg').in('id', idGiochi.slice(i, i + 150))
    if (error) throw error
    for (const g of data || []) pesi.set(String(g.id), g.peso_bgg)
  }

  // Stato di lavoro: account -> gioco -> { ipg, partite, r }. Si parte
  // dalla tabella e lo si aggiorna partita dopo partita.
  const stato = new Map()
  for (const a of account) stato.set(a, new Map())
  for (const r of tabella) {
    stato.get(r.profilo_id)?.set(String(r.gioco_id), {
      ipg: r.ipg, partite: r.partite || 0,
      r: r.mu != null && r.sigma != null ? rating({ mu: Number(r.mu), sigma: Number(r.sigma) }) : rating(),
    })
  }
  const inizioGlobale = new Map(account.map((a) => [a, globale([...stato.get(a)].map(([g, v]) => ({ gioco_id: g, ...v })), pesi)]))
  const inizioGioco = new Map()   // `${account}|${gioco}` -> { ipg, nuovo }
  const nomi = new Map()
  const nomiGiochi = new Map()

  for (const p of valide) {
    nomiGiochi.set(p.giocoId, p.giocoNome)
    const voci = p.righe.map((r) => {
      if (!r.utente_id) return { r: rating() }   // ospite: avversario nuovo
      nomi.set(r.utente_id, r.nome)
      const mio = stato.get(r.utente_id)
      if (!mio.has(p.giocoId)) mio.set(p.giocoId, { ipg: ipgDa(rating()), partite: 0, r: rating(), nuovo: true })
      const v = mio.get(p.giocoId)
      const k = `${r.utente_id}|${p.giocoId}`
      if (!inizioGioco.has(k)) inizioGioco.set(k, { ipg: v.nuovo ? null : v.ipg })
      return v
    })
    const nuovi = rate(voci.map((v) => [v.r]), { rank: p.rank })
    voci.forEach((v, i) => {
      if (!p.righe[i].utente_id) return
      v.r = nuovi[i][0]
      v.ipg = ipgDa(v.r)
      v.partite += 1
    })
  }

  return account.map((a) => {
    const mio = stato.get(a)
    const giochi = [...inizioGioco].filter(([k]) => k.startsWith(`${a}|`)).map(([k, x]) => {
      const g = k.slice(a.length + 1)
      const dopo = mio.get(g).ipg
      return { nome: nomiGiochi.get(g), prima: x.ipg, dopo, delta: x.ipg == null ? null : dopo - x.ipg, nuovo: x.ipg == null }
    })
    const g0 = inizioGlobale.get(a)
    const g1 = globale([...mio].map(([g, v]) => ({ gioco_id: g, ...v })), pesi)
    return { nome: nomi.get(a), giochi, globale: g0 == null || g1 == null ? null : Math.round(g1) - Math.round(g0) }
  })
}

// Le partite entrate fra «dal» e «fino» (creata_il), nel formato di
// calcolaStimaIpg. Quelle già comprese nell'ultimo ricalcolo si saltano.
// origine: 'bga' (numero del tavolo BGA) o 'bgstats' (chiave «bgstats:»).
export async function partitePerStima(profiloId, dal, fino = null, origine = 'bga') {
  const { data: ultimo } = await supabase.from('ipg').select('aggiornato_il')
    .order('aggiornato_il', { ascending: false }).limit(1)
  const ricalcolo = ultimo?.[0]?.aggiornato_il
  const da = ricalcolo && new Date(ricalcolo) > new Date(dal) ? ricalcolo : dal
  let q = supabase.from('partite')
    .select(`giocata_il, tipo_punteggio, a_squadre, giochi ( id, nome ),
      partecipazioni ( utente_id, ospite_id, posizione, punteggio_totale, vincitore,
        profili:utente_id ( nome, nickname ), ospiti:ospite_id ( nome, cognome, utente_collegato ) )`)
    .eq('registrata_da', profiloId).gt('creata_il', da)
    .order('giocata_il').limit(MASSIMO_PARTITE + 1)
  q = origine === 'bgstats' ? q.like('chiave_esterna', 'bgstats:%') : q.not('bga_tavolo', 'is', null)
  if (fino) q = q.lte('creata_il', fino)
  const { data, error } = await q
  if (error) throw error
  return (data || [])
    .filter((p) => p.giochi?.id && p.tipo_punteggio !== 'coop' && !p.a_squadre)
    .map((p) => ({
      giocoId: p.giochi.id, giocoNome: p.giochi.nome, giocataIl: p.giocata_il,
      giocatori: (p.partecipazioni || []).map((x) => ({
        // Un ospite che si è poi iscritto conta come il suo account, come sul server.
        utente_id: x.utente_id || x.ospiti?.utente_collegato || null,
        ospite_id: x.ospite_id,
        nome: x.profili ? daMostrare(x.profili) : nomeOspite(x.ospiti),
        posizione: x.posizione, punteggio_totale: x.punteggio_totale, vincitore: x.vincitore,
      })),
    }))
}

function Riquadro({ righe, titolo }) {
  return (
    <div className="scheda stima-ipg">
      <h3>{titolo}</h3>
      <ul>
        {righe.map((r) => (
          <li key={r.nome}>
            <span className="stima-ipg-nome">{r.nome}</span>
            <span className="stima-ipg-numeri">
              {r.giochi.map((g, i) => (
                <span key={g.nome + i} className="stima-ipg-gioco">
                  {g.nome}: {g.nuovo ? `${g.dopo} (prima partita)` : `${g.prima} → ${g.dopo}`}
                  {!g.nuovo && <> <strong className={g.delta > 0 ? 'su' : g.delta < 0 ? 'giu' : ''}>{segno(g.delta)}</strong></>}
                </span>
              ))}
              {r.globale != null && (
                <span className="stima-ipg-gioco">globale <strong className={r.globale > 0 ? 'su' : r.globale < 0 ? 'giu' : ''}>{segno(r.globale)}</strong></span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="aiuto">
        Stima sull&rsquo;ultimo ricalcolo. Il valore vero arriva col prossimo ricalcolo, stanotte
        (può differire di poco). Gli ospiti senza account non hanno IPG.
      </p>
    </div>
  )
}

// Una partita appena registrata a mano.
export default function StimaIpg({ giocoId, giocoNome, giocatori }) {
  const [righe, setRighe] = useState(null)
  useEffect(() => {
    let vivo = true
    calcolaStimaIpg([{ giocoId, giocoNome, giocataIl: '', giocatori }])
      .then((r) => { if (vivo) setRighe(r || []) })
      .catch(() => { if (vivo) setRighe([]) })   // tabella non leggibile: non si mostra niente
    return () => { vivo = false }
  }, [giocoId, giocatori])
  if (!righe?.length) return null
  return <Riquadro righe={righe} titolo="Primeggio" />
}

// Le partite arrivate da BGA (in automatico o dall'import a mano) o da BG Stats.
export function StimaIpgBga({ profiloId, dal, fino = null, origine = 'bga' }) {
  const [righe, setRighe] = useState(null)
  useEffect(() => {
    if (!profiloId || !dal) return
    let vivo = true
    partitePerStima(profiloId, dal, fino, origine)
      .then((partite) => calcolaStimaIpg(partite))
      .then((r) => { if (vivo) setRighe(r || []) })
      .catch(() => { if (vivo) setRighe([]) })
    return () => { vivo = false }
  }, [profiloId, dal, fino, origine])
  if (!righe?.length) return null
  return <Riquadro righe={righe} titolo={origine === 'bgstats' ? 'Primeggio, partite da BG Stats' : 'Primeggio, partite da BGA'} />
}
