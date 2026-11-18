// Primo Giocatore - ingresso agli eventi con link o QR
// v1.0.0 - 202611181700
//
// Il link di un evento è l'indirizzo dell'app con ?e=CODICE (come ?t=
// per i tavoli: nessun percorso da configurare sul server). Il codice
// resta sul telefono finché non si è entrati nell'evento: sopravvive
// all'iscrizione, alla conferma dell'email e alla chiusura dell'app.

import { supabase } from './supabase'

const CHIAVE = 'primo-giocatore:evento-da-entrare'

const pulito = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

// Codice dal link, oppure quello rimasto in sospeso su questo telefono.
export function codiceEventoInSospeso() {
  try {
    const dalLink = pulito(new URLSearchParams(window.location.search).get('e'))
    if (dalLink) { localStorage.setItem(CHIAVE, dalLink); return dalLink }
    return pulito(localStorage.getItem(CHIAVE)) || null
  } catch { return null }
}

export function dimenticaCodiceEvento() {
  try { localStorage.removeItem(CHIAVE) } catch { /* niente */ }
  try {
    const u = new URL(window.location.href)
    if (u.searchParams.has('e')) { u.searchParams.delete('e'); window.history.replaceState(window.history.state, '', u.pathname + u.search) }
  } catch { /* niente */ }
}

export const linkEvento = (codice) => `${window.location.origin}/?e=${encodeURIComponent(pulito(codice))}`

// Nome e date, anche senza account.
export async function leggiEventoDaCodice(codice) {
  const { data, error } = await supabase.rpc('evento_da_codice', { p_codice: codice })
  if (error) throw error
  return data   // null se il codice non esiste
}

export async function entraNellEvento(codice) {
  const { data, error } = await supabase.rpc('entra_evento', { p_codice: codice })
  if (error) throw error
  return data
}

const CAMPI_EVENTO = 'id, nome, inizio, fine, chiuso, codice, tana_id, luogo_id, luoghi ( nome )'
const conLuogo = (e) => ({ ...e, luogo_nome: e.luoghi?.nome || '' })

// Gli eventi in cui ho un ruolo, i più recenti prima.
export async function mieiEventi(utenteId) {
  const { data, error } = await supabase
    .from('evento_ruoli')
    .select(`ruolo, eventi ( ${CAMPI_EVENTO} )`)
    .eq('utente_id', utenteId)
  if (error) throw error
  return (data || [])
    .filter((r) => r.eventi)
    .map((r) => ({ ...conLuogo(r.eventi), ruolo: r.ruolo }))
    .sort((a, b) => String(b.inizio || '').localeCompare(String(a.inizio || '')))
}

// Tutti gli eventi che vedo (i soci li vedono tutti, i partecipanti i
// loro). Senza lo script degli eventi: elenco vuoto, il resto va.
export async function eventiVisibili() {
  const { data, error } = await supabase.from('eventi').select(CAMPI_EVENTO).order('inizio', { ascending: false })
  if (error) return []
  return (data || []).map(conLuogo)
}

// Il link della locandina di un tavolo: per i tavoli di un evento porta
// anche il codice, così chi lo inquadra entra pure nell'evento.
export const linkTavolo = (tavoloId, codiceEvento) =>
  `${window.location.origin}/?t=${tavoloId}${codiceEvento ? `&e=${encodeURIComponent(pulito(codiceEvento))}` : ''}`

// Inizio proposto per un tavolo dell'evento: fra un'ora, ma non prima
// del primo giorno (alle 15).
export function inizioPropostoEvento(ev) {
  const fra = new Date(Date.now() + 3600000)
  fra.setMinutes(0, 0, 0)
  if (ev?.inizio) {
    const primo = new Date(`${ev.inizio}T15:00:00`)
    if (fra < primo) return primo
  }
  return fra
}

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })   // AAAA-MM-GG

export const eventoAperto = (ev) => !ev.chiuso && (!ev.fine || oggi() <= ev.fine)

// Per l'etichetta: «In arrivo», «In corso» o «Concluso».
export const statoEvento = (ev) =>
  !eventoAperto(ev) ? 'concluso' : ev.inizio && oggi() < ev.inizio ? 'in_arrivo' : 'in_corso'

const giorno = (d, conMese = true) =>
  new Date(d + 'T12:00:00').toLocaleDateString('it-IT', conMese ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric' })

// «22–24 gennaio 2027», «30 gennaio – 2 febbraio 2027», «22 gennaio 2027».
export function dateEvento(ev) {
  if (!ev?.inizio) return ''
  if (!ev.fine || ev.fine === ev.inizio) return giorno(ev.inizio)
  const [ai, mi] = ev.inizio.split('-')
  const [af, mf] = ev.fine.split('-')
  if (ai === af && mi === mf) return `${giorno(ev.inizio, false)}–${giorno(ev.fine)}`
  return `${giorno(ev.inizio).replace(' ' + ai, ai === af ? '' : ' ' + ai)} – ${giorno(ev.fine)}`
}
