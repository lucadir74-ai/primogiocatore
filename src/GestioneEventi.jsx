// Primo Giocatore - gestione degli eventi
// v1.1.0 - 202611222330 (si nominano solo gli organizzatori; in cima i tavoli dell'evento)
//
// Per chi organizza: crea un evento, ne cambia nome, date e luogo, ne
// chiude gli ingressi, e lo fa conoscere (link da copiare, QR a tutto
// schermo, locandina da stampare). Nell'evento si nominano solo gli
// organizzatori: chi partecipa entra da solo con il link o il QR, e chi
// spiega un gioco lo decide ogni tavolo.
//
// Chi può cosa (lo garantisce il database, eventi_fase1.sql):
// - crea un evento chi organizza tutto, o chi organizza una Tana (per la sua);
// - lo gestisce anche chi ne è organizzatore;
// - nomina o toglie un organizzatore, e cambia il codice, solo chi
//   organizza tutto o la Tana dell'evento;
// - lo cancella solo chi organizza tutto.
//
// soloEventoId: aperta dall'app di chi partecipa solo agli eventi, mostra
// direttamente quell'evento (niente elenco, niente creazione).
// onApriTavoli(id): porta al programma dei tavoli dell'evento.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase, daMostrare, tutteLeRighe } from './supabase'
import { eventiVisibili, mieiEventi, statoEvento, dateEvento, linkEvento, giorniEvento } from './evento'
import { trovaOCreaLuogo } from './giochiMiei'

const STATI = { in_arrivo: 'In arrivo', in_corso: 'In corso', concluso: 'Concluso' }
const giornoCorto = (g) => new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
const giornoDi = (d) => new Date(d).toLocaleDateString('sv-SE')
const nuovoCodice = () => Array.from(crypto.getRandomValues(new Uint8Array(8)))
  .map((n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('')

function useQr(testo, larghezza = 900) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!testo) return
    QRCode.toDataURL(testo, { width: larghezza, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#131C26', light: '#FFFFFF' } })
      .then(setImg, () => setImg(null))
  }, [testo, larghezza])
  return img
}

/* ---------- Locandina e QR a schermo ---------- */

function LocandinaEvento({ evento, onChiudi }) {
  const link = linkEvento(evento.codice)
  const qr = useQr(link)
  return (
    <div className="scheda">
      <div className="non-stampare">
        <button className="bottone-piatto" onClick={onChiudi}>&larr; torna all&rsquo;evento</button>
        <h2>Locandina da stampare</h2>
        <p className="sottotitolo">Mettila all&rsquo;ingresso: chi la inquadra crea l&rsquo;account ed entra nell&rsquo;evento da solo.</p>
        <button className="bottone" onClick={() => window.print()}>Stampa</button>
      </div>
      <div className="locandina">
        <div className="locandina-testa">
          <span className="locandina-marchio">Primo Giocatore<small>l&rsquo;app delle partite e dei tavoli</small></span>
        </div>
        <h1 className="locandina-titolo">{evento.nome}</h1>
        <p className="locandina-quando">{dateEvento(evento)}</p>
        {evento.luogo_nome && <p className="locandina-dove">{evento.luogo_nome}</p>}
        {qr && <img src={qr} alt="Codice da inquadrare" className="locandina-qr" />}
        <p className="locandina-invito">Inquadra per entrare nell&rsquo;evento</p>
        <div className="locandina-dati">
          <span>iscriviti ai tavoli</span><span>pubblicane uno tuo</span><span>registra le partite</span>
        </div>
        <p className="locandina-nota">Codice evento: <strong>{evento.codice}</strong></p>
      </div>
    </div>
  )
}

function QrSchermo({ evento, onChiudi }) {
  const qr = useQr(linkEvento(evento.codice), 1200)
  return (
    <div className="qr-schermo" role="dialog" aria-label="QR dell'evento" onClick={onChiudi}>
      <p className="qr-schermo-titolo">{evento.nome}</p>
      {qr && <img src={qr} alt="Codice da inquadrare" />}
      <p>Inquadra per entrare nell&rsquo;evento · codice <strong>{evento.codice}</strong></p>
      <button className="bottone bottone-secondario" onClick={onChiudi}>Chiudi</button>
    </div>
  )
}

/* ---------- Un evento ---------- */

