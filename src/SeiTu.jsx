// Primo Giocatore - "Sei tu?"
// v3.0.0 - 202611121500 (niente più elenco «sei tu?»: collegamento da solo con nick o nome e cognome)
//
// Chi si registra spesso ha già giocato come ospite, e magari più
// persone l'hanno inserito ognuna a modo suo («kaihla», «gess»...).
// L'iscritto non sceglie più da un elenco di nomi simili (poteva
// sbagliare): il nick, o nome e cognome insieme, lo collegano da soli;
// i dubbi li conferma chi ha inserito l'ospite (ChiSono.jsx).
// Serve lo script riconoscimento_fase4.sql.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const nomeIntero = (nome, cognome) => [nome, cognome].filter(Boolean).join(' ')

// Le righe delle richieste raggruppate: una per gruppo (le vecchie,
// senza gruppo, contano da sole).
function raggruppa(righe, chiave) {
  const gruppi = new Map()
  for (const r of righe) {
    const k = chiave(r)
    if (!gruppi.has(k)) gruppi.set(k, [])
    gruppi.get(k).push(r)
  }
  return [...gruppi.entries()].map(([id, voci]) => ({ id, voci }))
}

// Chiede al database di collegare all'account gli ospiti che sono
// sicuramente questa persona (nick uguale, oppure nome e cognome
// insieme). Una volta al giorno per telefono, e dopo aver cambiato nome
// o nick. Restituisce quante schede sono passate all'account.
const chiaveRiconosciuto = (id) => `primo-giocatore:riconosciuto:${id}`
export async function riconoscimi(profilo, { subito = false } = {}) {
  const firma = [profilo.nickname, profilo.nome, profilo.cognome].map((x) => (x || '').trim().toLowerCase()).join('|')
  const oggi = new Date().toISOString().slice(0, 10)
  try {
    const visto = JSON.parse(localStorage.getItem(chiaveRiconosciuto(profilo.id)) || 'null')
    if (!subito && visto?.giorno === oggi && visto?.firma === firma) return 0
  } catch { /* si richiede */ }
  const { data, error } = await supabase.rpc('riconoscimi')
  if (error) return 0   // manca lo script, o niente rete: si riprova la prossima volta
  try { localStorage.setItem(chiaveRiconosciuto(profilo.id), JSON.stringify({ giorno: oggi, firma })) } catch { /* pazienza */ }
  return Number(data) || 0
}

// Nel profilo: con quali nomi le partite arrivano a questo account.
// L'iscritto non sceglie niente: i nomi sicuri si collegano da soli, i
// dubbi li conferma chi ha registrato la partita o chi organizza.
export default function SeiTu({ profilo }) {
  const [nomi, setNomi] = useState(null)
  const [collegate, setCollegate] = useState(0)

  useEffect(() => {
    let vivo = true
    async function carica() {
      const n = await riconoscimi(profilo, { subito: true })
      const { data } = await supabase.from('nomi_collegati')
        .select('nome, cognome').eq('utente_id', profilo.id).order('nome')
      if (!vivo) return
      setCollegate(n)
      setNomi(data || [])
    }
    carica()
    return () => { vivo = false }
  }, [profilo.id])

  const nick = (profilo.nickname || '').trim()
  const intero = nomeIntero((profilo.nome || '').trim(), (profilo.cognome || '').trim())
  const altri = (nomi || [])
    .map((n) => nomeIntero(n.nome, n.cognome))
    .filter((n) => n && n !== nick.toLowerCase() && n !== intero.toLowerCase())

  return (
    <div className="scheda">
      <h2>Le tue partite da ospite</h2>
      <p className="sottotitolo">
        Le partite che altri hanno registrato a tuo nome prima che ti iscrivessi arrivano qui da sole.
      </p>
      {collegate > 0 && (
        <div className="avviso ok">
          {collegate === 1 ? 'Trovata 1 scheda ospite con il tuo nome' : `Trovate ${collegate} schede ospite con il tuo nome`}:
          quelle partite ora sono tue.
        </div>
      )}
      <p className="aiuto">
        Ti riconosciamo quando chi registra la partita scrive il tuo nick
        {nick ? <> (<strong>{nick}</strong>)</> : ' (non l\u2019hai ancora messo nel profilo)'} oppure
        il tuo nome e cognome insieme{intero ? <> (<strong>{intero}</strong>)</> : ''}.
        Controlla che nel profilo siano scritti giusti.
      </p>
      {altri.length > 0 && (
        <p className="aiuto">
          Ti arrivano anche le partite registrate come: {altri.map((n) => `«${n}»`).join(', ')}.
        </p>
      )}
      <p className="aiuto">
        Se qualcuno ti ha segnato con un soprannome o con il solo nome, a confermare che sei tu è chi ha
        registrato quella partita, o un organizzatore: lo trovano nella sezione Ospiti. Tu non devi fare niente;
        se ti manca una partita, chiedi a loro.
      </p>
    </div>
  )
}

