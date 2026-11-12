// Primo Giocatore - contatti della Tana
// v1.1.0 - 202611131900 (un'icona per ogni contatto; tipo «Indirizzo», che apre la mappa)
//
// Telefono, email, social e sito della Tana: si aprono dalla Home e ogni
// voce è un tasto che chiama, scrive o apre la pagina. Gli organizzatori
// li scrivono e li riordinano qui, senza passare dal codice.
// Serve lo script contatti_tana.sql.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { nomeTana } from './Ludoteca.jsx'
import { eProblemaDiRete } from './coda'

const TIPI = [
  ['telefono', 'Telefono', '333 1234567'],
  ['whatsapp', 'WhatsApp', '333 1234567'],
  ['email', 'Email', 'tana@esempio.it'],
  ['facebook', 'Facebook', 'nome della pagina o indirizzo'],
  ['instagram', 'Instagram', '@nome'],
  ['telegram', 'Telegram', '@nome o indirizzo del gruppo'],
  ['indirizzo', 'Indirizzo', 'Via Roma 1, Roma'],
  ['sito', 'Sito', 'www.esempio.it'],
  ['altro', 'Altro', 'testo o indirizzo'],
]
const NOME_TIPO = Object.fromEntries(TIPI.map(([id, nome]) => [id, nome]))
const ESEMPIO = Object.fromEntries(TIPI.map(([id, , es]) => [id, es]))

const eIndirizzo = (v) => /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)
const conHttps = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`)
const nomeSocial = (v) => v.replace(/^@/, '').trim()

// Un disegno per tipo, a tratto come le icone della barra in basso.
const ICONE = {
  telefono: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  whatsapp: ['M3.5 20.5l1.3-4.4A8.5 8.5 0 1 1 8 19.3z', 'M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2z'],
  email: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  facebook: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M13 21v-8h2.5l.5-3H13V8.5c0-.9.4-1.5 1.6-1.5H16V4.3A9 9 0 0 0 14 4c-2 0-3.5 1.3-3.5 3.8V10H8v3h2.5v8'],
  instagram: ['M7.5 3.5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4z', 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M17 7h.01'],
  telegram: ['M21 4L3 11l5.5 2L11 20l3-4.5 4.5 3.5z', 'M8.5 13L21 4'],
  indirizzo: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', 'M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  sito: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'],
  altro: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
}
function IconaContatto({ tipo }) {
  return (
    <svg className="contatto-icona" viewBox="0 0 24 24" width="26" height="26" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICONE[tipo] || ICONE.altro).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// Dove porta il tocco: solo indirizzi costruiti qui (tel, mailto, https).
export function collegamento(tipo, valore) {
  const v = String(valore || '').trim()
  if (!v) return null
  if (tipo === 'telefono') {
    const n = v.replace(/[^\d+]/g, '')
    return n.length >= 5 ? `tel:${n}` : null
  }
  if (tipo === 'whatsapp') {
    // wa.me vuole il numero col prefisso, senza + né zeri davanti.
    let n = v.replace(/\D/g, '').replace(/^00/, '')
    if (n.length >= 9 && n.length <= 10) n = `39${n}`
    return n.length >= 9 ? `https://wa.me/${n}` : null
  }
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : null
  // Un indirizzo vero apre la mappa (se è già un collegamento, quello).
  if (tipo === 'indirizzo') {
    return /^https?:\/\//i.test(v) ? v : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`
  }
  if (eIndirizzo(v)) return conHttps(v)
  if (/\s/.test(nomeSocial(v))) return null
  const nome = encodeURIComponent(nomeSocial(v))
  if (tipo === 'facebook') return `https://www.facebook.com/${nome}`
  if (tipo === 'instagram') return `https://www.instagram.com/${nome}`
  if (tipo === 'telegram') return `https://t.me/${nome}`
  return null
}

