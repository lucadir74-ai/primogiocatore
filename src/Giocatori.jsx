// Primo Giocatore - Giocatori
// v1.2.0 - 202611131900 (le partite dall'archivio comune, non più rilette tutte a ogni apertura)
//
// Le persone con cui hai giocato: chi ha un account e chi è ospite.
// Un ospite collegato a un account ("sono io") è la stessa persona e
// compare una volta sola, come account. Vale la regola di sempre: si
// vede solo chi compare nelle partite che puoi vedere, più gli ospiti
// che hai creato tu (per esempio i dimostratori inseriti a mano).

import { useEffect, useMemo, useState } from 'react'
import { supabase, COLORI, daMostrare, tutteLeRighe } from './supabase'
import { unisciCondivise } from './condivise'
import { leggiArchivio, seguiArchivio } from './archivio'
import BarraScorrevole from './BarraScorrevole.jsx'

const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
const coloreHex = (id) => COLORI.find((c) => c.id === id)?.hex || '#C9D1D8'
// Ricordati fra una visita e l'altra della pagina: tornando si vede
// subito l'elenco di prima, e intanto si aggiorna dietro le quinte.
let memoria = null   // { utente, partite, mieiOspiti, account }
const PER_PAGINA = 60

const giorno = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Giocatori({ profilo, onStatistiche }) {
  const ricordo = memoria?.utente === profilo.id ? memoria : null
  const [partite, setPartite] = useState(ricordo?.partite || [])
  const [mieiOspiti, setMieiOspiti] = useState(ricordo?.mieiOspiti || [])
  const [account, setAccount] = useState(ricordo?.account || new Map())   // id -> profilo
  const [caricamento, setCaricamento] = useState(!ricordo)
  const [quanti, setQuanti] = useState(PER_PAGINA)
  const [errore, setErrore] = useState('')
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState('tutti')   // tutti | account | ospiti

  // Le partite arrivano dall'archivio comune (archivio.js), lo stesso di
  // Storico e Statistiche: prima questa pagina rileggeva da sola tutte le
  // partite a ogni apertura, con la lettura più lenta che c'è.
  useEffect(() => {
    let vivo = true
    let giro = 0

    async function applica(righe, ospiti) {
      const mio = ++giro
      // Gli account non arrivano interi dalla partita (manca «dimostratore»,
      // e quelli collegati a un ospite): si leggono a parte, una volta sola.
      const profili = new Map(memoria?.utente === profilo.id ? memoria.account : [])
      const idAccount = new Set()
      for (const p of righe) {
        for (const x of p.partecipazioni || []) {
          if (x.utente_id) idAccount.add(x.utente_id)
          if (x.ospiti?.utente_collegato) idAccount.add(x.ospiti.utente_collegato)
        }
      }
      for (const o of ospiti) if (o.utente_collegato) idAccount.add(o.utente_collegato)
      const ids = [...idAccount].filter((id) => !giaLetti.has(id))
      const blocchi = []
      for (let i = 0; i < ids.length; i += 200) blocchi.push(ids.slice(i, i + 200))
      const risposte = await Promise.all(blocchi.map((b) => supabase.from('profili')
        .select('id, nome, nickname, colore, dimostratore').in('id', b)))
      for (const { data } of risposte) for (const r of data || []) { profili.set(r.id, r); giaLetti.add(r.id) }
      if (!vivo || mio !== giro) return

      const unite = unisciCondivise(righe, [profilo.id])
      memoria = { utente: profilo.id, partite: unite, mieiOspiti: ospiti, account: profili }
      setPartite(unite)
      setMieiOspiti(ospiti)
      setAccount(profili)
    }

    // I profili già riletti in questa visita: gli altri (ricordati dalla
    // visita di prima) si rileggono, così un nome cambiato si aggiorna.
    const giaLetti = new Set()
    let ospiti = ricordo?.mieiOspiti || []
    let ultime = null

    ;(async () => {
      try {
        const [righe, o] = await Promise.all([
          leggiArchivio(profilo.id),
          tutteLeRighe(() => supabase.from('ospiti')
            .select('id, nome, utente_collegato').eq('creato_da', profilo.id).is('unito_in', null)),
        ])
        ospiti = o
        ultime = righe
        await applica(righe, ospiti)
      } catch (e) {
        if (vivo) setErrore(e.message)
      } finally {
        if (vivo) setCaricamento(false)
      }
    })()

    // L'archivio riletto altrove (una partita salvata, la rete tornata).
    const smetti = seguiArchivio((righe) => {
      if (righe === ultime) return
      ultime = righe
      applica(righe, ospiti).catch(() => {})
    })
    return () => { vivo = false; smetti() }
  }, [profilo.id])
  // Cambiando filtro o ricerca si riparte dalla prima pagina.
  useEffect(() => { setQuanti(PER_PAGINA) }, [filtro, cerca])

  const persone = useMemo(() => {
    const mappa = new Map()
    const voce = (chiave, base) => {
      const v = mappa.get(chiave) || { chiave, insieme: 0, ultima: null, ...base }
      mappa.set(chiave, v)
      return v
    }

    for (const p of partite) {
      const righe = p.partecipazioni || []
      const ci_sono = righe.some((x) => identita(x) === profilo.id)
      if (!ci_sono) continue
      const viste = new Set()
      for (const x of righe) {
        const k = identita(x)
        if (k === profilo.id || viste.has(k)) continue
        viste.add(k)
        const v = k.startsWith('ospite:')
          ? voce(k, { tipo: 'ospite', nome: x.ospiti?.nome || 'Sconosciuto' })
          : voce(k, { tipo: 'account' })
        v.insieme++
        if (!v.ultima || p.giocata_il > v.ultima) v.ultima = p.giocata_il
      }
    }

    // Gli ospiti che hai creato tu, anche senza partite insieme.
    for (const o of mieiOspiti) {
      const k = o.utente_collegato || `ospite:${o.id}`
      if (k === profilo.id) continue
      if (!mappa.has(k)) {
        voce(k, o.utente_collegato ? { tipo: 'account' } : { tipo: 'ospite', nome: o.nome })
      }
    }

    // Per gli account: soprannome, nome e colore dal profilo.
    for (const v of mappa.values()) {
      if (v.tipo !== 'account') continue
      const pr = account.get(v.chiave)
      v.mostra = pr ? daMostrare(pr) : 'Account'
      v.nomeCompleto = pr?.nickname?.trim() && pr?.nome ? pr.nome : null
      v.colore = coloreHex(pr?.colore)
      v.dimostratore = Boolean(pr?.dimostratore)
    }
    for (const v of mappa.values()) {
      if (v.tipo === 'ospite') { v.mostra = v.nome; v.colore = '#C9D1D8' }
    }

    return [...mappa.values()].sort((a, b) =>
      b.insieme - a.insieme || a.mostra.localeCompare(b.mostra, 'it'))
  }, [partite, mieiOspiti, account, profilo.id])

  const quantiAccount = persone.filter((p) => p.tipo === 'account').length
  const quantiOspiti = persone.length - quantiAccount

  const testo = cerca.trim().toLowerCase()
  const visibili = persone.filter((p) =>
    (filtro === 'tutti' || (filtro === 'account' ? p.tipo === 'account' : p.tipo === 'ospite')) &&
    (!testo ||
      p.mostra.toLowerCase().includes(testo) ||
      (p.nomeCompleto || '').toLowerCase().includes(testo)))

  if (caricamento) return <div className="scheda"><p>Carico i giocatori&hellip;</p></div>

  return (
    <div className="scheda">
      <h2>Giocatori</h2>
      <p className="sottotitolo">
        {persone.length} persone con cui hai giocato: {quantiAccount} con account, {quantiOspiti} ospiti.
      </p>

      {errore && <div className="avviso errore">{errore}</div>}

      <BarraScorrevole><div className="sottoschede">
        {[['tutti', 'Tutti'], ['account', 'Con account'], ['ospiti', 'Ospiti']].map(([id, et]) => (
          <button key={id} className={filtro === id ? 'attiva' : ''} onClick={() => setFiltro(id)}>
            {et}
          </button>
        ))}
      </div></BarraScorrevole>

      <div className="campo">
        <label htmlFor="g-cerca">Cerca</label>
        <input id="g-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Nome o soprannome" autoComplete="off" />
      </div>

      {visibili.length === 0 ? (
        <p className="aiuto">Nessuno corrisponde alla ricerca.</p>
      ) : (
        <ul className="elenco">
          {visibili.slice(0, quanti).map((p) => (
            <li key={p.chiave}>
              <button type="button" className="voce-scelta"
                onClick={() => onStatistiche?.(p.chiave)} disabled={p.insieme === 0}>
                <span className="pallino" style={{ background: p.colore }} aria-hidden="true" />
                <span className="voce-testo">
                  <strong>{p.mostra}</strong>
                  {p.nomeCompleto && <span className="anno"> · {p.nomeCompleto}</span>}
                  <span className="anno block">
                    {p.insieme
                      ? `${p.insieme} ${p.insieme === 1 ? 'partita' : 'partite'} insieme · ultima ${giorno(p.ultima)}`
                      : 'nessuna partita insieme'}
                  </span>
                  <span>
                    {p.tipo === 'account'
                      ? <span className="distintivo verde">account</span>
                      : <span className="distintivo grigio">ospite</span>}
                    {p.dimostratore && <span className="distintivo">dimostratore</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {visibili.length > quanti && (
        <button className="bottone bottone-secondario" onClick={() => setQuanti((q) => q + PER_PAGINA * 2)}>
          Mostra altri ({visibili.length - quanti})
        </button>
      )}

      <p className="aiuto">
        Tocca un nome per aprire le statistiche delle partite giocate insieme.
        Un ospite che ha detto «sono io» compare come account.
      </p>
    </div>
  )
}
