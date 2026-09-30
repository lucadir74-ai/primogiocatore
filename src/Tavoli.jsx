// Primo Giocatore - Tavoli
// v2.12.0 - 202609302230

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'
import Serate from './Serate.jsx'
import { chiediPosizione, distanza, scriviDistanza } from './posizione'
import Locandina from './Locandina.jsx'
import TavoloPubblico from './TavoloPubblico.jsx'
import CercaGiocoBgg from './CercaGiocoBgg.jsx'
import CercaDimostratore from './CercaDimostratore.jsx'
import SceltaQuando from './SceltaQuando.jsx'
import { trovaOCreaLuogo, mappaPerNome } from './giochiMiei'
import { IMMAGINE_TAVOLO_LIBERO, copertinaTavolo } from './immagini'

const quando = (d) =>
  new Date(d).toLocaleString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

const perCampo = (d) => {
  const x = new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`
}

const VUOTO = {
  titolo: '', gioco_id: null, gioco: null, libero: false, luogo: '', inizio: '', posti_min: '', posti_max: '',
  descrizione: '', dimostratore_nome: '', dimostratore_foto: '',
  dimostratore_id: null, dimostratore_ospite_id: null, dimostratore_gioca: true,
  chiusura_iscrizioni: '', pubblicato: true,
}

export default function Tavoli({ profilo, onRegistraPartita }) {
  const [tavoli, setTavoli] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  const [modulo, setModulo] = useState(null)      // null = chiuso
  const [gestito, setGestito] = useState(null)    // tavolo di cui vedo gli iscritti
  const [iscritti, setIscritti] = useState([])
  const [persone, setPersone] = useState([])
  const [aMano, setAMano] = useState(null)   // { nome, email, telefono, utente_id }
  const [sezione, setSezione] = useState('tavoli')
  const [disponibili, setDisponibili] = useState([])
  const [luoghiNoti, setLuoghiNoti] = useState([])
  const [serateFuture, setSerateFuture] = useState([])
  const [miaPosizione, setMiaPosizione] = useState(null)
  const [cercandoPosizione, setCercandoPosizione] = useState(false)
  const [locandina, setLocandina] = useState(null)
  const [aperto, setAperto] = useState(null)   // tavolo visto come lo vede chi arriva dal link
  const [sessione, setSessione] = useState(null)

  useEffect(() => { carica() }, [])
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessione(data.session))
  }, [])

  async function carica() {
    setCaricamento(true)
    const [t, pr, lu, se] = await Promise.all([
      supabase
        .from('tavoli')
        .select(`
          *, giochi:tavoli_gioco_id_fkey ( id, nome, immagine_url ),
          luoghi ( nome, tipo, latitudine, longitudine, posizione_pubblica ),
          iscrizioni_tavolo ( id, stato )
        `)
        .order('inizio', { ascending: true }),
      supabase.from('profili').select('id, nome, nickname, dimostratore').order('nome'),
      supabase.from('luoghi').select('nome').order('nome'),
      // Le prossime serate: nella scelta del giorno sono segnate.
      supabase.from('serate').select('data, ora_inizio')
        .gte('data', new Date().toISOString().slice(0, 10)).eq('annullata', false).order('data'),
    ])
    if (t.error) setErrore(t.error.message)
    else setTavoli(t.data || [])
    if (pr.data) setPersone(pr.data)
    if (lu.data) setLuoghiNoti(lu.data.map((x) => x.nome))
    if (se.data) setSerateFuture(se.data)
    setCaricamento(false)
  }

  /* ---------- Creazione e modifica ---------- */

  function apriNuovo() {
    const fra2ore = new Date(Date.now() + 2 * 60 * 60 * 1000)
    fra2ore.setMinutes(0, 0, 0)
    const inizio = perCampo(fra2ore)
    setModulo({ ...VUOTO, inizio })
    caricaDisponibili(inizio)
    setMessaggio('')
  }

  function apriModifica(t) {
    setModulo({
      id: t.id,
      titolo: t.titolo || '',
      gioco_id: t.gioco_id,
      gioco: t.giochi || null,
      // Senza gioco è un tavolo libero: ognuno porta o sceglie sul momento.
      libero: !t.gioco_id,
      luogo: t.luoghi?.nome || '',
      inizio: perCampo(t.inizio),
      posti_min: t.posti_min || '',
      posti_max: t.posti_max || '',
      descrizione: t.descrizione || '',
      dimostratore_nome: t.dimostratore_nome || '',
      dimostratore_foto: t.dimostratore_foto || '',
      dimostratore_id: t.dimostratore_id || null,
      dimostratore_ospite_id: t.dimostratore_ospite_id || null,
      dimostratore_gioca: t.dimostratore_gioca !== false,
      chiusura_iscrizioni: t.chiusura_iscrizioni ? perCampo(t.chiusura_iscrizioni) : '',
      pubblicato: t.pubblicato,
    })
    caricaDisponibili(perCampo(t.inizio))
    setMessaggio('')
  }

  // Quando il tavolo ha una data, cerco se quel giorno c'è una serata
  // e chi si è dato disponibile, con o senza account: sono i primi
  // nomi da proporre.
  async function caricaDisponibili(inizio) {
    if (!inizio) { setDisponibili([]); return }
    const giorno = inizio.slice(0, 10)
    const { data: serata } = await supabase
      .from('serate').select('id').eq('data', giorno).maybeSingle()
    if (!serata) { setDisponibili([]); return }
    const { data } = await supabase
      .from('disponibilita')
      .select('profilo_id, ospite_id, stato, profili ( id, nome, nickname ), ospiti ( id, nome )')
      .eq('serata_id', serata.id)
      .in('stato', ['si', 'forse'])
    setDisponibili((data || [])
      .map((d) => d.profilo_id
        ? { chiave: `p:${d.profilo_id}`, tipo: 'profilo', id: d.profilo_id, nome: daMostrare(d.profili), stato: d.stato }
        : { chiave: `o:${d.ospite_id}`, tipo: 'ospite', id: d.ospite_id, nome: d.ospiti?.nome || 'Dimostratore', stato: d.stato })
      .sort((a, b) => (a.stato === 'si' ? 0 : 1) - (b.stato === 'si' ? 0 : 1)))
  }

  async function caricaFoto(file) {
    if (!file) return
    setErrore('')
    const nome = `${profilo.id}-${Date.now()}-${file.name.replace(/[^\w.-]/g, '')}`
    const { error } = await supabase.storage.from('dimostratori').upload(nome, file, { upsert: true })
    if (error) { setErrore(`Foto non caricata: ${error.message}`); return }
    const { data } = supabase.storage.from('dimostratori').getPublicUrl(nome)
    setModulo((m) => ({ ...m, dimostratore_foto: data.publicUrl }))
  }

  async function salva() {
    setErrore(''); setMessaggio('')
    if (!modulo.gioco_id && !modulo.libero) { setErrore('Scegli il gioco, oppure segna «tavolo libero».'); return }
    if (!modulo.inizio) { setErrore('Metti data e ora.'); return }

    try {
      const luogoId = await trovaOCreaLuogo(modulo.luogo, profilo.id, 'sede')

      const campi = {
        titolo: modulo.titolo.trim() || (modulo.libero ? 'Tavolo libero' : null),
        gioco_id: modulo.libero ? null : modulo.gioco_id,
        luogo_id: luogoId,
        inizio: new Date(modulo.inizio).toISOString(),
        posti_min: modulo.posti_min ? Number(modulo.posti_min) : null,
        posti_max: modulo.posti_max ? Number(modulo.posti_max) : null,
        descrizione: modulo.descrizione.trim() || null,
        dimostratore_nome: modulo.dimostratore_nome.trim() || null,
        dimostratore_foto: modulo.dimostratore_foto || null,
        dimostratore_id: modulo.dimostratore_id,
        dimostratore_ospite_id: modulo.dimostratore_ospite_id,
        dimostratore_gioca: modulo.dimostratore_gioca,
        chiusura_iscrizioni: modulo.chiusura_iscrizioni
          ? new Date(modulo.chiusura_iscrizioni).toISOString() : null,
        pubblicato: modulo.pubblicato,
        visibilita: modulo.pubblicato ? 'pubblico' : 'gruppo',
      }

      let tavoloId = modulo.id
      if (modulo.id) {
        const { error } = await supabase.from('tavoli').update(campi).eq('id', modulo.id)
        if (error) throw error
        setMessaggio('Tavolo aggiornato.')
      } else {
        const { data, error } = await supabase
          .from('tavoli').insert({ ...campi, host_id: profilo.id, stato: 'aperto' })
          .select('id').single()
        if (error) throw error
        tavoloId = data.id
        setMessaggio('Tavolo pubblicato.')
      }

      await sistemaDimostratore(tavoloId, campi)
      if (!modulo.libero && modulo.gioco_id) await recuperaImmagineGrande(modulo.gioco_id)
      setModulo(null)
      carica()
    } catch (e) {
      setErrore(e.message)
    }
  }

  // L'iscrizione del dimostratore si crea, si aggiorna o si toglie
  // secondo quanto scelto nel modulo. È marcata come tale, così una
  // modifica al tavolo non ne crea una seconda.
  // La pagina pubblica mostra la copertina a tutta larghezza: la
  // miniatura di BGG sgranerebbe. Si scarica l'immagine piena solo
  // per i giochi che finiscono davvero su un tavolo.
  async function recuperaImmagineGrande(giocoId) {
    try {
      const { data: g } = await supabase
        .from('giochi').select('bgg_id, immagine_grande').eq('id', giocoId).maybeSingle()
      if (!g?.bgg_id || g.immagine_grande) return

      const r = await fetch(`/api/bgg?azione=dettagli&id=${g.bgg_id}`)
      const dati = await r.json()
      if (!r.ok) return
      const grande = dati.giochi?.[0]?.immagine_grande
      if (grande) await supabase.from('giochi').update({ immagine_grande: grande }).eq('id', giocoId)
    } catch {
      // Se non arriva resta la miniatura: nessun motivo per fermare
      // la pubblicazione del tavolo.
    }
  }

  async function sistemaDimostratore(tavoloId, campi) {
    const { data: esistente } = await supabase
      .from('iscrizioni_tavolo').select('id')
      .eq('tavolo_id', tavoloId).eq('ruolo', 'dimostratore').maybeSingle()

    const serve = campi.dimostratore_gioca
      && (campi.dimostratore_nome || campi.dimostratore_id || campi.dimostratore_ospite_id)

    if (!serve) {
      if (esistente) await supabase.from('iscrizioni_tavolo').delete().eq('id', esistente.id)
      return
    }

    const riga = {
      tavolo_id: tavoloId,
      utente_id: campi.dimostratore_id,
      ospite_id: campi.dimostratore_ospite_id,
      nome_visibile: campi.dimostratore_nome,
      stato: 'confermato',
      ruolo: 'dimostratore',
    }
    if (esistente) await supabase.from('iscrizioni_tavolo').update(riga).eq('id', esistente.id)
    else await supabase.from('iscrizioni_tavolo').insert(riga)
  }

  async function cambiaStato(t, stato) {
    const { error } = await supabase.from('tavoli').update({ stato }).eq('id', t.id)
    if (error) setErrore(error.message)
    else carica()
  }

  async function elimina(t) {
    if (!confirm('Eliminare questo tavolo e tutte le iscrizioni? Non si torna indietro.')) return
    const { error } = await supabase.from('tavoli').delete().eq('id', t.id)
    if (error) setErrore(error.message)
    else { setGestito(null); carica() }
  }

  /* ---------- Iscritti e contatti ---------- */

  async function apriIscritti(t) {
    setGestito(t)
    setIscritti([])
    const { data, error } = await supabase
      .from('iscrizioni_tavolo')
      .select(`
        id, stato, nome_visibile, presente, creata_il, utente_id, ruolo,
        profili:utente_id ( nome, nickname ),
        iscrizioni_contatti ( email, telefono )
      `)
      .eq('tavolo_id', t.id)
      .order('creata_il')
    if (error) setErrore(error.message)
    else setIscritti(data || [])
  }

  // Iscrizione aggiunta da chi organizza: per chi si presenta senza
  // essersi iscritto, o chi ha telefonato invece di usare il link.
  async function aggiungiAMano() {
    setErrore(''); setMessaggio('')
    if (!aMano.nome.trim()) { setErrore('Serve il nome.'); return }

    try {
      const { data: iscrizione, error } = await supabase
        .from('iscrizioni_tavolo')
        .insert({
          tavolo_id: gestito.id,
          utente_id: aMano.utente_id || null,
          nome_visibile: aMano.nome.trim(),
          stato: 'confermato',
          ruolo: 'giocatore',
        })
        .select('id').single()
      if (error) throw error

      if (aMano.email.trim() || aMano.telefono.trim()) {
        const { error: e2 } = await supabase.from('iscrizioni_contatti').insert({
          iscrizione_id: iscrizione.id,
          email: aMano.email.trim() || null,
          telefono: aMano.telefono.trim() || null,
        })
        if (e2) throw e2
      }

      setAMano(null)
      setMessaggio('Iscritto aggiunto.')
      apriIscritti(gestito)
      carica()
    } catch (e) {
      setErrore(e.message)
    }
  }

  async function cambiaIscrizione(id, campi) {
    const { error } = await supabase.from('iscrizioni_tavolo').update(campi).eq('id', id)
    if (error) setErrore(error.message)
    else apriIscritti(gestito)
  }

  async function togliIscritto(id) {
    if (!confirm('Togliere questa persona dal tavolo?')) return
    const { error } = await supabase.from('iscrizioni_tavolo').delete().eq('id', id)
    if (error) setErrore(error.message)
    else { apriIscritti(gestito); carica() }
  }

  // A fine serata il tavolo diventa una partita: gioco, luogo e
  // giocatori sono già noti, restano da mettere solo i punteggi.
  async function registraPartita(t) {
    setErrore(''); setMessaggio('')

    const { data: is, error: e0 } = await supabase
      .from('iscrizioni_tavolo')
      .select('id, stato, presente, nome_visibile, utente_id, ospite_id')
      .eq('tavolo_id', t.id)
      .neq('stato', 'annullato')
    if (e0) { setErrore(e0.message); return }

    // Se il check-in è stato fatto valgono i presenti, altrimenti i confermati.
    const conCheckIn = (is || []).some((i) => i.presente != null)
    const partecipanti = conCheckIn
      ? (is || []).filter((i) => i.presente === true)
      : (is || []).filter((i) => i.stato === 'confermato')

    if (partecipanti.length === 0) {
      setErrore('Nessun partecipante da registrare: segna chi c\u2019era, oppure conferma gli iscritti.')
      return
    }
    if (!confirm(`Creare la partita con ${partecipanti.length} giocatori? Poi inserisci i punteggi.`)) return

    try {
      const { data: gioco } = await supabase
        .from('giochi').select('tipo_punteggio').eq('id', t.gioco_id).maybeSingle()

      const { data: partita, error: e1 } = await supabase
        .from('partite')
        .insert({
          gioco_id: t.gioco_id,
          luogo_id: t.luogo_id,
          tavolo_id: t.id,
          giocata_il: t.inizio,
          tipo_punteggio: gioco?.tipo_punteggio || 'punti',
          registrata_da: profilo.id,
        })
        .select('id').single()
      if (e1) throw e1

      // Gli iscritti senza account diventano ospiti, riusando quelli
      // già esistenti quando il nome coincide.
      const { data: ospitiEsistenti } = await supabase
        .from('ospiti').select('id, nome, creato_da').is('utente_collegato', null)
      const mappa = mappaPerNome(ospitiEsistenti, profilo.id)

      const righe = []
      for (const i of partecipanti) {
        if (i.utente_id) {
          righe.push({ partita_id: partita.id, utente_id: i.utente_id })
          continue
        }
        if (i.ospite_id) {
          righe.push({ partita_id: partita.id, ospite_id: i.ospite_id })
          continue
        }
        const nome = (i.nome_visibile || 'Ospite').trim()
        let ospiteId = mappa.get(nome.toLowerCase())
        if (!ospiteId) {
          const { data: creato, error } = await supabase
            .from('ospiti').insert({ nome, creato_da: profilo.id }).select('id').single()
          if (error) throw error
          ospiteId = creato.id
          mappa.set(nome.toLowerCase(), ospiteId)
        }
        righe.push({ partita_id: partita.id, ospite_id: ospiteId })
      }

      const { error: e2 } = await supabase.from('partecipazioni').insert(righe)
      if (e2) throw e2

      await supabase.from('tavoli')
        .update({ partita_id: partita.id, stato: 'giocato' }).eq('id', t.id)

      setGestito(null)
      carica()
      onRegistraPartita?.(partita.id)
    } catch (e) {
      setErrore(e.message)
    }
  }

  // La posizione resta sul telefono: serve solo a ordinare l'elenco,
  // e non viene mai spedita da nessuna parte.
  async function trovaminiVicini() {
    setErrore('')
    setCercandoPosizione(true)
    try {
      setMiaPosizione(await chiediPosizione())
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCercandoPosizione(false)
    }
  }

  const distanzaDi = (t) => {
    if (!miaPosizione || !t.luoghi?.latitudine) return null
    return distanza(miaPosizione.lat, miaPosizione.lon, t.luoghi.latitudine, t.luoghi.longitudine)
  }

  function condividi(t) {
    const link = `${window.location.origin}/?t=${t.id}`
    const testo =
      `${t.titolo || t.giochi?.nome} — ${quando(t.inizio)}` +
      `${t.luoghi?.nome ? ` presso ${t.luoghi.nome}` : ''}\n${link}`
    if (navigator.share) navigator.share({ title: t.titolo || t.giochi?.nome, text: testo, url: link })
    else {
      navigator.clipboard?.writeText(link)
      setMessaggio('Link copiato.')
    }
  }

  function esportaIscritti() {
    const righe = [['nome', 'stato', 'email', 'telefono', 'presente']]
    for (const i of iscritti) {
      righe.push([
        i.profili ? daMostrare(i.profili) : i.nome_visibile,
        i.stato,
        i.iscrizioni_contatti?.[0]?.email || i.iscrizioni_contatti?.email || '',
        i.iscrizioni_contatti?.[0]?.telefono || i.iscrizioni_contatti?.telefono || '',
        i.presente === true ? 'sì' : i.presente === false ? 'no' : '',
      ])
    }
    const csv = righe.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `iscritti-${(gestito.titolo || gestito.giochi?.nome || 'tavolo').replace(/\W+/g, '-')}.csv`
    a.click()
  }

  /* ---------- Viste ---------- */

  if (caricamento) return <div className="scheda"><p>Carico i tavoli&hellip;</p></div>

  if (locandina) return <Locandina tavolo={locandina} onChiudi={() => setLocandina(null)} />

  // La scheda del tavolo è la stessa che vede chi arriva dal link:
  // così ci si iscrive senza uscire dall'app, e chi organizza vede
  // esattamente quello che vedono gli altri.
  if (aperto) {
    return (
      <>
        <div className="scheda scheda-sottile">
          <button className="bottone-piatto" onClick={() => { setAperto(null); carica() }}>
            ← torna ai tavoli
          </button>
        </div>
        <TavoloPubblico tavoloId={aperto.id} sessione={sessione} profilo={profilo} />
      </>
    )
  }

  // --- Pannello iscritti ---
  if (gestito) {
    const contatto = (i) => i.iscrizioni_contatti?.[0] || i.iscrizioni_contatti || {}
    const confermati = iscritti.filter((i) => i.stato === 'confermato')
    return (
      <div className="scheda">
        <button className="bottone-piatto" onClick={() => setGestito(null)}>← torna ai tavoli</button>
        <h2>{gestito.titolo || gestito.giochi?.nome}</h2>
        <p className="sottotitolo">{quando(gestito.inizio)} · {confermati.length} confermati</p>

        {errore && <div className="avviso errore">{errore}</div>}

        {iscritti.length === 0 ? (
          <p className="aiuto">Ancora nessun iscritto.</p>
        ) : (
          <ul className="elenco elenco-iscritti">
            {iscritti.map((i) => {
              const c = contatto(i)
              return (
                <li key={i.id}>
                  <div className="nome-giocatore">
                    <strong>{i.profili ? daMostrare(i.profili) : i.nome_visibile}</strong>
                    {i.ruolo === 'dimostratore' && <span className="distintivo">Spiega</span>}
                    <span className="anno block">
                      {i.stato === 'attesa' ? 'in attesa · ' : i.stato === 'annullato' ? 'annullato · ' : ''}
                      {c.email || '—'}{c.telefono ? ` · ${c.telefono}` : ''}
                    </span>
                    <span className="azioni-iscritto">
                      {c.telefono && (
                        <a className="bottone-piatto" href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`}
                          target="_blank" rel="noreferrer">WhatsApp</a>
                      )}
                      {c.email && <a className="bottone-piatto" href={`mailto:${c.email}`}>Email</a>}
                      {i.stato === 'attesa' && (
                        <button className="bottone-piatto"
                          onClick={() => cambiaIscrizione(i.id, { stato: 'confermato' })}>conferma</button>
                      )}
                      <button className="bottone-piatto pericolo" onClick={() => togliIscritto(i.id)}>togli</button>
                    </span>
                  </div>
                  <label className="vince">
                    <input type="checkbox" checked={i.presente === true}
                      onChange={(e) => cambiaIscrizione(i.id, { presente: e.target.checked })} />
                    c'era
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {aMano ? (
          <div className="riquadro-manuale">
            <h3 className="titolo-sezione">Aggiungi un iscritto</h3>

            <div className="campo">
              <label htmlFor="m-nome-isc">Nome</label>
              <input id="m-nome-isc" value={aMano.nome}
                onChange={(e) => setAMano({ ...aMano, nome: e.target.value, utente_id: null })} />
              <input className="campo-cerca" value={aMano.cerca || ''}
                onChange={(e) => setAMano({ ...aMano, cerca: e.target.value })}
                placeholder="…oppure cercalo fra chi ha un account" />
              {(aMano.cerca || '').trim() && (
                <div className="pastiglie-persone">
                  {persone
                    .filter((p) => (p.nickname || p.nome || '').toLowerCase().includes(aMano.cerca.toLowerCase()))
                    .slice(0, 8)
                    .map((p) => (
                      <button key={p.id} className="pastiglia-nome"
                        onClick={() => setAMano({ ...aMano, utente_id: p.id, nome: daMostrare(p), cerca: '' })}>
                        {daMostrare(p)}
                      </button>
                    ))}
                </div>
              )}
              {aMano.utente_id && (
                <p className="aiuto">Collegato a un account: la partita entrerà nelle sue statistiche.</p>
              )}
            </div>

            <div className="campo">
              <label htmlFor="m-email-isc">Email</label>
              <input id="m-email-isc" type="email" value={aMano.email}
                onChange={(e) => setAMano({ ...aMano, email: e.target.value })} />
            </div>

            <div className="campo">
              <label htmlFor="m-tel-isc">Telefono</label>
              <input id="m-tel-isc" type="tel" value={aMano.telefono}
                onChange={(e) => setAMano({ ...aMano, telefono: e.target.value })} />
            </div>

            <p className="aiuto">
              I contatti sono facoltativi qui: li stai inserendo tu, non la persona. Mettili
              solo se ti servono davvero e se chi li fornisce sa a cosa servono.
            </p>

            <div className="riga-bottoni">
              <button className="bottone" onClick={aggiungiAMano}>Aggiungi</button>
              <button className="bottone bottone-secondario" onClick={() => setAMano(null)}>Annulla</button>
            </div>
          </div>
        ) : (
          <button className="bottone bottone-secondario"
            onClick={() => setAMano({ nome: '', email: '', telefono: '', utente_id: null, cerca: '' })}>
            Aggiungi un iscritto a mano
          </button>
        )}

        {iscritti.length > 0 && !gestito.partita_id && (
          <button className="bottone" onClick={() => registraPartita(gestito)}>
            Registra la partita
          </button>
        )}

        {gestito.partita_id && (
          <button className="bottone" onClick={() => onRegistraPartita?.(gestito.partita_id)}>
            Apri la partita
          </button>
        )}

        {iscritti.length > 0 && (
          <button className="bottone bottone-secondario" onClick={esportaIscritti}>
            Scarica l'elenco
          </button>
        )}

        {!gestito.partita_id && (
          <p className="aiuto">
            Prima di registrare, segna chi c&rsquo;era davvero con la casella accanto a ogni
            nome: se nessuno è segnato vengono presi tutti i confermati.
          </p>
        )}

        <p className="aiuto">
          Email e telefono li vedi perché organizzi questo tavolo. Nessun altro iscritto
          può leggerli, e vanno usati solo per questa serata.
        </p>
      </div>
    )
  }

  // --- Modulo ---
  if (modulo) {
    const giocoScelto = modulo.gioco
    const dimScelto = modulo.dimostratore_id || modulo.dimostratore_ospite_id || modulo.dimostratore_nome

    return (
      <div className="scheda">
        <h2>{modulo.id ? 'Modifica tavolo' : 'Nuovo tavolo'}</h2>
        {errore && <div className="avviso errore">{errore}</div>}

        <div className="campo">
          <label>Gioco</label>
          {modulo.libero ? (
            <div className="gioco-scelto">
              <img src={IMMAGINE_TAVOLO_LIBERO} alt="" className="copertina" />
              <div>
                <strong>Tavolo libero</strong>
                <p className="aiuto">
                  <button className="bottone-piatto"
                    onClick={() => setModulo({ ...modulo, libero: false })}>cambia</button>
                </p>
              </div>
            </div>
          ) : giocoScelto ? (
            <div className="gioco-scelto">
              {giocoScelto.immagine_url && <img src={giocoScelto.immagine_url} alt="" className="copertina" />}
              <div>
                <strong>{giocoScelto.nome}</strong>
                <p className="aiuto">
                  <button className="bottone-piatto"
                    onClick={() => setModulo({ ...modulo, gioco_id: null, gioco: null })}>cambia</button>
                </p>
              </div>
            </div>
          ) : (
            <CercaGiocoBgg profilo={profilo}
              onLibero={() => setModulo((m) => ({ ...m, libero: true, gioco_id: null, gioco: null }))}
              onScegli={(g) => setModulo((m) => ({
                ...m, gioco_id: g.id, gioco: g,
                posti_max: m.posti_max || (g.max_giocatori ? String(g.max_giocatori) : ''),
              }))} />
          )}
        </div>

        <div className="campo">
          <label htmlFor="t-titolo">Titolo</label>
          <input id="t-titolo" value={modulo.titolo}
            onChange={(e) => setModulo({ ...modulo, titolo: e.target.value })}
            placeholder="Lascia vuoto per usare il nome del gioco" />
        </div>

        <div className="campo">
          <label>Quando</label>
          <SceltaQuando valore={modulo.inizio} serate={serateFuture}
            onCambia={(v) => {
              setModulo((m) => ({ ...m, inizio: v }))
              if (v.slice(0, 10) !== modulo.inizio.slice(0, 10)) caricaDisponibili(v)
            }} />
        </div>

        <div className="campo">
          <label htmlFor="t-luogo">Dove</label>
          <input id="t-luogo" value={modulo.luogo}
            onChange={(e) => setModulo({ ...modulo, luogo: e.target.value })}
            list="luoghi-noti-tavolo" placeholder="Sede, indirizzo o piattaforma" />
          <datalist id="luoghi-noti-tavolo">
            {luoghiNoti.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>

        <div className="riga-campi">
          <div className="campo">
            <label htmlFor="t-min">Minimo</label>
            <input id="t-min" type="number" min="1" value={modulo.posti_min}
              onChange={(e) => setModulo({ ...modulo, posti_min: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="t-max">Posti</label>
            <input id="t-max" type="number" min="1" value={modulo.posti_max}
              onChange={(e) => setModulo({ ...modulo, posti_max: e.target.value })} />
          </div>
        </div>

        <div className="campo">
          <label>Chi spiega il gioco</label>
          {dimScelto ? (
            <>
              <div className="pastiglie-persone">
                <button className="pastiglia-nome nuovo" aria-label="Cambia dimostratore"
                  onClick={() => setModulo({
                    ...modulo, dimostratore_id: null, dimostratore_ospite_id: null, dimostratore_nome: '',
                  })}>
                  {modulo.dimostratore_nome || 'Dimostratore'} ✕
                </button>
              </div>
              <p className="aiuto">
                {modulo.dimostratore_id
                  ? 'Ha un account: la partita entrerà nelle sue statistiche.'
                  : modulo.dimostratore_ospite_id
                    ? 'Senza account: quando si registra e si collega, il tavolo passa a lui.'
                    : 'Nome scritto a mano, non collegato a nessuno: toccalo e sceglilo fra i dimostratori.'}
              </p>
            </>
          ) : (
            <CercaDimostratore profilo={profilo} disponibili={disponibili} onErrore={setErrore}
              onScegli={(p) => setModulo((m) => ({
                ...m,
                dimostratore_nome: p.nome,
                dimostratore_id: p.tipo === 'profilo' ? p.id : null,
                dimostratore_ospite_id: p.tipo === 'ospite' ? p.id : null,
              }))} />
          )}

          <label className="consenso">
            <input type="checkbox" checked={modulo.dimostratore_gioca}
              onChange={(e) => setModulo({ ...modulo, dimostratore_gioca: e.target.checked })} />
            <span>Gioca anche lui, quindi occupa un posto e va iscritto al tavolo.</span>
          </label>
        </div>

        <div className="campo">
          <label htmlFor="t-foto">Foto del dimostratore</label>
          {modulo.dimostratore_foto && (
            <img src={modulo.dimostratore_foto} alt="" className="foto-dimostratore" />
          )}
          <input id="t-foto" type="file" accept="image/*" className="campo-file"
            onChange={(e) => caricaFoto(e.target.files?.[0])} />
        </div>

        <div className="campo">
          <label htmlFor="t-desc">Descrizione</label>
          <input id="t-desc" value={modulo.descrizione}
            onChange={(e) => setModulo({ ...modulo, descrizione: e.target.value })}
            placeholder="Per chi è adatto, cosa portare, quanto dura" />
        </div>

        <div className="campo">
          <label>Iscrizioni aperte fino a</label>
          {modulo.chiusura_iscrizioni ? (
            <SceltaQuando valore={modulo.chiusura_iscrizioni} facoltativo giorni={10}
              onCambia={(v) => setModulo((m) => ({ ...m, chiusura_iscrizioni: v }))} />
          ) : (
            <p className="aiuto">
              Restano aperte fino all&rsquo;inizio del tavolo.{' '}
              <button type="button" className="bottone-piatto"
                onClick={() => setModulo((m) => ({
                  ...m, chiusura_iscrizioni: `${(m.inizio || perCampo(new Date())).slice(0, 10)}T12:00`,
                }))}>metti una scadenza</button>
            </p>
          )}
        </div>

        <label className="consenso">
          <input type="checkbox" checked={modulo.pubblicato}
            onChange={(e) => setModulo({ ...modulo, pubblicato: e.target.checked })} />
          <span>Visibile a chiunque abbia il link. Togli la spunta per tenerlo in bozza.</span>
        </label>

        <button className="bottone" onClick={salva}>
          {modulo.id ? 'Salva modifiche' : 'Pubblica il tavolo'}
        </button>
        <button className="bottone bottone-secondario" onClick={() => setModulo(null)}>Annulla</button>
      </div>
    )
  }

  // --- Vetrina ---
  const adesso = new Date()
  const prossimi = tavoli
    .filter((t) => new Date(t.inizio) >= adesso)
    .sort((a, b) => {
      if (!miaPosizione) return 0   // senza posizione resta l'ordine per data
      const da = distanzaDi(a)
      const db = distanzaDi(b)
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  const passati = tavoli.filter((t) => new Date(t.inizio) < adesso).reverse()

  const scheda = (t) => {
    const conf = (t.iscrizioni_tavolo || []).filter((i) => i.stato === 'confermato').length
    // Chi l'ha pubblicato, chi organizza e il dimostratore del tavolo lo
    // gestiscono: iscritti, modifiche, partita. Eliminarlo no, il
    // dimostratore non può.
    const proprietario = t.host_id === profilo.id || profilo.organizzatore
    const mio = proprietario || t.dimostratore_id === profilo.id
    return (
      <div className="tavolo-scheda" key={t.id}>
        <div className="tavolo-testa">
          {copertinaTavolo(t) && <img src={copertinaTavolo(t)} alt="" className="copertina" />}
          <div className="nome-giocatore">
            <strong>{t.titolo || t.giochi?.nome || 'Tavolo'}</strong>
            <span className="anno block">{quando(t.inizio)}</span>
            <span className="anno block">
              {t.luoghi?.nome || 'luogo da definire'}
              {(() => {
                const d = distanzaDi(t)
                return d != null ? ` · a ${scriviDistanza(d)}` : ''
              })()}
              {' · '}{conf}
              {t.posti_max ? `/${t.posti_max}` : ''} iscritti
              {!t.pubblicato ? ' · bozza' : ''}
              {t.stato !== 'aperto' ? ` · ${t.stato}` : ''}
            </span>
          </div>
        </div>
        <div className="tavolo-azioni">
          <button className="bottone-piatto" onClick={() => setAperto(t)}>
            {t.stato === 'aperto' && new Date(t.inizio) >= adesso ? 'Apri e iscriviti' : 'Apri'}
          </button>
          <button className="bottone-piatto" onClick={() => condividi(t)}>Condividi</button>
          <button className="bottone-piatto" onClick={() => setLocandina(t)}>Locandina</button>
          {mio && <button className="bottone-piatto" onClick={() => apriIscritti(t)}>Iscritti ({conf})</button>}
          {mio && <button className="bottone-piatto" onClick={() => apriModifica(t)}>Modifica</button>}
          {mio && t.gioco_id && !t.partita_id && new Date(t.inizio) < new Date() && (
            <button className="bottone-piatto" onClick={() => registraPartita(t)}>Registra partita</button>
          )}
          {t.partita_id && (
            <button className="bottone-piatto" onClick={() => onRegistraPartita?.(t.partita_id)}>
              Vedi partita
            </button>
          )}
          {mio && t.stato === 'aperto' && (
            <button className="bottone-piatto" onClick={() => cambiaStato(t, 'annullato')}>Annulla</button>
          )}
          {proprietario && <button className="bottone-piatto pericolo" onClick={() => elimina(t)}>Elimina</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="scheda">
      <h2>Tavoli</h2>

      {(profilo.dimostratore || profilo.organizzatore) && (
        <div className="sottoschede">
          <button className={sezione === 'tavoli' ? 'attiva' : ''} onClick={() => setSezione('tavoli')}>
            Tavoli
          </button>
          <button className={sezione === 'calendario' ? 'attiva' : ''} onClick={() => setSezione('calendario')}>
            Calendario interno
          </button>
        </div>
      )}

      {sezione === 'calendario' ? <Serate profilo={profilo} /> : <>

      <p className="sottotitolo">Serate aperte a cui ci si può iscrivere.</p>

      {errore && <div className="avviso errore">{errore}</div>}
      {messaggio && <div className="avviso ok">{messaggio}</div>}

      {profilo.organizzatore && (
        <button className="bottone" onClick={apriNuovo}>Pubblica un tavolo</button>
      )}

      {!miaPosizione ? (
        <button className="bottone bottone-secondario" onClick={trovaminiVicini} disabled={cercandoPosizione}>
          {cercandoPosizione ? 'Cerco dove sei…' : 'Mostra prima i tavoli vicini'}
        </button>
      ) : (
        <p className="aiuto">
          Tavoli ordinati per distanza da dove sei.{' '}
          <button className="bottone-piatto" onClick={() => setMiaPosizione(null)}>
            torna all'ordine per data
          </button>
        </p>
      )}

      <h3 className="titolo-sezione">
        In programma <span className="conteggio">{prossimi.length}</span>
      </h3>
      {prossimi.length === 0 ? (
        <p className="aiuto">Nessun tavolo in programma.</p>
      ) : prossimi.map(scheda)}

      {passati.length > 0 && (
        <>
          <h3 className="titolo-sezione">Passati</h3>
          {passati.slice(0, 10).map(scheda)}
        </>
      )}

      {!profilo.organizzatore && (
        <p className="aiuto">
          Per pubblicare tavoli serve un account da organizzatore.
        </p>
      )}

      </>}
    </div>
  )
}
