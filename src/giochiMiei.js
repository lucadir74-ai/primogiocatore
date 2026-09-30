// Primo Giocatore - ciò che una persona può vedere, e come aggiungerlo
// v2.0.0 - 202609302000
//
// Regola unica (decisa nel database, v4.6): ognuno vede i giochi, i
// luoghi e i nomi che sono suoi o che ha condiviso giocando. Il resto
// non arriva nemmeno all'app.
//
// Per questo non si può controllare "esiste già?" leggendo il catalogo:
// i giochi passano da assicura_giochi, che guarda anche quelli che non
// vedi e restituisce quello giusto. Luoghi e ospiti invece restano di
// chi li crea: fra quelli visibili si preferiscono i propri.

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

const CAMPI_GIOCO = ['bgg_id', 'nome', 'anno', 'min_giocatori', 'max_giocatori', 'durata_minuti',
  'immagine_url', 'immagine_grande', 'tipo_punteggio', 'usa_fazioni']

// Trova o crea i giochi, a blocchi. Restituisce le righe nello stesso
// ordine di quelle passate.
export async function assicuraGiochi(righe) {
  const fuori = []
  for (let i = 0; i < righe.length; i += 200) {
    const blocco = righe.slice(i, i + 200).map((g) => {
      const r = {}
      for (const k of CAMPI_GIOCO) if (g[k] != null && g[k] !== '') r[k] = g[k]
      return r
    })
    const { data, error } = await supabase.rpc('assicura_giochi', { p_righe: blocco })
    if (error) throw error
    fuori.push(...(data || []))
  }
  return fuori
}

// Un gioco arrivato da BGG (o scritto a mano): quello già presente se
// c'è, altrimenti nuovo.
export async function assicuraGiocoBgg(g) {
  const [riga] = await assicuraGiochi([g])
  if (!riga) throw new Error('Non sono riuscito ad aggiungere il gioco.')
  return riga
}

// Fra più righe con lo stesso nome vince la propria.
export function mappaPerNome(righe, profiloId) {
  const m = new Map()
  const ordinate = [...(righe || [])].sort(
    (a, b) => (a.creato_da === profiloId ? 1 : 0) - (b.creato_da === profiloId ? 1 : 0))
  for (const r of ordinate) m.set(r.nome.toLowerCase(), r.id)
  return m
}

// Il luogo con quel nome fra quelli che vedi (prima il tuo); se non
// c'è, lo crei tu.
export async function trovaOCreaLuogo(nome, profiloId, tipo = 'altro') {
  const pulito = (nome || '').trim()
  if (!pulito) return null
  const { data } = await supabase.from('luoghi')
    .select('id, nome, creato_da').ilike('nome', pulito).limit(20)
  const trovato = mappaPerNome(data, profiloId).get(pulito.toLowerCase())
  if (trovato) return trovato
  const { data: creato, error } = await supabase.from('luoghi')
    .insert({ nome: pulito, tipo, creato_da: profiloId }).select('id').single()
  if (error) throw error
  return creato.id
}

// Lo stesso per gli ospiti.
export async function trovaOCreaOspite(nome, profiloId) {
  const pulito = (nome || '').trim() || 'Sconosciuto'
  const { data } = await supabase.from('ospiti')
    .select('id, nome, creato_da').ilike('nome', pulito).is('utente_collegato', null).limit(20)
  const trovato = mappaPerNome(data, profiloId).get(pulito.toLowerCase())
  if (trovato) return trovato
  const { data: creato, error } = await supabase.from('ospiti')
    .insert({ nome: pulito, creato_da: profiloId }).select('id').single()
  if (error) throw error
  return creato.id
}

export { tutteLeRighe }
