// Primo Giocatore - classifica di un evento
// v1.3.0 - 202611241000 (i numeri dell'evento in cima; avversari diversi, giochi diversi,
//   giochi impegnativi e Premi; prima che cominci dice cosa ci sarà)
//
// Solo le partite dell'evento, con tutti quelli che le hanno giocate:
// soci, partecipanti e ospiti senza account. Si calcola qui, al
// momento: è sempre aggiornata, anche mentre l'evento è in corso.
// I conti semplici stanno in src/eventoConti.js; l'IPG dell'evento usa lo
// stesso metodo del Primeggio (src/primeggioCalcolo.js).
// Le partite arrivano dal database (classifica_evento, eventi_fase5.sql).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { calcolaPrimeggio } from './primeggioCalcolo'
import { contiEvento, posti, MIN_PARTITE_PESO } from './eventoConti'
import { statoEvento, dateEvento } from './evento'
import BarraScorrevole from './BarraScorrevole.jsx'

// In tre giorni si giocano poche partite: per entrare in classifica ne bastano 3.
export const MIN_PARTITE_EVENTO = 3

// Prima le vittorie: si capiscono subito. L'IPG dell'evento, con poche
// partite, può mettere davanti chi ne ha vinte meno (pesa avversari e giochi).
const VISTE = [
  ['vittorie', 'Più vittorie'], ['partite', 'Più partite'], ['avversari', 'Avversari diversi'],
  ['giochiDiversi', 'Giochi diversi'], ['peso', 'Giochi impegnativi'], ['ipg', 'IPG evento'],
  ['giochi', 'Giochi'], ['premi', 'Premi'],
]
const partiteTesto = (n) => `${n} ${n === 1 ? 'partita' : 'partite'}`
const vinteTesto = (n) => `${n} ${n === 1 ? 'vinta' : 'vinte'}`
const pesoTesto = (p) => p.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// I premi di fine evento: uno per categoria, con i pari merito.
const PREMI = [
  { vista: 'vittorie', titolo: 'Più vittorie', valore: (r) => vinteTesto(r.vittorie) },
  { vista: 'partite', titolo: 'Più partite', valore: (r) => partiteTesto(r.partite) },
  { vista: 'avversari', titolo: 'Il più socievole', valore: (r) => `${r.avversari} avversari diversi` },
  { vista: 'giochiDiversi', titolo: 'L’esploratore', valore: (r) => `${r.giochi} giochi diversi` },
  { vista: 'peso', titolo: 'Il cervellone', valore: (r) => `peso medio ${pesoTesto(r.peso)}`, campo: 'peso' },
]
const CAMPO = { vittorie: 'vittorie', partite: 'partite', avversari: 'avversari', giochiDiversi: 'giochi', peso: 'peso' }