export default function Contatti({ profilo }) {
  const [dati, setDati] = useState(null)          // { tana_id, tana, posso, voci }
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [bozza, setBozza] = useState(null)        // in modifica: elenco di { tipo, etichetta, valore }
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carica() }, [profilo.id])

  async function carica() {
    setErrore('')
    const { data, error } = await supabase.rpc('contatti_elenco')
    if (error) {
      setErrore(/contatti_elenco/.test(error.message || '') ? 'Manca lo script contatti_tana.sql nel database.' : error.message)
      setDati({ voci: [], posso: false })
      return
    }
    setDati(data || { voci: [], posso: false })
  }

  const cambia = (i, campo, valore) =>
    setBozza((b) => b.map((x, k) => (k === i ? { ...x, [campo]: valore } : x)))
  const sposta = (i, di) => setBozza((b) => {
    const j = i + di
    if (j < 0 || j >= b.length) return b
    const c = [...b]; [c[i], c[j]] = [c[j], c[i]]
    return c
  })

  async function salva() {
    setErrore(''); setMessaggio('')
    const voci = bozza
      .map((x) => ({ tipo: x.tipo, etichetta: (x.etichetta || '').trim(), valore: (x.valore || '').trim() }))
      .filter((x) => x.valore)
    setSalvando(true)
    const { error } = await supabase.rpc('contatti_salva', { p_tana: dati.tana_id, p_voci: voci })
    setSalvando(false)
    if (error) { setErrore(eProblemaDiRete(error) ? 'Senza rete i contatti non si possono salvare: riprova quando torna la linea.' : error.message); return }
    setBozza(null)
    setMessaggio('Contatti salvati.')
    carica()
  }

  if (!dati) return <div className="scheda"><p className="aiuto">Carico…</p></div>

  return (
    <div className="scheda">
      <h2>Contatti</h2>
      <p className="aiuto">{nomeTana(dati.tana)}</p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {bozza ? (
        <>
          <p className="aiuto">
            Una riga per ogni contatto. La descrizione è facoltativa («Segreteria», «Marco, il presidente»).
            Una riga lasciata vuota non si salva.
          </p>
          <ul className="contatti-modifica">
            {bozza.map((x, i) => (
              <li key={i}>
                <div className="contatti-riga">
                  <select value={x.tipo} onChange={(e) => cambia(i, 'tipo', e.target.value)} aria-label="Tipo di contatto">
                    {TIPI.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                  </select>
                  <input value={x.valore} onChange={(e) => cambia(i, 'valore', e.target.value)}
                    placeholder={ESEMPIO[x.tipo]} aria-label={NOME_TIPO[x.tipo]} maxLength={200}
                    inputMode={x.tipo === 'telefono' || x.tipo === 'whatsapp' ? 'tel' : x.tipo === 'email' ? 'email' : 'text'}
                    autoCapitalize="none" autoCorrect="off" />
                </div>
                <div className="contatti-riga">
                  <input value={x.etichetta || ''} onChange={(e) => cambia(i, 'etichetta', e.target.value)}
                    placeholder="Descrizione (facoltativa)" aria-label="Descrizione" maxLength={60} />
                  <button type="button" className="bottone-piatto" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su">↑</button>
                  <button type="button" className="bottone-piatto" onClick={() => sposta(i, 1)} disabled={i === bozza.length - 1} aria-label="Sposta giù">↓</button>
                  <button type="button" className="bottone-piatto" onClick={() => setBozza((b) => b.filter((_, k) => k !== i))}>togli</button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="bottone-piatto"
            onClick={() => setBozza((b) => [...b, { tipo: 'telefono', etichetta: '', valore: '' }])}>
            + aggiungi un contatto
          </button>
          <button type="button" className="bottone" style={{ marginTop: '1.2rem' }} onClick={salva} disabled={salvando}>
            {salvando ? 'Salvo…' : 'Salva contatti'}
          </button>
          <button type="button" className="bottone bottone-secondario" onClick={() => setBozza(null)} disabled={salvando}>
            Annulla
          </button>
        </>
      ) : (
        <>
          {dati.voci.length === 0 ? (
            <p className="aiuto">
              {dati.posso ? 'Non ci sono ancora contatti: aggiungili tu.' : 'Non ci sono ancora contatti. Li inseriscono gli organizzatori.'}
            </p>
          ) : (
            <ul className="contatti-elenco">
              {dati.voci.map((x, i) => {
                const dove = collegamento(x.tipo, x.valore)
                const dentro = (
                  <>
                    <IconaContatto tipo={x.tipo} />
                    <span className="contatto-testo">
                      <span className="contatto-tipo">{x.etichetta || NOME_TIPO[x.tipo] || 'Contatto'}</span>
                      <span className="contatto-valore">{x.valore}</span>
                      {x.etichetta && <span className="contatto-sotto">{NOME_TIPO[x.tipo]}</span>}
                    </span>
                  </>
                )
                return (
                  <li key={i}>
                    {dove
                      ? <a className="contatto" href={dove}
                          {...(dove.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{dentro}</a>
                      : <div className="contatto">{dentro}</div>}
                  </li>
                )
              })}
            </ul>
          )}
          {dati.posso && (
            <button type="button" className="bottone bottone-secondario"
              onClick={() => { setMessaggio(''); setBozza(dati.voci.length ? dati.voci.map((x) => ({ ...x })) : [{ tipo: 'telefono', etichetta: '', valore: '' }]) }}>
              Modifica i contatti
            </button>
          )}
        </>
      )}
    </div>
  )
}
