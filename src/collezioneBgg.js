// Primo Giocatore - la collezione da BoardGameGeek
// v1.0.0 - 202611121200 (tolta da Giochi.jsx: la usano la pagina Giochi e la procedura in Dati e import)
//
// Porta qui i giochi che su BGG sono segnati come posseduti (giochi base
// ed espansioni) e li segna come tuoi. Quello che su BGG non possiedi
// più si toglie; i giochi aggiunti a mano restano.

import { supabase, tutteLeRighe, fetchBgg } from './supabase'
import { assicuraGiochi } from './giochiMiei'

// Quanti giochi della collezione sono arrivati da BGG (0 = mai importata).
export async function contaCollezioneBgg(profiloId) {
  const { count, error } = await supabase.from('collezioni')
    .select('gioco_id', { count: 'exact', head: true })
    .eq('utente_id', profiloId).eq('origine', 'bgg')
  return error ? 0 : (count || 0)
}

// Restituisce { giochi, espansioni, tolti, completo }.
export async function importaCollezioneBgg({ utente, profiloId }) {
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
  const salvati = await assicuraGiochi(unici.map((g) => ({
    bgg_id: g.bgg_id, nome: g.nome, anno: g.anno, espansione: Boolean(g.espansione),
  })))

  const possedute = [...new Map(salvati.filter(Boolean).map((g) => [g.id, {
    utente_id: profiloId,
    gioco_id: g.id,
    origine: 'bgg',
  }])).values()]
  for (let i = 0; i < possedute.length; i += 200) {
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