export default function ClassificaEvento({ evento, profilo }) {
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState('')
  const [vista, setVista] = useState('vittorie')

  useEffect(() => {
    setDati(null); setErrore('')
    supabase.rpc('classifica_evento', { p_evento: evento.id }).then(({ data, error }) => {
      if (error) setErrore(/classifica_evento/.test(error.message) ? 'Manca lo script eventi_fase5.sql nel database.' : error.message)
      else setDati(data || { partite: [], persone: {} })
    })
  }, [evento.id])

  const conti = useMemo(() => (dati ? contiEvento(dati) : null), [dati])

  // L'IPG si calcola solo se lo si guarda.
  const ipg = useMemo(() => {
    if (!dati || vista !== 'ipg') return null
    const righe = calcolaPrimeggio(dati.partite || [], { minGlobale: MIN_PARTITE_EVENTO, ancheOspiti: true })
    const globali = righe.filter((r) => r.gioco_id === '').map((r) => ({ ...r, nome: conti.nome(r.profilo_id) }))
    return {
      classificati: globali.filter((r) => r.posizione).sort((a, b) => a.posizione - b.posizione),
      inAttesa: globali.filter((r) => !r.posizione).sort((a, b) => b.partite - a.partite),
    }
  }, [dati, vista])

  if (errore) return <div className="avviso errore">{errore}</div>
  if (!conti) return <p>Un attimo&hellip;</p>

  // Prima della prima partita: cosa ci sarà, così si sa dove guardare.
  if (conti.totale === 0) {
    const inArrivo = statoEvento(evento) === 'in_arrivo'
    return (
      <div className="evento-attesa">
        <p className="sottotitolo">
          {inArrivo ? `L’evento comincia il ${dateEvento({ inizio: evento.inizio })}: ` : 'Ancora nessuna partita registrata nell’evento: '}
          la classifica parte con la prima partita registrata e si aggiorna da sola.
        </p>
        <p className="aiuto">Ci saranno: più vittorie, più partite, avversari diversi, giochi diversi, giochi
          più impegnativi, l&rsquo;IPG dell&rsquo;evento, i giochi più giocati e, alla fine, i premi.</p>
        <p className="aiuto">Le partite dell&rsquo;evento contano anche nelle classifiche generali per chi è socio.</p>
      </div>
    )
  }

  const io = (k) => k === profilo.id
  const riga = (r, posto, valore, sotto) => (
    <li key={r.k || r.profilo_id} className={io(r.k || r.profilo_id) ? 'io' : ''}>
      <span className="posto">{posto}</span>
      <div className="nome-giocatore">
        <strong>{r.nome}</strong>{io(r.k || r.profilo_id) ? ' (tu)' : ''}
        <span className="anno block">{sotto}</span>
      </div>
      <span className="punti-finali">{valore}</span>
    </li>
  )
  const elenco = (righe, campo, valore, sotto, vuoto) => (righe.length === 0
    ? <p className="sottotitolo">{vuoto}</p>
    : <ul className="elenco">{posti(righe, campo).map((r) => riga(r, `${r.posto}°`, valore(r), sotto(r)))}</ul>)
  // Il gioco più giocato solo se è uno: a pari merito non c'è.
  const piuGiocato = conti.giochi[0] && conti.giochi[0].partite > (conti.giochi[1]?.partite || 0) ? conti.giochi[0] : null

  return (
    <>
      <div className="evento-numeri">
        <span><strong>{conti.totale}</strong> {conti.totale === 1 ? 'partita' : 'partite'}</span>
        <span><strong>{conti.giocatori}</strong> {conti.giocatori === 1 ? 'giocatore' : 'giocatori'}</span>
        <span><strong>{conti.giochi.length}</strong> {conti.giochi.length === 1 ? 'gioco' : 'giochi'}</span>
      </div>
      <p className="aiuto">
        {conti.ospiti > 0 ? `Fra i giocatori ${conti.ospiti === 1 ? '1 ospite' : `${conti.ospiti} ospiti`} senza account. ` : ''}
        {piuGiocato && piuGiocato.partite > 1 ? `Il più giocato: ${piuGiocato.nome} (${piuGiocato.partite}). ` : ''}
        Si aggiorna a ogni partita registrata.
      </p>

      <BarraScorrevole><div className="sottoschede">
        {VISTE.map(([id, t]) => <button key={id} className={vista === id ? 'attiva' : ''} onClick={() => setVista(id)}>{t}</button>)}
      </div></BarraScorrevole>

      {vista === 'vittorie' && elenco(conti.vittorie, 'vittorie', (r) => r.vittorie,
        (r) => `su ${partiteTesto(r.competitive)} · ${Math.round((r.vittorie / r.competitive) * 100)}%`,
        'Ancora nessuna vittoria.')}

      {vista === 'partite' && elenco(conti.partite, 'partite', (r) => r.partite, (r) => vinteTesto(r.vittorie), '')}

      {vista === 'avversari' && (
        <>
          <p className="aiuto">Con quante persone diverse si è giocato: premia chi cambia tavolo e conosce gente nuova.</p>
          {elenco(conti.avversari, 'avversari', (r) => r.avversari, (r) => partiteTesto(r.partite), 'Ancora nessuno.')}
        </>
      )}

      {vista === 'giochiDiversi' && elenco(conti.giochiDiversi, 'giochi', (r) => r.giochi, (r) => partiteTesto(r.partite), '')}

      {vista === 'peso' && (
        <>
          <p className="aiuto">
            Il peso medio BGG dei giochi giocati, da 1 (leggero) a 5 (impegnativo).
            Conta da {MIN_PARTITE_PESO} partite con giochi di cui BGG dà il peso.
          </p>
          {elenco(conti.peso, 'peso', (r) => pesoTesto(r.peso), (r) => partiteTesto(r.partite),
            `Nessuno ha ancora ${MIN_PARTITE_PESO} partite.`)}
        </>
      )}

      {vista === 'ipg' && ipg && (
        <>
          <p className="aiuto">
            L&rsquo;IPG dell&rsquo;evento: lo stesso calcolo del Primeggio, solo sulle partite competitive dell&rsquo;evento.
            Conta contro chi hai giocato, non solo quante ne hai vinte. In classifica da {MIN_PARTITE_EVENTO} partite.
          </p>
          {ipg.classificati.length === 0
            ? <p className="sottotitolo">Nessuno ha ancora {MIN_PARTITE_EVENTO} partite.</p>
            : <ul className="elenco">{ipg.classificati.map((r) => riga(r, `${r.posizione}°`, r.ipg,
                `${partiteTesto(r.partite)} · ${vinteTesto(r.vittorie)}`))}</ul>}
          {ipg.inAttesa.length > 0 && (
            <>
              <h3 className="titolo-sezione">Ancora poche partite</h3>
              <ul className="elenco">{ipg.inAttesa.map((r) => riga(r, '', '—',
                `${partiteTesto(r.partite)}: ne mancano ${MIN_PARTITE_EVENTO - r.partite}`))}</ul>
            </>
          )}
        </>
      )}

      {vista === 'giochi' && (
        <ul className="elenco">
          {conti.giochi.map((g) => (
            <li key={g.id}>
              <div className="nome-giocatore">
                <strong>{g.nome}</strong>
                <span className="anno block">
                  {partiteTesto(g.partite)}
                  {g.campione ? ` · più vittorie: ${conti.nome(g.campione[0])} (${g.campione[1]})` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {vista === 'premi' && (
        <>
          <p className="aiuto">
            {statoEvento(evento) === 'concluso' ? 'I premi dell’evento.' : 'Come stanno andando i premi: si decidono a fine evento.'}
          </p>
          <ul className="evento-premi">
            {PREMI.map((p) => {
              const righe = conti[p.vista]
              const campo = CAMPO[p.vista]
              const primi = righe.length ? righe.filter((r) => r[campo] === righe[0][campo]) : []
              return (
                <li key={p.vista}>
                  <button type="button" onClick={() => setVista(p.vista)}>
                    <span className="evento-occhiello">{p.titolo}</span>
                    <strong>{primi.length ? primi.map((r) => r.nome + (io(r.k) ? ' (tu)' : '')).join(', ') : '—'}</strong>
                    {primi[0] && <span className="anno">{p.valore(primi[0])}{primi.length > 1 ? ' a testa' : ''}</span>}
                  </button>
                </li>
              )
            })}
            {piuGiocato && (
              <li>
                <button type="button" onClick={() => setVista('giochi')}>
                  <span className="evento-occhiello">Il gioco dell&rsquo;evento</span>
                  <strong>{piuGiocato.nome}</strong>
                  <span className="anno">{partiteTesto(piuGiocato.partite)}</span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </>
  )
}
