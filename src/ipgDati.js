// Primo Giocatore - Primeggio: letture della tabella ipg
// v1.0.0 - 202611131200
//
// Statistiche e Classifiche scaricavano a ogni apertura l'intera tabella
// ipg (una riga per iscritto e per gioco: cresce in fretta). Ora si legge
// solo il pezzo che serve:
// - ipgGenerale(): la classifica generale (gioco_id = '');
// - ipgPersona(id): le righe di un iscritto, gioco per gioco;
// - ipgGioco(id): le righe di un gioco;
// - giochiClassifiche(cerca, limite): l'elenco dei giochi della pagina
//   Classifiche, già riassunto dal database (classifiche_giochi, in
//   supabase/primeggio_leggero.sql). Se la funzione non c'è ancora, lo
//   si calcola qui come prima, dalla tabella intera.
// Ogni pezzo letto resta in memoria per un'ora, condiviso fra le pagine:
// tornando su una scheda già vista non si rilegge. dimenticaIpg() svuota
// tutto (dopo un ricalcolo).
// Con { leggere: true } le righe arrivano senza gioco_nome e
// gioco_immagine, che Statistiche non usa.

import { supabase, tutteLeRighe } from './supabase'

const CAMPI = 'profilo_id, gioco_id, ipg, partite, vittorie, posizione, nome, colore, gioco_nome, gioco_immagine, aggiornato_il'
const CAMPI_LEGGERI = 'profilo_id, gioco_id, ipg, partite, vittorie, posizione, nome, colore, aggiornato_il'
const DURATA = 3600000

const memoria = new Map()   // nome -> { quando, promessa }

function ricordato(nome, leggi) {
  const v = memoria.get(nome)
  if (v && Date.now() - v.quando < DURATA) return v.promessa
  const promessa = leggi()
  memoria.set(nome, { quando: Date.now(), promessa })
  // Una lettura fallita non si tiene: la prossima volta si riprova.
  promessa.catch(() => { if (memoria.get(nome)?.promessa === promessa) memoria.delete(nome) })
  return promessa
}

// Le righe complete vanno bene anche a chi le chiede leggere: se ci
// sono già, non si rilegge.
function pezzo(nome, filtra, ordine, { leggere = false } = {}) {
  const pieno = memoria.get(`${nome}|pieno`)
  if (leggere && pieno && Date.now() - pieno.quando < DURATA) return pieno.promessa
  return ricordato(`${nome}|${leggere ? 'leggero' : 'pieno'}`, () => tutteLeRighe(
    () => filtra(supabase.from('ipg').select(leggere ? CAMPI_LEGGERI : CAMPI)).order(ordine),
    1000, null))
}

export const ipgGenerale = (opz) => pezzo('generale', (q) => q.eq('gioco_id', ''), 'profilo_id', opz)
export const ipgPersona = (id, opz) => pezzo(`persona:${id}`, (q) => q.eq('profilo_id', id), 'gioco_id', opz)
export const ipgGioco = (id, opz) => pezzo(`gioco:${id}`, (q) => q.eq('gioco_id', String(id)), 'profilo_id', opz)

export function dimenticaIpg() { memoria.clear() }

const funzioneMancante = (e) => e?.code === 'PGRST202' || e?.code === '42883'

// Il calcolo di prima, in JS, sull'intera tabella: serve solo finché lo
// script SQL non è stato lanciato (e per la prova in locale).
export function riassumiGiochi(righe) {
  const m = new Map()
  for (const r of righe) {
    if (r.gioco_id === '') continue
    const g = m.get(r.gioco_id) || { id: r.gioco_id, nome: r.gioco_nome || 'Gioco', immagine: r.gioco_immagine, classifica: [], fuori: 0 }
    if (r.posizione != null) g.classifica.push(r)
    else g.fuori++
    m.set(r.gioco_id, g)
  }
  return [...m.values()]
    .map((g) => {
      const classifica = g.classifica.sort((a, b) => a.posizione - b.posizione)
      return {
        id: g.id, nome: g.nome, immagine: g.immagine || null,
        classificati: classifica.length,
        giocatori: classifica.length + g.fuori,
        primo: classifica[0]?.nome ?? null,
      }
    })
    .sort(ordineGiochi)
}

// Lo stesso ordine della pagina di prima: più classificati, poi più
// giocatori, poi il nome in ordine alfabetico italiano. Si applica anche
// all'elenco che arriva dal database, che i nomi non li ordina: con le
// sue regole (spazi, apostrofi) l'ordine sarebbe un po' diverso.
export const ordineGiochi = (a, b) => b.classificati - a.classificati
  || b.giocatori - a.giocatori || a.nome.localeCompare(b.nome, 'it')

// [{ id, nome, immagine, classificati, giocatori, primo }], al massimo
// «limite» giochi (200 al più), con il nome che contiene «cerca».
export function giochiClassifiche(cerca = '', limite = 30) {
  const q = String(cerca || '').trim().toLowerCase()
  const quanti = Math.max(1, Math.min(Number(limite) || 30, 200))
  return ricordato(`giochi|${q}|${quanti}`, async () => {
    const { data, error } = await supabase.rpc('classifiche_giochi', { p_cerca: q || null, p_limite: quanti })
    if (error) {
      if (!funzioneMancante(error)) throw error
      const tutte = await ricordato('tutta', () => tutteLeRighe(() => supabase.from('ipg')
        .select(CAMPI).order('profilo_id').order('gioco_id'), 1000, null))
      const giochi = riassumiGiochi(tutte)
      return (q ? giochi.filter((g) => g.nome.toLowerCase().includes(q)) : giochi).slice(0, quanti)
    }
    // Arrivano anche i pari merito oltre il limite: qui si ordina con
    // l'alfabeto italiano e si taglia.
    return (data || [])
      .map((g) => ({
        id: g.gioco_id, nome: g.nome || 'Gioco', immagine: g.immagine || null,
        classificati: g.classificati, giocatori: g.giocatori, primo: g.primo ?? null,
      }))
      .sort(ordineGiochi)
      .slice(0, quanti)
  })
}

// C'è almeno un gioco in classifica ancora senza nome? (una riga sola)
export function giochiSenzaNome() {
  return ricordato('senza-nome', async () => {
    const { data, error } = await supabase.from('ipg').select('gioco_id')
      .neq('gioco_id', '').is('gioco_nome', null).limit(1)
    if (error) throw error
    return (data || []).length > 0
  })
}
