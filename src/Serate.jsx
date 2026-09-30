// Primo Giocatore - calendario interno delle serate
// v4.10.0 - 202609302300
//
// Un mese alla volta: si tocca il giorno per aprirlo o crearlo.
// I dimostratori danno la disponibilità, gli organizzatori decidono
// quali giorni la sede è aperta e con quale orario. Gli organizzatori
// possono anche segnare a mano la disponibilità degli altri, per chi
// avvisa a voce o su WhatsApp. I dimostratori possono essere persone
// con un account o ospiti, cioè giocatori non ancora registrati.
// Dalla serata l'organizzatore cerca chi c'è, vede solo i disponibili
// e a ciascuno può assegnare un tavolo con un gioco.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'
import CercaGiocoBgg from './CercaGiocoBgg.jsx'
import { SceltaOra } from './SceltaQuando.jsx'
import { IMMAGINE_TAVOLO_LIBERO, copertinaTavolo } from './immagini'

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

// Separatore fra una persona e l'altra nella gestione della serata.
const RIGA = { padding: '0.6rem 0', borderTop: '1px solid var(--bordo)' }

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
  const [cercaSerata, setCercaSerata] = useState('')
  const [trovatiSerata, setTrovatiSerata] = useState([])
  const [inScelta, setInScelta] = useState(null)  // persona di cui segno la risposta
  const [assegna, setAssegna] = useState(null)    // modulo del tavolo da assegnare
  const [bozzeNote, setBozzeNote] = useState({})  // id disponibilità -> testo
  const [rigaAperta, setRigaAperta] = useState(null)  // chiave della persona con la nota aperta
  const [aggiungendo, setAggiungendo] = useState(false) // ricerca per aggiungere qualcuno
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

  // Cerca fra chi ha un account e fra i giocatori delle partite, escluso
  // chi è già dimostratore (quelli li ho già in memoria).
  async function cercaNonDimostratori(testo) {
    // Virgole e parentesi romperebbero il filtro di Supabase.
    const q = testo.trim().replace(/[,()%*]/g, '')
    if (q.length < 2) return []
    const [p, o] = await Promise.all([
      supabase.from('profili').select('id, nome, nickname')
        .or(`nome.ilike.%${q}%,nickname.ilike.%${q}%`)
        .eq('dimostratore', false).limit(8),
      supabase.from('ospiti').select('id, nome')
        .ilike('nome', `%${q}%`)
        .eq('dimostratore', false).is('utente_collegato', null).limit(8),
    ])
    return [
      ...(p.data || []).map((x) => ({ chiave: `p:${x.id}`, tipo: 'profilo', id: x.id, nome: daMostrare(x) })),
      ...(o.data || []).map((x) => ({ chiave: `o:${x.id}`, tipo: 'ospite', id: x.id, nome: x.nome })),
    ]
  }

  useEffect(() => {
    if (cercaDim.trim().length < 2) { setTrovati([]); return }
    const attesa = setTimeout(async () => setTrovati(await cercaNonDimostratori(cercaDim)), 250)
    return () => clearTimeout(attesa)
  }, [cercaDim])

  useEffect(() => {
    if (cercaSerata.trim().length < 2) { setTrovatiSerata([]); return }
    const attesa = setTimeout(async () => setTrovatiSerata(await cercaNonDimostratori(cercaSerata)), 250)
    return () => clearTimeout(attesa)
  }, [cercaSerata])

  async function nomina(persona, valore) {
    setErrore(''); setMessaggio('')
    const tabella = persona.tipo === 'profilo' ? 'profili' : 'ospiti'
    const { error } = await supabase.from(tabella)
      .update({ dimostratore: valore }).eq('id', persona.id)
    if (error) { setErrore(error.message); return false }
    setCercaDim('')
    caricaDimostratori()
    return true
  }

  // Una persona mai vista prima: diventa un ospite, lo stesso che si
  // potrà poi mettere nelle partite e collegare quando si registra.
  async function nuovoDimostratore(testo) {
    const nome = testo.trim()
    if (!nome) return null
    setErrore(''); setMessaggio('')
    const { data, error } = await supabase.from('ospiti')
      .insert({ nome, creato_da: profilo.id, dimostratore: true })
      .select('id, nome').single()
    if (error) { setErrore(error.message); return null }
    setMessaggio(`${nome} aggiunto ai dimostratori.`)
    caricaDimostratori()
    return { chiave: `o:${data.id}`, tipo: 'ospite', id: data.id, nome: data.nome }
  }

  // Dalla ricerca della serata: chi non è ancora dimostratore lo diventa,
  // poi si sceglie la sua risposta.
  async function scegliPersona(persona, giaDimostratore) {
    if (!giaDimostratore && !(await nomina(persona, true))) return
    setInScelta(persona)
    setCercaSerata('')
    setAggiungendo(false)
  }

  async function aggiungiDaSerata() {
    const persona = await nuovoDimostratore(cercaSerata)
    if (!persona) return
    setInScelta(persona)
    setCercaSerata('')
    setAggiungendo(false)
  }

  async function creaTavolo(serata) {
    setErrore(''); setMessaggio('')
    const a = assegna
    if (!a.gioco && !a.libero) { setErrore('Scegli il gioco, oppure segna «tavolo libero».'); return }

    // La data è quella della serata, l'ora quella scelta: il browser la
    // interpreta come ora italiana e la converte per il database.
    const inizio = new Date(`${serata.data}T${a.ora || serata.ora_inizio.slice(0, 5)}`)
    const ospite = a.persona.tipo === 'ospite'

    // Il tavolo libero della serata è uno solo: se c'è già, chi viene
    // assegnato si aggiunge ai suoi dimostratori.
    const liberoEsistente = a.libero
      && tavoliDelGiorno(serata.data).find((t) => !t.gioco_id && t.stato !== 'annullato')
    if (liberoEsistente) {
      const giaDentro = (liberoEsistente.iscrizioni_tavolo || []).find((i) => i.stato !== 'annullato'
        && (ospite ? i.ospite_id === a.persona.id : i.utente_id === a.persona.id))
      const { error } = giaDentro
        ? await supabase.from('iscrizioni_tavolo')
          .update({ ruolo: 'dimostratore', stato: 'confermato' }).eq('id', giaDentro.id)
        : await supabase.from('iscrizioni_tavolo').insert({
          tavolo_id: liberoEsistente.id,
          [ospite ? 'ospite_id' : 'utente_id']: a.persona.id,
          nome_visibile: a.persona.nome,
          ruolo: 'dimostratore',
          stato: 'confermato',
        })
      if (error) { setErrore(error.message); return }
      setAssegna(null)
      setMessaggio(`${a.persona.nome} aggiunto ai dimostratori del tavolo libero.`)
      carica()
      return
    }

    const { data, error } = await supabase.from('tavoli').insert({
      gioco_id: a.libero ? null : a.gioco.id,
      titolo: a.libero ? 'Tavolo libero' : null,
      host_id: profilo.id,
      inizio: inizio.toISOString(),
      posti_max: a.posti ? Number(a.posti) : null,
      luogo_id: serata.luogo_id || null,
      dimostratore_nome: a.persona.nome,
      dimostratore_id: ospite ? null : a.persona.id,
      dimostratore_ospite_id: ospite ? a.persona.id : null,
      dimostratore_gioca: true,
      pubblicato: a.pubblica,
      stato: 'aperto',
    }).select('id').single()
    if (error) { setErrore(error.message); return }

    // Il dimostratore occupa un posto, come quando il tavolo nasce
    // dalla scheda Tavoli.
    const { error: e2 } = await supabase.from('iscrizioni_tavolo').insert({
      tavolo_id: data.id,
      [ospite ? 'ospite_id' : 'utente_id']: a.persona.id,
      nome_visibile: a.persona.nome,
      ruolo: 'dimostratore',
      stato: 'confermato',
    })

    setAssegna(null)
    setMessaggio(e2
      ? `Tavolo creato, ma ${a.persona.nome} non è stato iscritto come giocatore. Aprilo da Tavoli e salvalo.`
      : `${a.libero ? 'Tavolo libero' : `Tavolo di ${a.gioco.nome}`} assegnato a ${a.persona.nome}${a.pubblica ? ' e pubblicato' : ' (bozza)'}.`)
    carica()
  }

  // Cambiando giorno si chiude tutto quello che era aperto sul precedente.
  useEffect(() => {
    setBozzeNote({}); setCercaSerata(''); setInScelta(null); setAssegna(null)
  }, [scelto])

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
          id, titolo, inizio, stato, posti_max, pubblicato, gioco_id,
          dimostratore_nome, dimostratore_id, dimostratore_ospite_id,
          giochi:tavoli_gioco_id_fkey ( nome, immagine_url ),
          iscrizioni_tavolo ( id, stato, ruolo, utente_id, ospite_id )
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
                <button className="pastiglia-nome nuovo"
                  onClick={async () => { if (await nuovoDimostratore(cercaDim)) setCercaDim('') }}>
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

              {!(profilo.organizzatore && !serataScelta.annullata) && <>
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
                          {copertinaTavolo(t) && (
                            <img src={copertinaTavolo(t)} alt="" className="copertina" />
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

              </>}

              <h4 className="titolo-sezione">
                Chi c&rsquo;è <span className="conteggio">{(serataScelta.disponibilita || []).length}</span>
              </h4>

              {profilo.organizzatore && !serataScelta.annullata ? (() => {
                const risposte = serataScelta.disponibilita || []
                const rispostaDi = (chiave) => risposte.find((d) => chiaveDi(d) === chiave)
                const personaDi = (d) => ({
                  chiave: chiaveDi(d),
                  tipo: d.profilo_id ? 'profilo' : 'ospite',
                  id: d.profilo_id || d.ospite_id,
                  nome: nomeDi(d),
                })
                const q = cercaSerata.trim().toLowerCase()
                const trovatiDim = q.length >= 2
                  ? dimostratori.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 8)
                  : []
                // Prima chi c'è di sicuro, poi i forse; chi non può resta in fondo.
                const disponibili = risposte
                  .filter((d) => d.stato !== 'no')
                  .sort((a, b) => Number(a.stato !== 'si') - Number(b.stato !== 'si')
                    || nomeDi(a).localeCompare(nomeDi(b), 'it'))
                const assenti = risposte.filter((d) => d.stato === 'no')
                // Anche i tavoli liberi dove spiega insieme ad altri.
                const tavoliDi = (pers) => tavoliDelGiorno(scelto).filter((t) =>
                  (pers.tipo === 'profilo' ? t.dimostratore_id === pers.id : t.dimostratore_ospite_id === pers.id)
                  || (t.iscrizioni_tavolo || []).some((i) => i.ruolo === 'dimostratore' && i.stato !== 'annullato'
                    && (pers.tipo === 'profilo' ? i.utente_id === pers.id : i.ospite_id === pers.id)))
                const etichettaDi = (stato) => STATI.find((x) => x.id === stato)?.etichetta

                return (
                  <>
                    {aggiungendo || risposte.length === 0 ? (
                      <div className="riga-bottoni" style={{ alignItems: 'center' }}>
                        <input className="campo-cerca" style={{ flex: 1, margin: 0 }} value={cercaSerata}
                          autoFocus={aggiungendo}
                          onChange={(e) => setCercaSerata(e.target.value)}
                          placeholder="Chi vuoi aggiungere?" aria-label="Cerca un dimostratore" />
                        {aggiungendo && (
                          <button className="bottone-piatto"
                            onClick={() => { setAggiungendo(false); setCercaSerata('') }}>chiudi</button>
                        )}
                      </div>
                    ) : (
                      <button className="bottone-piatto" onClick={() => setAggiungendo(true)}>
                        + Aggiungi qualcuno alla serata
                      </button>
                    )}

                    {q.length >= 2 && (
                      <div className="pastiglie-persone">
                        {trovatiDim.map((p) => {
                          const r = rispostaDi(p.chiave)
                          return (
                            <button key={p.chiave} className="pastiglia-nome"
                              onClick={() => scegliPersona(p, true)}>
                              {p.nome}{r ? ` · ${etichettaDi(r.stato).toLowerCase()}` : ''}
                            </button>
                          )
                        })}
                        {trovatiSerata.map((p) => (
                          <button key={p.chiave} className="pastiglia-nome ospite"
                            onClick={() => scegliPersona(p, false)}>
                            {p.nome} (nuovo dimostratore)
                          </button>
                        ))}
                        {![...trovatiDim, ...trovatiSerata].some((p) => p.nome.toLowerCase() === q) && (
                          <button className="pastiglia-nome nuovo" onClick={aggiungiDaSerata}>
                            + Aggiungi &laquo;{cercaSerata.trim()}&raquo;
                          </button>
                        )}
                      </div>
                    )}

                    {inScelta && (
                      <div style={RIGA}>
                        <strong>{inScelta.nome}</strong>
                        <div className="scelte-disponibilita">
                          {STATI.map((st) => {
                            const r = rispostaDi(inScelta.chiave)
                            return (
                              <button key={st.id}
                                className={`pastiglia-stato ${st.id}${r?.stato === st.id ? ' scelto' : ''}`}
                                onClick={async () => {
                                  if (r?.stato === st.id) await ritira(serataScelta.id, inScelta)
                                  else await dai(serataScelta.id, st.id, inScelta)
                                  setInScelta(null)
                                }}>
                                {st.etichetta}
                              </button>
                            )
                          })}
                        </div>
                        <button className="bottone-piatto" onClick={() => setInScelta(null)}>Annulla</button>
                      </div>
                    )}

                    {disponibili.length === 0 ? (
                      <p className="aiuto">Nessuno ancora. Scrivi un nome qui sopra per aggiungerlo.</p>
                    ) : disponibili.map((d) => {
                      const pers = personaDi(d)
                      const suoi = tavoliDi(pers)
                      const aperto = assegna?.persona.chiave === pers.chiave
                      return (
                        <div key={d.id} style={RIGA}>
                          <div className="riga-serata">
                            <button type="button" className="nome-serata"
                              onClick={() => setRigaAperta(rigaAperta === pers.chiave ? null : pers.chiave)}
                              aria-expanded={rigaAperta === pers.chiave}>
                              <strong>{pers.nome}</strong>
                              {pers.tipo === 'ospite' && <span className="anno"> · senza account</span>}
                              {suoi.length > 0 && (
                                <span className="anno block">
                                  {suoi.map((t) =>
                                    `${t.giochi?.nome || t.titolo || 'Tavolo'} alle ${new Date(t.inizio)
                                      .toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
                                    + (t.pubblicato === false ? ' (bozza)' : ''),
                                  ).join(' · ')}
                                </span>
                              )}
                              {d.note && rigaAperta !== pers.chiave && (
                                <span className="anno block">{d.note}</span>
                              )}
                            </button>
                            <button className={`pastiglia-stato piccola ${d.stato}`}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setInScelta(pers)}
                              aria-label={`Cambia la risposta di ${pers.nome}`}>
                              {etichettaDi(d.stato)}
                            </button>
                            {!aperto && (
                              <button className="bottone-assegna"
                                onClick={() => setAssegna({
                                  persona: pers, gioco: null,
                                  ora: serataScelta.ora_inizio.slice(0, 5), posti: '', pubblica: true,
                                })}>
                                {suoi.length ? '+ tavolo' : 'Assegna tavolo'}
                              </button>
                            )}
                          </div>

                          {rigaAperta === pers.chiave && (
                            <input
                              className="campo-cerca"
                              style={{ marginTop: '0.4rem' }}
                              autoFocus
                              value={bozzeNote[d.id] ?? d.note ?? ''}
                              onChange={(e) => setBozzeNote({ ...bozzeNote, [d.id]: e.target.value })}
                              onBlur={() => salvaNota(d.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              placeholder="Nota: arriva alle 22…"
                              aria-label={`Nota per ${pers.nome}`}
                            />
                          )}

                          {!aperto ? null : (
                            <div style={{ marginTop: '0.5rem' }}>
                              {assegna.libero ? (
                                <div className="gioco-scelto">
                                  <img src={IMMAGINE_TAVOLO_LIBERO} alt="" className="copertina" />
                                  <div>
                                    <strong>Tavolo libero</strong>
                                    <p className="aiuto">
                                      <button className="bottone-piatto"
                                        onClick={() => setAssegna({ ...assegna, libero: false })}>cambia</button>
                                    </p>
                                  </div>
                                </div>
                              ) : assegna.gioco ? (
                                <div className="pastiglie-persone">
                                  <button className="pastiglia-nome nuovo"
                                    onClick={() => setAssegna({ ...assegna, gioco: null })}
                                    aria-label="Cambia gioco">
                                    {assegna.gioco.nome} ✕
                                  </button>
                                </div>
                              ) : (
                                <CercaGiocoBgg profilo={profilo}
                                  onLibero={() => setAssegna((x) => ({ ...x, libero: true, gioco: null }))}
                                  onScegli={(g) => setAssegna((x) => ({
                                    ...x, gioco: g,
                                    posti: x.posti || (g.max_giocatori ? String(g.max_giocatori) : ''),
                                  }))} />
                              )}

                              <div className="campo">
                                <label>Alle</label>
                                <SceltaOra valore={assegna.ora}
                                  ore={[...new Set([serataScelta.ora_inizio.slice(0, 5), '15:00', '18:00', '20:30', '21:00', '21:30'])].sort()}
                                  onCambia={(o) => setAssegna((x) => ({ ...x, ora: o }))} />
                              </div>

                              <div className="riga-campi">
                                <div className="campo">
                                  <label htmlFor="a-posti">Posti</label>
                                  <input id="a-posti" type="number" min="1" inputMode="numeric"
                                    value={assegna.posti}
                                    onChange={(e) => setAssegna({ ...assegna, posti: e.target.value })} />
                                </div>
                              </div>

                              <label className="consenso">
                                <input type="checkbox" checked={assegna.pubblica}
                                  onChange={(e) => setAssegna({ ...assegna, pubblica: e.target.checked })} />
                                <span>Pubblica subito nella vetrina. Senza spunta resta in bozza.</span>
                              </label>

                              <div className="riga-bottoni">
                                <button className="bottone" onClick={() => creaTavolo(serataScelta)}>Crea il tavolo</button>
                                <button className="bottone bottone-secondario" onClick={() => setAssegna(null)}>Annulla</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {assenti.length > 0 && (
                      <p className="aiuto">
                        Non possono:{' '}
                        {assenti.map((d, k) => (
                          <span key={d.id}>
                            {k > 0 && ', '}
                            <button className="bottone-piatto" style={{ padding: 0 }}
                              onClick={() => setInScelta(personaDi(d))}>
                              {nomeDi(d)}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                    {tavoliDelGiorno(scelto).length > 0 && <h4 className="titolo-sezione">
                      Tavoli previsti{' '}
                      <span className="conteggio">{tavoliDelGiorno(scelto).length}</span>
                    </h4>}
                    {tavoliDelGiorno(scelto).length === 0 ? null : (
                      <ul className="elenco">
                        {tavoliDelGiorno(scelto).map((t) => {
                          const iscritti = (t.iscrizioni_tavolo || [])
                            .filter((i) => i.stato === 'confermato').length
                          return (
                            <li key={t.id}>
                              <div className="gioco">
                                {copertinaTavolo(t) && (
                                  <img src={copertinaTavolo(t)} alt="" className="copertina" />
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


                    {!serataScelta.annullata && (
                      <>
                        <h4 className="titolo-sezione">La tua disponibilità</h4>
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

                  </>
                )
              })() : (serataScelta.disponibilita || []).length === 0 ? (
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