// Per chi organizza (o ha inserito l'ospite): le richieste da decidere,
// una per persona anche quando le schede sono tante.
export function RichiesteDaApprovare({ onCambio }) {
  const [righe, setRighe] = useState([])
  const [errore, setErrore] = useState('')
  const [lavorando, setLavorando] = useState(false)

  useEffect(() => { carica() }, [])

  async function carica() {
    const { data, error } = await supabase.rpc('richieste_da_decidere')
    if (!error) setRighe(data || [])
  }

  const gruppi = raggruppa(righe, (r) => r.gruppo)

  async function decidi(g, approva) {
    const chi = g.voci[0].chi || 'questa persona'
    const nomi = g.voci.map((v) => nomeIntero(v.ospite_nome, v.ospite_cognome)).join(', ')
    const testo = approva
      ? `${chi} è «${nomi}»? Tutte le partite, i tavoli e le disponibilità di ${g.voci.length === 1 ? 'questa scheda' : `queste ${g.voci.length} schede`} passano a quell'account.`
      : `Rifiutare la richiesta di ${chi}?`
    if (!confirm(testo)) return
    setErrore(''); setLavorando(true)
    const { error } = await supabase.rpc('decidi_gruppo', { p_gruppo: g.id, p_approva: approva })
    setLavorando(false)
    if (error) { setErrore(error.message); return }
    carica()
    onCambio?.()
  }

  if (gruppi.length === 0) return null

  return (
    <>
      <h3 className="titolo-sezione">
        Richieste «sono io» <span className="conteggio">{gruppi.length}</span>
      </h3>
      {errore && <div className="avviso errore">{errore}</div>}
      <ul className="elenco">
        {gruppi.map((g) => (
          <li key={g.id}>
            <div className="nome-giocatore">
              <strong>{g.voci[0].chi || 'Utente'}</strong>
              <span className="anno block">dice di essere:</span>
              {g.voci.map((v) => (
                <span className="anno block" key={v.ospite_id}>
                  «{nomeIntero(v.ospite_nome, v.ospite_cognome)}»
                  {` · ${v.partite} ${v.partite === 1 ? 'partita' : 'partite'}`}
                  {v.creato_da ? ` · inserito da ${v.creato_da}` : ''}
                </span>
              ))}
            </div>
            <span className="azioni-iscritto">
              <button className="bottone-piatto" onClick={() => decidi(g, true)} disabled={lavorando}>
                {g.voci.length > 1 ? 'approva tutte' : 'approva'}
              </button>
              <button className="bottone-piatto pericolo" onClick={() => decidi(g, false)} disabled={lavorando}>rifiuta</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Quante richieste (persone) aspettano una decisione: per l'avviso in cima all'app.
export async function contaRichiesteDaApprovare() {
  const { data, error } = await supabase.rpc('richieste_da_decidere')
  if (error) return 0
  return new Set((data || []).map((r) => r.gruppo)).size
}
