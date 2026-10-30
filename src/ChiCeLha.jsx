// Primo Giocatore - «Chi ce l'ha?»
// v1.1.0 - 202610301800 (suggerimenti mentre scrivi, anche con il nome scritto male; «Forse cercavi» se non trova niente)
//
// Si cerca un gioco per nome: l'app mostra chi ce l'ha in collezione,
// diviso per Tana (prima la propria). A chi ce l'ha si può chiedere un
// tavolo con un messaggio facoltativo: la richiesta gli arriva in Tavoli.
// Chi non vuole comparire lo toglie dal profilo.

import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export default function ChiCeLha({ profilo }) {
  const [cerca, setCerca] = useState('')
  const [righe, setRighe] = useState(null)
  const [cercando, setCercando] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [chiedo, setChiedo] = useState(null)   // { gioco, tana, persone } mentre scrivo la richiesta
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const [suggeriti, setSuggeriti] = useState([])   // giochi posseduti con un nome simile
  const [mostraSuggeriti, setMostraSuggeriti] = useState(false)
  const ultimaRichiesta = useRef(0)

  // Mentre scrivi: dopo una breve pausa chiede i giochi con un nome
  // simile (anche scritto male) fra quelli che qualcuno possiede.
  useEffect(() => {
    const testo = cerca.trim()
    if (testo.length < 2) { setSuggeriti([]); return }
    const numero = ++ultimaRichiesta.current
    const attesa = setTimeout(async () => {
      const { data, error } = await supabase.rpc('suggerisci_giochi', { p_testo: testo })
      if (numero !== ultimaRichiesta.current || error) return
      setSuggeriti(data || [])
    }, 300)
    return () => clearTimeout(attesa)
  }, [cerca])

  // Un gioco scelto dai suggerimenti: si cerca proprio quello.
  async function scegli(s) {
    ultimaRichiesta.current++
    setCerca(s.nome); setSuggeriti([]); setMostraSuggeriti(false)
    setErrore(''); setMessaggio(''); setChiedo(null); setCercando(true)
    const { data, error } = await supabase.rpc('chi_ha_gioco', { p_gioco: s.gioco_id })
    setCercando(false)
    if (error) { setErrore(error.message); return }
    setRighe(data || [])
  }

  async function trova() {
    if (cerca.trim().length < 2) { setErrore('Scrivi almeno due lettere.'); return }
    setErrore(''); setMessaggio(''); setChiedo(null); setCercando(true); setMostraSuggeriti(false)
    const { data, error } = await supabase.rpc('chi_ha', { p_cerca: cerca.trim() })
    setCercando(false)
    if (error) { setErrore(error.message); return }
    setRighe(data || [])
  }

  // Gioco → Tane → persone, con la propria Tana per prima.
  const giochi = []
  for (const r of righe || []) {
    let g = giochi.find((x) => x.id === r.gioco_id)
    if (!g) { g = { id: r.gioco_id, nome: r.nome, anno: r.anno, immagine: r.immagine_url, tane: [] }; giochi.push(g) }
    const chiave = r.tana_id ?? 'nessuna'
    let t = g.tane.find((x) => x.chiave === chiave)
    if (!t) { t = { chiave, nome: r.tana || (r.tana_id ? 'Tana' : 'Senza Tana'), persone: [] }; g.tane.push(t) }
    t.persone.push({ id: r.utente_id, nome: r.chi, io: r.sono_io })
  }
  for (const g of giochi) {
    g.tane.sort((a, b) =>
      (b.chiave === profilo.tana_id) - (a.chiave === profilo.tana_id)
      || (a.chiave === 'nessuna') - (b.chiave === 'nessuna')
      || b.persone.length - a.persone.length)
  }

  async function invia() {
    const altri = chiedo.persone.filter((p) => !p.io)
    setErrore(''); setInvio(true)
    const { error } = await supabase.rpc('chiedi_tavolo', {
      p_gioco: chiedo.gioco.id, p_destinatari: altri.map((p) => p.id), p_messaggio: testo,
    })
    setInvio(false)
    if (error) { setErrore(error.message); return }
    setMessaggio(`Richiesta inviata a ${altri.length === 1 ? altri[0].nome : `${altri.length} persone`}. `
      + 'Se qualcuno organizza il tavolo ti iscriviamo noi: lo vedi in Tavoli.')
    setChiedo(null); setTesto('')
  }

  return (
    <>
      <p className="sottotitolo">
        Cerca un gioco: vedi chi ce l&rsquo;ha in collezione nelle Tane e puoi chiedergli di organizzare un tavolo.
      </p>

      <div className="campo">
        <label htmlFor="chi-cerca">Che gioco cerchi?</label>
        <div className="riga-ricerca">
          <input id="chi-cerca" value={cerca} placeholder="Supplì Battle, Brass…" autoComplete="off"
            onChange={(e) => { setCerca(e.target.value); setMostraSuggeriti(true) }}
            onKeyDown={(e) => e.key === 'Enter' && trova()} />
          <button className="bottone bottone-stretto" onClick={trova} disabled={cercando}>
            {cercando ? '\u2026' : 'Cerca'}
          </button>
        </div>
        {mostraSuggeriti && suggeriti.length > 0 && (
          <ul className="suggerimenti-gioco" aria-label="Giochi suggeriti">
            {suggeriti.map((s) => (
              <li key={s.gioco_id}>
                <button type="button" onClick={() => scegli(s)}>
                  {s.immagine_url ? <img src={s.immagine_url} alt="" /> : <span className="segnaposto" />}
                  <span>
                    <strong>{s.nome}</strong>{s.anno ? <span className="anno"> {s.anno}</span> : null}
                    <span className="anno block">{s.quanti === 1 ? 'ce l\u2019ha 1 persona' : `ce l\u2019hanno ${s.quanti} persone`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {righe && giochi.length === 0 && (
        suggeriti.length > 0 ? (
          <>
            <p className="aiuto">Con questo nome esatto non c&rsquo;è niente. Forse cercavi:</p>
            <div className="pastiglie-persone">
              {suggeriti.map((s) => (
                <button key={s.gioco_id} className="pastiglia-nome" onClick={() => scegli(s)}>{s.nome}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="aiuto">Nessuno ha in collezione un gioco con questo nome, nemmeno scritto in modo simile.</p>
        )
      )}

      {giochi.map((g) => (
        <div key={g.id} className="chi-gioco">
          <div className="gioco">
            {g.immagine && <img src={g.immagine} alt="" className="copertina" />}
            <div>
              <strong>{g.nome}</strong>
              {g.anno ? <span className="anno"> {g.anno}</span> : null}
            </div>
          </div>

          {g.tane.map((t) => {
            const altri = t.persone.filter((p) => !p.io)
            const staChiedendo = chiedo?.gioco.id === g.id && chiedo?.tana === t.chiave
            return (
              <div key={t.chiave} className="chi-tana">
                <p className="chi-tana-nome">
                  {t.nome}{t.chiave === profilo.tana_id ? ' (la tua)' : ''} · {t.persone.length}
                </p>
                <p className="chi-persone">
                  {t.persone.map((p) => (p.io ? 'tu' : p.nome)).join(', ')}
                </p>
                {altri.length > 0 && !staChiedendo && (
                  <button className="bottone-piatto"
                    onClick={() => { setChiedo({ gioco: g, tana: t.chiave, persone: t.persone }); setTesto(''); setMessaggio('') }}>
                    Chiedi un tavolo {altri.length === 1 ? `a ${altri[0].nome}` : `a questi ${altri.length}`}
                  </button>
                )}
                {staChiedendo && (
                  <div className="chi-richiesta">
                    <label htmlFor="chi-testo" className="aiuto">Un messaggio, se vuoi (quando, dove…)</label>
                    <textarea id="chi-testo" rows={2} value={testo} maxLength={300}
                      onChange={(e) => setTesto(e.target.value)} placeholder="Sabato sera alla Tana?" />
                    <button className="bottone" onClick={invia} disabled={invio}>
                      {invio ? 'Invio\u2026' : 'Invia la richiesta'}
                    </button>
                    <button className="bottone-piatto" onClick={() => setChiedo(null)}>annulla</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <p className="aiuto">
        Compaiono le collezioni di tutti, salvo chi l&rsquo;ha tolta dal profilo.
      </p>
    </>
  )
}
