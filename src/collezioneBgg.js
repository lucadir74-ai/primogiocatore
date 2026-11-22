// Primo Giocatore - la collezione da BoardGameGeek
// v1.2.0 - 202611231400 (barra di avanzamento)
//
// Porta qui i giochi che su BGG sono segnati come posseduti (giochi base
// ed espansioni) e li segna come tuoi. Quello che su BGG non possiedi
// più si toglie; i giochi aggiunti a mano restano.

import { supabase, tutteLeRighe, fetchBgg } from './supabase'
import { assicuraGiochi } from './giochiMiei'
import { sincroForzata } from './forzaSincro'

const CHIAVE_GIORNO = 'primo-giocatore:collezione-bgg-ultima'
const OGNI = 24 * 3600000
let inCorso = false

// All'apertura, al massimo una volta al giorno (o subito, dopo «trascina
// giù per aggiornare»). Solo per chi la collezione l'ha già importata
// almeno una volta: per gli altri resta una scelta, col pulsante.
export async function aggiornaCollezioneSeServe(profilo) {
  const utente = profilo?.bgg_username?.trim()
  if (!utente || inCorso) return null
  const chiave = `${CHIAVE_GIORNO}:${profilo.id}`
  try {
    const ultima = Number(localStorage.getItem(chiave) || 0)
    if (!sincroForzata() && Date.now() - ultima < OGNI) return null
  } catch { /* senza memoria si prova lo stesso */ }
  inCorso = true
  try {
    if (!(await contaCollezioneBgg(profilo.id))) return null
    const esito = await importaCollezioneBgg({ utente, profiloId: profilo.id })
    try { localStorage.setItem(chiave, String(Date.now())) } catch { /* niente */ }
    return esito
  } finally {
    inCorso = false
  }
}

// Quanti giochi della collezione sono arrivati da BGG (0 = mai importata).
export async function contaCollezioneBgg(profiloId) {
  const { count, error } = await supabase.from('collezioni')
    .select('gioco_id', { count: 'exact', head: true })
    .eq('utente_id', profiloId).eq('origine', 'bgg')
  return error ? 0 : (count || 0)
}

// Restituisce { giochi, espansioni, tolti, completo }.
export async function importaCollezioneBgg({ utente, profiloId, avanzamento = () => {} }) {
  // BGG prepara la collezione con calma: la barra avanza a stima.
  avanzamento({ fase: 'Chiedo la collezione a BGG', stima: 20 })
  const r = await fetchBgg(`/api/bgg?azione=collezione&utente=${encodeURIComponent(utente)}`)
  const dati = await r.json()
  if (r.status === 202) throw new Error('BGG sta ancora preparando la collezione. Riprova fra poco.')
  if (!r.ok) throw new Error(dati.errore || 'Import non riuscito.')
  if (!dati.giochi?.length) {
    throw new Error(`Su BGG «${utente}» non ha giochi segnati come posseduti. Controlla il nome utente, o segna i giochi come «Owned» nella collezione su BGG.`)
  }

  // Salva i giochi nel catalogo (solo nome e anno: i dettagli si
  // completano quando servono) e segna quali possiedi.
  // Quelli già presenti nell'app (anche aggiunti da altri) si
  // riusano senza toccarli; gli altri si creano.
  // BGG elenca lo stesso gioco più volte se ne hai più copie o più
  // edizioni: una riga ripetuta nello stesso invio fa fallire tutto
  // ("cannot affect row a second time"). Si tiene una riga per gioco.
  const unici = [...new Map(dati.giochi.map((g) => [g.bgg_id, g])).values()]
  avanzamento({ fase: 'Salvo i giochi', fatto: 0, totale: unici.length })
  const salvati = await assicuraGiochi(unici.map((g) => ({
    bgg_id: g.bgg_id, nome: g.nome, anno: g.anno, espansione: Boolean(g.espansione),
  })), (fatto) => avanzamento({ fase: 'Salvo i giochi', fatto, totale: unici.length }))

  const possedute = [...new Map(salvati.filter(Boolean).map((g) => [g.id, {
    utente_id: profiloId,
    gioco_id: g.id,
    origine: 'bgg',
  }])).values()]
  for (let i = 0; i < possedute.length; i += 200) {
    avanzamento({ fase: 'Segno i tuoi giochi', fatto: i, totale: possedute.length })
    const { error } = await supabase
      .from('collezioni')
      .upsert(possedute.slice(i, i + 200), { onConflict: 'utente_id,gioco_id' })
    if (error) throw error
  }

  // Quello che hai tolto dalla collezione su BGG si toglie anche qui.
  // Solo le righe arrivate da BGG: i giochi segnati «è mio» a mano dalla
  // partita restano. Per prudenza non si toglie niente se qualche gioco
  // non è stato salvato: meglio un gioco in più che una collezione cancellata.
  let tolti = 0
  const completo = possedute.length > 0 && salvati.length === unici.length && salvati.every(Boolean)
  if (completo) {
    avanzamento({ fase: 'Tolgo quelli che su BGG non hai più' })
    const oraSuBgg = new Set(possedute.map((x) => x.gioco_id))
    const mie = await tutteLeRighe(() => supabase.from('collezioni')
      .select('gioco_id, origine').eq('utente_id', profiloId), 1000, 'gioco_id')
    const daTogliere = mie
      .filter((x) => x.origine === 'bgg' && !oraSuBgg.has(x.gioco_id))
      .map((x) => x.gioco_id)
    for (let i = 0; i < daTogliere.length; i += 100) {
      const { error } = await supabase.from('collezioni').delete()
        .eq('utente_id', profiloId).in('gioco_id', daTogliere.slice(i, i + 100))
      if (error) throw error
    }
    tolti = daTogliere.length
  }

  const espansioni = salvati.filter((g) => g?.espansione).length
  return { giochi: possedute.length - espansioni, espansioni, tolti, completo }
}

export function fraseCollezione({ giochi, espansioni, tolti, completo }) {
  const quanti = espansioni ? `${giochi} giochi e ${espansioni} espansioni` : `${giochi} giochi`
  return `Collezione aggiornata: ${quanti}.`
    + (tolti === 1 ? ' Tolto 1 gioco che su BGG non è più nella tua collezione.' : '')
    + (tolti > 1 ? ` Tolti ${tolti} giochi che su BGG non sono più nella tua collezione.` : '')
    + (completo ? '' : ' Non ho tolto niente: BGG ha risposto in modo incompleto, riprova più tardi.')
}
