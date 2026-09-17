// Primo Giocatore - calendario interno delle serate
// v2.4.0 - 202609180900
//
// Visibile solo a dimostratori e organizzatori. I dimostratori danno
// la disponibilità, gli organizzatori creano e spostano le serate.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

const dataLunga = (d) =>
  new Date(d + 'T12:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

const oggi = () => new Date().toISOString().slice(0, 10)

const STATI = [
  { id: 'si', etichetta: 'Ci sono', classe: 'si' },
  { id: 'forse', etichetta: 'Forse', classe: 'forse' },
  { id: 'no', etichetta: 'Non posso', classe: 'no' },
]

export default function Serate({ profilo }) {
  const [serate, setSerate] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  const [modifica, setModifica] = useState(null)   // serata singola
  const [generatore, setGeneratore] = useState(null)
  const [aperta, setAperta] = useState(null)

  useEffect(() => { carica() }, [])

  async function carica() {
    setCaricamento(true)
    const { data, error } = await supabase
      .from('serate')
      .select(`
        *, luoghi ( nome ),
        disponibilita ( profilo_id, stato, note, profili ( nome, nickname ) )
      `)
      .gte('data', oggi())
      .order('data')
      .order('ora_inizio')
    if (error) setErrore(error.message)
    else setSerate(data || [])
    setCaricamento(false)
  }

  async function dai(serataId, stato) {
    setErrore('')
    const { error } = await supabase.from('disponibilita').upsert({
      serata_id: serataId,
      profilo_id: profilo.id,
      stato,
      aggiornata_il: new Date().toISOString(),
    })
    if (error) setErrore(error.message)
    else carica()
  }

  async function togliDisponibilita(serataId) {
    const { error } = await supabase
      .from('disponibilita').delete()
      .eq('serata_id', serataId).eq('profilo_id', profilo.id)
    if (error) setErrore(error.message)
    else carica()
  }

  /* ---------- Creazione e modifica ---------- */

  async function salvaSerata() {
    setErrore(''); setMessaggio('')
    if (!modifica.data) { setErrore('Serve la data.'); return }

    const campi = {
      data: modifica.data,
      ora_inizio: modifica.ora_inizio || '21:00',
      ora_fine: modifica.ora_fine || null,
      titolo: modifica.titolo?.trim() || null,
      note: modifica.note?.trim() || null,
      annullata: Boolean(modifica.annullata),
    }

    const { error } = modifica.id
      ? await supabase.from('serate').update(campi).eq('id', modifica.id)
      : await supabase.from('serate').insert({ ...campi, creata_da: profilo.id })

    if (error) { setErrore(error.message); return }
    setMessaggio(modifica.id ? 'Serata aggiornata.' : 'Serata aggiunta.')
    setModifica(null)
    carica()
  }

  async function eliminaSerata(s) {
    if (!confirm(`Eliminare la serata di ${dataLunga(s.data)}? Spariscono anche le disponibilità.`)) return
    const { error } = await supabase.from('serate').delete().eq('id', s.id)
    if (error) setErrore(error.message)
    else { setModifica(null); carica() }
  }

  // Genera le occorrenze dei giorni scelti in un periodo. Chi ha bisogno
  // di due domeniche al mese genera tutte le domeniche e cancella le altre:
  // più semplice da capire di una regola di ricorrenza.
  async function generaSerate() {
    setErrore(''); setMessaggio('')
    const { dal, al, giorni, ora_inizio, ora_fine } = generatore
    if (!dal || !al) { setErrore('Metti le due date.'); return }
    if (giorni.length === 0) { setErrore('Scegli almeno un giorno.'); return }

    const righe = []
    const cursore = new Date(dal + 'T12:00')
    const fine = new Date(al + 'T12:00')
    while (cursore <= fine) {
      if (giorni.includes(cursore.getDay())) {
        righe.push({
          data: cursore.toISOString().slice(0, 10),
          ora_inizio: ora_inizio || '21:00',
          ora_fine: ora_fine || null,
          creata_da: profilo.id,
        })
      }
      cursore.setDate(cursore.getDate() + 1)
    }

    if (righe.length === 0) { setErrore('Nessuna data in questo periodo.'); return }
    if (righe.length > 200) { setErrore('Troppe serate in una volta: accorcia il periodo.'); return }

    // Le serate già presenti non vengono toccate.
    const { error } = await supabase
      .from('serate').upsert(righe, { onConflict: 'data,ora_inizio', ignoreDuplicates: true })
    if (error) { setErrore(error.message); return }

    setMessaggio(`Generate ${righe.length} serate. Cancella quelle che non servono.`)
    setGeneratore(null)
    carica()
  }

  if (caricamento) return <p className="aiuto">Carico il calendario&hellip;</p>

  /* ---------- Modulo serata ---------- */

  if (modifica) {
    return (
      <div className="riquadro-manuale">
        <h3 className="titolo-sezione">{modifica.id ? 'Modifica serata' : 'Nuova serata'}</h3>
        {errore && <div className="avviso errore">{errore}</div>}

        <div className="campo">
          <label htmlFor="s-data">Giorno</label>
          <input id="s-data" type="date" value={modifica.data}
            onChange={(e) => setModifica({ ...modifica, data: e.target.value })} />
        </div>

        <div className="riga-campi">
          <div className="campo">
            <label htmlFor="s-inizio">Dalle</label>
            <input id="s-inizio" type="time" value={modifica.ora_inizio}
              onChange={(e) => setModifica({ ...modifica, ora_inizio: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="s-fine">Alle</label>
            <input id="s-fine" type="time" value={modifica.ora_fine || ''}
              onChange={(e) => setModifica({ ...modifica, ora_fine: e.target.value })} />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="s-titolo">Titolo</label>
          <input id="s-titolo" value={modifica.titolo || ''}
            onChange={(e) => setModifica({ ...modifica, titolo: e.target.value })}
            placeholder="Serata libera, torneo, demo…" />
        </div>

        <div className="campo">
          <label htmlFor="s-note">Note per i dimostratori</label>
          <input id="s-note" value={modifica.note || ''}
            onChange={(e) => setModifica({ ...modifica, note: e.target.value })} />
        </div>

        <label className="consenso">
          <input type="checkbox" checked={Boolean(modifica.annullata)}
            onChange={(e) => setModifica({ ...modifica, annullata: e.target.checked })} />
          <span>Serata annullata. Resta nel calendario ma segnata come saltata.</span>
        </label>

        <div className="riga-bottoni">
          <button className="bottone" onClick={salvaSerata}>Salva</button>
          <button className="bottone bottone-secondario" onClick={() => setModifica(null)}>Annulla</button>
        </div>

        {modifica.id && (
          <button className="bottone-piatto pericolo" onClick={() => eliminaSerata(modifica)}>
            Elimina la serata
          </button>
        )}
      </div>
    )
  }

  /* ---------- Generatore ---------- */

  if (generatore) {
    return (
      <div className="riquadro-manuale">
        <h3 className="titolo-sezione">Genera le serate fisse</h3>
        <p className="aiuto">
          Crea tutte le ricorrenze dei giorni scelti. Per le domeniche alterne genera
          tutte le domeniche e cancella quelle che non servono.
        </p>
        {errore && <div className="avviso errore">{errore}</div>}

        <div className="riga-campi">
          <div className="campo">
            <label htmlFor="g-dal">Dal</label>
            <input id="g-dal" type="date" value={generatore.dal}
              onChange={(e) => setGeneratore({ ...generatore, dal: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="g-al">Al</label>
            <input id="g-al" type="date" value={generatore.al}
              onChange={(e) => setGeneratore({ ...generatore, al: e.target.value })} />
          </div>
        </div>

        <div className="campo">
          <label>Giorni</label>
          <div className="pastiglie-persone">
            {GIORNI.map((g, i) => (
              <button
                key={g}
                className={`pastiglia-nome${generatore.giorni.includes(i) ? ' nuovo' : ''}`}
                onClick={() =>
                  setGeneratore({
                    ...generatore,
                    giorni: generatore.giorni.includes(i)
                      ? generatore.giorni.filter((x) => x !== i)
                      : [...generatore.giorni, i],
                  })
                }
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="riga-campi">
          <div className="campo">
            <label htmlFor="g-inizio">Dalle</label>
            <input id="g-inizio" type="time" value={generatore.ora_inizio}
              onChange={(e) => setGeneratore({ ...generatore, ora_inizio: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="g-fine">Alle</label>
            <input id="g-fine" type="time" value={generatore.ora_fine}
              onChange={(e) => setGeneratore({ ...generatore, ora_fine: e.target.value })} />
          </div>
        </div>

        <div className="riga-bottoni">
          <button className="bottone" onClick={generaSerate}>Genera</button>
          <button className="bottone bottone-secondario" onClick={() => setGeneratore(null)}>Annulla</button>
        </div>
      </div>
    )
  }

  /* ---------- Calendario ---------- */

  return (
    <>
      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {profilo.organizzatore && (
        <div className="riga-bottoni">
          <button className="bottone"
            onClick={() => setModifica({ data: oggi(), ora_inizio: '21:00', ora_fine: '' })}>
            Aggiungi una serata
          </button>
          <button className="bottone bottone-secondario"
            onClick={() => setGeneratore({
              dal: oggi(), al: '', giorni: [2, 5], ora_inizio: '21:00', ora_fine: '',
            })}>
            Genera le fisse
          </button>
        </div>
      )}

      {serate.length === 0 ? (
        <p className="aiuto">Nessuna serata in calendario.</p>
      ) : serate.map((s) => {
        const mia = (s.disponibilita || []).find((d) => d.profilo_id === profilo.id)
        const presenti = (s.disponibilita || []).filter((d) => d.stato === 'si')
        const forse = (s.disponibilita || []).filter((d) => d.stato === 'forse')
        const apertaQui = aperta === s.id

        return (
          <div className={`serata${s.annullata ? ' annullata' : ''}`} key={s.id}>
            <button className="testa-partita" onClick={() => setAperta(apertaQui ? null : s.id)}>
              <div className="dati-partita">
                <strong>
                  {dataLunga(s.data)}
                  {s.annullata && <span className="distintivo rosso">Annullata</span>}
                </strong>
                <span className="anno">
                  {s.ora_inizio?.slice(0, 5)}
                  {s.ora_fine ? `–${s.ora_fine.slice(0, 5)}` : ''}
                  {s.titolo ? ` · ${s.titolo}` : ''}
                </span>
                <span className="anno">
                  {presenti.length} disponibili
                  {forse.length ? ` · ${forse.length} forse` : ''}
                </span>
              </div>
              <span className="freccia" aria-hidden="true">{apertaQui ? '−' : '+'}</span>
            </button>

            {!s.annullata && (
              <div className="scelte-disponibilita">
                {STATI.map((st) => (
                  <button
                    key={st.id}
                    className={`pastiglia-stato ${st.classe}${mia?.stato === st.id ? ' scelto' : ''}`}
                    onClick={() => (mia?.stato === st.id ? togliDisponibilita(s.id) : dai(s.id, st.id))}
                  >
                    {st.etichetta}
                  </button>
                ))}
              </div>
            )}

            {apertaQui && (
              <div className="dettaglio">
                {s.note && <p className="aiuto note-partita">{s.note}</p>}

                {(s.disponibilita || []).length === 0 ? (
                  <p className="aiuto">Nessuno si è ancora espresso.</p>
                ) : (
                  <ul className="elenco">
                    {[...(s.disponibilita || [])]
                      .sort((a, b) => a.stato.localeCompare(b.stato))
                      .map((d) => (
                        <li key={d.profilo_id}>
                          <div className="nome-giocatore">
                            <strong>{d.profili ? daMostrare(d.profili) : 'Dimostratore'}</strong>
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
                  <button className="bottone-piatto"
                    onClick={() => setModifica({
                      id: s.id, data: s.data,
                      ora_inizio: s.ora_inizio?.slice(0, 5) || '21:00',
                      ora_fine: s.ora_fine?.slice(0, 5) || '',
                      titolo: s.titolo, note: s.note, annullata: s.annullata,
                    })}>
                    Modifica serata
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
