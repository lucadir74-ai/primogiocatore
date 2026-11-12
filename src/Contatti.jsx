// Primo Giocatore - contatti della Tana
// v1.0.0 - 202611121000
//
// Telefono, email, social e sito della Tana: si aprono dalla Home e ogni
// voce è un tasto che chiama, scrive o apre la pagina. Gli organizzatori
// li scrivono e li riordinano qui, senza passare dal codice.
// Serve lo script contatti_tana.sql.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { nomeTana } from './Ludoteca.jsx'

const TIPI = [
  ['telefono', 'Telefono', '333 1234567'],
  ['whatsapp', 'WhatsApp', '333 1234567'],
  ['email', 'Email', 'tana@esempio.it'],
  ['facebook', 'Facebook', 'nome della pagina o indirizzo'],
  ['instagram', 'Instagram', '@nome'],
  ['telegram', 'Telegram', '@nome o indirizzo del gruppo'],
  ['sito', 'Sito', 'www.esempio.it'],
  ['altro', 'Altro', 'testo o indirizzo'],
]
const NOME_TIPO = Object.fromEntries(TIPI.map(([id, nome]) => [id, nome]))
const ESEMPIO = Object.fromEntries(TIPI.map(([id, , es]) => [id, es]))

const eIndirizzo = (v) => /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)
const conHttps = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`)
const nomeSocial = (v) => v.replace(/^@/, '').trim()

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
    if (error) { setErrore(error.message); return }
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
                    <span className="contatto-tipo">{x.etichetta || NOME_TIPO[x.tipo] || 'Contatto'}</span>
                    <span className="contatto-valore">{x.valore}</span>
                    {x.etichetta && <span className="contatto-sotto">{NOME_TIPO[x.tipo]}</span>}
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
