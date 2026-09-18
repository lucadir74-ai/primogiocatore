// Primo Giocatore - calendario interno delle serate
// v4.2.0 - 202609221400
//
// Un mese alla volta: si tocca il giorno per aprirlo o crearlo.
// I dimostratori danno la disponibilità, gli organizzatori decidono
// quali giorni la sede è aperta e con quale orario.

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

  useEffect(() => { carica() }, [mese])

  const primoDelMese = iso(new Date(mese.getFullYear(), mese.getMonth(), 1))
  const ultimoDelMese = iso(new Date(mese.getFullYear(), mese.getMonth() + 1, 0))

  async function carica() {
    setCaricamento(true)
    const [s, t] = await Promise.all([
      supabase
        .from('serate')
        .select(`
          *, disponibilita ( profilo_id, stato, note, profili ( nome, nickname ) )
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

  async function dai(serataId, stato) {
    const { error } = await supabase.from('disponibilita').upsert({
      serata_id: serataId, profilo_id: profilo.id, stato,
      aggiornata_il: new Date().toISOString(),
    })
    if (error) setErrore(error.message)
    else carica()
  }

  async function ritira(serataId) {
    const { error } = await supabase.from('disponibilita').delete()
      .eq('serata_id', serataId).eq('profilo_id', profilo.id)
    if (error) setErrore(error.message)
    else carica()
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
              {(serataScelta.disponibilita || []).length === 0 ? (
                <p className="aiuto">Nessuno si è ancora espresso.</p>
              ) : (
                <ul className="elenco">
                  {[...(serataScelta.disponibilita || [])]
                    .sort((a, b) => a.stato.localeCompare(b.stato))
                    .map((d) => (
                      <li key={d.profilo_id}>
                        <div className="nome-giocatore">
                          <strong>{d.profili ? daMostrare(d.profili) : 'Dimostratore'}</strong>
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
