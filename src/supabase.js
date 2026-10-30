import { createClient } from '@supabase/supabase-js'

// Questi due valori arrivano dalle variabili d'ambiente (vedi README, passo 4).
const url = import.meta.env.VITE_SUPABASE_URL
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurato = Boolean(url && chiave)

export const supabase = configurato
  ? createClient(url, chiave)
  : null

// I colori dei segnalini: identità della persona dentro l'app.
export const COLORI = [
  { id: 'rosso',  nome: 'Rosso',  hex: '#D1463A' },
  { id: 'blu',    nome: 'Blu',    hex: '#2E6FB0' },
  { id: 'giallo', nome: 'Giallo', hex: '#E5A32B' },
  { id: 'verde',  nome: 'Verde',  hex: '#3E8E5A' },
  { id: 'viola',  nome: 'Viola',  hex: '#7A5195' },
]

// Come si chiama una persona dentro l'app: il soprannome se ce l'ha,
// altrimenti nome e cognome. Un posto solo, per non doverlo ricordare.
export const daMostrare = (p) =>
  (p?.nickname && p.nickname.trim())
  || [p?.nome, p?.cognome].filter(Boolean).join(' ')
  || 'Sconosciuto'

// Supabase restituisce al massimo mille righe per interrogazione.
// Questa funzione le chiede a blocchi finché non finiscono: senza,
// oltre le mille partite le statistiche sarebbero semplicemente
// sbagliate, senza dare nessun errore.
//
// Il primo blocco da solo (spesso basta); se è pieno, i successivi
// partono a gruppi di PARALLELI insieme invece che uno dopo l'altro:
// con qualche migliaio di partite la pagina si apre in un terzo del tempo.
//
// chiave: la colonna univoca che fa da ultimo criterio di ordine (di
// solito id). Senza un ordine univoco il database non garantisce la
// stessa sequenza da un blocco all'altro: oltre le mille righe alcune
// sparivano e altre arrivavano due volte. Si aggiunge in coda a
// eventuali altri ordini (nome, data...), che restano i primi.
// null solo dove la query ha già un ordine univoco suo.
const PARALLELI = 4
export async function tutteLeRighe(costruisciQuery, blocco = 1000, chiave = 'id') {
  const query = () => (chiave ? costruisciQuery().order(chiave) : costruisciQuery())
  const pezzo = async (da) => {
    const { data, error } = await query().range(da, da + blocco - 1)
    if (error) throw error
    return data || []
  }
  const righe = await pezzo(0)
  if (righe.length < blocco) return righe
  for (let da = blocco; ; da += blocco * PARALLELI) {
    const gruppo = await Promise.all(Array.from({ length: PARALLELI }, (_, i) => pezzo(da + i * blocco)))
    let finito = false
    for (const g of gruppo) {
      if (finito) break
      righe.push(...g)
      if (g.length < blocco) finito = true
    }
    if (finito) break
    if (righe.length > 50000) break   // rete di sicurezza
  }
  return righe
}

// Le chiamate a /api/bgg portano la sessione: il server risponde solo a
// chi è entrato nell'app, così nessuno usa il nostro token BGG da fuori.
export async function fetchBgg(indirizzo) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(indirizzo, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
}