function SchedaEvento({ evento, profilo, puoNominare, puoCancellare, onCambiato, onIndietro, onApriTavoli }) {
  const [vista, setVista] = useState(null)   // null | 'locandina' | 'qr'
  const [modulo, setModulo] = useState({ nome: evento.nome || '', inizio: evento.inizio || '', fine: evento.fine || '', luogo: evento.luogo_nome || '', chiuso: !!evento.chiuso })
  const [organizzatori, setOrganizzatori] = useState(null)
  const [partecipanti, setPartecipanti] = useState(null)   // quanti sono entrati con il link
  const [tavoli, setTavoli] = useState(null)               // per il riepilogo in cima
  const [tutti, setTutti] = useState([])     // fra chi scegliere un organizzatore
  const [cerca, setCerca] = useState('')
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confermaCodice, setConfermaCodice] = useState(false)
  const [confermaCancella, setConfermaCancella] = useState(false)
  const link = linkEvento(evento.codice)
  const qr = useQr(link, 600)

  useEffect(() => { caricaPersone(); caricaTavoli() }, [evento.id])
  useEffect(() => {
    if (!puoNominare) return
    tutteLeRighe(() => supabase.from('profili').select('id, nome, cognome, nickname'))
      .then(setTutti, () => setTutti([]))
  }, [puoNominare])

  // Nell'evento si nominano solo gli organizzatori; degli altri basta sapere quanti sono.
  async function caricaPersone() {
    const [org, altri] = await Promise.all([
      supabase.from('evento_ruoli').select('utente_id, profili ( nome, cognome, nickname )')
        .eq('evento_id', evento.id).eq('ruolo', 'organizzatore'),
      supabase.from('evento_ruoli').select('utente_id', { count: 'exact', head: true })
        .eq('evento_id', evento.id).neq('ruolo', 'organizzatore'),
    ])
    if (org.error) { setErrore(org.error.message); return }
    setOrganizzatori((org.data || []).sort((a, b) => daMostrare(a.profili).localeCompare(daMostrare(b.profili), 'it')))
    setPartecipanti(altri.error ? null : (altri.count ?? 0))
  }

  async function caricaTavoli() {
    const { data, error } = await supabase.from('tavoli').select('id, inizio, stato').eq('evento_id', evento.id)
    setTavoli(error ? [] : (data || []).filter((t) => t.stato !== 'annullato'))
  }

  const fatto = (testo) => { setErrore(''); setMessaggio(testo) }
  const sbagliato = (e) => { setMessaggio(''); setErrore(e.message || String(e)) }

  async function salva() {
    if (!modulo.nome.trim()) { sbagliato('Serve il nome dell’evento.'); return }
    if (!modulo.inizio || !modulo.fine || modulo.fine < modulo.inizio) { sbagliato('Controlla le date: la fine non può venire prima dell’inizio.'); return }
    setSalvando(true)
    try {
      const luogoId = modulo.luogo.trim() === (evento.luogo_nome || '') ? evento.luogo_id
        : await trovaOCreaLuogo(modulo.luogo, profilo.id, 'sede')
      const { error } = await supabase.from('eventi').update({
        nome: modulo.nome.trim(), inizio: modulo.inizio, fine: modulo.fine, luogo_id: luogoId || null, chiuso: modulo.chiuso,
      }).eq('id', evento.id)
      if (error) throw error
      fatto('Evento salvato.')
      onCambiato()
    } catch (e) { sbagliato(e) } finally { setSalvando(false) }
  }

  async function cambiaCodice() {
    setConfermaCodice(false)
    const { error } = await supabase.from('eventi').update({ codice: nuovoCodice() }).eq('id', evento.id)
    if (error) sbagliato(error); else { fatto('Codice cambiato: il link e il QR di prima non funzionano più.'); onCambiato() }
  }

  async function cancella() {
    const { error } = await supabase.from('eventi').delete().eq('id', evento.id)
    if (error) sbagliato(error); else { onCambiato(); onIndietro() }
  }

  // Chi era già entrato nell'evento cambia ruolo; gli altri entrano già organizzatori.
  async function nomina(p) {
    const { data: gia, error: e0 } = await supabase.from('evento_ruoli').select('ruolo')
      .eq('evento_id', evento.id).eq('utente_id', p.id).maybeSingle()
    if (e0) { sbagliato(e0); return }
    const { error } = gia
      ? await supabase.from('evento_ruoli').update({ ruolo: 'organizzatore' }).eq('evento_id', evento.id).eq('utente_id', p.id)
      : await supabase.from('evento_ruoli').insert({ evento_id: evento.id, utente_id: p.id, ruolo: 'organizzatore' })
    if (error) sbagliato(error); else { fatto(`${daMostrare(p)} organizza l’evento.`); setCerca(''); caricaPersone() }
  }

  // Non organizza più, ma resta nell'evento: se non è socio, continua a vederlo.
  async function togli(x) {
    const { error } = await supabase.from('evento_ruoli').update({ ruolo: 'partecipante' })
      .eq('evento_id', evento.id).eq('utente_id', x.utente_id)
    if (error) sbagliato(error); else { fatto(`${daMostrare(x.profili)} non organizza più l’evento.`); caricaPersone() }
  }

  async function copia() {
    try { await navigator.clipboard.writeText(link); fatto('Link copiato.') }
    catch { fatto('Copia non riuscita: tieni premuto sul link per copiarlo.') }
  }

  function condividi() {
    const testo = `${evento.nome} · ${dateEvento(evento)}\nEntra nell'evento con Primo Giocatore: ${link}`
    if (navigator.share) navigator.share({ title: evento.nome, text: testo, url: link }).catch(() => {})
    else copia()
  }

  if (vista === 'locandina') return <LocandinaEvento evento={evento} onChiudi={() => setVista(null)} />

  const q = cerca.trim().toLowerCase()
  const giaOrganizzano = new Set((organizzatori || []).map((x) => x.utente_id))
  const trovati = q.length >= 2
    ? tutti.filter((p) => !giaOrganizzano.has(p.id) && [p.nickname, p.nome, p.cognome].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 8)
    : []
  const st = statoEvento(evento)
  // I tavoli giorno per giorno: i giorni dell'evento, più quelli dei tavoli messi fuori date.
  const giorniTavoli = [...new Set([...giorniEvento(evento), ...(tavoli || []).map((t) => giornoDi(t.inizio))])].sort()

  return (
    <>
      {vista === 'qr' && <QrSchermo evento={evento} onChiudi={() => setVista(null)} />}

      <div className="scheda">
        {onIndietro && <button className="bottone-piatto" onClick={onIndietro}>&larr; tutti gli eventi</button>}
        <p className="evento-occhiello">Evento · {STATI[st]}</p>
        <h2>{evento.nome}</h2>
        <p className="sottotitolo">{dateEvento(evento)}{evento.luogo_nome ? ` · ${evento.luogo_nome}` : ''}</p>
        {errore && <div className="avviso errore">{errore}</div>}
        {messaggio && <div className="avviso ok">{messaggio}</div>}

        <h3 className="titolo-sezione">
          Tavoli {tavoli && <span className="conteggio">{tavoli.length}</span>}
        </h3>
        {!tavoli ? <p className="aiuto">Un attimo&hellip;</p> : (
          <>
            <ul className="evento-giorni">
              {giorniTavoli.map((g) => {
                const n = tavoli.filter((t) => giornoDi(t.inizio) === g).length
                return (
                  <li key={g} className={n ? '' : 'vuoto'}>
                    <span>{giornoCorto(g)}</span>
                    <strong>{n === 0 ? 'nessun tavolo' : n === 1 ? '1 tavolo' : `${n} tavoli`}</strong>
                  </li>
                )
              })}
            </ul>
            <p className="aiuto">
              I tavoli li pubblica chiunque partecipi, e ognuno decide chi spiega, quanti posti ci sono e se
              gli iscritti vanno accettati. Chi organizza l&rsquo;evento li gestisce tutti.
            </p>
            {onApriTavoli && (
              <button className="bottone" onClick={() => onApriTavoli(evento.id)}>Apri i tavoli dell&rsquo;evento</button>
            )}
          </>
        )}
      </div>

      <div className="scheda">
        <h3 className="titolo-sezione">Come si entra</h3>
        {evento.chiuso ? (
          <p className="avviso errore">Gli ingressi sono chiusi: il link non fa più entrare nessuno.</p>
        ) : (
          <p className="aiuto">Manda il link nei gruppi prima dell&rsquo;evento: chi si registra a casa non fa la fila all&rsquo;ingresso.</p>
        )}
        <div className="evento-ingresso-riga">
          {qr && <img src={qr} alt="QR dell'evento" className="evento-qr-piccolo" onClick={() => setVista('qr')} />}
          <div className="evento-link">
            <code className="evento-link-testo">{link}</code>
            <div className="evento-tasti">
              <button className="tasto-piccolo" onClick={copia}>Copia link</button>
              <button className="tasto-piccolo" onClick={condividi}>Condividi</button>
              <button className="tasto-piccolo" onClick={() => setVista('qr')}>QR a schermo</button>
              <button className="tasto-piccolo" onClick={() => setVista('locandina')}>Locandina</button>
            </div>
            <p className="anno">Codice: <strong>{evento.codice}</strong></p>
          </div>
        </div>
        {puoNominare && (
          confermaCodice ? (
            <div className="avviso errore">
              Il link e il QR di adesso smettono di funzionare (chi è già dentro resta dentro).
              <div className="evento-tasti">
                <button className="tasto-piccolo" onClick={cambiaCodice}>Sì, cambia codice</button>
                <button className="tasto-piccolo" onClick={() => setConfermaCodice(false)}>Annulla</button>
              </div>
            </div>
          ) : (
            <button className="bottone-piatto" onClick={() => setConfermaCodice(true)}>Cambia codice</button>
          )
        )}
      </div>

      <div className="scheda">
        <h3 className="titolo-sezione">Dati dell&rsquo;evento</h3>
        <div className="campo">
          <label htmlFor="ev-nome">Nome</label>
          <input id="ev-nome" value={modulo.nome} onChange={(e) => setModulo({ ...modulo, nome: e.target.value })} />
        </div>
        <div className="evento-date">
          <div className="campo">
            <label htmlFor="ev-inizio">Primo giorno</label>
            <input id="ev-inizio" type="date" value={modulo.inizio} onChange={(e) => setModulo({ ...modulo, inizio: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="ev-fine">Ultimo giorno</label>
            <input id="ev-fine" type="date" value={modulo.fine} onChange={(e) => setModulo({ ...modulo, fine: e.target.value })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ev-luogo">Luogo</label>
          <input id="ev-luogo" value={modulo.luogo} onChange={(e) => setModulo({ ...modulo, luogo: e.target.value })}
            placeholder="Dove si gioca" />
          <p className="aiuto">Lo prendono da soli i tavoli e le partite dell&rsquo;evento.</p>
        </div>
        <label className="consenso">
          <input type="checkbox" checked={modulo.chiuso} onChange={(e) => setModulo({ ...modulo, chiuso: e.target.checked })} />
          <span>Chiudi l&rsquo;evento adesso: nessuno entra più, e chi non è socio può solo consultare tavoli e partite.
            Senza spunta si chiude da solo dopo l&rsquo;ultimo giorno.</span>
        </label>
        <button className="bottone" onClick={salva} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva'}</button>
      </div>

      <div className="scheda">
        <h3 className="titolo-sezione">
          Organizzatori {organizzatori && <span className="conteggio">{organizzatori.length}</span>}
        </h3>
        <p className="aiuto">
          Cambiano i dati dell&rsquo;evento, ne chiudono gli ingressi e gestiscono tutti i suoi tavoli: iscritti,
          modifiche, partite. {puoNominare
            ? 'Chi organizza la Tana dell’evento lo fa anche senza essere in elenco.'
            : 'Li nomina chi organizza la Tana dell’evento.'}
        </p>
        {!organizzatori ? <p>Un attimo&hellip;</p> : organizzatori.length === 0 ? (
          <p className="aiuto">Nessuno, per ora.</p>
        ) : (
          <ul className="elenco">
            {organizzatori.map((x) => {
              const io = x.utente_id === profilo.id
              return (
                <li key={x.utente_id} className="evento-persona">
                  <span className="nome-giocatore">{daMostrare(x.profili)}{io ? ' (tu)' : ''}</span>
                  {puoNominare && !io && <button className="tasto-piccolo" onClick={() => togli(x)}>Togli</button>}
                </li>
              )
            })}
          </ul>
        )}

        {puoNominare && (
          <div className="campo">
            <label htmlFor="ev-cerca">Aggiungi un organizzatore</label>
            <input id="ev-cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Nickname, nome o cognome" />
            {trovati.length > 0 && (
              <ul className="elenco">
                {trovati.map((p) => (
                  <li key={p.id} className="evento-persona">
                    <span className="nome-giocatore">{daMostrare(p)}</span>
                    <button className="tasto-piccolo" onClick={() => nomina(p)}>Organizza</button>
                  </li>
                ))}
              </ul>
            )}
            {q.length >= 2 && trovati.length === 0 && (
              <p className="aiuto">Nessuno con questo nome. Chi non ha ancora l&rsquo;account deve prima entrare con il link dell&rsquo;evento.</p>
            )}
          </div>
        )}

        <p className="aiuto">
          {partecipanti == null ? 'Chi partecipa entra da solo con il link o il QR: non serve aggiungerlo.'
            : partecipanti === 0 ? 'Ancora nessuno è entrato con il link o il QR. Chi partecipa entra da solo: non serve aggiungerlo.'
            : `${partecipanti === 1 ? 'È entrata 1 persona' : `Sono entrate ${partecipanti} persone`} con il link o il QR. Chi partecipa entra da solo: non serve aggiungerlo.`}
        </p>
      </div>

      {puoCancellare && (
        <div className="scheda">
          {confermaCancella ? (
            <div className="avviso errore">
              L&rsquo;evento sparisce con i suoi ruoli. Tavoli e partite restano, ma non più legati all&rsquo;evento.
              <div className="evento-tasti">
                <button className="tasto-piccolo" onClick={cancella}>Sì, cancella l&rsquo;evento</button>
                <button className="tasto-piccolo" onClick={() => setConfermaCancella(false)}>Annulla</button>
              </div>
            </div>
          ) : (
            <button className="bottone-piatto" onClick={() => setConfermaCancella(true)}>Cancella l&rsquo;evento</button>
          )}
        </div>
      )}
    </>
  )
}

/* ---------- Elenco e creazione ---------- */

export default function GestioneEventi({ profilo, soloEventoId = null, onApriTavoli = null }) {
  const [eventi, setEventi] = useState(null)
  const [mieTane, setMieTane] = useState([])     // id delle Tane che organizzo
  const [tane, setTane] = useState([])
  const [ruoli, setRuoli] = useState(new Map())  // evento → mio ruolo
  const [aperto, setAperto] = useState(soloEventoId)
  const [nuovo, setNuovo] = useState(null)
  const [errore, setErrore] = useState('')
  // Tutto, in ogni Tana: l'amministratore dell'app (amministratore.sql).
  const globale = !!profilo.amministratore

  async function carica() {
    const [ev, miei, ot, ta] = await Promise.all([
      eventiVisibili(),
      mieiEventi(profilo.id).catch(() => []),
      supabase.from('organizzatori_tana').select('tana_id').eq('utente_id', profilo.id),
      supabase.from('tane').select('id, nome').order('nome'),
    ])
    const mie = (ot.data || []).map((x) => x.tana_id)
    const mr = new Map(miei.map((m) => [m.id, m.ruolo]))
    setMieTane(mie); setTane(ta.data || []); setRuoli(mr)
    // Solo gli eventi che posso gestire.
    setEventi(ev.filter((e) => globale || (e.tana_id && mie.includes(e.tana_id)) || mr.get(e.id) === 'organizzatore')
      .map((e) => ({ ...e, tana_id: e.tana_id })))
  }
  useEffect(() => { carica() }, [profilo.id])

  const puoCreare = globale || mieTane.length > 0
  const puoNominare = (e) => globale || (e.tana_id && mieTane.includes(e.tana_id))

  async function crea() {
    setErrore('')
    if (!nuovo.nome.trim()) { setErrore('Serve il nome dell’evento.'); return }
    if (!nuovo.inizio || !nuovo.fine || nuovo.fine < nuovo.inizio) { setErrore('Controlla le date: la fine non può venire prima dell’inizio.'); return }
    if (!globale && !nuovo.tana_id) { setErrore('Scegli la Tana dell’evento.'); return }
    try {
      const luogoId = await trovaOCreaLuogo(nuovo.luogo, profilo.id, 'sede')
      const { data, error } = await supabase.from('eventi').insert({
        nome: nuovo.nome.trim(), inizio: nuovo.inizio, fine: nuovo.fine, luogo_id: luogoId || null,
        tana_id: nuovo.tana_id ? Number(nuovo.tana_id) : null, codice: nuovoCodice(),
      }).select('id').single()
      if (error) throw error
      setNuovo(null)
      await carica()
      setAperto(data.id)
    } catch (e) { setErrore(e.message) }
  }

  if (!eventi) return <div className="scheda"><p>Un attimo&hellip;</p></div>

  const scelto = eventi.find((e) => e.id === aperto)
  if (scelto) {
    return <SchedaEvento key={scelto.id + scelto.codice} evento={scelto} profilo={profilo}
      puoNominare={puoNominare(scelto)} puoCancellare={globale} onApriTavoli={onApriTavoli}
      onCambiato={carica} onIndietro={soloEventoId ? null : () => setAperto(null)} />
  }
  if (soloEventoId) return <div className="scheda"><p className="sottotitolo">Questo evento non lo gestisci tu.</p></div>

  return (
    <div className="scheda">
      <h2>Eventi</h2>
      <p className="sottotitolo">
        Un evento ha i suoi tavoli, le sue partite e la sua classifica, ed è aperto anche a chi non è socio:
        entra con il link o il QR e vede solo le cose dell&rsquo;evento.
      </p>
      {errore && <div className="avviso errore">{errore}</div>}

      {nuovo ? (
        <div className="evento-nuovo">
          <h3 className="titolo-sezione">Nuovo evento</h3>
          <div className="campo">
            <label htmlFor="nv-nome">Nome</label>
            <input id="nv-nome" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
              placeholder="Es. Tana dei Goblin a Pescara" />
          </div>
          <div className="evento-date">
            <div className="campo">
              <label htmlFor="nv-inizio">Primo giorno</label>
              <input id="nv-inizio" type="date" value={nuovo.inizio}
                onChange={(e) => setNuovo({ ...nuovo, inizio: e.target.value, fine: nuovo.fine || e.target.value })} />
            </div>
            <div className="campo">
              <label htmlFor="nv-fine">Ultimo giorno</label>
              <input id="nv-fine" type="date" value={nuovo.fine} onChange={(e) => setNuovo({ ...nuovo, fine: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="nv-luogo">Luogo</label>
            <input id="nv-luogo" value={nuovo.luogo} onChange={(e) => setNuovo({ ...nuovo, luogo: e.target.value })} placeholder="Dove si gioca" />
          </div>
          <div className="campo">
            <label htmlFor="nv-tana">Tana</label>
            <select id="nv-tana" value={nuovo.tana_id} onChange={(e) => setNuovo({ ...nuovo, tana_id: e.target.value })}>
              {globale && <option value="">Nessuna Tana</option>}
              {tane.filter((t) => globale || mieTane.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <p className="aiuto">Chi organizza la Tana scelta gestisce anche l&rsquo;evento e ne nomina gli organizzatori.</p>
          </div>
          <button className="bottone" onClick={crea}>Crea l&rsquo;evento</button>
          <button className="bottone bottone-secondario" onClick={() => setNuovo(null)}>Annulla</button>
        </div>
      ) : puoCreare && (
        <button className="bottone" onClick={() => setNuovo({ nome: '', inizio: '', fine: '', luogo: '', tana_id: globale ? '' : String(mieTane[0] || '') })}>
          Nuovo evento
        </button>
      )}

      {eventi.length === 0 ? (
        <p className="aiuto">Nessun evento da gestire.</p>
      ) : (
        <ul className="elenco-eventi">
          {eventi.map((e) => {
            const st = statoEvento(e)
            return (
              <li key={e.id}>
                <button type="button" className="evento-riga evento-riga-tasto" onClick={() => setAperto(e.id)}>
                  <div>
                    <strong>{e.nome}</strong>
                    <span className="anno block">{dateEvento(e)}{e.luogo_nome ? ` · ${e.luogo_nome}` : ''}
                      {ruoli.get(e.id) === 'organizzatore' ? ' · organizzi' : ''}</span>
                  </div>
                  <span className={'evento-stato' + (st !== 'concluso' ? ' aperto' : '')}>{STATI[st]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
