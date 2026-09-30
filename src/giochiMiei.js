// Primo Giocatore - i giochi che una persona può vedere
// v1.0.0 - 202609301600
//
// Nessuno sfoglia il catalogo comune: dentro ci sono le collezioni
// degli altri. Ognuno vede solo i propri giochi, cioè quelli che
// possiede, quelli a cui ha giocato (anche nelle partite con altri) e
// quelli che ha aggiunto lui. Tutto il resto si cerca su BGG.

import { supabase, tutteLeRighe } from './supabase'

export async function giochiMiei(profiloId, campi) {
  const [c, p, m] = await Promise.all([
    tutteLeRighe(() => supabase.from('collezioni')
      .select(`gioco_id, giochi ( ${campi} )`).eq('utente_id', profiloId)),
    tutteLeRighe(() => supabase.from('partecipazioni')
      .select(`partite ( giochi ( ${campi} ) )`).eq('utente_id', profiloId)),
    tutteLeRighe(() => supabase.from('giochi').select(campi).eq('creato_da', profiloId)),
  ])
  const mappa = new Map()
  for (const r of c) if (r.giochi) mappa.set(r.giochi.id, r.giochi)
  for (const r of p) if (r.partite?.giochi) mappa.set(r.partite.giochi.id, r.partite.giochi)
  for (const g of m) mappa.set(g.id, g)
  return [...mappa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

// Un gioco arrivato da BGG: se è già nell'app si usa quella voce,
// senza toccarla (può averla aggiunta qualcun altro); altrimenti si crea.
export async function assicuraGiocoBgg(g, profiloId, campi = '*') {
  const { data: esistente } = await supabase
    .from('giochi').select(campi).eq('bgg_id', g.bgg_id).maybeSingle()
  if (esistente) return esistente

  const { data: creato, error } = await supabase.from('giochi').insert({
    bgg_id: g.bgg_id, nome: g.nome, anno: g.anno,
    min_giocatori: g.min_giocatori, max_giocatori: g.max_giocatori,
    durata_minuti: g.durata_minuti, immagine_url: g.immagine_url,
    immagine_grande: g.immagine_grande,
    creato_da: profiloId,
  }).select(campi).single()
  if (!error) return creato

  // Qualcun altro può averlo aggiunto nel frattempo.
  const { data: ancora } = await supabase
    .from('giochi').select(campi).eq('bgg_id', g.bgg_id).maybeSingle()
  if (ancora) return ancora
  throw error
}
