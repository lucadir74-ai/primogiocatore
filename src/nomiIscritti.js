// Primo Giocatore - nome e cognome veri degli iscritti
// v1.0.0 - 202611191800
//
// L'archivio delle partite porta solo il nick. Qui si leggono una volta
// sola nome e cognome di tutti gli iscritti, per due cose:
// - cercare («irene ragni» trova Syliael): nome e cognome interi;
// - mostrare sotto il nick, in piccolo, nome e iniziale del cognome
//   («Irene R.»): basta per riconoscere qualcuno senza esporre il cognome.
// Se la lettura non riesce si fa senza: resta il nick, come prima.

import { createElement, useEffect, useSyncExternalStore } from 'react'
import { supabase, tutteLeRighe } from './supabase'

let mappa = null          // id → { nome, cognome }
let lettura = null
const ascoltatori = new Set()

export function leggiNomiIscritti() {
  if (mappa) return Promise.resolve(mappa)
  lettura ||= tutteLeRighe(() => supabase.from('profili').select('id, nome, cognome'))
    .then((r) => {
      mappa = new Map(r.map((x) => [x.id, { nome: (x.nome || '').trim(), cognome: (x.cognome || '').trim() }]))
      for (const f of ascoltatori) f()
      return mappa
    })
    .catch(() => { lettura = null; return null })   // pazienza: si riprova la prossima volta
  return lettura
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

// «Irene R.»: solo se dice qualcosa in più del nick (Giacomo → Giacomo no).
export function nomeBreve(m, id, nick) {
  const x = m?.get(id)
  if (!x?.nome) return ''
  const breve = x.cognome ? `${x.nome} ${x.cognome[0].toUpperCase()}.` : x.nome
  const n = piatto(nick)
  if (n && (n === piatto(x.nome) || n === piatto(`${x.nome}${x.cognome}`) || n === piatto(breve))) return ''
  return breve
}

// Sotto il nick, in piccolo. Per gli ospiti (id vuoto o «ospite:…») niente.
export function NomeVero({ id, nick }) {
  const m = useNomiIscritti()
  const t = id && !String(id).startsWith('ospite:') ? nomeBreve(m, id, nick) : ''
  return t ? createElement('span', { className: 'anno block nome-vero' }, t) : null
}
