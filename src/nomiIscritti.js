// Primo Giocatore - nome e cognome veri degli iscritti
// v1.1.0 - 202611212300 (privacy: nome e cognome solo di chi li mostra; tutti per chi organizza)
//
// L'archivio delle partite porta solo il nick. Qui si leggono una volta
// sola nome e cognome degli iscritti, per due cose:
// - cercare («irene ragni» trova Syliael): nome e cognome interi;
// - mostrare sotto il nick, in piccolo, nome e iniziale del cognome
//   («Irene R.»): basta per riconoscere qualcuno senza esporre il cognome.
// Privacy (supabase/privacy_fase5.sql): in profili nome e cognome ci sono
// solo per chi ha scelto di mostrarli; la tabella anagrafica, coi nomi
// veri, restituisce il mio e, a chi organizza, quelli di tutti.
// Se la lettura non riesce si fa senza: resta il nick, come prima.

import { createElement, useEffect, useSyncExternalStore } from 'react'
import { supabase, tutteLeRighe } from './supabase'

let mappa = null          // id → { nome, cognome }
let lettura = null
const ascoltatori = new Set()

export function leggiNomiIscritti() {
  if (mappa) return Promise.resolve(mappa)
  lettura ||= Promise.all([
    tutteLeRighe(() => supabase.from('profili').select('id, nome, cognome')),
    // Se lo script della privacy manca, solo profili.
    tutteLeRighe(() => supabase.from('anagrafica').select('utente_id, nome, cognome'), 1000, 'utente_id').catch(() => []),
  ])
    .then(([r, veri]) => {
      mappa = new Map(r.map((x) => [x.id, { nome: (x.nome || '').trim(), cognome: (x.cognome || '').trim() }]))
      for (const v of veri) {
        if (v.nome || v.cognome) mappa.set(v.utente_id, { nome: (v.nome || '').trim(), cognome: (v.cognome || '').trim() })
      }
      for (const f of ascoltatori) f()
      return mappa
    })
    .catch(() => { lettura = null; return null })   // pazienza: si riprova la prossima volta
  return lettura
}

// Dopo un cambio del proprio nome o della casella: si rilegge.
export function dimenticaNomiIscritti() {
  mappa = null
  lettura = null
  for (const f of ascoltatori) f()
}

// Righe di profili (o con id dell'account) con nome e cognome veri dove
// chi guarda può vederli: per le pagine di chi organizza.
export async function conNomiVeri(righe, campoId = 'id') {
  const m = await leggiNomiIscritti()
  if (!m) return righe
  return righe.map((r) => {
    const x = m.get(r[campoId])
    return x && (x.nome || x.cognome) ? { ...r, nome: x.nome || r.nome, cognome: x.cognome || r.cognome } : r
  })
}

// La mappa, che si aggiorna da sola quando arriva.
export function useNomiIscritti() {
  const m = useSyncExternalStore((f) => { ascoltatori.add(f); return () => ascoltatori.delete(f) }, () => mappa)
  useEffect(() => { if (!m) leggiNomiIscritti() }, [m])
  return m
}

// Nome e cognome interi, per la ricerca.
export const nomeIntero = (m, id) => {
  const x = m?.get(id)
  return x ? [x.nome, x.cognome].filter(Boolean).join(' ') : ''
}

const piatto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

// «Irene R.»: solo se dice qualcosa in più del nick. Nick «Giacomo» con
// cognome Rossi → «Giacomo R.» (l'iniziale serve a distinguerlo); senza
// cognome, o se il nick è già nome e cognome, niente.
export function nomeBreve(m, id, nick) {
  const x = m?.get(id)
  if (!x?.nome) return ''
  const breve = x.cognome ? `${x.nome} ${x.cognome[0].toUpperCase()}.` : x.nome
  const n = piatto(nick)
  if (n && (n === piatto(breve) || n === piatto(`${x.nome}${x.cognome}`))) return ''
  return breve
}

// Sotto il nick, in piccolo. Per gli ospiti (id vuoto o «ospite:…») niente.
export function NomeVero({ id, nick }) {
  const m = useNomiIscritti()
  const t = id && !String(id).startsWith('ospite:') ? nomeBreve(m, id, nick) : ''
  return t ? createElement('span', { className: 'anno block nome-vero' }, t) : null
}
