// Primo Giocatore - Giocatori
// v1.0.0 - 202610041800
//
// Le persone con cui hai giocato: chi ha un account e chi è ospite.
// Un ospite collegato a un account ("sono io") è la stessa persona e
// compare una volta sola, come account. Vale la regola di sempre: si
// vede solo chi compare nelle partite che puoi vedere, più gli ospiti
// che hai creato tu (per esempio i dimostratori inseriti a mano).

import { useEffect, useMemo, useState } from 'react'
import { supabase, COLORI, daMostrare, tutteLeRighe } from './supabase'
import { unisciCondivise } from './condivise'

const identita = (x) => x.utente_id || x.ospiti?.utente_collegato || `ospite:${x.ospite_id}`
const coloreHex = (id) => COLORI.find((c) => c.id === id)?.hex || '#C9D1D8'
const giorno = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Giocatori({ profilo, onStatistiche }) {
  const [partite, setPartite] = useState([])
  const [mieiOspiti, setMieiOspiti] = useState([])
  const [account, setAccount] = useState(new Map())   // id -> profilo
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState('tutti')   // tutti | account | ospiti

  useEffect(() => { carica() }, [])

  async function carica() {
    try {
      const [righe, ospiti] = await Promise.all([
        tutteLeRighe(() => supabase.from('partite').select(`
          id, giocata_il, registrata_da,
          giochi ( id ),
          partecipazioni (
            utente_id, ospite_id, punteggio_totale,
            profili:utente_id ( id, nome, nickname, colore, dimostratore ),
            ospiti:ospite_id ( id, nome, utente_collegato )
          )
        `)),
        tutteLeRighe(() => supabase.from('ospiti')
          .select('id, nome, utente_collegato').eq('creato_da', profilo.id)),
      ])

      // Gli account collegati agli ospiti non arrivano dalla partita:
      // si leggono a parte, per avere nome e soprannome veri.
      const idAccount = new Set()
      for (const p of righe) {
        for (const x of p.partecipazioni || []) {
          if (x.utente_id) idAccount.add(x.utente_id)
          if (x.ospiti?.utente_collegato) idAccount.add(x.ospiti.utente_collegato)
        }
      }
      for (const o of ospiti) if (o.utente_collegato) idAccount.add(o.utente_collegato)
      const ids = [...idAccount]
      const profili = new Map()
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('profili')
          .select('id, nome, nickname, colore, dimostratore').in('id', ids.slice(i, i + 200))
        for (const r of data || []) profili.set(r.id, r)
      }

      setPartite(unisciCondivise(righe, [profilo.id]))
      setMieiOspiti(ospiti)
      setAccount(profili)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCaricamento(false)
    }
  }

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

      <div className="sottoschede">
        {[['tutti', 'Tutti'], ['account', 'Con account'], ['ospiti', 'Ospiti']].map(([id, et]) => (
          <button key={id} className={filtro === id ? 'attiva' : ''} onClick={() => setFiltro(id)}>
            {et}
          </button>
        ))}
      </div>

      <div className="campo">
        <label htmlFor="g-cerca">Cerca</label>
        <input id="g-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)}
          placeholder="Nome o soprannome" autoComplete="off" />
      </div>

      {visibili.length === 0 ? (
        <p className="aiuto">Nessuno corrisponde alla ricerca.</p>
      ) : (
        <ul className="elenco">
          {visibili.map((p) => (
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

      <p className="aiuto">
        Tocca un nome per aprire le statistiche delle partite giocate insieme.
        Un ospite che ha detto «sono io» compare come account.
      </p>
    </div>
  )
}
