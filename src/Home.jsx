// Primo Giocatore - Home di atterraggio
// v1.0.0 - 202610281700 (prima versione, bozza B «Cruscotto»: quattro riquadri, notizie della Tana, tavoli in programma, ultime partite)
//
// La pagina che si apre all'avvio e toccando il logo. Prima il gioco:
// nuova partita, tavoli, IPG, rifai l'ultima. Le notizie della Tana
// nazionale stanno in una striscia piccola, poi i tavoli e le partite.

import { useEffect, useState } from 'react'
import { supabase, daMostrare } from './supabase'
import { archivioInMemoria, leggiArchivio, seguiArchivio } from './archivio'
import { unisciCondivise } from './condivise'
import { leggiBozza, scriviBozza } from './bozza'
import { copertinaTavolo } from './immagini'
import DallaTana from './DallaTana.jsx'

const giornoBreve = (d) => new Date(d).toLocaleDateString('it-IT', { weekday: 'short' })
const giornoNumero = (d) => new Date(d).getDate()
const ora = (d) => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const dataBreve = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

// Le partite a cui ho giocato io, anche come ospite collegato a me.
const giocataDa = (p, id) => (p.partecipazioni || [])
  .some((x) => x.utente_id === id || x.ospiti?.utente_collegato === id)

const nomeDi = (x) => (x.utente_id ? daMostrare(x.profili) : x.ospiti?.nome || 'Ospite')

function chiHaVinto(p) {
  if (p.tipo_punteggio === 'coop') return p.esito_coop === 'vinta' ? 'vinta insieme' : 'persa insieme'
  const v = (p.partecipazioni || []).filter((x) => x.vincitore)
  if (v.length === 0) return null
  return `vinta da ${v.map(nomeDi).join(', ')}`
}

