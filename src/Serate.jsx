// Primo Giocatore - calendario interno delle serate
// v4.3.1 - 202609282130
//
// Un mese alla volta: si tocca il giorno per aprirlo o crearlo.
// I dimostratori danno la disponibilità, gli organizzatori decidono
// quali giorni la sede è aperta e con quale orario. Gli organizzatori
// possono anche segnare a mano la disponibilità degli altri, per chi
// avvisa a voce o su WhatsApp. I dimostratori possono essere persone
// con un account o ospiti, cioè giocatori non ancora registrati.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

const GIORNI_CORTI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const dataLunga = (s) =>
  new Date(s + 'T12:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

// Preimpostazioni: la serata classica e la domenica in giornata.
const ORARI = [
  { id: 'sera', etichetta: 'Serata', inizio: '21:00', fine: '01:00' },
  { id: 'giornata', etichetta: 'Giornata', inizio: '10:00', fine: '20:00' },
  { id: 'pomeriggio', etichetta: 'Pomeriggio', inizio: '15:00', fine: '20:00' },
]

// Una disponibilità riguarda un profilo o un ospite: la chiave li tiene distinti.
const chiaveDi = (d) => (d.profilo_id ? `p:${d.profilo_id}` : `o:${d.ospite_id}`)
const nomeDi = (d) => (d.profili ? daMostrare(d.profili) : d.ospiti?.nome || 'Dimostratore')

const STATI = [
  { id: 'si', etichetta: 'Ci sono' },
  { id: 'forse', etichetta: 'Forse' },
  { id: 'no', etichetta: 'Non posso' },
]

export default function Serate({ profilo }) {
  const [mese, setMese] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [serate, setSerate] = useState([])
  const [tavoli, setTavoli] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [scelto, setScelto] = useState(null)      // data in formato ISO
  const [modifica, setModifica] = useState(null)  // serata in modifica
  const [dimostratori, setDimostratori] = useState([])
  const [gestione, setGestione] = useState(false) // inserimento manuale aperto
  const [bozzeNote, setBozzeNote] = useState({})  // id disponibilità -> testo
  const [pannello, setPannello] = useState(false) // elenco dimostratori aperto
  const [cercaDim, setCercaDim] = useState('')
  const [trovati, setTrovati] = useState([])

  useEffect(() => { carica() }, [mese])

  // L'elenco dei dimostratori serve solo a chi può scrivere per gli altri.
  useEffect(() => { if (profilo.organizzatore) caricaDimostratori() }, [profilo.organizzatore])

  async function caricaDimostratori() {
    const [p, o] = await Promise.all([
      supabase.from('profili').select('id, nome, nickname')
        .eq('dimostratore', true),
      supabase.from('ospiti').select('id, nome')
        .eq('dimostratore', true).is('utente_collegato', null),
    ])
    if (p.error || o.error) { setErrore((p.error || o.error).message); return }
    setDimostratori([
      ...(p.data || []).map((x) => ({ chiave: `p:${x.id}`, tipo: 'profilo', id: x.id, nome: daMostrare(x) })),
      ...(o.data || []).map((x) => ({ chiave: `o:${x.id}`, tipo: 'ospite', id: x.id, nome: x.nome })),
    ].sort((a, b) => a.nome.localeCompare(b.nome, 'it')))
  }

  // Cerca fra chi ha un account e fra i giocatori delle partite.
  useEffect(() => {
    // Virgole e parentesi romperebbero il filtro di Supabase.
    const q = cercaDim.trim().replace(/[,()%*]/g, '')
    if (q.length < 2) { setTrovati([]); return }
    const attesa = setTimeout(async () => {
      const [p, o] = await Promise.all([
        supabase.from('profili').select('id, nome, nickname')
          .or(`nome.ilike.%${q}%,nickname.ilike.%${q}%`)
          .eq('dimostratore', false).limit(8),
        supabase.from('ospiti').select('id, nome')
          .ilike('nome', `%${q}%`)
          .eq('dimostratore', false).is('utente_collegato', null).limit(8),
      ])
      setTrovati([
        ...(p.data || []).map((x) => ({ tipo: 'profilo', id: x.id, nome: daMostrare(x) })),
        ...(o.data || []).map((x) => ({ tipo: 'ospite', id: x.id, nome: x.nome })),
      ])
    }, 250)
    return () => clearTimeout(attesa)
  }, [cercaDim])

  async function nomina(persona, valore) {
    setErrore(''); setMessaggio('')
    const tabella = persona.tipo === 'profilo' ? 'profili' : 'ospiti'
    const { error } = await supabase.from(tabella)
      .update({ dimostratore: valore }).eq('id', persona.id)
    if (error) { setErrore(error.message); return }
    setCercaDim('')
    caricaDimostratori()
  }

  // Una persona mai vista prima: diventa un ospite, lo stesso che si
  // potrà poi mettere nelle partite e collegare quando si registra.
  async function nuovoDimostratore() {
    const nome = cercaDim.trim()
    if (!nome) return
    setErrore(''); setMessaggio('')
    const { error } = await supabase.from('ospiti')
      .insert({ nome, creato_da: profilo.id, dimostratore: true })
    if (error) { setErrore(error.message); return }
    setCercaDim('')
    setMessaggio(`${nome} aggiunto ai dimostratori.`)
    caricaDimostratori()
  }

  // Cambiando giorno si chiude l'inserimento manuale e si buttano le bozze.
  useEffect(() => { setGestione(false); setBozzeNote({}) }, [scelto])

  const primoDelMese = iso(new Date(mese.getFullYear(), mese.getMonth(), 1))
  const ultimoDelMese = iso(new Date(mese.getFullYear(), mese.getMonth() + 1, 0))

  async function carica() {
    setCaricamento(true)
    const [s, t] = await Promise.all([
      supabase
        .from('serate')
        .select(`
          *, disponibilita (
            id, profilo_id, ospite_id, stato, note,
            profili ( nome, nickname ), ospiti ( nome )
          )
        `)
        .gte('data', primoDelMese)
        .lte('data', ultimoDelMese)
        .order('data'),
      // I tavoli previsti nello stesso mese: servono a vedere la
      // serata per intero, non solo chi c'è fra i dimostratori.
      supabase
        .from('tavoli')
        .select(`
          id, titolo, inizio, stato, posti_max, dimostratore_nome,
          giochi:tavoli_gioco_id_fkey ( nome, immagine_url ),
          iscrizioni_tavolo ( id, stato )
        `)
        .gte('inizio', `${primoDelMese}T00:00:00`)
        .lte('inizio', `${ultimoDelMese}T23:59:59`)
        .order('inizio'),
    ])
    if (s.error) setErrore(s.error.message)
    else setSerate(s.data || [])
    if (t.data) setTavoli(t.data)
    setCaricamento(false)
  }

  const serataDi = (giorno) => serate.find((s) => s.data === giorno)

  /* ---------- Griglia del mese ---------- */

  function celle() {
    const primo = new Date(mese.getFullYear(), mese.getMonth(), 1)
    // La settimana comincia di lunedì: domenica vale 7, non 0.
    const spostamento = (primo.getDay() + 6) % 7
    const giorniNelMese = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate()

    const out = []
    for (let i = 0; i < spostamento; i++) out.push(null)
    for (let g = 1; g <= giorniNelMese; g++) {
      out.push(iso(new Date(mese.getFullYear(), mese.getMonth(), g)))
    }
    return out
  }

  /* ---------- Azioni ---------- */

  async function creaSerata(giorno, preset) {
    setErrore(''); setMessaggio('')
    const { error } = await supabase.from('serate').insert({
      data: giorno,
      ora_inizio: preset.inizio,
      ora_fine: preset.fine,
      creata_da: profilo.id,
    })
    if (error) setErrore(error.message)
    else carica()
  }

  // Aggiunge lo stesso giorno della settimana per tutto il mese: utile
  // per i martedì fissi, e le eccezioni si tolgono una per una.
  async function ripetiNelMese(giorno, serata) {
    const riferimento = new Date(giorno + 'T12:00')
    const settimana = riferimento.getDay()
    const giorniNelMese = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate()

    const righe = []
    for (let g = 1; g <= giorniNelMese; g++) {
      const d = new Date(mese.getFullYear(), mese.getMonth(), g)
      if (d.getDay() !== settimana) continue
      const data = iso(d)
      if (serataDi(data)) continue
      righe.push({
        data,
        ora_inizio: serata.ora_inizio,
        ora_fine: serata.ora_fine,
        titolo: serata.titolo,
        creata_da: profilo.id,
      })
    }
    if (righe.length === 0) { setMessaggio('Sono già tutti in calendario.'); return }

    const { error } = await supabase.from('serate').insert(righe)
    if (error) setErrore(error.message)
    else { setMessaggio(`Aggiunti altri ${righe.length} giorni.`); carica() }
  }

  async function salvaModifica() {
    setErrore('')
    const { error } = await supabase.from('serate').update({
      ora_inizio: modifica.ora_inizio,
      ora_fine: modifica.ora_fine || null,
      titolo: modifica.titolo?.trim() || null,
      note: modifica.note?.trim() || null,
      annullata: Boolean(modifica.annullata),
    }).eq('id', modifica.id)
    if (error) setErrore(error.message)
    else { setModifica(null); carica() }
  }

  async function elimina(s) {
    if (!confirm(`Togliere ${dataLunga(s.data)} dal calendario? Spariscono anche le disponibilità.`)) return
    const { error } = await supabase.from('serate').delete().eq('id', s.id)
    if (error) setErrore(error.message)
    else { setScelto(null); carica() }
  }

  // Senza persona, vale per sé stessi. Con persona, è un organizzatore
  // che scrive per un altro: il database lo consente solo a loro.
  const IO = { tipo: 'profilo', id: profilo.id }

  async function dai(serataId, stato, persona = IO) {
    setErrore('')
    const colonna = persona.tipo === 'profilo' ? 'profilo_id' : 'ospite_id'
    const { error } = await supabase.from('disponibilita').upsert({
      serata_id: serataId, [colonna]: persona.id, stato,
      aggiornata_il: new Date().toISOString(),
    }, { onConflict: `serata_id,${colonna}` })
    if (error) setErrore(error.message)
    else carica()
  }

  async function ritira(serataId, persona = IO) {
    setErrore('')
    const colonna = persona.tipo === 'profilo' ? 'profilo_id' : 'ospite_id'
    const { error } = await supabase.from('disponibilita').delete()
      .eq('serata_id', serataId).eq(colonna, persona.id)
    if (error) setErrore(error.message)
    else carica()
  }

  async function salvaNota(rigaId) {
    const testo = bozzeNote[rigaId]
    if (testo === undefined) return
    const { error } = await supabase.from('disponibilita')
      .update({ note: testo.trim() || null, aggiornata_il: new Date().toISOString() })
      .eq('id', rigaId)
    if (error) { setErrore(error.message); return }
    setBozzeNote((b) => { const n = { ...b }; delete n[rigaId]; return n })
    carica()
  }

  // Tutti i dimostratori, più chi ha risposto pur non essendolo più:
  // nessuna risposta resta invisibile.
  function elencoPerGestione(serata) {
    const risposte = serata.disponibilita || []
    const persone = [...dimostratori]
    for (const d of risposte) {
      const chiave = chiaveDi(d)
      if (!persone.some((p) => p.chiave === chiave)) {
        persone.push({
          chiave,
          tipo: d.profilo_id ? 'profilo' : 'ospite',
          id: d.profilo_id || d.ospite_id,
          nome: nomeDi(d),
        })
      }
    }
    return persone
      .map((p) => ({ ...p, risposta: risposte.find((d) => chiaveDi(d) === p.chiave) }))
      .sort((a, b) => Number(Boolean(a.risposta)) - Number(Boolean(b.risposta))
        || a.nome.localeCompare(b.nome, 'it'))
  }

  /* ---------- Vista ---------- */

  const oggiIso = iso(new Date())
  const serataScelta = scelto ? serataDi(scelto) : null
  const tavoliDelGiorno = (giorno) =>
    tavoli.filter((t) => t.inizio.slice(0, 10) === giorno)

  return (
    <>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      <div className="testa-mese">
        <button className="freccia-mese"
          onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))}
          aria-label="Mese precedente">‹</button>
        <strong>{MESI[mese.getMonth()]} {mese.getFullYear()}</strong>
        <button className="freccia-mese"
          onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))}
          aria-label="Mese successivo">›</button>
      </div>

      <div className="griglia-giorni">
        {GIORNI_CORTI.map((g) => <span className="intestazione-giorno" key={g}>{g}</span>)}

        {celle().map((giorno, i) => {
          if (!giorno) return <span className="cella vuota" key={`v${i}`} />
          const s = serataDi(giorno)
          const numero = Number(giorno.slice(8))
          const disponibili = s ? (s.disponibilita || []).filter((d) => d.stato === 'si').length : 0
          const mia = s ? (s.disponibilita || []).find((d) => d.profilo_id === profilo.id) : null

          return (
            <button
              key={giorno}
              className={[
                'cella',
                s ? 'aperta' : '',
                s?.annullata ? 'saltata' : '',
                giorno === oggiIso ? 'oggi' : '',
                giorno === scelto ? 'scelta' : '',
                mia ? `mia-${mia.stato}` : '',
              ].join(' ').trim()}
              onClick={() => setScelto(giorno === scelto ? null : giorno)}
            >
              <span className="numero">{numero}</span>
              {s && !s.annullata && (
                <span className="ora">{s.ora_inizio.slice(0, 5)}</span>
              )}
              {s && disponibili > 0 && <span className="conta">{disponibili}</span>}
              {tavoliDelGiorno(giorno).length > 0 && <span className="punto-tavoli" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {caricamento && <p className="aiuto">Carico&hellip;</p>}

      <p className="aiuto legenda">
        I giorni con il bordo sono aperti. Il numero in basso è quanti dimostratori
        ci sono. La striscia colorata è la tua risposta.
      </p>

      {profilo.organizzatore && (
        <button className="bottone-piatto" onClick={() => setPannello(!pannello)}>
          {pannello ? 'Chiudi i dimostratori' : `Dimostratori (${dimostratori.length})`}
        </button>
      )}

      {pannello && (
        <div className="riquadro-manuale">
          <h3 className="titolo-sezione">
            Dimostratori <span className="conteggio">{dimostratori.length}</span>
          </h3>
          <p className="aiuto">
            Cerca fra i giocatori delle tue partite o fra chi ha un account. Se non
            c&rsquo;è, scrivi il nome e aggiungilo. Quando si registrerà e verrà
            collegato, porterà con sé il ruolo e le disponibilità.
          </p>

          <input className="campo-cerca" value={cercaDim}
            onChange={(e) => setCercaDim(e.target.value)}
            placeholder="Nome o soprannome…" aria-label="Cerca un dimostratore" />

          {cercaDim.trim().length >= 2 && (
            <div className="pastiglie-persone">
              {trovati.map((p) => (
                <button key={`${p.tipo}:${p.id}`} className="pastiglia-nome"
                  onClick={() => nomina(p, true)}>
                  {p.nome}{p.tipo === 'ospite' ? ' (senza account)' : ''}
                </button>
              ))}
              {!trovati.some((p) => p.nome.toLowerCase() === cercaDim.trim().toLowerCase()) && (
                <button className="pastiglia-nome nuovo" onClick={nuovoDimostratore}>
                  + Aggiungi &laquo;{cercaDim.trim()}&raquo;
                </button>
              )}
            </div>
          )}

          {dimostratori.length === 0 ? (
            <p className="aiuto">Ancora nessuno.</p>
          ) : (
            <ul className="elenco">
              {dimostratori.map((p) => (
                <li key={p.chiave}>
                  <div className="nome-giocatore">
                    <strong>{p.nome}</strong>
                    {p.tipo === 'ospite' && <span className="anno block">senza account</span>}
                  </div>
                  <button className="bottone-piatto pericolo" onClick={() => nomina(p, false)}>
                    togli
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------- Giorno scelto ---------- */}

      {scelto && (
        <div className="riquadro-manuale">
          <h3 className="titolo-sezione">{dataLunga(scelto)}</h3>

          {!serataScelta ? (
            profilo.organizzatore ? (
              <>
                <p className="aiuto">Sede chiusa. Aprila scegliendo l&rsquo;orario:</p>
                <div className="pastiglie-persone">
                  {ORARI.map((o) => (
                    <button key={o.id} className="pastiglia-nome nuovo"
                      onClick={() => creaSerata(scelto, o)}>
                      {o.etichetta} {o.inizio}–{o.fine}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="aiuto">Sede chiusa in questo giorno.</p>
            )
          ) : modifica ? (
            <>
              <div className="riga-campi">
                <div className="campo">
                  <label htmlFor="m-inizio">Dalle</label>
                  <input id="m-inizio" type="time" value={modifica.ora_inizio}
                    onChange={(e) => setModifica({ ...modifica, ora_inizio: e.target.value })} />
                </div>
                <div className="campo">
                  <label htmlFor="m-fine">Alle</label>
                  <input id="m-fine" type="time" value={modifica.ora_fine || ''}
                    onChange={(e) => setModifica({ ...modifica, ora_fine: e.target.value })} />
                </div>
              </div>

              <div className="campo">
                <label htmlFor="m-titolo">Titolo</label>
                <input id="m-titolo" value={modifica.titolo || ''}
                  onChange={(e) => setModifica({ ...modifica, titolo: e.target.value })}
                  placeholder="Serata libera, torneo, demo…" />
              </div>

              <div className="campo">
                <label htmlFor="m-note">Note per i dimostratori</label>
                <input id="m-note" value={modifica.note || ''}
                  onChange={(e) => setModifica({ ...modifica, note: e.target.value })} />
              </div>

              <label className="consenso">
                <input type="checkbox" checked={Boolean(modifica.annullata)}
                  onChange={(e) => setModifica({ ...modifica, annullata: e.target.checked })} />
                <span>Saltata. Resta in calendario ma segnata come chiusa.</span>
              </label>

              <div className="riga-bottoni">
                <button className="bottone" onClick={salvaModifica}>Salva</button>
                <button className="bottone bottone-secondario" onClick={() => setModifica(null)}>Annulla</button>
              </div>
            </>
          ) : (
            <>
              <p className="sottotitolo">
                {serataScelta.annullata ? 'Saltata · ' : ''}
                {serataScelta.ora_inizio.slice(0, 5)}
                {serataScelta.ora_fine ? `–${serataScelta.ora_fine.slice(0, 5)}` : ''}
                {serataScelta.titolo ? ` · ${serataScelta.titolo}` : ''}
              </p>

              {serataScelta.note && <p className="aiuto note-partita">{serataScelta.note}</p>}

              {!serataScelta.annullata && (
                <>
                  <label>La tua disponibilità</label>
                  <div className="scelte-disponibilita">
                    {STATI.map((st) => {
                      const mia = (serataScelta.disponibilita || [])
                        .find((d) => d.profilo_id === profilo.id)
                      return (
                        <button key={st.id}
                          className={`pastiglia-stato ${st.id}${mia?.stato === st.id ? ' scelto' : ''}`}
                          onClick={() => (mia?.stato === st.id
                            ? ritira(serataScelta.id)
                            : dai(serataScelta.id, st.id))}>
                          {st.etichetta}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <h4 className="titolo-sezione">
                Tavoli previsti{' '}
                <span className="conteggio">{tavoliDelGiorno(scelto).length}</span>
              </h4>
              {tavoliDelGiorno(scelto).length === 0 ? (
                <p className="aiuto">
                  Nessun tavolo pubblicato per questa serata.
                  {(serataScelta.disponibilita || []).some((d) => d.stato === 'si') &&
                    ' Ci sono dimostratori disponibili: c\u2019è da organizzare.'}
                </p>
              ) : (
                <ul className="elenco">
                  {tavoliDelGiorno(scelto).map((t) => {
                    const iscritti = (t.iscrizioni_tavolo || [])
                      .filter((i) => i.stato === 'confermato').length
                    return (
                      <li key={t.id}>
                        <div className="gioco">
                          {t.giochi?.immagine_url && (
                            <img src={t.giochi.immagine_url} alt="" className="copertina" />
                          )}
                          <div className="nome-giocatore">
                            <strong>{t.titolo || t.giochi?.nome || 'Tavolo'}</strong>
                            <span className="anno block">
                              {new Date(t.inizio).toLocaleTimeString('it-IT', {
                                hour: '2-digit', minute: '2-digit',
                              })}
                              {t.dimostratore_nome ? ` · ${t.dimostratore_nome}` : ''}
                              {t.stato !== 'aperto' ? ` · ${t.stato}` : ''}
                            </span>
                          </div>
                        </div>
                        <span className="anno">
                          {iscritti}{t.posti_max ? `/${t.posti_max}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}

              <h4 className="titolo-sezione">
                Chi c&rsquo;è <span className="conteggio">{(serataScelta.disponibilita || []).length}</span>
              </h4>

              {profilo.organizzatore && !serataScelta.annullata && (
                <button className="bottone-piatto" onClick={() => setGestione(!gestione)}>
                  {gestione ? 'Fatto' : 'Inserisci le disponibilità a mano'}
                </button>
              )}

              {gestione ? (
                dimostratori.length === 0 && (serataScelta.disponibilita || []).length === 0 ? (
                  <p className="aiuto">
                    Non ci sono ancora dimostratori. Aggiungili dal pulsante
                    Dimostratori sotto il calendario.
                  </p>
                ) : (
                  <>
                    <p className="aiuto">
                      Tocca la risposta per ciascuno. Toccare di nuovo quella scelta la toglie.
                      In cima chi non ha ancora risposto.
                    </p>
                    {elencoPerGestione(serataScelta).map((p) => (
                      <div key={p.chiave} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--bordo)' }}>
                        <strong>
                          {p.nome}
                          {p.chiave === `p:${profilo.id}` && <span className="anno"> · tu</span>}
                          {p.tipo === 'ospite' && <span className="anno"> · senza account</span>}
                        </strong>
                        <div className="scelte-disponibilita">
                          {STATI.map((st) => (
                            <button key={st.id}
                              className={`pastiglia-stato ${st.id}${p.risposta?.stato === st.id ? ' scelto' : ''}`}
                              onClick={() => (p.risposta?.stato === st.id
                                ? ritira(serataScelta.id, p)
                                : dai(serataScelta.id, st.id, p))}>
                              {st.etichetta}
                            </button>
                          ))}
                        </div>
                        {p.risposta && (
                          <input
                            className="campo-cerca"
                            style={{ marginTop: '0.4rem' }}
                            value={bozzeNote[p.risposta.id] ?? p.risposta.note ?? ''}
                            onChange={(e) => setBozzeNote({ ...bozzeNote, [p.risposta.id]: e.target.value })}
                            onBlur={() => salvaNota(p.risposta.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            placeholder="Nota: arriva alle 22, porta Brass…"
                            aria-label={`Nota per ${p.nome}`}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )
              ) : (serataScelta.disponibilita || []).length === 0 ? (
                <p className="aiuto">Nessuno si è ancora espresso.</p>
              ) : (
                <ul className="elenco">
                  {[...(serataScelta.disponibilita || [])]
                    .sort((a, b) => a.stato.localeCompare(b.stato))
                    .map((d) => (
                      <li key={d.id}>
                        <div className="nome-giocatore">
                          <strong>{nomeDi(d)}</strong>
                          {d.note && <span className="anno block">{d.note}</span>}
                        </div>
                        <span className={`pastiglia-stato piccola ${d.stato}`}>
                          {STATI.find((x) => x.id === d.stato)?.etichetta}
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              {profilo.organizzatore && (
                <div className="azioni-iscritto">
                  <button className="bottone-piatto"
                    onClick={() => setModifica({
                      id: serataScelta.id,
                      ora_inizio: serataScelta.ora_inizio.slice(0, 5),
                      ora_fine: serataScelta.ora_fine?.slice(0, 5) || '',
                      titolo: serataScelta.titolo,
                      note: serataScelta.note,
                      annullata: serataScelta.annullata,
                    })}>
                    Cambia orario
                  </button>
                  <button className="bottone-piatto"
                    onClick={() => ripetiNelMese(scelto, serataScelta)}>
                    Ripeti ogni {GIORNI_CORTI[(new Date(scelto + 'T12:00').getDay() + 6) % 7]} del mese
                  </button>
                  <button className="bottone-piatto pericolo" onClick={() => elimina(serataScelta)}>
                    Chiudi il giorno
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