function Icona({ d }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function Home({ profilo, onNuovaPartita, onTavoli, onApriTavolo, onPrimeggio, onStorico }) {
  const [tavoli, setTavoli] = useState(null)
  const [ipg, setIpg] = useState(null)
  const ordina = (righe) => unisciCondivise([...righe].reverse(), [profilo.id])
    .filter((p) => giocataDa(p, profilo.id))
  const inMemoria = archivioInMemoria(profilo.id)
  const [partite, setPartite] = useState(() => (inMemoria ? ordina(inMemoria) : null))
  const [bozza] = useState(() => leggiBozza())
  const [preparo, setPreparo] = useState(false)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    let finito = false
    supabase
      .from('tavoli')
      .select(`id, titolo, inizio, posti_max, stato, pubblicato,
        giochi:tavoli_gioco_id_fkey ( id, nome, immagine_url ),
        luoghi ( nome ), iscrizioni_tavolo ( stato )`)
      .eq('stato', 'aperto')
      .gte('inizio', new Date().toISOString())
      .order('inizio', { ascending: true })
      .limit(30)
      .then(({ data }) => { if (!finito) setTavoli((data || []).filter((t) => t.pubblicato !== false)) })

    // Il Primeggio generale: il mio IPG e quanti sono in classifica.
    Promise.all([
      supabase.from('ipg').select('ipg, posizione').eq('profilo_id', profilo.id).eq('gioco_id', '').maybeSingle(),
      supabase.from('ipg').select('profilo_id', { count: 'exact', head: true })
        .eq('gioco_id', '').not('posizione', 'is', null),
    ]).then(([mio, tutti]) => {
      if (!finito && mio.data) setIpg({ ...mio.data, su: tutti.count || null })
    }).catch(() => { /* tabella assente: il riquadro mostra il trattino */ })

    leggiArchivio(profilo.id).then((r) => { if (!finito) setPartite(ordina(r)) }).catch(() => {
      if (!finito) setPartite((p) => p || [])
    })
    return () => { finito = true }
  }, [profilo.id])

  useEffect(() => seguiArchivio((righe) => setPartite(ordina(righe))), [profilo.id])

  const ultima = partite?.[0] || null

  // «Rifai l'ultima»: stesso gioco e stessi giocatori, il resto da capo.
  async function rifaiUltima() {
    if (bozza) { onNuovaPartita(); return }   // c'è una partita a metà: si riprende quella
    if (!ultima?.giochi?.id) { onNuovaPartita(); return }
    setPreparo(true)
    setErrore('')
    try {
      const { data: gioco, error } = await supabase.from('giochi').select('*').eq('id', ultima.giochi.id).single()
      if (error) throw error
      const righe = [...(ultima.partecipazioni || [])]
        .sort((a, b) => (a.ordine_turno ?? 99) - (b.ordine_turno ?? 99))
        .map((x) => ({
          chiave: x.utente_id ? `u-${x.utente_id}` : `o-${x.ospite_id}`,
          ...(x.utente_id ? { utente_id: x.utente_id } : { ospite_id: x.ospite_id }),
          nome: nomeDi(x),
          punteggio: '', posizione: '', spareggio: '', ruolo: '', ordine: null,
        }))
      scriviBozza({ gioco, righe, luogo: ultima.luoghi?.nome || '', rifatta: true, accumulati: 0, avviatoIl: null })
      onNuovaPartita()
    } catch (e) {
      setErrore('Non riesco a preparare la partita: ' + (e.message || 'riprova.'))
      setPreparo(false)
    }
  }

  const primo = tavoli?.[0]
  const confermati = (t) => (t.iscrizioni_tavolo || []).filter((i) => i.stato === 'confermato').length
  const postiLiberi = (t) => (t.posti_max ? Math.max(0, t.posti_max - confermati(t)) : null)
  const nomeTavolo = (t) => t.titolo || t.giochi?.nome || 'Tavolo libero'

  return (
    <div className="scheda home">
      <h2 className="home-saluto">Ciao {(profilo.nome || '').trim().split(/\s+/)[0] || daMostrare(profilo)}</h2>

      {errore && <div className="avviso errore">{errore}</div>}

      <div className="home-riquadri">
        <button type="button" className="home-riquadro primario" onClick={onNuovaPartita}>
          <Icona d="M12 5v14 M5 12h14" />
          <span className="home-riquadro-titolo">Nuova partita</span>
        </button>

        <button type="button" className="home-riquadro" onClick={onTavoli}>
          <span className="home-numero">{tavoli == null ? '…' : tavoli.length}</span>
          <span>
            <span className="home-riquadro-titolo">{tavoli?.length === 1 ? 'Tavolo aperto' : 'Tavoli aperti'}</span>
            <span className="home-riquadro-sotto">
              {tavoli == null ? '' : primo ? `il primo ${giornoBreve(primo.inizio)} ${giornoNumero(primo.inizio)}` : 'nessuno in programma'}
            </span>
          </span>
        </button>

        <button type="button" className="home-riquadro" onClick={onPrimeggio}>
          <span className="home-numero">{ipg?.ipg ?? '—'}</span>
          <span>
            <span className="home-riquadro-titolo">Il tuo IPG</span>
            <span className="home-riquadro-sotto">
              {ipg?.posizione ? `${ipg.posizione}° in Primeggio${ipg.su ? ` su ${ipg.su}` : ''}` : 'Primeggio'}
            </span>
          </span>
        </button>

        <button type="button" className="home-riquadro" onClick={rifaiUltima} disabled={preparo}>
          {bozza?.gioco || ultima?.giochi?.immagine_url
            ? <img className="home-copertina" alt="" src={(bozza?.gioco || ultima.giochi).immagine_url || ''} />
            : <Icona d="M4 12a8 8 0 0 1 14-5.3 M20 4v4h-4 M20 12a8 8 0 0 1-14 5.3 M4 20v-4h4" />}
          <span>
            <span className="home-riquadro-titolo">
              {preparo ? 'Preparo…' : bozza ? 'Riprendi la partita' : ultima ? 'Rifai l\u2019ultima' : 'Prima partita'}
            </span>
            <span className="home-riquadro-sotto">
              {bozza ? (bozza.gioco?.nome || 'lasciata a metà') : ultima ? `${ultima.giochi?.nome || 'stesso gioco'}, stessi giocatori` : 'registrala adesso'}
            </span>
          </span>
        </button>
      </div>

      <DallaTana compatta quante={10} />

      <h3 className="titolo-sezione">In programma</h3>
      {tavoli == null ? (
        <p className="aiuto">Un attimo&hellip;</p>
      ) : tavoli.length === 0 ? (
        <p className="aiuto">Nessun tavolo in programma.</p>
      ) : (
        <ul className="home-elenco">
          {tavoli.slice(0, 3).map((t) => {
            const liberi = postiLiberi(t)
            return (
              <li key={t.id}>
                <button type="button" className="home-riga" onClick={() => onApriTavolo(t.id)}>
                  <span className="home-data">
                    <span>{giornoBreve(t.inizio)}</span>
                    <strong>{giornoNumero(t.inizio)}</strong>
                  </span>
                  {copertinaTavolo(t) && <img className="home-mini" src={copertinaTavolo(t)} alt="" />}
                  <span className="home-riga-testo">
                    <strong>{nomeTavolo(t)}</strong>
                    <span>
                      {ora(t.inizio)}{t.luoghi?.nome ? ` · ${t.luoghi.nome}` : ''}
                      {liberi != null ? ` · ${liberi === 0 ? 'completo' : liberi === 1 ? '1 posto' : `${liberi} posti`}` : ''}
                    </span>
                  </span>
                  <span className="home-azione">{liberi === 0 ? 'Apri' : 'Iscriviti'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {tavoli?.length > 3 && (
        <button type="button" className="bottone-piatto" onClick={onTavoli}>Tutti i tavoli ({tavoli.length})</button>
      )}

      <h3 className="titolo-sezione">Le tue ultime partite</h3>
      {partite == null ? (
        <p className="aiuto">Un attimo&hellip;</p>
      ) : partite.length === 0 ? (
        <p className="aiuto">Ancora nessuna partita: tocca «Nuova partita» per registrare la prima.</p>
      ) : (
        <>
          <ul className="home-elenco">
            {partite.slice(0, 3).map((p) => {
              const vinto = chiHaVinto(p)
              return (
                <li key={p.id}>
                  <button type="button" className="home-riga" onClick={onStorico}>
                    {p.giochi?.immagine_url && <img className="home-mini" src={p.giochi.immagine_url} alt="" />}
                    <span className="home-riga-testo">
                      <strong>{p.giochi?.nome || 'Partita'}</strong>
                      <span>{vinto || `${(p.partecipazioni || []).length} giocatori`}</span>
                    </span>
                    <span className="home-quando">{dataBreve(p.giocata_il)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="bottone-piatto" onClick={onStorico}>Tutto lo storico</button>
        </>
      )}
    </div>
  )
}
